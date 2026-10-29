import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import type { AppConfig, EpimEncounter, Reservation } from '../types/epim.ts';
import {
  formatMonthName,
  getEncounterDates,
  getGroupedEncounterDatesEs,
  LOGO_URL_FALLBACK,
  LOGO_URL_PRIMARY,
  MARACAIBO_ARCIPRESTAZGOS,
  normalizeArciprestazgoName,
  normalizeParroquiaName,
} from '../data/maracaiboCatalog.ts';

export interface EpimReportFilters {
  year: 'todos' | number;
  arciprestazgo: string; // 'todos' or exact arciprestazgo name
  parroquia: string; // 'todas' or exact parish name
  estado: 'todos' | 'abierto' | 'cerrado' | 'finalizado';
  orientation: 'landscape' | 'portrait';
  includeReservationsAppendix: boolean;
}

export interface ArciprestazgoReportGroup {
  arciprestazgo: string;
  encounters: EpimEncounter[];
  totalCupos: number;
  totalReservados: number;
  totalDisponibles: number;
}

type StyledDatePdfLine =
  | { kind: 'headline'; text: string; plainText: string }
  | { kind: 'group-first'; prefix: string; rest: string; plainText: string }
  | { kind: 'group-cont'; text: string; plainText: string };

/**
 * Sanitizes text for jsPDF built-in Helvetica (WinAnsiEncoding) so that all Spanish
 * characters (á, é, í, ó, ú, ü, ñ, ¡, ¿, °, ·) render crisply without width/kerning
 * glitches from unsupported Unicode symbols.
 */
export function cleanPdfText(input: string | undefined | null): string {
  if (!input) return '';
  return input
    .normalize('NFC')
    .replace(/[\u2013\u2014\u2212]/g, '-') // en-dash, em-dash, minus -> hyphen
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2192\u2794\u27A1]/g, '->')
    .replace(/[\u2022\u25CF\u25AA]/g, '·')
    .replace(/\u00A0/g, ' ')
    // Strip any remaining characters outside WinAnsi / Latin-1 supplement + newlines
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '')
    .trim();
}

/**
 * Builds pre-wrapped rich-text lines for an encounter's scheduled dates using the same
 * criterion as the public Cartelera cards:
 * - Line 1: Bold summary of involved month(s) + year (e.g. "Abril 2027" or "Octubre y Noviembre 2027")
 * - Grouped lines: Bold "Mes Año:" prefix + normal weekday/day tokens (e.g. "Octubre 2027: Vie. 30 y Sáb. 31")
 */
function buildStyledDateLinesForPdf(
  doc: jsPDF,
  enc: EpimEncounter,
  fontSize: number,
  maxLineWidthMm: number
): StyledDatePdfLine[] {
  const dateSummary = getGroupedEncounterDatesEs(enc);
  const result: StyledDatePdfLine[] = [];

  doc.setFontSize(fontSize);

  const headlineRaw = cleanPdfText(dateSummary.monthsHeadline || 'Fechas por confirmar');
  doc.setFont('helvetica', 'bold');
  const headlineWrapped = doc.splitTextToSize(headlineRaw, maxLineWidthMm) as string[];
  for (const line of headlineWrapped) {
    if (line) {
      result.push({ kind: 'headline', text: line, plainText: line });
    }
  }

  for (const grp of dateSummary.groups) {
    const prefix = cleanPdfText(`${grp.monthName} ${grp.year}:`);
    const daysText = cleanPdfText(grp.daysLabel);

    doc.setFont('helvetica', 'bold');
    const prefixWithSpaceW = doc.getTextWidth(`${prefix} `);

    doc.setFont('helvetica', 'normal');
    const words = daysText.split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      result.push({ kind: 'group-first', prefix, rest: '', plainText: prefix });
      continue;
    }

    const firstLineMaxW = Math.max(10, maxLineWidthMm - prefixWithSpaceW);
    const firstLineWords: string[] = [];
    let wordIdx = 0;

    while (wordIdx < words.length) {
      const candidate = [...firstLineWords, words[wordIdx]].join(' ');
      if (doc.getTextWidth(candidate) <= firstLineMaxW) {
        firstLineWords.push(words[wordIdx]);
        wordIdx += 1;
      } else {
        break;
      }
    }

    if (firstLineWords.length > 0) {
      const firstRest = firstLineWords.join(' ');
      result.push({
        kind: 'group-first',
        prefix,
        rest: firstRest,
        plainText: `${prefix} ${firstRest}`,
      });
    } else {
      result.push({ kind: 'group-first', prefix, rest: '', plainText: prefix });
    }

    if (wordIdx < words.length) {
      const remainingStr = words.slice(wordIdx).join(' ');
      const contLines = doc.splitTextToSize(remainingStr, maxLineWidthMm) as string[];
      for (const cLine of contLines) {
        if (cLine) {
          result.push({ kind: 'group-cont', text: cLine, plainText: cLine });
        }
      }
    }
  }

  return result;
}

function getArciprestazgoOrderIndex(arcName: string): number {
  const idx = MARACAIBO_ARCIPRESTAZGOS.findIndex((g) => g.nombre === arcName);
  return idx === -1 ? 999 : idx;
}

/**
 * Canonical report sorter requested by user:
 * 1° Arciprestazgo (ecclesiastical order, then alphabetical)
 * 2° Parroquia (alphabetical A-Z)
 * 3° Fechas (chronological by first scheduled date, then closing date)
 */
export function sortEncountersForReport(encounters: EpimEncounter[]): EpimEncounter[] {
  return encounters
    .map((enc) => ({
      ...enc,
      arciprestazgo: normalizeArciprestazgoName(enc.arciprestazgo),
      parroquia: normalizeParroquiaName(enc.parroquia),
    }))
    .sort((a, b) => {
      const arcOrderA = getArciprestazgoOrderIndex(a.arciprestazgo);
      const arcOrderB = getArciprestazgoOrderIndex(b.arciprestazgo);
      if (arcOrderA !== arcOrderB) return arcOrderA - arcOrderB;

      const arcCmp = a.arciprestazgo.localeCompare(b.arciprestazgo, 'es', {
        sensitivity: 'base',
      });
      if (arcCmp !== 0) return arcCmp;

      const parishCmp = a.parroquia.localeCompare(b.parroquia, 'es', {
        sensitivity: 'base',
      });
      if (parishCmp !== 0) return parishCmp;

      const firstDateA = getEncounterDates(a)[0] || a.fechaInicio;
      const firstDateB = getEncounterDates(b)[0] || b.fechaInicio;
      const dateCmp = firstDateA.localeCompare(firstDateB);
      if (dateCmp !== 0) return dateCmp;

      return a.fechaFin.localeCompare(b.fechaFin);
    });
}

export function filterAndSortEncountersForReport(
  encounters: EpimEncounter[],
  filters: Pick<EpimReportFilters, 'year' | 'arciprestazgo' | 'parroquia' | 'estado'>
): EpimEncounter[] {
  const filtered = encounters.filter((enc) => {
    const normArc = normalizeArciprestazgoName(enc.arciprestazgo);
    const normPar = normalizeParroquiaName(enc.parroquia);
    if (filters.year !== 'todos' && enc.year !== filters.year) {
      return false;
    }
    if (filters.arciprestazgo !== 'todos' && normArc !== filters.arciprestazgo) {
      return false;
    }
    if (filters.parroquia !== 'todas' && normPar !== filters.parroquia) {
      return false;
    }
    if (filters.estado !== 'todos' && enc.estado !== filters.estado) {
      return false;
    }
    return true;
  });

  return sortEncountersForReport(filtered);
}

export function groupEncountersByArciprestazgo(
  sortedEncounters: EpimEncounter[]
): ArciprestazgoReportGroup[] {
  const map = new Map<string, ArciprestazgoReportGroup>();
  for (const rawEnc of sortedEncounters) {
    const enc = {
      ...rawEnc,
      arciprestazgo: normalizeArciprestazgoName(rawEnc.arciprestazgo),
      parroquia: normalizeParroquiaName(rawEnc.parroquia),
    };
    const existing = map.get(enc.arciprestazgo);
    const disponibles = Math.max(0, enc.cuposTotales - enc.cuposReservados);
    if (existing) {
      existing.encounters.push(enc);
      existing.totalCupos += enc.cuposTotales;
      existing.totalReservados += enc.cuposReservados;
      existing.totalDisponibles += disponibles;
    } else {
      map.set(enc.arciprestazgo, {
        arciprestazgo: enc.arciprestazgo,
        encounters: [enc],
        totalCupos: enc.cuposTotales,
        totalReservados: enc.cuposReservados,
        totalDisponibles: disponibles,
      });
    }
  }
  return Array.from(map.values());
}

interface LoadedLogoAsset {
  dataUrl: string;
  width: number;
  height: number;
}

function loadSingleImageAsPng(src: string): Promise<LoadedLogoAsset> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const naturalW = img.naturalWidth || 300;
        const naturalH = img.naturalHeight || 300;
        const canvas = document.createElement('canvas');
        canvas.width = naturalW;
        canvas.height = naturalH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo inicializar el contexto de imagen'));
          return;
        }
        ctx.clearRect(0, 0, naturalW, naturalH);
        ctx.drawImage(img, 0, 0, naturalW, naturalH);
        const dataUrl = canvas.toDataURL('image/png');
        resolve({ dataUrl, width: naturalW, height: naturalH });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error(`No se pudo cargar el logo desde ${src}`));
    img.src = src;
  });
}

let cachedLogoAsset: LoadedLogoAsset | null = null;

async function getInstitutionalLogoAsset(): Promise<LoadedLogoAsset | null> {
  if (cachedLogoAsset) return cachedLogoAsset;
  try {
    cachedLogoAsset = await loadSingleImageAsPng(LOGO_URL_PRIMARY);
    return cachedLogoAsset;
  } catch {
    try {
      cachedLogoAsset = await loadSingleImageAsPng(LOGO_URL_FALLBACK);
      return cachedLogoAsset;
    } catch {
      return null;
    }
  }
}

function formatEstadoLabel(estado: EpimEncounter['estado']): string {
  if (estado === 'abierto') return 'Abierto';
  if (estado === 'cerrado') return 'Cupos llenos';
  return 'Finalizado';
}

function formatGeneratedTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} · ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export async function generateAndDownloadEpimPdf(params: {
  encounters: EpimEncounter[];
  reservations: Reservation[];
  config: AppConfig;
  filters: EpimReportFilters;
}): Promise<{ filename: string; totalPages: number }> {
  const { encounters, reservations, config, filters } = params;
  const sorted = sortEncountersForReport(encounters);
  const groups = groupEncountersByArciprestazgo(sorted);
  const logoAsset = await getInstitutionalLogoAsset();

  const doc = new jsPDF({
    orientation: filters.orientation,
    unit: 'mm',
    format: 'letter',
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  // Strictly reserved vertical zones so content NEVER overlaps header or footer
  const headerBottomY = 31;
  const tableMarginTop = 37.5;
  const tableMarginBottom = 18.5;
  const contentWidth = pageWidth - marginX * 2;

  const emittedAt = new Date();
  const emittedLabel = cleanPdfText(formatGeneratedTimestamp(emittedAt));
  const yearFilterLabel =
    filters.year === 'todos' ? 'Todos los años' : `Año ${filters.year}`;
  const arcFilterLabel =
    filters.arciprestazgo === 'todos'
      ? 'Todos los Arciprestazgos'
      : cleanPdfText(normalizeArciprestazgoName(filters.arciprestazgo));
  const parishFilterLabel =
    filters.parroquia === 'todas'
      ? 'Todas las Parroquias'
      : cleanPdfText(normalizeParroquiaName(filters.parroquia));
  const estadoFilterToken =
    filters.estado === 'todos'
      ? 'Todos los estados'
      : filters.estado === 'abierto'
      ? 'Estado: Solo abiertos'
      : filters.estado === 'cerrado'
      ? 'Estado: Cupos llenos'
      : 'Estado: Finalizados';

  // Aggregate metrics
  const totalEncuentros = sorted.length;
  const encuentrosCountLabel =
    totalEncuentros === 1 ? '1 encuentro' : `${totalEncuentros} encuentros`;
  const uniqueArcCount = groups.length;
  const uniqueParishCount = new Set(sorted.map((e) => e.parroquia)).size;
  const totalCupos = sorted.reduce((acc, e) => acc + e.cuposTotales, 0);
  const totalReservados = sorted.reduce((acc, e) => acc + e.cuposReservados, 0);
  const totalDisponibles = sorted.reduce(
    (acc, e) => acc + Math.max(0, e.cuposTotales - e.cuposReservados),
    0
  );

  // ──────────────────────────────────────────────────────────────
  // PAGE 1: FILTER SUMMARY & METRIC STRIP (Dynamic non-overlapping Y)
  // ──────────────────────────────────────────────────────────────
  let cursorY = tableMarginTop;

  // Filter summary box: calculate exact wrapped line heights BEFORE drawing
  const innerPadX = 4.5;
  const boxInnerWidth = contentWidth - innerPadX * 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  const reportTitleLines = doc.splitTextToSize(
    cleanPdfText('Informe de Programación y Disponibilidad de Encuentros EPIM'),
    boxInnerWidth
  ) as string[];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.3);
  const filterCriteriaText = cleanPdfText(
    `Filtros aplicados: ${yearFilterLabel}  ·  ${arcFilterLabel}  ·  ${parishFilterLabel}  ·  ${estadoFilterToken}`
  );
  const filterCriteriaLines = doc.splitTextToSize(
    filterCriteriaText,
    boxInnerWidth
  ) as string[];

  doc.setFontSize(7.8);
  const orderText = cleanPdfText(
    'Orden del documento: 1° Arciprestazgo  ·  2° Parroquia Sede (A-Z)  ·  3° Fechas programadas (cronológico)'
  );
  const orderLines = doc.splitTextToSize(orderText, boxInnerWidth) as string[];

  const titleBlockH = reportTitleLines.length * 4.6;
  const criteriaBlockH = filterCriteriaLines.length * 3.9;
  const orderBlockH = orderLines.length * 3.6;
  const summaryBoxHeight = 4 + titleBlockH + 1.5 + criteriaBlockH + 1.2 + orderBlockH + 3.8;

  // Draw summary container
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.25);
  doc.roundedRect(marginX, cursorY, contentWidth, summaryBoxHeight, 1.8, 1.8, 'FD');

  let textY = cursorY + 5.2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(24, 24, 27);
  for (const line of reportTitleLines) {
    doc.text(line, marginX + innerPadX, textY);
    textY += 4.6;
  }

  textY += 0.8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.3);
  doc.setTextColor(63, 63, 70);
  for (const line of filterCriteriaLines) {
    doc.text(line, marginX + innerPadX, textY);
    textY += 3.9;
  }

  textY += 0.6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(113, 113, 122);
  for (const line of orderLines) {
    doc.text(line, marginX + innerPadX, textY);
    textY += 3.6;
  }

  cursorY += summaryBoxHeight + 3.5;

  // KPI Cards Row (4 proportional columns)
  const kpiGap = 3.5;
  const kpiWidth = (contentWidth - kpiGap * 3) / 4;
  const kpiHeight = 14.5;
  const kpiItems: Array<{ label: string; value: string; accent?: boolean }> = [
    {
      label: 'Encuentros incluidos',
      value: encuentrosCountLabel,
    },
    {
      label: 'Cobertura territorial',
      value: `${uniqueParishCount} parr. · ${uniqueArcCount} arcip.`,
    },
    {
      label: 'Capacidad y reservas',
      value: `${totalCupos} tot. · ${totalReservados} res.`,
    },
    {
      label: 'Cupos disponibles',
      value: `${totalDisponibles} ${totalDisponibles === 1 ? 'pareja' : 'parejas'}`,
      accent: true,
    },
  ];

  kpiItems.forEach((item, index) => {
    const cardX = marginX + index * (kpiWidth + kpiGap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.25);
    doc.roundedRect(cardX, cursorY, kpiWidth, kpiHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);
    doc.setTextColor(113, 113, 122);
    const clampedLabel = (
      doc.splitTextToSize(cleanPdfText(item.label), kpiWidth - 6) as string[]
    )[0];
    doc.text(clampedLabel || '', cardX + 3, cursorY + 5.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.8);
    if (item.accent) {
      doc.setTextColor(220, 31, 38);
    } else {
      doc.setTextColor(24, 24, 27);
    }
    const clampedVal = (
      doc.splitTextToSize(cleanPdfText(item.value), kpiWidth - 6) as string[]
    )[0];
    doc.text(clampedVal || '', cardX + 3, cursorY + 11.2);
  });

  cursorY += kpiHeight + 4.5;

  // ──────────────────────────────────────────────────────────────
  // MAIN SCHEDULE TABLE (Grouped by Arciprestazgo -> Parroquia -> Fechas)
  // ──────────────────────────────────────────────────────────────
  if (sorted.length === 0) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(228, 228, 231);
    doc.roundedRect(marginX, cursorY, contentWidth, 22, 1.8, 1.8, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(82, 82, 91);
    doc.text(
      cleanPdfText('No existen encuentros EPIM que coincidan con los filtros seleccionados.'),
      pageWidth / 2,
      cursorY + 12.5,
      { align: 'center' }
    );
  } else {
    // Explicit column widths summing exactly to contentWidth so columns never squish or overlap
    const colWidths =
      filters.orientation === 'landscape'
        ? {
            // Sum = 10 + 62 + 68 + 43 + 40 + 28.4 = 251.4mm (Letter Landscape contentWidth)
            0: 10,
            1: 62,
            2: 68,
            3: 43,
            4: 40,
            5: contentWidth - (10 + 62 + 68 + 43 + 40),
          }
        : {
            // Sum = 9.5 + 45 + 51 + 32 + 29 + 21.4 = 187.9mm (Letter Portrait contentWidth)
            0: 9.5,
            1: 45,
            2: 51,
            3: 32,
            4: 29,
            5: contentWidth - (9.5 + 45 + 51 + 32 + 29),
          };

    const bodyFontSize = filters.orientation === 'landscape' ? 8.1 : 7.6;
    const cellPadH = 2.8;
    const maxDateTextWidth = colWidths[2] - cellPadH * 2 - 1.2;

    const tableBody: RowInput[] = [];
    const dateLinesByBodyRow = new Map<number, StyledDatePdfLine[]>();
    let rowCounter = 1;

    for (const group of groups) {
      const groupCountText =
        group.encounters.length === 1
          ? '1 encuentro'
          : `${group.encounters.length} encuentros`;

      // Non-redundant group banner row: group.arciprestazgo already begins with "Arciprestazgo ..."
      tableBody.push([
        {
          content: cleanPdfText(
            `${group.arciprestazgo}   ·   ${groupCountText}   ·   Cupos disponibles: ${group.totalDisponibles} de ${group.totalCupos}`
          ),
          colSpan: 6,
          styles: {
            fillColor: [253, 242, 242],
            textColor: [185, 25, 31],
            fontStyle: 'bold',
            fontSize: 8.4,
            halign: 'left',
            valign: 'middle',
            cellPadding: { top: 2.8, right: 3.2, bottom: 2.8, left: 3.2 },
          },
        },
      ]);

      for (const enc of group.encounters) {
        const styledDateLines = buildStyledDateLinesForPdf(
          doc,
          enc,
          bodyFontSize,
          maxDateTextWidth
        );
        const dateLinesPlain = styledDateLines.map((l) => l.plainText).join('\n');

        const parishCellLines = [
          enc.parroquia,
          filters.year === 'todos' ? `Año pastoral: ${enc.year}` : '',
          enc.sedeDetalle ? `Lugar: ${enc.sedeDetalle}` : 'Lugar: Salón Parroquial',
        ]
          .filter(Boolean)
          .join('\n');

        const scheduleCellLines = [
          enc.horario || 'Horario por confirmar',
          enc.aporteInfo ? `Info: ${enc.aporteInfo}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        const contactCellLines = [
          `Tel: ${enc.telefonoContacto || 'Por confirmar'}`,
          enc.coordinadores
            ? `Coord: ${enc.coordinadores}`
            : 'Coord: Equipo de Pastoral Familiar',
        ].join('\n');

        const disponibles = Math.max(0, enc.cuposTotales - enc.cuposReservados);
        const quotaCellLines = [
          `Totales: ${enc.cuposTotales}`,
          `Reservados: ${enc.cuposReservados}`,
          `Disponibles: ${disponibles}`,
          `Estado: ${formatEstadoLabel(enc.estado)}`,
        ].join('\n');

        const bodyRowIndex = tableBody.length;
        dateLinesByBodyRow.set(bodyRowIndex, styledDateLines);

        tableBody.push([
          cleanPdfText(String(rowCounter)),
          cleanPdfText(parishCellLines),
          dateLinesPlain,
          cleanPdfText(scheduleCellLines),
          cleanPdfText(contactCellLines),
          cleanPdfText(quotaCellLines),
        ]);
        rowCounter += 1;
      }
    }

    autoTable(doc, {
      startY: cursorY,
      margin: {
        top: tableMarginTop,
        right: marginX,
        bottom: tableMarginBottom,
        left: marginX,
      },
      tableWidth: contentWidth,
      rowPageBreak: 'avoid',
      showHead: 'everyPage',
      head: [
        [
          'N°',
          'Parroquia Sede y Lugar',
          'Fechas Programadas',
          'Horario y Observaciones',
          'Contacto y Coordinación',
          'Cupos y Estado',
        ],
      ],
      body: tableBody,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: bodyFontSize,
        cellPadding: { top: 2.8, right: cellPadH, bottom: 2.8, left: cellPadH },
        overflow: 'linebreak',
        valign: 'top',
        textColor: [39, 39, 42],
        lineColor: [228, 228, 231],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [74, 75, 78], // Institutional Charcoal #4A4B4E
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: filters.orientation === 'landscape' ? 8.3 : 7.8,
        valign: 'middle',
        cellPadding: { top: 3.2, right: cellPadH, bottom: 3.2, left: cellPadH },
      },
      columnStyles: {
        0: { cellWidth: colWidths[0], halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: colWidths[1] },
        2: { cellWidth: colWidths[2] },
        3: { cellWidth: colWidths[3] },
        4: { cellWidth: colWidths[4] },
        5: { cellWidth: colWidths[5] },
      },
      didParseCell: (data) => {
        if (data.column.index === 0 && data.cell.colSpan === 1) {
          data.cell.styles.halign = 'center';
          data.cell.styles.cellPadding = {
            top: data.section === 'head' ? 3.2 : 2.8,
            right: 1.5,
            bottom: data.section === 'head' ? 3.2 : 2.8,
            left: 1.5,
          };
        }
      },
      willDrawCell: (data) => {
        if (
          data.section === 'body' &&
          data.column.index === 2 &&
          data.cell.colSpan === 1 &&
          dateLinesByBodyRow.has(data.row.index)
        ) {
          // Suppress default plain-text render; rich-text lines are drawn in didDrawCell
          data.cell.text = [];
        }
      },
      didDrawCell: (data) => {
        if (
          data.section === 'body' &&
          data.column.index === 2 &&
          data.cell.colSpan === 1
        ) {
          const styledLines = dateLinesByBodyRow.get(data.row.index);
          if (!styledLines || styledLines.length === 0) return;

          const k = doc.internal.scaleFactor;
          const fontSizeMm = bodyFontSize / k;
          const lineHeightFactor = doc.getLineHeightFactor
            ? doc.getLineHeightFactor()
            : 1.15;
          const lineHeight = fontSizeMm * lineHeightFactor;
          const startX = data.cell.x + data.cell.padding('left');
          let lineY =
            data.cell.y + data.cell.padding('top') + fontSizeMm * (2 - 1.15);

          doc.setFontSize(bodyFontSize);
          for (const item of styledLines) {
            if (item.kind === 'headline') {
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(220, 31, 38); // Institutional Crimson #DC1F26
              doc.text(item.text, startX, lineY);
            } else if (item.kind === 'group-first') {
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(24, 24, 27);
              doc.text(item.prefix, startX, lineY);
              if (item.rest) {
                const prefixW = doc.getTextWidth(`${item.prefix} `);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(63, 63, 70);
                doc.text(item.rest, startX + prefixW, lineY);
              }
            } else {
              doc.setFont('helvetica', 'normal');
              doc.setTextColor(63, 63, 70);
              doc.text(item.text, startX, lineY);
            }
            lineY += lineHeight;
          }
        }
      },
    });

    // ──────────────────────────────────────────────────────────────
    // OPTIONAL APPENDIX: CONFIRMED COUPLE RESERVATIONS
    // ──────────────────────────────────────────────────────────────
    if (filters.includeReservationsAppendix) {
      const encounterIds = new Set(sorted.map((e) => e.id));
      const encounterOrderMap = new Map<string, number>();
      const encounterById = new Map<string, EpimEncounter>();
      sorted.forEach((e, idx) => {
        encounterOrderMap.set(e.id, idx);
        encounterById.set(e.id, e);
      });

      const matchingReservations = reservations
        .filter((r) => r.estado === 'confirmada' && encounterIds.has(r.encounterId))
        .sort((a, b) => {
          const idxA = encounterOrderMap.get(a.encounterId) ?? 9999;
          const idxB = encounterOrderMap.get(b.encounterId) ?? 9999;
          if (idxA !== idxB) return idxA - idxB;
          return a.createdAt.localeCompare(b.createdAt);
        });

      const lastTable = (doc as unknown as { lastAutoTable?: { finalY?: number } })
        .lastAutoTable;
      let nextY = (lastTable?.finalY ?? cursorY) + 8;

      if (nextY + 28 > pageHeight - tableMarginBottom) {
        doc.addPage();
        nextY = tableMarginTop;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(24, 24, 27);
      doc.text(
        cleanPdfText(
          `Anexo · Parejas con Reserva Confirmada (${matchingReservations.length})`
        ),
        marginX,
        nextY + 4
      );
      nextY += 6.5;

      if (matchingReservations.length === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.2);
        doc.setTextColor(113, 113, 122);
        doc.text(
          cleanPdfText(
            'No hay reservaciones confirmadas registradas para los encuentros incluidos en este filtro.'
          ),
          marginX,
          nextY + 4
        );
      } else {
        const resColWidths =
          filters.orientation === 'landscape'
            ? {
                0: 25,
                1: 62,
                2: 58,
                3: 46,
                4: contentWidth - (25 + 62 + 58 + 46),
              }
            : {
                0: 22,
                1: 46,
                2: 44,
                3: 34,
                4: contentWidth - (22 + 46 + 44 + 34),
              };

        const resBody: RowInput[] = matchingReservations.map((r) => {
          const matchedEnc = encounterById.get(r.encounterId);
          let formattedDatesBlock = r.fechasEpim;
          if (matchedEnc) {
            const grouped = getGroupedEncounterDatesEs(matchedEnc);
            if (grouped.groups.length > 0) {
              formattedDatesBlock = grouped.groups
                .map((g) => `${g.monthName} ${g.year}: ${g.daysLabel}`)
                .join('\n');
            } else if (grouped.monthsHeadline) {
              formattedDatesBlock = grouped.monthsHeadline;
            }
          }

          return [
            cleanPdfText(r.codigoReserva),
            cleanPdfText(
              `${normalizeParroquiaName(r.parroquiaEpim)}\n${normalizeArciprestazgoName(
                r.arciprestazgo
              )}\n${formattedDatesBlock}`
            ),
            cleanPdfText(
              `Novia: ${r.nombreNovia}\nNovio: ${r.nombreNovio}${
                r.documentoIdentidad ? `\nCédulas: ${r.documentoIdentidad}` : ''
              }`
            ),
            cleanPdfText(
              `Tel: ${r.telefonoPareja}${
                r.correoPareja ? `\nCorreo: ${r.correoPareja}` : ''
              }`
            ),
            cleanPdfText(
              `${
                r.parroquiaMatrimonio
                  ? `Boda en: ${normalizeParroquiaName(r.parroquiaMatrimonio)}`
                  : 'Parroquia boda: Por definir'
              }${r.fechaPrevistaBoda ? `\nFecha boda: ${r.fechaPrevistaBoda}` : ''}`
            ),
          ];
        });

        autoTable(doc, {
          startY: nextY,
          margin: {
            top: tableMarginTop,
            right: marginX,
            bottom: tableMarginBottom,
            left: marginX,
          },
          tableWidth: contentWidth,
          rowPageBreak: 'avoid',
          showHead: 'everyPage',
          head: [
            [
              'Código',
              'Encuentro EPIM Asignado',
              'Datos de los Novios',
              'Contacto Pareja',
              'Parroquia de Matrimonio',
            ],
          ],
          body: resBody,
          theme: 'grid',
          styles: {
            font: 'helvetica',
            fontSize: filters.orientation === 'landscape' ? 7.9 : 7.4,
            cellPadding: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
            overflow: 'linebreak',
            valign: 'top',
            textColor: [39, 39, 42],
            lineColor: [228, 228, 231],
            lineWidth: 0.2,
          },
          headStyles: {
            fillColor: [220, 31, 38],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: filters.orientation === 'landscape' ? 8.1 : 7.6,
            valign: 'middle',
          },
          columnStyles: {
            0: { cellWidth: resColWidths[0], fontStyle: 'bold' },
            1: { cellWidth: resColWidths[1] },
            2: { cellWidth: resColWidths[2] },
            3: { cellWidth: resColWidths[3] },
            4: { cellWidth: resColWidths[4] },
          },
        });
      }
    }
  }

  // ──────────────────────────────────────────────────────────────
  // INSTITUTIONAL HEADER & FOOTER ON EVERY PAGE (Non-overlapping zones)
  // ──────────────────────────────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  const rightMetaWidth = filters.orientation === 'landscape' ? 56 : 48;
  const logoBoxSize = 20;
  const titleStartX = marginX + logoBoxSize + 4; // 38mm
  const titleMaxWidth = pageWidth - marginX - rightMetaWidth - 4 - titleStartX;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    doc.setPage(pageNum);

    // Clear header background strictly above headerBottomY
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageWidth, headerBottomY + 1, 'F');

    // Top Institutional Crimson Accent Bar
    doc.setFillColor(220, 31, 38); // #DC1F26
    doc.rect(0, 0, pageWidth, 2.2, 'F');

    // Logo in proportional bounding box [marginX .. marginX + 20, y = 6.2 .. 26.2]
    if (logoAsset) {
      const scale = Math.min(
        logoBoxSize / logoAsset.width,
        logoBoxSize / logoAsset.height
      );
      const drawW = logoAsset.width * scale;
      const drawH = logoAsset.height * scale;
      const drawX = marginX + (logoBoxSize - drawW) / 2;
      const drawY = 6.2 + (logoBoxSize - drawH) / 2;
      doc.addImage(
        logoAsset.dataUrl,
        'PNG',
        drawX,
        drawY,
        drawW,
        drawH,
        'logo-pastoral-epim',
        'FAST'
      );
    } else {
      // Minimal geometric fallback emblem if offline
      doc.setDrawColor(220, 31, 38);
      doc.setLineWidth(0.5);
      doc.roundedRect(marginX, 7, 18, 18, 2, 2, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(220, 31, 38);
      doc.text('EPIM', marginX + 9, 17.2, { align: 'center' });
    }

    // Institutional Identification (Strictly bounded to titleMaxWidth)
    const line1 = (
      doc.splitTextToSize(
        cleanPdfText('ARQUIDIÓCESIS DE MARACAIBO'),
        titleMaxWidth
      ) as string[]
    )[0];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(220, 31, 38);
    doc.text(line1 || '', titleStartX, 10.6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(24, 24, 27);
    const line2 = (
      doc.splitTextToSize(
        cleanPdfText('Secretariado de Pastoral Familiar'),
        titleMaxWidth
      ) as string[]
    )[0];
    doc.text(line2 || '', titleStartX, 16.0);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(filters.orientation === 'landscape' ? 9.2 : 8.1);
    doc.setTextColor(74, 75, 78);
    const line3 = (
      doc.splitTextToSize(
        cleanPdfText(
          'Programa EPIM — Encuentros de Preparación Inmediata al Matrimonio'
        ),
        titleMaxWidth
      ) as string[]
    )[0];
    doc.text(line3 || '', titleStartX, 21.0);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(113, 113, 122);
    const line4 = (
      doc.splitTextToSize(
        cleanPdfText(
          'Reporte Oficial de Planificación Pastoral y Cartelera Arquidiocesana'
        ),
        titleMaxWidth
      ) as string[]
    )[0];
    doc.text(line4 || '', titleStartX, 25.4);

    // Right Metadata Column (Strictly bounded to rightMetaWidth)
    const rightX = pageWidth - marginX;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(24, 24, 27);
    const rLine1 = (
      doc.splitTextToSize(cleanPdfText('REPORTE OFICIAL EPIM'), rightMetaWidth) as string[]
    )[0];
    doc.text(rLine1 || '', rightX, 10.6, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.0);
    doc.setTextColor(220, 31, 38);
    const rLine2 = (
      doc.splitTextToSize(cleanPdfText(yearFilterLabel), rightMetaWidth) as string[]
    )[0];
    doc.text(rLine2 || '', rightX, 15.4, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(82, 82, 91);
    const rLine3 = (
      doc.splitTextToSize(
        cleanPdfText(`Emisión: ${emittedLabel}`),
        rightMetaWidth
      ) as string[]
    )[0];
    doc.text(rLine3 || '', rightX, 19.9, { align: 'right' });

    const rLine4 = (
      doc.splitTextToSize(
        cleanPdfText(`Registros: ${encuentrosCountLabel}`),
        rightMetaWidth
      ) as string[]
    )[0];
    doc.text(rLine4 || '', rightX, 24.2, { align: 'right' });

    // Header Bottom Divider Line + Crimson Highlight Segment
    doc.setDrawColor(212, 212, 216);
    doc.setLineWidth(0.3);
    doc.line(marginX, headerBottomY, pageWidth - marginX, headerBottomY);

    doc.setDrawColor(220, 31, 38);
    doc.setLineWidth(0.75);
    doc.line(marginX, headerBottomY, marginX + 34, headerBottomY);

    // Footer strictly below (pageHeight - tableMarginBottom)
    const footerLineY = pageHeight - 13.5;
    doc.setDrawColor(228, 228, 231);
    doc.setLineWidth(0.25);
    doc.line(marginX, footerLineY, pageWidth - marginX, footerLineY);

    const footerLeftMaxW = contentWidth - 36;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);
    doc.setTextColor(113, 113, 122);
    const footerContact = cleanPdfText(
      `Arquidiócesis de Maracaibo · Secretariado de Pastoral Familiar · Programa EPIM · Contacto: ${config.secretariadoTelefono} · ${config.secretariadoCorreo}`
    );
    const footerLeftLine = (
      doc.splitTextToSize(footerContact, footerLeftMaxW) as string[]
    )[0];
    doc.text(footerLeftLine || '', marginX, footerLineY + 4.8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(74, 75, 78);
    doc.text(
      cleanPdfText(`Página ${pageNum} de ${totalPages}`),
      pageWidth - marginX,
      footerLineY + 4.8,
      { align: 'right' }
    );
  }

  // Construct descriptive, clean filename
  const dateStamp = `${emittedAt.getFullYear()}-${String(
    emittedAt.getMonth() + 1
  ).padStart(2, '0')}-${String(emittedAt.getDate()).padStart(2, '0')}`;
  const yearSlug = filters.year === 'todos' ? 'Todos' : String(filters.year);
  const slugify = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 28);

  const arcSlug =
    filters.arciprestazgo === 'todos' ? '' : `_${slugify(filters.arciprestazgo)}`;
  const parishSlug =
    filters.parroquia === 'todas' ? '' : `_${slugify(filters.parroquia)}`;

  const filename = `Informe_EPIM_Maracaibo_${yearSlug}${arcSlug}${parishSlug}_${dateStamp}.pdf`;
  doc.save(filename);

  return { filename, totalPages };
}

// ──────────────────────────────────────────────────────────────────────────────
// SINGLE-PAGE EXTRA OFICIO MINIMALIST ARCHDIOCESAN CALENDAR PDF
// Paper size: Extra Oficio (8.5" × 14" = 215.9 mm × 355.6 mm), Vertical (Portrait)
// Guaranteed 1-page adaptive layout containing 100% of the selected year's EPIMs
// ──────────────────────────────────────────────────────────────────────────────

interface CalendarWrappedDateLine {
  prefix?: string;
  rest: string;
}

interface MeasuredCalendarRow {
  parishLines: string[];
  dateLines: CalendarWrappedDateLine[];
  phoneLines: string[];
  heightMm: number;
}

interface MeasuredCalendarItem {
  kind: 'month' | 'row';
  monthLabel?: string;
  monthCount?: number;
  row?: MeasuredCalendarRow;
  isEvenRow?: boolean;
  heightMm: number;
}

interface CalendarLayoutPreset {
  columns: 1 | 2;
  fontSize: number;
  lineHeightFactor: number;
  rowPadY: number;
  monthHeaderH: number;
  monthGapTop: number;
  tableHeaderH: number;
}

function sortEncountersChronologicallyForCalendar(
  encounters: EpimEncounter[]
): EpimEncounter[] {
  return encounters
    .map((enc) => ({
      ...enc,
      arciprestazgo: normalizeArciprestazgoName(enc.arciprestazgo),
      parroquia: normalizeParroquiaName(enc.parroquia),
    }))
    .sort((a, b) => {
      const firstA = getEncounterDates(a)[0] || a.fechaInicio || '';
      const firstB = getEncounterDates(b)[0] || b.fechaInicio || '';
      const cmpStart = firstA.localeCompare(firstB);
      if (cmpStart !== 0) return cmpStart;

      const cmpEnd = (a.fechaFin || '').localeCompare(b.fechaFin || '');
      if (cmpEnd !== 0) return cmpEnd;

      return a.parroquia.localeCompare(b.parroquia, 'es', { sensitivity: 'base' });
    });
}

function wrapCalendarDateLines(
  doc: jsPDF,
  enc: EpimEncounter,
  reportYear: number,
  fontSize: number,
  maxWidthMm: number
): CalendarWrappedDateLine[] {
  const summary = getGroupedEncounterDatesEs(enc);
  doc.setFontSize(fontSize);

  if (summary.groups.length === 0) {
    doc.setFont('helvetica', 'normal');
    const fallback = cleanPdfText(summary.monthsHeadline || 'Por confirmar');
    const wrapped = doc.splitTextToSize(fallback, maxWidthMm) as string[];
    return (wrapped.length > 0 ? wrapped : ['Por confirmar']).map((line) => ({
      rest: line,
    }));
  }

  const lines: CalendarWrappedDateLine[] = [];
  for (const grp of summary.groups) {
    const prefix = cleanPdfText(
      grp.year === reportYear
        ? `${grp.monthName}:`
        : `${grp.monthName} ${grp.year}:`
    );
    const daysText = cleanPdfText(grp.daysLabel);

    doc.setFont('helvetica', 'bold');
    const prefixSpaceW = doc.getTextWidth(`${prefix} `);

    doc.setFont('helvetica', 'normal');
    const words = daysText.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push({ prefix, rest: '' });
      continue;
    }

    const firstMaxW = Math.max(8, maxWidthMm - prefixSpaceW);
    const firstWords: string[] = [];
    let idx = 0;
    while (idx < words.length) {
      const candidate = [...firstWords, words[idx]].join(' ');
      if (doc.getTextWidth(candidate) <= firstMaxW) {
        firstWords.push(words[idx]);
        idx += 1;
      } else {
        break;
      }
    }

    if (firstWords.length > 0) {
      lines.push({ prefix, rest: firstWords.join(' ') });
    } else {
      lines.push({ prefix, rest: '' });
    }

    if (idx < words.length) {
      const rem = words.slice(idx).join(' ');
      const cont = doc.splitTextToSize(rem, maxWidthMm) as string[];
      for (const c of cont) {
        if (c) lines.push({ rest: c });
      }
    }
  }

  return lines;
}

function measureCalendarLayout(
  doc: jsPDF,
  monthBuckets: Array<{ month: number; label: string; encounters: EpimEncounter[] }>,
  reportYear: number,
  usableWidthMm: number,
  usableHeightMm: number,
  preset: CalendarLayoutPreset
): {
  fits: boolean;
  colWidth: number;
  colGap: number;
  dateColW: number;
  parishColW: number;
  phoneColW: number;
  columnsItems: MeasuredCalendarItem[][];
  maxRenderedHeight: number;
} {
  const colGap = preset.columns === 2 ? 5.5 : 0;
  const colWidth =
    preset.columns === 2 ? (usableWidthMm - colGap) / 2 : usableWidthMm;

  const phoneColW = preset.columns === 2 ? 22.5 : 34;
  const dateColW =
    preset.columns === 2
      ? Math.round((colWidth - phoneColW) * 0.48 * 10) / 10
      : Math.round((colWidth - phoneColW) * 0.49 * 10) / 10;
  const parishColW = colWidth - phoneColW - dateColW;

  const cellPadX = preset.columns === 2 ? 1.6 : 2.4;
  const k = doc.internal.scaleFactor;
  const lineH = (preset.fontSize / k) * preset.lineHeightFactor;

  const stream: MeasuredCalendarItem[] = [];

  monthBuckets.forEach((bucket, bucketIdx) => {
    stream.push({
      kind: 'month',
      monthLabel: bucket.label,
      monthCount: bucket.encounters.length,
      heightMm:
        preset.monthHeaderH + (bucketIdx === 0 ? 0 : preset.monthGapTop),
    });

    bucket.encounters.forEach((enc, rowIdx) => {
      const dateLines = wrapCalendarDateLines(
        doc,
        enc,
        reportYear,
        preset.fontSize,
        dateColW - cellPadX * 2
      );

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(preset.fontSize);
      const parishRaw = cleanPdfText(normalizeParroquiaName(enc.parroquia));
      const parishLines = (
        doc.splitTextToSize(parishRaw, parishColW - cellPadX * 2) as string[]
      ).filter(Boolean);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(preset.fontSize);
      const phoneRaw = cleanPdfText(enc.telefonoContacto || 'En despacho');
      const phoneLines = (
        doc.splitTextToSize(phoneRaw, phoneColW - cellPadX * 2) as string[]
      ).filter(Boolean);

      const maxLines = Math.max(
        1,
        dateLines.length,
        parishLines.length,
        phoneLines.length
      );
      const rowHeight = maxLines * lineH + preset.rowPadY * 2;

      stream.push({
        kind: 'row',
        row: {
          parishLines: parishLines.length > 0 ? parishLines : [parishRaw],
          dateLines,
          phoneLines: phoneLines.length > 0 ? phoneLines : [phoneRaw],
          heightMm: rowHeight,
        },
        isEvenRow: rowIdx % 2 === 1,
        heightMm: rowHeight,
      });
    });
  });

  const maxColBodyH = usableHeightMm - preset.tableHeaderH;

  if (preset.columns === 1) {
    const totalBodyH = stream.reduce((acc, item) => acc + item.heightMm, 0);
    const totalH = preset.tableHeaderH + totalBodyH;
    return {
      fits: totalH <= usableHeightMm,
      colWidth,
      colGap,
      dateColW,
      parishColW,
      phoneColW,
      columnsItems: [stream],
      maxRenderedHeight: totalH,
    };
  }

  // Pack across 2 columns cleanly, repeating "(cont.)" month header if split mid-month
  const rawTotalBodyH = stream.reduce((acc, item) => acc + item.heightMm, 0);
  const idealSplitBodyH = Math.min(maxColBodyH, rawTotalBodyH * 0.52 + 4);

  const col1: MeasuredCalendarItem[] = [];
  const col2: MeasuredCalendarItem[] = [];
  let col1H = 0;
  let col2H = 0;
  let currentCol: 1 | 2 = 1;
  let activeMonthLabel = '';

  for (let i = 0; i < stream.length; i++) {
    const item = stream[i];
    const nextItem = stream[i + 1];

    if (item.kind === 'month') {
      activeMonthLabel = item.monthLabel || '';
      const firstRowH = nextItem?.kind === 'row' ? nextItem.heightMm : 0;
      const effectiveH =
        col1.length === 0 ? preset.monthHeaderH : item.heightMm;

      if (
        currentCol === 1 &&
        col1.length > 0 &&
        (col1H + effectiveH + firstRowH > maxColBodyH ||
          (col1H >= idealSplitBodyH && col1H + effectiveH + firstRowH > idealSplitBodyH))
      ) {
        currentCol = 2;
      }

      if (currentCol === 1) {
        const adjusted =
          col1.length === 0 ? { ...item, heightMm: preset.monthHeaderH } : item;
        col1.push(adjusted);
        col1H += adjusted.heightMm;
      } else {
        const adjusted =
          col2.length === 0 ? { ...item, heightMm: preset.monthHeaderH } : item;
        col2.push(adjusted);
        col2H += adjusted.heightMm;
      }
    } else {
      if (currentCol === 1 && col1H + item.heightMm > maxColBodyH) {
        currentCol = 2;
        if (activeMonthLabel) {
          const contHeader: MeasuredCalendarItem = {
            kind: 'month',
            monthLabel: `${activeMonthLabel} (cont.)`,
            heightMm: preset.monthHeaderH,
          };
          col2.push(contHeader);
          col2H += contHeader.heightMm;
        }
      }

      if (currentCol === 1) {
        col1.push(item);
        col1H += item.heightMm;
      } else {
        col2.push(item);
        col2H += item.heightMm;
      }
    }
  }

  const maxRenderedHeight =
    preset.tableHeaderH + Math.max(col1H, col2H);

  return {
    fits: maxRenderedHeight <= usableHeightMm,
    colWidth,
    colGap,
    dateColW,
    parishColW,
    phoneColW,
    columnsItems: col2.length > 0 ? [col1, col2] : [col1],
    maxRenderedHeight,
  };
}

export async function generateAndDownloadAnnualCalendarPdf(params: {
  year: number;
  encounters: EpimEncounter[];
  config: AppConfig;
}): Promise<{ filename: string; totalPages: number; totalEncounters: number }> {
  const { year, encounters, config } = params;
  const yearEncounters = sortEncountersChronologicallyForCalendar(
    encounters.filter((e) => e.year === year)
  );
  const logoAsset = await getInstitutionalLogoAsset();

  // Extra Oficio paper size in Portrait: 8.5" x 14" = 215.9 mm x 355.6 mm
  const PAGE_W = 215.9;
  const PAGE_H = 355.6;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [PAGE_W, PAGE_H],
    compress: true,
  });

  const marginX = 11;
  const contentWidth = PAGE_W - marginX * 2; // 193.9 mm
  const headerBottomY = 21.2;
  const bodyTopY = 23.8;
  const footerLineY = PAGE_H - 9.2; // 346.4 mm
  const usableBodyHeight = footerLineY - 2.0 - bodyTopY; // 320.6 mm

  // ──────────────────────────────────────────────────────────────
  // 1. SIMPLIFIED INSTITUTIONAL BRANDING HEADER
  // ──────────────────────────────────────────────────────────────
  doc.setFillColor(220, 31, 38); // Institutional Crimson #DC1F26
  doc.rect(0, 0, PAGE_W, 1.6, 'F');

  const logoSize = 13.5;
  if (logoAsset) {
    const scale = Math.min(logoSize / logoAsset.width, logoSize / logoAsset.height);
    const drawW = logoAsset.width * scale;
    const drawH = logoAsset.height * scale;
    const drawX = marginX + (logoSize - drawW) / 2;
    const drawY = 4.6 + (logoSize - drawH) / 2;
    doc.addImage(
      logoAsset.dataUrl,
      'PNG',
      drawX,
      drawY,
      drawW,
      drawH,
      'logo-calendario-epim',
      'FAST'
    );
  } else {
    doc.setDrawColor(220, 31, 38);
    doc.setLineWidth(0.4);
    doc.roundedRect(marginX, 5, 13, 13, 1.5, 1.5, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(220, 31, 38);
    doc.text('EPIM', marginX + 6.5, 12.5, { align: 'center' });
  }

  const titleX = marginX + logoSize + 3.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  doc.setTextColor(220, 31, 38);
  doc.text(
    cleanPdfText('ARQUIDIÓCESIS DE MARACAIBO · SECRETARIADO DE PASTORAL FAMILIAR'),
    titleX,
    8.2
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.2);
  doc.setTextColor(24, 24, 27);
  doc.text(
    cleanPdfText(`Calendario Arquidiocesano de Encuentros EPIM ${year}`),
    titleX,
    13.5
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(113, 113, 122);
  doc.text(
    cleanPdfText(
      'Encuentros de Preparación Inmediata al Matrimonio · Fechas, parroquias sede y teléfonos de contacto'
    ),
    titleX,
    17.8
  );

  // Right-aligned year & encounter count
  const rightX = PAGE_W - marginX;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(220, 31, 38);
  doc.text(String(year), rightX, 11.8, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.3);
  doc.setTextColor(82, 82, 91);
  doc.text(
    cleanPdfText(
      `${yearEncounters.length} ${
        yearEncounters.length === 1 ? 'encuentro' : 'encuentros'
      }`
    ),
    rightX,
    16.8,
    { align: 'right' }
  );

  // Header bottom hairline + crimson accent rule
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.25);
  doc.line(marginX, headerBottomY, rightX, headerBottomY);

  doc.setDrawColor(220, 31, 38);
  doc.setLineWidth(0.65);
  doc.line(marginX, headerBottomY, marginX + 28, headerBottomY);

  // ──────────────────────────────────────────────────────────────
  // 2. ADAPTIVE SINGLE-PAGE CALENDAR BODY
  // ──────────────────────────────────────────────────────────────
  if (yearEncounters.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(113, 113, 122);
    doc.text(
      cleanPdfText(`No hay encuentros EPIM programados para el año ${year}.`),
      PAGE_W / 2,
      bodyTopY + 24,
      { align: 'center' }
    );
  } else {
    // Group chronologically by start month (1..12)
    const bucketMap = new Map<number, EpimEncounter[]>();
    for (const enc of yearEncounters) {
      const firstIso = getEncounterDates(enc)[0] || enc.fechaInicio || '';
      const startMonth =
        Number(firstIso.split('-')[1]) || Math.min(12, Math.max(1, enc.mes || 1));
      const existing = bucketMap.get(startMonth);
      if (existing) {
        existing.push(enc);
      } else {
        bucketMap.set(startMonth, [enc]);
      }
    }

    const monthBuckets = Array.from(bucketMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([month, list]) => ({
        month,
        label: formatMonthName(month).toUpperCase(),
        encounters: list,
      }));

    // Ordered candidate presets from spacious 1-column down to ultra-dense 2-column
    const candidatePresets: CalendarLayoutPreset[] = [
      { columns: 1, fontSize: 9.0, lineHeightFactor: 1.22, rowPadY: 2.1, monthHeaderH: 5.6, monthGapTop: 2.0, tableHeaderH: 6.2 },
      { columns: 1, fontSize: 8.6, lineHeightFactor: 1.2, rowPadY: 1.85, monthHeaderH: 5.3, monthGapTop: 1.7, tableHeaderH: 5.8 },
      { columns: 1, fontSize: 8.2, lineHeightFactor: 1.18, rowPadY: 1.6, monthHeaderH: 5.0, monthGapTop: 1.4, tableHeaderH: 5.5 },
      { columns: 1, fontSize: 7.8, lineHeightFactor: 1.16, rowPadY: 1.35, monthHeaderH: 4.7, monthGapTop: 1.2, tableHeaderH: 5.2 },
      { columns: 1, fontSize: 7.4, lineHeightFactor: 1.15, rowPadY: 1.15, monthHeaderH: 4.4, monthGapTop: 1.0, tableHeaderH: 5.0 },
      { columns: 1, fontSize: 7.0, lineHeightFactor: 1.14, rowPadY: 0.95, monthHeaderH: 4.1, monthGapTop: 0.8, tableHeaderH: 4.8 },
      // 2-column presets when encounter count is high so all rows remain crisp on 1 page
      { columns: 2, fontSize: 7.8, lineHeightFactor: 1.16, rowPadY: 1.35, monthHeaderH: 4.6, monthGapTop: 1.2, tableHeaderH: 5.2 },
      { columns: 2, fontSize: 7.4, lineHeightFactor: 1.15, rowPadY: 1.15, monthHeaderH: 4.3, monthGapTop: 1.0, tableHeaderH: 5.0 },
      { columns: 2, fontSize: 7.0, lineHeightFactor: 1.14, rowPadY: 1.0, monthHeaderH: 4.0, monthGapTop: 0.8, tableHeaderH: 4.8 },
      { columns: 2, fontSize: 6.6, lineHeightFactor: 1.13, rowPadY: 0.85, monthHeaderH: 3.8, monthGapTop: 0.7, tableHeaderH: 4.5 },
      { columns: 2, fontSize: 6.2, lineHeightFactor: 1.12, rowPadY: 0.72, monthHeaderH: 3.5, monthGapTop: 0.6, tableHeaderH: 4.2 },
      { columns: 2, fontSize: 5.8, lineHeightFactor: 1.12, rowPadY: 0.62, monthHeaderH: 3.3, monthGapTop: 0.5, tableHeaderH: 4.0 },
      { columns: 2, fontSize: 5.4, lineHeightFactor: 1.1, rowPadY: 0.52, monthHeaderH: 3.1, monthGapTop: 0.4, tableHeaderH: 3.8 },
      { columns: 2, fontSize: 5.0, lineHeightFactor: 1.1, rowPadY: 0.45, monthHeaderH: 2.9, monthGapTop: 0.35, tableHeaderH: 3.6 },
    ];

    let chosenPreset = candidatePresets[candidatePresets.length - 1];
    let chosenLayout = measureCalendarLayout(
      doc,
      monthBuckets,
      year,
      contentWidth,
      usableBodyHeight,
      chosenPreset
    );

    for (const preset of candidatePresets) {
      const measured = measureCalendarLayout(
        doc,
        monthBuckets,
        year,
        contentWidth,
        usableBodyHeight,
        preset
      );
      if (measured.fits) {
        chosenPreset = preset;
        chosenLayout = measured;
        break;
      }
    }

    // Safety compression ratio if an extreme dataset (>130 encounters) still slightly exceeds usableBodyHeight
    const vScale =
      chosenLayout.maxRenderedHeight > usableBodyHeight
        ? usableBodyHeight / chosenLayout.maxRenderedHeight
        : 1;

    const effectiveFontSize = chosenPreset.fontSize * Math.min(1, vScale);
    const k = doc.internal.scaleFactor;
    const fontSizeMm = effectiveFontSize / k;
    const lineH = fontSizeMm * chosenPreset.lineHeightFactor;
    const cellPadX = chosenLayout.columnsItems.length === 2 ? 1.6 : 2.4;
    const tableHeaderH = chosenPreset.tableHeaderH * vScale;

    chosenLayout.columnsItems.forEach((colStream, colIdx) => {
      const colStartX =
        marginX + colIdx * (chosenLayout.colWidth + chosenLayout.colGap);
      let y = bodyTopY;

      // Minimalist Table Column Header
      doc.setFillColor(74, 75, 78); // Institutional Charcoal #4A4B4E
      doc.rect(colStartX, y, chosenLayout.colWidth, tableHeaderH, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(Math.min(8.2, effectiveFontSize + 0.2));
      doc.setTextColor(255, 255, 255);
      const headerBaselineY = y + tableHeaderH * 0.68;

      doc.text('Fechas', colStartX + cellPadX, headerBaselineY);
      doc.text(
        'Parroquia Sede',
        colStartX + chosenLayout.dateColW + cellPadX,
        headerBaselineY
      );
      doc.text(
        cleanPdfText('Teléfono'),
        colStartX + chosenLayout.colWidth - cellPadX,
        headerBaselineY,
        { align: 'right' }
      );

      y += tableHeaderH;

      // Render stream of Month Headers + Encounter Rows
      for (const item of colStream) {
        const scaledItemH = item.heightMm * vScale;

        if (item.kind === 'month') {
          const monthBarH = chosenPreset.monthHeaderH * vScale;
          const topGap = scaledItemH - monthBarH;
          y += topGap;

          doc.setFillColor(254, 242, 242); // Soft crimson tint #FEF2F2
          doc.rect(colStartX, y, chosenLayout.colWidth, monthBarH, 'F');

          doc.setDrawColor(254, 202, 202);
          doc.setLineWidth(0.18);
          doc.line(
            colStartX,
            y + monthBarH,
            colStartX + chosenLayout.colWidth,
            y + monthBarH
          );

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(Math.max(5.2, effectiveFontSize - 0.1));
          doc.setTextColor(185, 25, 31); // #B9191F
          const mBaseline = y + monthBarH * 0.7;
          doc.text(cleanPdfText(item.monthLabel || ''), colStartX + cellPadX, mBaseline);

          y += monthBarH;
        } else if (item.row) {
          if (item.isEvenRow) {
            doc.setFillColor(250, 250, 250);
            doc.rect(colStartX, y, chosenLayout.colWidth, scaledItemH, 'F');
          }

          // Subtle row bottom hairline
          doc.setDrawColor(236, 236, 240);
          doc.setLineWidth(0.15);
          doc.line(
            colStartX,
            y + scaledItemH,
            colStartX + chosenLayout.colWidth,
            y + scaledItemH
          );

          const firstBaselineY =
            y + chosenPreset.rowPadY * vScale + fontSizeMm * 0.84;

          // Column 1: Fechas (Bold Month Prefix + Regular Days)
          doc.setFontSize(effectiveFontSize);
          item.row.dateLines.forEach((dLine, idx) => {
            const lineY = firstBaselineY + idx * lineH;
            const dateX = colStartX + cellPadX;
            if (dLine.prefix) {
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(220, 31, 38);
              doc.text(dLine.prefix, dateX, lineY);
              if (dLine.rest) {
                const pW = doc.getTextWidth(`${dLine.prefix} `);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(39, 39, 42);
                doc.text(dLine.rest, dateX + pW, lineY);
              }
            } else {
              doc.setFont('helvetica', 'normal');
              doc.setTextColor(39, 39, 42);
              doc.text(dLine.rest, dateX, lineY);
            }
          });

          // Column 2: Parroquia Sede
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(effectiveFontSize);
          doc.setTextColor(24, 24, 27);
          const parishX = colStartX + chosenLayout.dateColW + cellPadX;
          item.row.parishLines.forEach((pLine, idx) => {
            doc.text(pLine, parishX, firstBaselineY + idx * lineH);
          });

          // Column 3: Teléfono de Contacto (Right-aligned)
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(effectiveFontSize);
          doc.setTextColor(63, 63, 70);
          const phoneRightX = colStartX + chosenLayout.colWidth - cellPadX;
          item.row.phoneLines.forEach((tLine, idx) => {
            doc.text(tLine, phoneRightX, firstBaselineY + idx * lineH, {
              align: 'right',
            });
          });

          y += scaledItemH;
        }
      }

      // Outer hairline border around the column table for crisp finish
      doc.setDrawColor(228, 228, 231);
      doc.setLineWidth(0.2);
      doc.rect(colStartX, bodyTopY, chosenLayout.colWidth, y - bodyTopY, 'S');
    });
  }

  // ──────────────────────────────────────────────────────────────
  // 3. MINIMALIST SINGLE-LINE FOOTER
  // ──────────────────────────────────────────────────────────────
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.22);
  doc.line(marginX, footerLineY, rightX, footerLineY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.setTextColor(113, 113, 122);
  doc.text(
    cleanPdfText(
      `Secretariado de Pastoral Familiar · Arquidiócesis de Maracaibo · Tel: ${config.secretariadoTelefono}`
    ),
    marginX,
    footerLineY + 4.2
  );

  doc.text(
    cleanPdfText(`Calendario Oficial EPIM ${year} · Formato Extra Oficio`),
    rightX,
    footerLineY + 4.2,
    { align: 'right' }
  );

  const filename = `Calendario_Arquidiocesano_EPIM_${year}_ExtraOficio.pdf`;
  doc.save(filename);

  return {
    filename,
    totalPages: doc.getNumberOfPages(),
    totalEncounters: yearEncounters.length,
  };
}

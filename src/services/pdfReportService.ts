import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import type { AppConfig, EpimEncounter, Reservation } from '../types/epim.ts';
import {
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

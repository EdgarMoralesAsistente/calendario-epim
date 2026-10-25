import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import type { AppConfig, EpimEncounter, Reservation } from '../types/epim.ts';
import {
  formatEncounterDatesEs,
  formatSingleDateEs,
  getEncounterDates,
  LOGO_URL_FALLBACK,
  LOGO_URL_PRIMARY,
  MARACAIBO_ARCIPRESTAZGOS,
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

function getArciprestazgoOrderIndex(arcName: string): number {
  const idx = MARACAIBO_ARCIPRESTAZGOS.findIndex((g) => g.nombre === arcName);
  return idx === -1 ? 999 : idx;
}

/**
 * Canonical report sorter requested by user:
 * 1° Arciprestazgo (pastoral zone order, then alphabetical)
 * 2° Parroquia (alphabetical A-Z)
 * 3° Fechas (chronological by first scheduled date, then closing date)
 */
export function sortEncountersForReport(encounters: EpimEncounter[]): EpimEncounter[] {
  return [...encounters].sort((a, b) => {
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
    if (filters.year !== 'todos' && enc.year !== filters.year) {
      return false;
    }
    if (filters.arciprestazgo !== 'todos' && enc.arciprestazgo !== filters.arciprestazgo) {
      return false;
    }
    if (filters.parroquia !== 'todas' && enc.parroquia !== filters.parroquia) {
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
  for (const enc of sortedEncounters) {
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
      : cleanPdfText(filters.arciprestazgo);
  const parishFilterLabel =
    filters.parroquia === 'todas'
      ? 'Todas las Parroquias'
      : cleanPdfText(filters.parroquia);
  const estadoFilterLabel =
    filters.estado === 'todos'
      ? 'Todos los estados'
      : filters.estado === 'abierto'
      ? 'Solo abiertos'
      : filters.estado === 'cerrado'
      ? 'Cerrados (cupos llenos)'
      : 'Finalizados';

  // Aggregate metrics
  const totalEncuentros = sorted.length;
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
    `Filtros aplicados: ${yearFilterLabel}  ·  Arciprestazgo: ${arcFilterLabel}  ·  Parroquia: ${parishFilterLabel}  ·  Estado: ${estadoFilterLabel}`
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
      value: `${totalEncuentros} encuentro(s)`,
    },
    {
      label: 'Cobertura territorial',
      value: `${uniqueParishCount} parr. · ${uniqueArcCount} zona(s)`,
    },
    {
      label: 'Capacidad y reservas',
      value: `${totalCupos} tot. · ${totalReservados} res.`,
    },
    {
      label: 'Cupos disponibles',
      value: `${totalDisponibles} parejas`,
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
    const tableBody: RowInput[] = [];
    let rowCounter = 1;

    for (const group of groups) {
      // Native colSpan group banner row -> 100% immune to overlap
      tableBody.push([
        {
          content: cleanPdfText(
            `ARCIPRESTAZGO: ${group.arciprestazgo}   ·   ${group.encounters.length} encuentro(s)   ·   Cupos disponibles en zona: ${group.totalDisponibles} de ${group.totalCupos}`
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
        const individualDates = getEncounterDates(enc);
        const summaryDates = formatEncounterDatesEs(enc);
        const dateLines = [
          `Resumen: ${summaryDates}`,
          ...individualDates.map(
            (iso, idx) => `- Fecha ${idx + 1}: ${formatSingleDateEs(iso)}`
          ),
        ].join('\n');

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

        tableBody.push([
          cleanPdfText(String(rowCounter)),
          cleanPdfText(parishCellLines),
          cleanPdfText(dateLines),
          cleanPdfText(scheduleCellLines),
          cleanPdfText(contactCellLines),
          cleanPdfText(quotaCellLines),
        ]);
        rowCounter += 1;
      }
    }

    // Explicit column widths summing exactly to contentWidth so columns never squish or overlap
    const colWidths =
      filters.orientation === 'landscape'
        ? {
            // Sum = 9 + 64 + 66 + 44 + 40 + 28.4 = 251.4mm (Letter Landscape contentWidth)
            0: 9,
            1: 64,
            2: 66,
            3: 44,
            4: 40,
            5: contentWidth - (9 + 64 + 66 + 44 + 40),
          }
        : {
            // Sum = 8 + 46 + 49 + 33 + 30 + 21.9 = 187.9mm (Letter Portrait contentWidth)
            0: 8,
            1: 46,
            2: 49,
            3: 33,
            4: 30,
            5: contentWidth - (8 + 46 + 49 + 33 + 30),
          };

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
          'Fechas Individuales del EPIM',
          'Horario y Observaciones',
          'Contacto y Coordinación',
          'Cupos y Estado',
        ],
      ],
      body: tableBody,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: filters.orientation === 'landscape' ? 8.1 : 7.6,
        cellPadding: { top: 2.8, right: 2.8, bottom: 2.8, left: 2.8 },
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
        cellPadding: { top: 3.2, right: 2.8, bottom: 3.2, left: 2.8 },
      },
      columnStyles: {
        0: { cellWidth: colWidths[0], halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: colWidths[1] },
        2: { cellWidth: colWidths[2] },
        3: { cellWidth: colWidths[3] },
        4: { cellWidth: colWidths[4] },
        5: { cellWidth: colWidths[5] },
      },
    });

    // ──────────────────────────────────────────────────────────────
    // OPTIONAL APPENDIX: CONFIRMED COUPLE RESERVATIONS
    // ──────────────────────────────────────────────────────────────
    if (filters.includeReservationsAppendix) {
      const encounterIds = new Set(sorted.map((e) => e.id));
      const encounterOrderMap = new Map<string, number>();
      sorted.forEach((e, idx) => encounterOrderMap.set(e.id, idx));

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

        const resBody: RowInput[] = matchingReservations.map((r) => [
          cleanPdfText(r.codigoReserva),
          cleanPdfText(
            `${r.parroquiaEpim}\n${r.arciprestazgo}\nFechas: ${r.fechasEpim}`
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
                ? `Boda en: ${r.parroquiaMatrimonio}`
                : 'Parroquia boda: Por definir'
            }${r.fechaPrevistaBoda ? `\nFecha boda: ${r.fechaPrevistaBoda}` : ''}`
          ),
        ]);

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
  const rightMetaWidth = 56;
  const logoBoxSize = 20;
  const titleStartX = marginX + logoBoxSize + 4.5; // 38.5mm
  const titleMaxWidth = pageWidth - marginX - rightMetaWidth - 5 - titleStartX;

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
    doc.setFontSize(9.2);
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
        cleanPdfText(`Registros: ${totalEncuentros} encuentro(s)`),
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

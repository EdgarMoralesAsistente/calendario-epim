import type {
  EpimEncounter,
  EpimStore,
  Inquiry,
  InquiryChecklistItem,
  InquiryHistoryEntry,
  Reservation,
} from '../types/epim.js';
import {
  MARACAIBO_ARCIPRESTAZGOS,
  normalizeArciprestazgoName,
  normalizeInquiryRecord,
  normalizeParroquiaName,
  parseDatesFromSheet,
} from '../data/maracaiboCatalog.js';
import { extractSpreadsheetId } from '../services/sheetsService.js';

function safeParseCsvJsonArray<T>(raw?: string): T[] | undefined {
  const trimmed = (raw || '').trim();
  if (!trimmed.startsWith('[')) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? (parsed as T[]) : undefined;
  } catch {
    return undefined;
  }
}

function cleanCellValue(val: string | undefined, fallback = ''): string {
  const trimmed = (val || '').trim();
  if (
    !trimmed ||
    trimmed.startsWith('#ERROR') ||
    trimmed.startsWith('#NAME') ||
    trimmed.startsWith('#VALUE')
  ) {
    return fallback;
  }
  return trimmed;
}

/**
 * Parses an RFC-4180 CSV string (including quoted fields, commas, and multiline cells)
 * returned by Google Sheets' public gviz CSV endpoint.
 */
export function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (ch === '\r' && next === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += ch;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

async function fetchPublicSheetTabCsv(
  spreadsheetId: string,
  tabName: string
): Promise<string[][] | null> {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
    spreadsheetId
  )}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.8' },
    });
    if (!res.ok) return null;

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    // If the sheet is still private ("Restricted"), Google redirects to an HTML sign-in page
    if (contentType.includes('text/html')) {
      return null;
    }

    const text = await res.text();
    if (!text || text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')) {
      return null;
    }

    const parsed = parseCsvRows(text);
    // Drop header row (row 0)
    return parsed.length > 1 ? parsed.slice(1) : [];
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Reads live data from a Google Sheet whose general access is set to
 * "Anyone with the link -> Viewer" ("Cualquier persona con el enlace -> Lector").
 * Enables stateless Vercel Serverless instances to always serve real Google Sheets data
 * even after cold starts without needing service-account keys.
 */
export async function fetchStoreFromPublicSheet(
  rawIdOrUrl: string,
  fallbackStore: EpimStore
): Promise<Partial<EpimStore> | null> {
  const spreadsheetId = extractSpreadsheetId(rawIdOrUrl);
  if (!spreadsheetId) return null;

  const [rawEncounters, rawConfig, rawReservations, rawInquiries] = await Promise.all([
    fetchPublicSheetTabCsv(spreadsheetId, 'Encuentros'),
    fetchPublicSheetTabCsv(spreadsheetId, 'Configuracion'),
    fetchPublicSheetTabCsv(spreadsheetId, 'Reservaciones'),
    fetchPublicSheetTabCsv(spreadsheetId, 'Consultas'),
  ]);

  // If even Encuentros & Configuracion returned null, the sheet is either private or uninitialized
  if (!rawEncounters && !rawConfig) {
    return null;
  }

  const configMap = new Map<string, string>();
  for (const row of rawConfig || []) {
    if (row[0] && row[1] !== undefined) {
      configMap.set(row[0].trim(), row[1].trim());
    }
  }

  const parsedPublicYear = Number(configMap.get('publicYear'));
  const resolvedPublicYear =
    Number.isFinite(parsedPublicYear) && parsedPublicYear >= 2024
      ? parsedPublicYear
      : fallbackStore.config.publicYear;

  const encounters: EpimEncounter[] = (rawEncounters || [])
    .filter((row) => row.length >= 4 && row[3]?.trim())
    .map((row, idx) => {
      const estadoVal = (row[15] || 'abierto').trim().toLowerCase();
      const estado: EpimEncounter['estado'] =
        estadoVal === 'cerrado' || estadoVal === 'finalizado' ? estadoVal : 'abierto';
      const fallbackInicio = (row[5] || '').trim();
      const fallbackFin = (row[6] || fallbackInicio).trim();
      const fechas = parseDatesFromSheet(row[17], fallbackInicio, fallbackFin);
      const firstInicio = fechas[0] || fallbackInicio;
      const lastFin = fechas[fechas.length - 1] || fallbackFin;

      return {
        id: row[0]?.trim() || `epim-sheet-${idx + 1}`,
        year: Number(row[1]) || resolvedPublicYear,
        arciprestazgo:
          normalizeArciprestazgoName(row[2]) || MARACAIBO_ARCIPRESTAZGOS[0].nombre,
        parroquia: normalizeParroquiaName(row[3]),
        mes: Math.min(
          12,
          Math.max(1, Number(row[4]) || Number(firstInicio.split('-')[1]) || 1)
        ),
        fechaInicio: firstInicio,
        fechaFin: lastFin,
        fechas,
        horario:
          row[7]?.trim() ||
          'Sábados 2:30 p.m. – 6:00 p.m. · Domingo cierre 8:30 a.m. – 1:00 p.m.',
        sedeDetalle: cleanCellValue(row[8]),
        telefonoContacto: cleanCellValue(row[9]),
        coordinadores: cleanCellValue(row[10]),
        cuposTotales: Math.max(1, Number(row[11]) || 25),
        cuposReservados: Math.max(0, Number(row[12]) || 0),
        aporteInfo: row[14]?.trim() || '',
        estado,
        updatedAt: row[16]?.trim() || new Date().toISOString(),
      };
    });

  const reservations: Reservation[] = (rawReservations || [])
    .filter((row) => row.length >= 8 && row[2]?.trim())
    .map((row, idx) => {
      const cedulaNovia = cleanCellValue(row[17]);
      const cedulaNovio = cleanCellValue(row[18]);
      const telefonoNovia = cleanCellValue(row[19]);
      const telefonoNovio = cleanCellValue(row[20]);
      const rawParMat = (row[12] || '').trim();
      return {
        id: row[0]?.trim() || `res-sheet-${idx + 1}`,
        codigoReserva: row[1]?.trim() || `EPIM-${idx + 1000}`,
        encounterId: row[2]?.trim() || '',
        year: Number(row[3]) || resolvedPublicYear,
        parroquiaEpim: normalizeParroquiaName(row[4]),
        arciprestazgo: normalizeArciprestazgoName(row[5]),
        fechasEpim: row[6]?.trim() || '',
        nombreNovia: row[7]?.trim() || '',
        nombreNovio: row[8]?.trim() || '',
        cedulaNovia: cedulaNovia || undefined,
        cedulaNovio: cedulaNovio || undefined,
        documentoIdentidad:
          row[9]?.trim() || [cedulaNovia, cedulaNovio].filter(Boolean).join(' / '),
        telefonoNovia: telefonoNovia || undefined,
        telefonoNovio: telefonoNovio || undefined,
        telefonoPareja:
          cleanCellValue(row[10]) ||
          [telefonoNovia, telefonoNovio].filter(Boolean).join(' / '),
        correoPareja: row[11]?.trim() || '',
        parroquiaMatrimonio: rawParMat
          ? rawParMat.toLowerCase().startsWith('otra parroquia')
            ? rawParMat
            : normalizeParroquiaName(rawParMat)
          : '',
        fechaPrevistaBoda: row[13]?.trim() || '',
        observaciones: row[14]?.trim() || '',
        estado: row[15]?.trim() === 'cancelada' ? 'cancelada' : 'confirmada',
        createdAt: row[16]?.trim() || new Date().toISOString(),
      };
    });

  const inquiries: Inquiry[] = (rawInquiries || [])
    .filter((row) => row.length >= 2 && row[1]?.trim())
    .map((row, idx) =>
      normalizeInquiryRecord({
        id: row[0]?.trim() || `inq-sheet-${idx + 1}`,
        nombreRemitente: row[1]?.trim() || '',
        rolRemitente: (row[2]?.trim() || 'Pareja de novios') as Inquiry['rolRemitente'],
        telefono: cleanCellValue(row[3]),
        correo: row[4]?.trim() || '',
        arciprestazgoInteres: row[5]?.trim() || '',
        parroquiaInteres: row[6]?.trim() || '',
        mensaje: row[7]?.trim() || '',
        estado: row[8]?.trim() === 'atendida' ? 'atendida' : 'pendiente',
        createdAt: row[9]?.trim() || new Date().toISOString(),
        etapa: (row[10]?.trim() || undefined) as Inquiry['etapa'],
        prioridad: (row[11]?.trim() || undefined) as Inquiry['prioridad'],
        asunto: row[12]?.trim() || undefined,
        responsable: row[13]?.trim() || undefined,
        fechaSeguimiento: row[14]?.trim() || undefined,
        canalOrigen: (row[15]?.trim() || undefined) as Inquiry['canalOrigen'],
        notasInternas: row[16]?.trim() || undefined,
        checklist: safeParseCsvJsonArray<InquiryChecklistItem>(row[17]),
        historial: safeParseCsvJsonArray<InquiryHistoryEntry>(row[18]),
        updatedAt: row[19]?.trim() || row[9]?.trim() || new Date().toISOString(),
      })
    );

  const availableYearsRaw = configMap.get('availableYears');
  const parsedYears = availableYearsRaw
    ? availableYearsRaw
        .split(',')
        .map((y) => Number(y.trim()))
        .filter((y) => Number.isFinite(y) && y >= 2024)
    : [];
  const yearSet = new Set<number>([
    ...fallbackStore.config.availableYears,
    ...parsedYears,
    resolvedPublicYear,
    ...encounters.map((e) => e.year),
  ]);

  const adminsRaw = configMap.get('authorizedAdmins');
  const parsedAdmins = adminsRaw
    ? adminsRaw
        .split(',')
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean)
    : [];
  const adminSet = new Set<string>([
    ...fallbackStore.config.authorizedAdmins.map((a) => a.toLowerCase()),
    ...parsedAdmins,
    'lapastoralfamiliar.mcbo@gmail.com',
  ]);

  return {
    config: {
      ...fallbackStore.config,
      publicYear: resolvedPublicYear,
      availableYears: Array.from(yearSet).sort((a, b) => a - b),
      authorizedAdmins: Array.from(adminSet),
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      secretariadoTelefono: cleanCellValue(
        configMap.get('secretariadoTelefono'),
        cleanCellValue(fallbackStore.config.secretariadoTelefono, '+58 414-6184520')
      ),
      secretariadoCorreo:
        cleanCellValue(configMap.get('secretariadoCorreo')) ||
        fallbackStore.config.secretariadoCorreo,
      secretariadoDireccion:
        configMap.get('secretariadoDireccion') ||
        fallbackStore.config.secretariadoDireccion,
      lastSyncedAt:
        configMap.get('lastSyncedAt') || fallbackStore.config.lastSyncedAt,
    },
    encounters,
    reservations,
    inquiries,
  };
}

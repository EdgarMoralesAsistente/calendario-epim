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
  serializeDatesForSheet,
} from '../data/maracaiboCatalog.js';

function safeParseJsonArray<T>(raw?: string): T[] | undefined {
  const trimmed = (raw || '').trim();
  if (!trimmed.startsWith('[')) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? (parsed as T[]) : undefined;
  } catch {
    return undefined;
  }
}

function cleanFormulaError(val: string | undefined, fallback = ''): string {
  const trimmed = (val || '').trim();
  if (!trimmed || trimmed.startsWith('#ERROR') || trimmed.startsWith('#NAME') || trimmed.startsWith('#VALUE')) {
    return fallback;
  }
  return trimmed;
}

const SHEETS_BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

const REQUIRED_TABS = {
  ENCUENTROS: 'Encuentros',
  RESERVACIONES: 'Reservaciones',
  CONSULTAS: 'Consultas',
  CONFIGURACION: 'Configuracion',
} as const;

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

interface SpreadsheetMetadata {
  spreadsheetId: string;
  spreadsheetUrl: string;
  properties?: { title?: string };
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
    };
  }>;
}

export async function fetchSpreadsheetMetadata(
  spreadsheetId: string,
  accessToken: string
): Promise<SpreadsheetMetadata> {
  const res = await fetch(
    `${SHEETS_BASE_URL}/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message ||
        `No se pudo acceder a la hoja de cálculo en Google Sheets (código ${res.status}).`
    );
  }
  return res.json();
}

export async function ensureRequiredTabs(
  spreadsheetId: string,
  accessToken: string
): Promise<{ title: string; spreadsheetUrl: string }> {
  const meta = await fetchSpreadsheetMetadata(spreadsheetId, accessToken);
  const existingTitles = new Set(
    (meta.sheets || []).map((s) => s.properties?.title).filter(Boolean) as string[]
  );

  const missingTabs = Object.values(REQUIRED_TABS).filter((tab) => !existingTitles.has(tab));

  if (missingTabs.length > 0) {
    const requests = missingTabs.map((tabTitle) => ({
      addSheet: {
        properties: {
          title: tabTitle,
        },
      },
    }));

    const batchRes = await fetch(
      `${SHEETS_BASE_URL}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      }
    );

    if (!batchRes.ok) {
      const errBody = await batchRes.json().catch(() => ({}));
      throw new Error(
        errBody?.error?.message || 'No se pudieron preparar las pestañas en Google Sheets.'
      );
    }
  }

  return {
    title: meta.properties?.title || 'EPIM - Arquidiócesis de Maracaibo',
    spreadsheetUrl:
      meta.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

export async function createEpimSpreadsheet(
  accessToken: string,
  store: EpimStore
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; title: string }> {
  const title = 'EPIM - Arquidiócesis de Maracaibo (Base de Datos)';
  const createRes = await fetch(SHEETS_BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title, locale: 'es_ES' },
      sheets: Object.values(REQUIRED_TABS).map((tabName) => ({
        properties: {
          title: tabName,
          gridProperties: { frozenRowCount: 1 },
        },
      })),
    }),
  });

  if (!createRes.ok) {
    const errBody = await createRes.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message || 'No se pudo crear la hoja de cálculo en Google Sheets.'
    );
  }

  const created: SpreadsheetMetadata = await createRes.json();
  const spreadsheetId = created.spreadsheetId;
  const spreadsheetUrl =
    created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  await pushStoreToSpreadsheet(spreadsheetId, accessToken, store);

  return {
    spreadsheetId,
    spreadsheetUrl,
    title: created.properties?.title || title,
  };
}

export async function pushStoreToSpreadsheet(
  spreadsheetId: string,
  accessToken: string,
  store: EpimStore
): Promise<{ title: string; spreadsheetUrl: string; syncedAt: string }> {
  const metaInfo = await ensureRequiredTabs(spreadsheetId, accessToken);

  const encuentrosRows = [
    [
      'ID',
      'Año',
      'Arciprestazgo',
      'Parroquia',
      'Mes (1-12)',
      'Fecha Inicio',
      'Fecha Fin',
      'Horario',
      'Sede / Salón',
      'Teléfono Contacto',
      'Coordinadores',
      'Cupos Totales',
      'Cupos Reservados',
      'Cupos Disponibles',
      'Información / Requisitos',
      'Estado',
      'Actualizado',
      'Fechas Individuales (Fecha 1, Fecha 2...)',
    ],
    ...store.encounters.map((e) => [
      e.id,
      String(e.year),
      normalizeArciprestazgoName(e.arciprestazgo) || MARACAIBO_ARCIPRESTAZGOS[0].nombre,
      normalizeParroquiaName(e.parroquia),
      String(e.mes),
      e.fechaInicio,
      e.fechaFin,
      e.horario,
      e.sedeDetalle,
      e.telefonoContacto,
      e.coordinadores,
      String(e.cuposTotales),
      String(e.cuposReservados),
      String(Math.max(0, e.cuposTotales - e.cuposReservados)),
      e.aporteInfo,
      e.estado,
      e.updatedAt,
      serializeDatesForSheet(e.fechas, e.sesiones, e.fechaInicio, e.fechaFin),
    ]),
  ];

  const reservacionesRows = [
    [
      'ID',
      'Código Reserva',
      'ID Encuentro',
      'Año',
      'Parroquia Sede EPIM',
      'Arciprestazgo',
      'Fechas EPIM',
      'Nombre Novia',
      'Nombre Novio',
      'Documento Identidad',
      'Teléfono Pareja',
      'Correo Pareja',
      'Parroquia Matrimonio',
      'Fecha Prevista Boda',
      'Observaciones',
      'Estado',
      'Fecha Registro',
    ],
    ...store.reservations.map((r) => [
      r.id,
      r.codigoReserva,
      r.encounterId,
      String(r.year),
      normalizeParroquiaName(r.parroquiaEpim),
      normalizeArciprestazgoName(r.arciprestazgo),
      r.fechasEpim,
      r.nombreNovia,
      r.nombreNovio,
      r.documentoIdentidad,
      r.telefonoPareja,
      r.correoPareja,
      r.parroquiaMatrimonio?.trim() ? normalizeParroquiaName(r.parroquiaMatrimonio) : '',
      r.fechaPrevistaBoda,
      r.observaciones,
      r.estado,
      r.createdAt,
    ]),
  ];

  const consultasRows = [
    [
      'ID',
      'Nombre Remitente',
      'Rol',
      'Teléfono',
      'Correo',
      'Arciprestazgo Interés',
      'Parroquia Interés',
      'Mensaje',
      'Estado',
      'Fecha Consulta',
      'Etapa Kanban',
      'Prioridad',
      'Asunto',
      'Responsable',
      'Fecha Seguimiento',
      'Canal Origen',
      'Notas Internas',
      'Checklist (JSON)',
      'Historial (JSON)',
      'Última Actualización',
    ],
    ...store.inquiries.map((rawInq) => {
      const q = normalizeInquiryRecord(rawInq);
      const compactHistory = (q.historial || []).slice(-80);
      return [
        q.id,
        q.nombreRemitente,
        q.rolRemitente,
        q.telefono,
        q.correo,
        q.arciprestazgoInteres,
        q.parroquiaInteres,
        q.mensaje,
        q.estado,
        q.createdAt,
        q.etapa || 'nuevas',
        q.prioridad || 'media',
        q.asunto || '',
        q.responsable || '',
        q.fechaSeguimiento || '',
        q.canalOrigen || 'Formulario Web',
        q.notasInternas || '',
        JSON.stringify(q.checklist || []),
        JSON.stringify(compactHistory),
        q.updatedAt || q.createdAt,
      ];
    }),
  ];

  const syncedAt = new Date().toISOString();
  const configRows = [
    ['Clave', 'Valor'],
    ['publicYear', String(store.config.publicYear)],
    ['availableYears', store.config.availableYears.join(',')],
    ['authorizedAdmins', store.config.authorizedAdmins.join(',')],
    ['secretariadoTelefono', cleanFormulaError(store.config.secretariadoTelefono, '+58 414-6184520')],
    ['secretariadoCorreo', store.config.secretariadoCorreo],
    ['secretariadoDireccion', store.config.secretariadoDireccion],
    ['lastSyncedAt', syncedAt],
  ];

  // Clear existing ranges first so deleted rows do not leave stale tail rows
  await fetch(`${SHEETS_BASE_URL}/${encodeURIComponent(spreadsheetId)}/values:batchClear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ranges: [
        `${REQUIRED_TABS.ENCUENTROS}!A1:Z2000`,
        `${REQUIRED_TABS.RESERVACIONES}!A1:Z5000`,
        `${REQUIRED_TABS.CONSULTAS}!A1:Z3000`,
        `${REQUIRED_TABS.CONFIGURACION}!A1:B100`,
      ],
    }),
  });

  const writeRes = await fetch(
    `${SHEETS_BASE_URL}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: [
          { range: `${REQUIRED_TABS.ENCUENTROS}!A1`, values: encuentrosRows },
          { range: `${REQUIRED_TABS.RESERVACIONES}!A1`, values: reservacionesRows },
          { range: `${REQUIRED_TABS.CONSULTAS}!A1`, values: consultasRows },
          { range: `${REQUIRED_TABS.CONFIGURACION}!A1`, values: configRows },
        ],
      }),
    }
  );

  if (!writeRes.ok) {
    const errBody = await writeRes.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message || 'Error al escribir los datos en Google Sheets.'
    );
  }

  return {
    title: metaInfo.title,
    spreadsheetUrl: metaInfo.spreadsheetUrl,
    syncedAt,
  };
}

export async function pullStoreFromSpreadsheet(
  spreadsheetId: string,
  accessToken: string,
  currentStore: EpimStore
): Promise<{
  encounters: EpimEncounter[];
  reservations: Reservation[];
  inquiries: Inquiry[];
  publicYear?: number;
  title: string;
  spreadsheetUrl: string;
}> {
  const metaInfo = await ensureRequiredTabs(spreadsheetId, accessToken);

  const ranges = [
    `ranges=${encodeURIComponent(`${REQUIRED_TABS.ENCUENTROS}!A2:R1500`)}`,
    `ranges=${encodeURIComponent(`${REQUIRED_TABS.RESERVACIONES}!A2:Q4000`)}`,
    `ranges=${encodeURIComponent(`${REQUIRED_TABS.CONSULTAS}!A2:T2500`)}`,
    `ranges=${encodeURIComponent(`${REQUIRED_TABS.CONFIGURACION}!A2:B50`)}`,
  ].join('&');

  const res = await fetch(
    `${SHEETS_BASE_URL}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${ranges}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message || 'No se pudieron leer los datos desde Google Sheets.'
    );
  }

  const data = await res.json();
  const valueRanges: Array<{ values?: string[][] }> = data.valueRanges || [];

  const rawEncounters = valueRanges[0]?.values || [];
  const rawReservations = valueRanges[1]?.values || [];
  const rawInquiries = valueRanges[2]?.values || [];
  const rawConfig = valueRanges[3]?.values || [];

  const encounters: EpimEncounter[] = rawEncounters
    .filter((row) => row.length >= 4 && row[3])
    .map((row, idx) => {
      const estadoVal = (row[15] || 'abierto').toLowerCase();
      const estado: EpimEncounter['estado'] =
        estadoVal === 'cerrado' || estadoVal === 'finalizado' ? estadoVal : 'abierto';
      const fallbackInicio = row[5] || '';
      const fallbackFin = row[6] || fallbackInicio;
      const fechas = parseDatesFromSheet(row[17], fallbackInicio, fallbackFin);
      const firstInicio = fechas[0] || fallbackInicio;
      const lastFin = fechas[fechas.length - 1] || fallbackFin;

      return {
        id: row[0] || `epim-sheet-${idx + 1}`,
        year: Number(row[1]) || currentStore.config.publicYear,
        arciprestazgo:
          normalizeArciprestazgoName(row[2]) || MARACAIBO_ARCIPRESTAZGOS[0].nombre,
        parroquia: normalizeParroquiaName(row[3]),
        mes: Math.min(12, Math.max(1, Number(row[4]) || Number(firstInicio.split('-')[1]) || 1)),
        fechaInicio: firstInicio,
        fechaFin: lastFin,
        fechas,
        horario: row[7] || 'Sábados 2:30 p.m. – 6:00 p.m. · Domingo cierre 8:30 a.m. – 1:00 p.m.',
        sedeDetalle: row[8] || '',
        telefonoContacto: cleanFormulaError(row[9]),
        coordinadores: row[10] || '',
        cuposTotales: Math.max(1, Number(row[11]) || 25),
        cuposReservados: Math.max(0, Number(row[12]) || 0),
        aporteInfo: row[14] || '',
        estado,
        updatedAt: row[16] || new Date().toISOString(),
      };
    });

  const reservations: Reservation[] = rawReservations
    .filter((row) => row.length >= 8 && row[2])
    .map((row, idx) => ({
      id: row[0] || `res-sheet-${idx + 1}`,
      codigoReserva: row[1] || `EPIM-${idx + 1000}`,
      encounterId: row[2] || '',
      year: Number(row[3]) || currentStore.config.publicYear,
      parroquiaEpim: normalizeParroquiaName(row[4]),
      arciprestazgo: normalizeArciprestazgoName(row[5]),
      fechasEpim: row[6] || '',
      nombreNovia: row[7] || '',
      nombreNovio: row[8] || '',
      documentoIdentidad: row[9] || '',
      telefonoPareja: cleanFormulaError(row[10]),
      correoPareja: row[11] || '',
      parroquiaMatrimonio: row[12]?.trim() ? normalizeParroquiaName(row[12]) : '',
      fechaPrevistaBoda: row[13] || '',
      observaciones: row[14] || '',
      estado: row[15] === 'cancelada' ? 'cancelada' : 'confirmada',
      createdAt: row[16] || new Date().toISOString(),
    }));

  const inquiries: Inquiry[] = rawInquiries
    .filter((row) => row.length >= 2 && row[1])
    .map((row, idx) =>
      normalizeInquiryRecord({
        id: row[0] || `inq-sheet-${idx + 1}`,
        nombreRemitente: row[1] || '',
        rolRemitente: (row[2] || 'Pareja de novios') as Inquiry['rolRemitente'],
        telefono: cleanFormulaError(row[3]),
        correo: row[4] || '',
        arciprestazgoInteres: row[5] || '',
        parroquiaInteres: row[6] || '',
        mensaje: row[7] || '',
        estado: row[8] === 'atendida' ? 'atendida' : 'pendiente',
        createdAt: row[9] || new Date().toISOString(),
        etapa: (row[10] || undefined) as Inquiry['etapa'],
        prioridad: (row[11] || undefined) as Inquiry['prioridad'],
        asunto: row[12] || undefined,
        responsable: row[13] || undefined,
        fechaSeguimiento: row[14] || undefined,
        canalOrigen: (row[15] || undefined) as Inquiry['canalOrigen'],
        notasInternas: row[16] || undefined,
        checklist: safeParseJsonArray<InquiryChecklistItem>(row[17]),
        historial: safeParseJsonArray<InquiryHistoryEntry>(row[18]),
        updatedAt: row[19] || row[9] || new Date().toISOString(),
      })
    );

  const configMap = new Map<string, string>();
  for (const row of rawConfig) {
    if (row[0] && row[1] !== undefined) {
      configMap.set(row[0], row[1]);
    }
  }
  const parsedPublicYear = Number(configMap.get('publicYear'));

  return {
    encounters,
    reservations,
    inquiries,
    publicYear: Number.isFinite(parsedPublicYear) && parsedPublicYear >= 2024 ? parsedPublicYear : undefined,
    title: metaInfo.title,
    spreadsheetUrl: metaInfo.spreadsheetUrl,
  };
}

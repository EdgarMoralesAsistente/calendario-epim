import type {
  EpimStore,
  Inquiry,
  InquiryChannel,
  InquiryChecklistItem,
  InquiryHistoryEntry,
  InquiryPriority,
  InquiryStage,
} from '../types/epim.js';

export const LOGO_URL_PRIMARY =
  'https://res.cloudinary.com/djvpapwvq/image/upload/v1789603448/Logo_del_Secretariado_de_Pastoral_Familiar_Sin_fondo_nffmht.png';
export const LOGO_URL_FALLBACK = '/logo-pastoral-familiar.png';

export const MONTHS_ES: { value: number; label: string; short: string }[] = [
  { value: 1, label: 'Enero', short: 'Ene' },
  { value: 2, label: 'Febrero', short: 'Feb' },
  { value: 3, label: 'Marzo', short: 'Mar' },
  { value: 4, label: 'Abril', short: 'Abr' },
  { value: 5, label: 'Mayo', short: 'May' },
  { value: 6, label: 'Junio', short: 'Jun' },
  { value: 7, label: 'Julio', short: 'Jul' },
  { value: 8, label: 'Agosto', short: 'Ago' },
  { value: 9, label: 'Septiembre', short: 'Sep' },
  { value: 10, label: 'Octubre', short: 'Oct' },
  { value: 11, label: 'Noviembre', short: 'Nov' },
  { value: 12, label: 'Diciembre', short: 'Dic' },
];

export interface ArciprestazgoGroup {
  nombre: string;
  nombreCorto: string;
  parroquias: string[];
}

export const MARACAIBO_ARCIPRESTAZGOS: ArciprestazgoGroup[] = [
  {
    nombre: 'Arciprestazgo 1. Ntra. Sra. de Chiquinquirá',
    nombreCorto: 'Arciprestazgo 1',
    parroquias: [
      'Parroquia Basílica Ntra. Sra. de Chiquinquirá y San Juan de Dios',
      'Parroquia El Sagrario La Catedral de los Santos Apóstoles Pedro y Pablo',
      'Parroquia Ntra. Sra. de la Asunción',
      'Parroquia Ntra. Sra. de la Medalla Milagrosa',
      'Parroquia Santa Bárbara',
      'Parroquia Santa Lucía',
      'Parroquia Santo Cristo de Aranza',
    ],
  },
  {
    nombre: 'Arciprestazgo 2. Sagrado Corazón de Jesús',
    nombreCorto: 'Arciprestazgo 2',
    parroquias: [
      'Parroquia Ntra. Sra. de la Consolación',
      'Parroquia Ntra. Sra. de las Mercedes',
      'Parroquia Ntra. Sra. del Perpetuo Socorro',
      'Parroquia Ntra. Sra. del Rosario',
      'Parroquia Sagrado Corazón de Jesús',
      'Parroquia San Alfonso María de Ligorio',
      'Parroquia San Antonio María Claret',
      'Parroquia San Benito de Palermo',
      'Parroquia San José, Maracaibo',
      'Parroquia San Judas Tadeo',
    ],
  },
  {
    nombre: 'Arciprestazgo 3. La Sagrada Familia',
    nombreCorto: 'Arciprestazgo 3',
    parroquias: [
      'Parroquia La Sagrada Familia. Urb. San Miguel',
      'Parroquia Niña María',
      'Parroquia Ntra. Sra. de Lourdes. Maracaibo',
      'Parroquia Ntra. Sra. del Carmen. Maracaibo',
      'Parroquia San Ignacio de Loyola',
      'Parroquia San Martín de Porres',
      'Parroquia San Miguel Arcángel',
      'Parroquia San Pedro Apóstol',
      'Parroquia Santa Teresita del Niño Jesús. Amparo',
    ],
  },
  {
    nombre: 'Arciprestazgo 4. Ntra. Sra. de Coromoto',
    nombreCorto: 'Arciprestazgo 4',
    parroquias: [
      'Parroquia El Buen Pastor. Cuatricentenario',
      'Parroquia La Resurrección del Señor',
      'Parroquia Ntra. Sra. de Coromoto. Los Olivos',
      'Parroquia Ntra. Sra. de la Paz. La Victoria',
      'Parroquia Nuestro Señor Jesucristo Rey. La Curva',
      'Parroquia San Isidro Labrador. San Isidro',
      'Parroquia San Pablo Apóstol. La Rotaria',
      'Parroquia San Tarsicio',
      'Parroquia Santa Inés. Sector Indio Mara',
      'Parroquia Santa Mónica. La Concepción',
      'Parroquia Santísimo Sacramento. Las Lomas',
    ],
  },
  {
    nombre: 'Arciprestazgo 5. San Francisco de Asís',
    nombreCorto: 'Arciprestazgo 5',
    parroquias: [
      'Parroquia Jesús Nazareno',
      'Parroquia Ntra. Sra. de Guadalupe',
      'Parroquia Ntra. Sra. de la Caridad del Cobre',
      'Parroquia San Felipe Neri',
      'Parroquia San Juan Bautista',
      'Parroquia Santa Mariana de Jesús. Sur América',
      'Parroquia Santísimo Cristo de San Francisco',
      'Parroquia Santísimo Salvador. El Callao',
      'Parroquia Santo Domingo de Guzmán',
      'Parroquia Transfiguración del Señor. Los Cortijos',
    ],
  },
  {
    nombre: 'Arciprestazgo 6. Ntra. Sra. de Fátima',
    nombreCorto: 'Arciprestazgo 6',
    parroquias: [
      'Parroquia La Santísima Trinidad',
      'Parroquia Ntra. Sra. de Fátima',
      'Parroquia Ntra. Sra. de la Candelaria',
      'Parroquia San Bartolomé. Ziruma',
      'Parroquia San Juan Bosco',
      'Parroquia San Onofre',
      'Parroquia San Ramón Nonato',
      'Parroquia Santa Rosa de Lima. Santa Rita de Casia',
    ],
  },
  {
    nombre: 'Arciprestazgo 7. San Rafael del Moján',
    nombreCorto: 'Arciprestazgo 7',
    parroquias: [
      'Parroquia El Sagrado Corazón de Jesús. Guarero',
      'Parroquia Jesús Redentor. Tamare',
      'Parroquia La Inmaculada Concepción. Carrasquero',
      'Parroquia María Auxiliadora (Santa Cruz de Mara)',
      'Parroquia Ntra. Sra. de Coromoto y San José Obrero (La Sierrita)',
      'Parroquia Ntra. Sra. de Lourdes. Isla de Toas',
      'Parroquia San Bartolomé Apóstol. Sinamaica',
      'Parroquia San José de Paraguaipoa',
      'Parroquia San Rafael Arcángel El Moján',
      'Parroquia Santa María. Guana',
    ],
  },
  {
    nombre: 'Arciprestazgo 8. Inmaculada Concepción',
    nombreCorto: 'Arciprestazgo 8',
    parroquias: [
      'Parroquia La Inmaculada Concepción. La Cañada de Urdaneta',
      'Parroquia Ntra. Sra. de Chiquinquirá. La Ensenada',
      'Parroquia Ntra. Sra. del Carmen. El Carmelo. La Cañada de Urdaneta',
      'Parroquia Purísima Madre de Dios y San Benito de Palermo. El Bajo',
      'Parroquia San Antonio de Padua y Ntra. Sra. Virgen de los Parrales. La Cañada de Urdaneta',
    ],
  },
];

/**
 * Normalizes any legacy or externally stored arciprestazgo string so it always uses
 * the official "Arciprestazgo N. ..." nomenclature (never legacy nomenclature).
 */
export function normalizeArciprestazgoName(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';

  const exact = MARACAIBO_ARCIPRESTAZGOS.find(
    (g) => g.nombre.toLowerCase() === trimmed.toLowerCase()
  );
  if (exact) return exact.nombre;

  const numMatch = trimmed.match(/^(?:\S+(?:\s+pastoral)?|arciprestazgo)\s*([1-8])\b/i);
  if (numMatch) {
    const idx = Number(numMatch[1]) - 1;
    if (MARACAIBO_ARCIPRESTAZGOS[idx]) {
      return MARACAIBO_ARCIPRESTAZGOS[idx].nombre;
    }
  }

  for (const group of MARACAIBO_ARCIPRESTAZGOS) {
    const patronName = group.nombre.replace(/^Arciprestazgo\s+\d+\.\s*/i, '').trim();
    if (patronName && trimmed.toLowerCase().includes(patronName.toLowerCase())) {
      return group.nombre;
    }
  }

  if (/^arciprestazgo\b/i.test(trimmed)) {
    return trimmed.replace(/^arciprestazgo/i, 'Arciprestazgo');
  }

  return `Arciprestazgo ${trimmed}`;
}

/**
 * Ensures every parish name explicitly begins with "Parroquia " and matches the
 * canonical spelling in MARACAIBO_ARCIPRESTAZGOS whenever applicable.
 */
export function normalizeParroquiaName(raw?: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  if (/^otra\s+parroquia\b/i.test(trimmed)) return trimmed;

  const stripped = trimmed.replace(/^(?:parroquia\s+)+/i, '').trim();
  if (!stripped) return '';

  const targetCandidate = `Parroquia ${stripped}`.toLowerCase();
  for (const group of MARACAIBO_ARCIPRESTAZGOS) {
    const found = group.parroquias.find((p) => p.toLowerCase() === targetCandidate);
    if (found) return found;
  }

  return `Parroquia ${stripped}`;
}

export function getShortArciprestazgoLabel(arciprestazgo: string): string {
  const normalized = normalizeArciprestazgoName(arciprestazgo);
  const found = MARACAIBO_ARCIPRESTAZGOS.find((g) => g.nombre === normalized);
  if (found) return found.nombreCorto;
  if (normalized.includes('·')) return normalized.split('·')[0].trim();
  if (normalized.includes('.')) return normalized.split('.')[0].trim();
  return normalized;
}

export const INQUIRY_STAGES: Array<{
  id: InquiryStage;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: 'nuevas',
    label: 'Recibidas / Por revisar',
    shortLabel: 'Recibidas',
    description: 'Consultas nuevas pendientes de primer contacto',
  },
  {
    id: 'en_seguimiento',
    label: 'En seguimiento',
    shortLabel: 'En seguimiento',
    description: 'En gestión activa por parte del Secretariado',
  },
  {
    id: 'esperando_respuesta',
    label: 'Esperando confirmación',
    shortLabel: 'Esperando confirmación',
    description: 'A la espera de datos de los novios o del párroco',
  },
  {
    id: 'atendidas',
    label: 'Atendidas / Resueltas',
    shortLabel: 'Atendidas',
    description: 'Orientación o solicitud completada satisfactoriamente',
  },
];

export function getInquiryStageLabel(stage?: InquiryStage): string {
  return (
    INQUIRY_STAGES.find((s) => s.id === stage)?.shortLabel || 'Recibidas'
  );
}

const VALID_STAGES: InquiryStage[] = [
  'nuevas',
  'en_seguimiento',
  'esperando_respuesta',
  'atendidas',
];

const VALID_PRIORITIES: InquiryPriority[] = ['alta', 'media', 'baja'];

const VALID_CHANNELS: InquiryChannel[] = [
  'Formulario Web',
  'WhatsApp',
  'Llamada telefónica',
  'Correo electrónico',
  'Presencial',
];

const VALID_ROLES: Inquiry['rolRemitente'][] = [
  'Pareja de novios',
  'Sacerdote / Diácono',
  'Agente de Pastoral',
  'Otro',
];

export function buildDefaultInquirySubject(inq: Partial<Inquiry>): string {
  if (inq.asunto?.trim()) return inq.asunto.trim();
  const parish = inq.parroquiaInteres?.trim()
    ? normalizeParroquiaName(inq.parroquiaInteres)
    : '';
  if (inq.rolRemitente === 'Sacerdote / Diácono') {
    return parish ? `Solicitud parroquial · ${parish}` : 'Consulta pastoral de clero';
  }
  if (inq.rolRemitente === 'Agente de Pastoral') {
    return parish ? `Coordinación pastoral · ${parish}` : 'Consulta de agente pastoral';
  }
  return parish ? `Consulta EPIM · ${parish}` : `Consulta de ${inq.nombreRemitente || 'remitente'}`;
}

export function normalizeInquiryRecord(raw: Inquiry): Inquiry {
  const createdAt = raw.createdAt || new Date().toISOString();
  const rolRemitente: Inquiry['rolRemitente'] = VALID_ROLES.includes(raw.rolRemitente)
    ? raw.rolRemitente
    : 'Pareja de novios';

  let etapa: InquiryStage;
  if (raw.etapa && VALID_STAGES.includes(raw.etapa)) {
    etapa = raw.etapa;
  } else {
    etapa = raw.estado === 'atendida' ? 'atendidas' : 'nuevas';
  }

  const estado: Inquiry['estado'] = etapa === 'atendidas' ? 'atendida' : 'pendiente';
  const prioridad: InquiryPriority =
    raw.prioridad && VALID_PRIORITIES.includes(raw.prioridad)
      ? raw.prioridad
      : rolRemitente === 'Sacerdote / Diácono'
      ? 'alta'
      : 'media';

  const canalOrigen: InquiryChannel =
    raw.canalOrigen && VALID_CHANNELS.includes(raw.canalOrigen)
      ? raw.canalOrigen
      : 'Formulario Web';

  const arciprestazgoInteres = raw.arciprestazgoInteres?.trim()
    ? normalizeArciprestazgoName(raw.arciprestazgoInteres)
    : '';
  const parroquiaInteres = raw.parroquiaInteres?.trim()
    ? normalizeParroquiaName(raw.parroquiaInteres)
    : '';

  const checklist: InquiryChecklistItem[] = Array.isArray(raw.checklist)
    ? raw.checklist
        .filter((item) => item && typeof item.texto === 'string' && item.texto.trim())
        .map((item, idx) => ({
          id: item.id || `${raw.id}-chk-${idx + 1}`,
          texto: item.texto.trim(),
          completado: Boolean(item.completado),
        }))
    : [];

  const historial: InquiryHistoryEntry[] =
    Array.isArray(raw.historial) && raw.historial.length > 0
      ? raw.historial
          .filter((h) => h && typeof h.texto === 'string' && h.texto.trim())
          .map((h, idx) => ({
            id: h.id || `${raw.id}-hist-${idx + 1}`,
            tipo: h.tipo || 'nota',
            autor: h.autor || 'Secretariado',
            texto: h.texto.trim(),
            createdAt: h.createdAt || createdAt,
          }))
      : [
          {
            id: `${raw.id}-hist-init`,
            tipo: 'creacion',
            autor: raw.nombreRemitente || 'Formulario Web',
            texto: `Consulta registrada por ${canalOrigen.toLowerCase()}.`,
            createdAt,
          },
        ];

  return {
    ...raw,
    asunto: raw.asunto?.trim() || buildDefaultInquirySubject({ ...raw, rolRemitente, parroquiaInteres }),
    nombreRemitente: (raw.nombreRemitente || '').trim(),
    rolRemitente,
    telefono: (raw.telefono || '').trim(),
    correo: (raw.correo || '').trim(),
    arciprestazgoInteres,
    parroquiaInteres,
    mensaje: (raw.mensaje || '').trim(),
    estado,
    etapa,
    prioridad,
    responsable: (raw.responsable || '').trim(),
    fechaSeguimiento: (raw.fechaSeguimiento || '').trim(),
    canalOrigen,
    notasInternas: (raw.notasInternas || '').trim(),
    checklist,
    historial,
    createdAt,
    updatedAt: raw.updatedAt || createdAt,
  };
}

/**
 * Normalizes all arciprestazgo, parroquia, and inquiry fields across an EpimStore in place.
 */
export function normalizeEpimStoreNames(store: EpimStore): EpimStore {
  if (Array.isArray(store.encounters)) {
    for (const enc of store.encounters) {
      enc.arciprestazgo =
        normalizeArciprestazgoName(enc.arciprestazgo) || MARACAIBO_ARCIPRESTAZGOS[0].nombre;
      enc.parroquia = normalizeParroquiaName(enc.parroquia);
    }
  }
  if (Array.isArray(store.reservations)) {
    for (const res of store.reservations) {
      res.arciprestazgo = normalizeArciprestazgoName(res.arciprestazgo);
      res.parroquiaEpim = normalizeParroquiaName(res.parroquiaEpim);
      if (res.parroquiaMatrimonio?.trim()) {
        res.parroquiaMatrimonio = normalizeParroquiaName(res.parroquiaMatrimonio);
      }
    }
  }
  if (Array.isArray(store.inquiries)) {
    store.inquiries = store.inquiries.map((inq) => normalizeInquiryRecord(inq));
  }
  if (Array.isArray(store.customParishes)) {
    for (const cp of store.customParishes) {
      cp.arciprestazgo = normalizeArciprestazgoName(cp.arciprestazgo);
      cp.parroquia = normalizeParroquiaName(cp.parroquia);
    }
  }
  return store;
}

export function formatMonthName(mes: number): string {
  return MONTHS_ES.find((m) => m.value === mes)?.label ?? `Mes ${mes}`;
}

export function formatMonthShort(mes: number): string {
  return (MONTHS_ES.find((m) => m.value === mes)?.short ?? `M${mes}`).toLowerCase();
}

const WEEKDAYS_SHORT_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export function addDaysIso(isoDate: string, daysToAdd: number): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d + daysToAdd));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function formatSingleDateEs(isoDate: string, includeWeekday = true): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = WEEKDAYS_SHORT_ES[dt.getUTCDay()];
  const base = `${d} de ${formatMonthName(m).toLowerCase()} de ${y}`;
  return includeWeekday ? `${wd} ${base}` : base;
}

export function formatDateRangeEs(fechaInicio: string, fechaFin: string): string {
  if (!fechaInicio) return '';
  if (!fechaFin || fechaFin === fechaInicio) {
    return formatSingleDateEs(fechaInicio, false);
  }
  const [y1, m1, d1] = fechaInicio.split('-').map(Number);
  const [y2, m2, d2] = fechaFin.split('-').map(Number);
  if (m1 === m2 && y1 === y2) {
    return `${d1} y ${d2} de ${formatMonthName(m1).toLowerCase()} de ${y1}`;
  }
  return `${d1} de ${formatMonthName(m1).toLowerCase()} al ${d2} de ${formatMonthName(m2).toLowerCase()} de ${y2}`;
}

function expandRangeToDates(startIso: string, endIso?: string): string[] {
  const a = (startIso || '').trim();
  const b = (endIso || startIso || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a)) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b) || b <= a) return [a];

  const out: string[] = [];
  let cursor = a;
  let guard = 0;
  while (cursor && cursor <= b && guard < 30) {
    out.push(cursor);
    cursor = addDaysIso(cursor, 1);
    guard += 1;
  }
  return out;
}

export function normalizeIndividualDates(
  fechas?: string[],
  legacySesiones?: Array<{ fechaInicio: string; fechaFin?: string }>,
  fallbackInicio?: string,
  fallbackFin?: string
): string[] {
  let collected: string[] = [];

  if (Array.isArray(fechas) && fechas.length > 0) {
    collected = fechas
      .map((f) => (f || '').trim())
      .filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f));
  } else if (Array.isArray(legacySesiones) && legacySesiones.length > 0) {
    for (const s of legacySesiones) {
      if (s?.fechaInicio) {
        collected.push(...expandRangeToDates(s.fechaInicio, s.fechaFin));
      }
    }
  } else if (fallbackInicio) {
    collected = expandRangeToDates(fallbackInicio, fallbackFin);
  }

  return Array.from(new Set(collected)).sort((a, b) => a.localeCompare(b));
}

export function getEncounterDates(enc: {
  fechaInicio: string;
  fechaFin: string;
  fechas?: string[];
  sesiones?: Array<{ fechaInicio: string; fechaFin: string }>;
}): string[] {
  return normalizeIndividualDates(enc.fechas, enc.sesiones, enc.fechaInicio, enc.fechaFin);
}

function joinDaysEs(days: number[]): string {
  if (days.length === 0) return '';
  if (days.length === 1) return `${days[0]}`;
  if (days.length === 2) return `${days[0]} y ${days[1]}`;
  return `${days.slice(0, -1).join(', ')} y ${days[days.length - 1]}`;
}

export function formatEncounterDatesEs(enc: {
  fechaInicio: string;
  fechaFin: string;
  fechas?: string[];
  sesiones?: Array<{ fechaInicio: string; fechaFin: string }>;
}): string {
  const dates = getEncounterDates(enc);
  if (dates.length === 0) return '';
  if (dates.length === 1) return formatSingleDateEs(dates[0], false);

  const parsed = dates.map((iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return { y, m, d };
  });

  const first = parsed[0];
  const allSameMonthAndYear = parsed.every((p) => p.y === first.y && p.m === first.m);

  if (allSameMonthAndYear) {
    return `${joinDaysEs(parsed.map((p) => p.d))} de ${formatMonthName(first.m).toLowerCase()} de ${first.y}`;
  }

  // Group consecutive dates that share month & year
  const groups: Array<{ y: number; m: number; days: number[] }> = [];
  for (const item of parsed) {
    const prev = groups[groups.length - 1];
    if (prev && prev.y === item.y && prev.m === item.m) {
      prev.days.push(item.d);
    } else {
      groups.push({ y: item.y, m: item.m, days: [item.d] });
    }
  }

  const allSameYear = groups.every((g) => g.y === first.y);
  if (allSameYear) {
    const tokens = groups.map((g) => `${joinDaysEs(g.days)} ${formatMonthShort(g.m)}`);
    return `${tokens.join(' · ')} de ${first.y}`;
  }

  return groups
    .map((g) => `${joinDaysEs(g.days)} ${formatMonthShort(g.m)} ${g.y}`)
    .join(' · ');
}

const WEEKDAYS_DOT_ES = ['Dom.', 'Lun.', 'Mar.', 'Mié.', 'Jue.', 'Vie.', 'Sáb.'];

function joinStringsEs(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

export interface EncounterMonthDateGroup {
  year: number;
  month: number;
  monthName: string;
  daysLabel: string;
}

export interface GroupedEncounterDatesSummary {
  monthsHeadline: string;
  groups: EncounterMonthDateGroup[];
}

export function getGroupedEncounterDatesEs(enc: {
  mes?: number;
  year?: number;
  fechaInicio: string;
  fechaFin: string;
  fechas?: string[];
  sesiones?: Array<{ fechaInicio: string; fechaFin: string }>;
}): GroupedEncounterDatesSummary {
  const dates = getEncounterDates(enc);
  if (dates.length === 0) {
    const fallbackMonth = enc.mes ? formatMonthName(enc.mes) : '';
    const fallbackHeadline =
      fallbackMonth && enc.year ? `${fallbackMonth} ${enc.year}` : fallbackMonth;
    return { monthsHeadline: fallbackHeadline, groups: [] };
  }

  const rawGroups: Array<{ year: number; month: number; dayTokens: string[] }> = [];

  for (const iso of dates) {
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) continue;
    const dt = new Date(Date.UTC(y, m - 1, d));
    const wd = WEEKDAYS_DOT_ES[dt.getUTCDay()];
    const dayToken = `${wd} ${String(d).padStart(2, '0')}`;

    const last = rawGroups[rawGroups.length - 1];
    if (last && last.year === y && last.month === m) {
      last.dayTokens.push(dayToken);
    } else {
      rawGroups.push({ year: y, month: m, dayTokens: [dayToken] });
    }
  }

  const groups: EncounterMonthDateGroup[] = rawGroups.map((g) => ({
    year: g.year,
    month: g.month,
    monthName: formatMonthName(g.month),
    daysLabel: joinStringsEs(g.dayTokens),
  }));

  if (groups.length === 0) {
    return { monthsHeadline: '', groups: [] };
  }

  const firstYear = groups[0].year;
  const allSameYear = groups.every((g) => g.year === firstYear);
  const monthsHeadline = allSameYear
    ? `${joinStringsEs(groups.map((g) => g.monthName))} ${firstYear}`
    : joinStringsEs(groups.map((g) => `${g.monthName} ${g.year}`));

  return { monthsHeadline, groups };
}

export function doesEncounterIncludeDate(
  enc: {
    fechaInicio: string;
    fechaFin: string;
    fechas?: string[];
    sesiones?: Array<{ fechaInicio: string; fechaFin: string }>;
  },
  isoDate: string
): boolean {
  return getEncounterDates(enc).includes(isoDate);
}

export function doesEncounterMatchMonth(
  enc: {
    mes: number;
    fechaInicio: string;
    fechaFin: string;
    fechas?: string[];
    sesiones?: Array<{ fechaInicio: string; fechaFin: string }>;
  },
  targetMonth: number
): boolean {
  const dates = getEncounterDates(enc);
  if (dates.length === 0) return enc.mes === targetMonth;
  return dates.some((iso) => Number(iso.split('-')[1]) === targetMonth);
}

export function serializeDatesForSheet(
  fechas?: string[],
  legacySesiones?: Array<{ fechaInicio: string; fechaFin: string }>,
  fallbackInicio?: string,
  fallbackFin?: string
): string {
  const list = normalizeIndividualDates(fechas, legacySesiones, fallbackInicio, fallbackFin);
  return list.join(', ');
}

export function parseDatesFromSheet(
  cellValue: string | undefined,
  fallbackInicio: string,
  fallbackFin: string
): string[] {
  if (!cellValue || !cellValue.trim()) {
    return normalizeIndividualDates(undefined, undefined, fallbackInicio, fallbackFin);
  }
  const tokens = cellValue
    .split(/[,|;]/)
    .map((t) => t.trim())
    .filter(Boolean);

  const expanded: string[] = [];
  for (const token of tokens) {
    if (token.includes('..')) {
      const [s, e] = token.split('..').map((x) => x.trim());
      expanded.push(...expandRangeToDates(s, e));
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(token)) {
      expanded.push(token);
    }
  }
  return normalizeIndividualDates(expanded, undefined, fallbackInicio, fallbackFin);
}

export function createInitialStore(): EpimStore {
  return {
    config: {
      publicYear: 2026,
      availableYears: [2026, 2027],
      spreadsheetId: '',
      spreadsheetUrl: '',
      spreadsheetTitle: '',
      lastSyncedAt: '',
      authorizedAdmins: ['lapastoralfamiliar.mcbo@gmail.com'],
      secretariadoTelefono: '+58 414-6184520',
      secretariadoCorreo: 'lapastoralfamiliar.mcbo@gmail.com',
      secretariadoDireccion:
        'Curia Arzobispal de Maracaibo, Calle 95 (Venezuela) entre Av. 2 y 3, Casco Central, Maracaibo, Edo. Zulia',
    },
    encounters: [
      {
        id: 'epim-2026-01',
        year: 2026,
        arciprestazgo: 'Arciprestazgo 2. Sagrado Corazón de Jesús',
        parroquia: 'Parroquia Ntra. Sra. de las Mercedes',
        mes: 3,
        fechaInicio: '2026-03-07',
        fechaFin: '2026-03-22',
        fechas: ['2026-03-07', '2026-03-14', '2026-03-21', '2026-03-22'],
        horario: 'Sábados 2:30 p.m. – 6:30 p.m. · Domingo cierre 8:30 a.m. – 1:00 p.m.',
        sedeDetalle: 'Salón Parroquial Las Mercedes, Av. 4 Bella Vista',
        telefonoContacto: '+58 414-6321890',
        coordinadores: 'Esp. Carlos y Elena Urdaneta',
        cuposTotales: 25,
        cuposReservados: 25,
        aporteInfo: 'Incluye refrigerios, carpeta de trabajo y certificado arquidiocesano',
        estado: 'finalizado',
        updatedAt: '2026-03-23T10:00:00.000Z',
      },
      {
        id: 'epim-2026-02',
        year: 2026,
        arciprestazgo: 'Arciprestazgo 1. Ntra. Sra. de Chiquinquirá',
        parroquia: 'Parroquia Basílica Ntra. Sra. de Chiquinquirá y San Juan de Dios',
        mes: 6,
        fechaInicio: '2026-06-06',
        fechaFin: '2026-06-21',
        fechas: ['2026-06-06', '2026-06-13', '2026-06-20', '2026-06-21'],
        horario: 'Sábados 2:00 p.m. – 6:00 p.m. · Domingo cierre 8:00 a.m. – 12:30 p.m.',
        sedeDetalle: 'Casa Parroquial San Juan de Dios, Paseo Ciencias',
        telefonoContacto: '+58 412-7640911',
        coordinadores: 'Esp. José Gregorio y María Chiquinquirá Finol',
        cuposTotales: 30,
        cuposReservados: 30,
        aporteInfo: 'Presentar constancia de expediente prematrimonial en curso',
        estado: 'finalizado',
        updatedAt: '2026-06-22T10:00:00.000Z',
      },
      {
        id: 'epim-2026-03',
        year: 2026,
        arciprestazgo: 'Arciprestazgo 2. Sagrado Corazón de Jesús',
        parroquia: 'Parroquia San Antonio María Claret',
        mes: 10,
        fechaInicio: '2026-10-24',
        fechaFin: '2026-11-08',
        fechas: ['2026-10-24', '2026-10-31', '2026-11-07', '2026-11-08'],
        horario: 'Sábados 2:30 p.m. – 6:00 p.m. · Domingo cierre 8:30 a.m. – 1:00 p.m.',
        sedeDetalle: 'Salón Claretiano, Calle 78 (Dr. Portillo)',
        telefonoContacto: '+58 414-6159044',
        coordinadores: 'Esp. Andrés y Verónica Villasmil',
        cuposTotales: 25,
        cuposReservados: 19,
        aporteInfo: 'Asistencia obligatoria de ambos novios a todas las fechas programadas',
        estado: 'abierto',
        updatedAt: '2026-10-20T14:00:00.000Z',
      },
      {
        id: 'epim-2026-04',
        year: 2026,
        arciprestazgo: 'Arciprestazgo 4. Ntra. Sra. de Coromoto',
        parroquia: 'Parroquia Ntra. Sra. de Coromoto. Los Olivos',
        mes: 11,
        fechaInicio: '2026-11-07',
        fechaFin: '2026-11-22',
        fechas: ['2026-11-07', '2026-11-14', '2026-11-21', '2026-11-22'],
        horario: 'Sábados 3:00 p.m. – 6:30 p.m. · Domingo clausura 8:30 a.m. – 1:00 p.m.',
        sedeDetalle: 'Salón de Usos Múltiples Los Olivos',
        telefonoContacto: '+58 424-6493310',
        coordinadores: 'Esp. Luis Fernando y Gabriela Rincón',
        cuposTotales: 22,
        cuposReservados: 8,
        aporteInfo: 'Incluye guía pastoral de novios y certificado oficial EPIM',
        estado: 'abierto',
        updatedAt: '2026-10-21T09:30:00.000Z',
      },
      {
        id: 'epim-2026-05',
        year: 2026,
        arciprestazgo: 'Arciprestazgo 3. La Sagrada Familia',
        parroquia: 'Parroquia Ntra. Sra. de Lourdes. Maracaibo',
        mes: 11,
        fechaInicio: '2026-11-14',
        fechaFin: '2026-11-29',
        fechas: ['2026-11-14', '2026-11-15', '2026-11-28', '2026-11-29'],
        horario: 'Sáb 8:30 a.m. – 5:00 p.m. · Dom 8:30 a.m. – 12:30 p.m.',
        sedeDetalle: 'Centro Pastoral Lourdes, Urb. Agua Blanca',
        telefonoContacto: '+58 414-6882105',
        coordinadores: 'Esp. Rafael y Beatriz Pirela',
        cuposTotales: 20,
        cuposReservados: 6,
        aporteInfo: 'Cierre con Eucaristía dominical a las 11:30 a.m.',
        estado: 'abierto',
        updatedAt: '2026-10-22T11:15:00.000Z',
      },
      {
        id: 'epim-2026-06',
        year: 2026,
        arciprestazgo: 'Arciprestazgo 5. San Francisco de Asís',
        parroquia: 'Parroquia Santísimo Cristo de San Francisco',
        mes: 11,
        fechaInicio: '2026-11-14',
        fechaFin: '2026-11-29',
        fechas: ['2026-11-14', '2026-11-21', '2026-11-28', '2026-11-29'],
        horario: 'Sábados 2:30 p.m. – 6:00 p.m. · Domingo cierre 8:00 a.m. – 1:00 p.m.',
        sedeDetalle: 'Casa de Retiros San Francisco, Plaza Bolívar de San Francisco',
        telefonoContacto: '+58 412-6554418',
        coordinadores: 'Esp. Miguel Ángel y Rosaura Ferrer',
        cuposTotales: 28,
        cuposReservados: 11,
        aporteInfo: 'Abierto a novios de San Francisco y La Cañada de Urdaneta',
        estado: 'abierto',
        updatedAt: '2026-10-22T16:40:00.000Z',
      },
      {
        id: 'epim-2026-07',
        year: 2026,
        arciprestazgo: 'Arciprestazgo 2. Sagrado Corazón de Jesús',
        parroquia: 'Parroquia Ntra. Sra. de la Consolación',
        mes: 11,
        fechaInicio: '2026-11-28',
        fechaFin: '2026-12-13',
        fechas: ['2026-11-28', '2026-12-05', '2026-12-12', '2026-12-13'],
        horario: 'Sábados 2:30 p.m. – 6:00 p.m. · Domingo cierre 8:30 a.m. – 1:00 p.m.',
        sedeDetalle: 'Salón San Agustín, Av. 4 Bella Vista con Calle 79',
        telefonoContacto: '+58 414-6097732',
        coordinadores: 'Esp. Gustavo y Mariana Perozo',
        cuposTotales: 24,
        cuposReservados: 5,
        aporteInfo: 'Último encuentro arquidiocesano de cierre de año 2026',
        estado: 'abierto',
        updatedAt: '2026-10-23T08:20:00.000Z',
      },
      {
        id: 'epim-2026-08',
        year: 2026,
        arciprestazgo: 'Arciprestazgo 7. San Rafael del Moján',
        parroquia: 'Parroquia San Rafael Arcángel El Moján',
        mes: 12,
        fechaInicio: '2026-12-05',
        fechaFin: '2026-12-20',
        fechas: ['2026-12-05', '2026-12-12', '2026-12-19', '2026-12-20'],
        horario: 'Sábados 2:00 p.m. – 5:30 p.m. · Domingo cierre 8:00 a.m. – 12:00 m.',
        sedeDetalle: 'Salón Parroquial San Rafael, El Moján',
        telefonoContacto: '+58 424-6712098',
        coordinadores: 'Esp. Hernán y Carmen Paz',
        cuposTotales: 18,
        cuposReservados: 4,
        aporteInfo: 'Encuentro arciprestal para comunidades de Mara y Guajira',
        estado: 'abierto',
        updatedAt: '2026-10-24T12:00:00.000Z',
      },
      // Programación adelantada 2027 (para demostrar selección de año público en administración)
      {
        id: 'epim-2027-01',
        year: 2027,
        arciprestazgo: 'Arciprestazgo 1. Ntra. Sra. de Chiquinquirá',
        parroquia: 'Parroquia El Sagrario La Catedral de los Santos Apóstoles Pedro y Pablo',
        mes: 1,
        fechaInicio: '2027-01-16',
        fechaFin: '2027-01-31',
        fechas: ['2027-01-16', '2027-01-23', '2027-01-30', '2027-01-31'],
        horario: 'Sábados 2:30 p.m. – 6:00 p.m. · Domingo cierre 8:30 a.m. – 12:30 p.m.',
        sedeDetalle: 'Salón Capitular de la Santa Iglesia Catedral',
        telefonoContacto: '+58 414-6184520',
        coordinadores: 'Equipo Arquidiocesano Pastoral Familiar',
        cuposTotales: 25,
        cuposReservados: 0,
        aporteInfo: 'Apertura del calendario pastoral 2027',
        estado: 'abierto',
        updatedAt: '2026-10-24T15:00:00.000Z',
      },
      {
        id: 'epim-2027-02',
        year: 2027,
        arciprestazgo: 'Arciprestazgo 2. Sagrado Corazón de Jesús',
        parroquia: 'Parroquia Ntra. Sra. de las Mercedes',
        mes: 2,
        fechaInicio: '2027-02-06',
        fechaFin: '2027-02-21',
        fechas: ['2027-02-06', '2027-02-13', '2027-02-20', '2027-02-21'],
        horario: 'Sábados 2:30 p.m. – 6:30 p.m. · Domingo cierre 8:00 a.m. – 1:00 p.m.',
        sedeDetalle: 'Salón Parroquial Las Mercedes, Av. 4 Bella Vista',
        telefonoContacto: '+58 414-6321890',
        coordinadores: 'Esp. Carlos y Elena Urdaneta',
        cuposTotales: 25,
        cuposReservados: 0,
        aporteInfo: 'Incluye material formativo y certificado arquidiocesano',
        estado: 'abierto',
        updatedAt: '2026-10-24T15:10:00.000Z',
      },
      {
        id: 'epim-2027-03',
        year: 2027,
        arciprestazgo: 'Arciprestazgo 4. Ntra. Sra. de Coromoto',
        parroquia: 'Parroquia San Pablo Apóstol. La Rotaria',
        mes: 3,
        fechaInicio: '2027-03-06',
        fechaFin: '2027-03-21',
        fechas: ['2027-03-06', '2027-03-13', '2027-03-20', '2027-03-21'],
        horario: 'Sábados 2:30 p.m. – 6:00 p.m. · Domingo cierre 8:30 a.m. – 1:00 p.m.',
        sedeDetalle: 'Salón Parroquial San Pablo, Urb. La Rotaria',
        telefonoContacto: '+58 424-6128834',
        coordinadores: 'Esp. Daniel y Patricia Molero',
        cuposTotales: 24,
        cuposReservados: 0,
        aporteInfo: 'Inscripciones previas hasta el miércoles anterior al inicio del encuentro',
        estado: 'abierto',
        updatedAt: '2026-10-24T15:20:00.000Z',
      },
    ],
    reservations: [
      {
        id: 'res-2026-101',
        codigoReserva: 'EPIM-2026-4812',
        encounterId: 'epim-2026-03',
        year: 2026,
        parroquiaEpim: 'Parroquia San Antonio María Claret',
        arciprestazgo: 'Arciprestazgo 2. Sagrado Corazón de Jesús',
        fechasEpim: '24 y 31 oct · 7 y 8 nov de 2026',
        nombreNovia: 'Daniela Alejandra Montiel',
        nombreNovio: 'Alejandro José Fuenmayor',
        documentoIdentidad: 'V-26.418.902 / V-25.891.114',
        telefonoPareja: '+58 414-6901122',
        correoPareja: 'daniela.montiel@ejemplo.com',
        parroquiaMatrimonio: 'Parroquia Ntra. Sra. de la Consolación',
        fechaPrevistaBoda: '2027-02-14',
        observaciones: 'Expediente matrimonial iniciado con el Pbro. párroco.',
        estado: 'confirmada',
        createdAt: '2026-10-18T14:22:00.000Z',
      },
      {
        id: 'res-2026-102',
        codigoReserva: 'EPIM-2026-5190',
        encounterId: 'epim-2026-04',
        year: 2026,
        parroquiaEpim: 'Parroquia Ntra. Sra. de Coromoto. Los Olivos',
        arciprestazgo: 'Arciprestazgo 4. Ntra. Sra. de Coromoto',
        fechasEpim: '7, 14, 21 y 22 de noviembre de 2026',
        nombreNovia: 'Valeria Sofía Castellanos',
        nombreNovio: 'Ricardo Andrés Boscán',
        documentoIdentidad: 'V-27.104.331 / V-26.774.209',
        telefonoPareja: '+58 424-6039981',
        correoPareja: 'ricardo.boscan@ejemplo.com',
        parroquiaMatrimonio: 'Parroquia Basílica Ntra. Sra. de Chiquinquirá y San Juan de Dios',
        fechaPrevistaBoda: '2027-04-10',
        observaciones: '',
        estado: 'confirmada',
        createdAt: '2026-10-22T09:45:00.000Z',
      },
    ],
    inquiries: [
      {
        id: 'inq-2026-01',
        nombreRemitente: 'Pbro. Eduardo Morán',
        rolRemitente: 'Sacerdote / Diácono',
        telefono: '+58 414-6229810',
        correo: 'despacho.santalucia@ejemplo.com',
        arciprestazgoInteres: 'Arciprestazgo 1. Ntra. Sra. de Chiquinquirá',
        parroquiaInteres: 'Parroquia Santa Lucía',
        mensaje:
          'Bendiciones. Quisiéramos confirmar la fecha límite para remitir las tres parejas de nuestra comunidad al encuentro en La Consolación.',
        estado: 'pendiente',
        createdAt: '2026-10-23T16:10:00.000Z',
      },
    ],
    customParishes: [],
  };
}

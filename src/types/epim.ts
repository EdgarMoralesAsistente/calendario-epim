export interface EpimDateSession {
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string; // YYYY-MM-DD
}

export interface EpimEncounter {
  id: string;
  year: number;
  arciprestazgo: string;
  parroquia: string;
  mes: number; // Mes principal (1 = Enero ... 12 = Diciembre)
  fechaInicio: string; // Primera fecha del encuentro (YYYY-MM-DD)
  fechaFin: string; // Última fecha del encuentro (YYYY-MM-DD)
  fechas?: string[]; // Fechas individuales del EPIM (Fecha 1, Fecha 2, Fecha 3...) en formato YYYY-MM-DD
  sesiones?: EpimDateSession[]; // Compatibilidad con bloques anteriores
  horario: string;
  sedeDetalle: string;
  telefonoContacto: string;
  coordinadores: string;
  cuposTotales: number;
  cuposReservados: number;
  aporteInfo: string;
  estado: 'abierto' | 'cerrado' | 'finalizado';
  updatedAt: string;
}

export interface Reservation {
  id: string;
  codigoReserva: string;
  encounterId: string;
  year: number;
  parroquiaEpim: string;
  arciprestazgo: string;
  fechasEpim: string;
  nombreNovia: string;
  nombreNovio: string;
  cedulaNovia?: string;
  cedulaNovio?: string;
  documentoIdentidad: string;
  telefonoNovia?: string;
  telefonoNovio?: string;
  telefonoPareja: string;
  correoPareja: string;
  parroquiaMatrimonio: string;
  fechaPrevistaBoda: string;
  observaciones: string;
  estado: 'confirmada' | 'cancelada';
  createdAt: string;
}

export type InquiryStage =
  | 'nuevas'
  | 'en_seguimiento'
  | 'esperando_respuesta'
  | 'atendidas';

export type InquiryPriority = 'alta' | 'media' | 'baja';

export type InquiryChannel =
  | 'Formulario Web'
  | 'WhatsApp'
  | 'Llamada telefónica'
  | 'Correo electrónico'
  | 'Presencial';

export interface InquiryChecklistItem {
  id: string;
  texto: string;
  completado: boolean;
}

export type InquiryHistoryType =
  | 'creacion'
  | 'nota'
  | 'contacto'
  | 'cambio_etapa'
  | 'edicion'
  | 'checklist';

export interface InquiryHistoryEntry {
  id: string;
  tipo: InquiryHistoryType;
  autor: string;
  texto: string;
  createdAt: string;
}

export interface Inquiry {
  id: string;
  asunto?: string;
  nombreRemitente: string;
  rolRemitente: 'Pareja de novios' | 'Sacerdote / Diácono' | 'Agente de Pastoral' | 'Otro';
  telefono: string;
  correo: string;
  arciprestazgoInteres: string;
  parroquiaInteres: string;
  mensaje: string;
  estado: 'pendiente' | 'atendida';
  etapa?: InquiryStage;
  prioridad?: InquiryPriority;
  responsable?: string;
  fechaSeguimiento?: string; // YYYY-MM-DD
  canalOrigen?: InquiryChannel;
  notasInternas?: string;
  checklist?: InquiryChecklistItem[];
  historial?: InquiryHistoryEntry[];
  createdAt: string;
  updatedAt?: string;
}

export interface AppConfig {
  publicYear: number;
  availableYears: number[];
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle: string;
  lastSyncedAt: string;
  authorizedAdmins: string[];
  secretariadoTelefono: string;
  secretariadoCorreo: string;
  secretariadoDireccion: string;
}

export interface EpimStore {
  config: AppConfig;
  encounters: EpimEncounter[];
  reservations: Reservation[];
  inquiries: Inquiry[];
  customParishes: { arciprestazgo: string; parroquia: string }[];
}

export interface PublicBoardResponse {
  publicYear: number;
  encounters: EpimEncounter[];
  secretariado: {
    telefono: string;
    correo: string;
    direccion: string;
  };
  customParishes: { arciprestazgo: string; parroquia: string }[];
  spreadsheetConnected: boolean;
  lastSyncedAt: string;
}

export interface AnnualParishBatchItem {
  mes: number;
  fechaInicio: string;
  fechaFin: string;
  fechas?: string[];
  sesiones?: EpimDateSession[];
  horario: string;
  cuposTotales: number;
  sedeDetalle: string;
  aporteInfo: string;
}

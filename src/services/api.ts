import type {
  AnnualParishBatchItem,
  EpimEncounter,
  EpimStore,
  Inquiry,
  InquiryHistoryType,
  InquiryStage,
  PublicBoardResponse,
  Reservation,
} from '../types/epim.ts';
import { getAccessToken, auth } from './authService.ts';

async function adminHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Tu sesión administrativa expiró. Por favor vuelve a iniciar sesión con Google.');
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (auth.currentUser) {
    if (auth.currentUser.email) {
      headers['X-Admin-Email'] = auth.currentUser.email;
    }
    try {
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) {
        headers['X-Firebase-Id-Token'] = idToken;
      }
    } catch {
      // Fallback to accessToken verification on server
    }
  }
  if (typeof window !== 'undefined') {
    const savedSheetId = window.localStorage.getItem('epim_connected_spreadsheet_id');
    if (savedSheetId) {
      headers['X-Preferred-Spreadsheet-Id'] = savedSheetId;
    }
  }
  return headers;
}

async function parseJsonOrError<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Error en la solicitud (${res.status})`);
  }
  return data as T;
}

export async function fetchPublicBoard(): Promise<PublicBoardResponse> {
  const res = await fetch('/api/public/board');
  return parseJsonOrError<PublicBoardResponse>(res);
}

export async function submitPublicReservation(payload: {
  encounterId: string;
  nombreNovia: string;
  nombreNovio: string;
  cedulaNovia: string;
  cedulaNovio: string;
  documentoIdentidad?: string;
  telefonoNovia: string;
  telefonoNovio: string;
  telefonoPareja?: string;
  correoPareja: string;
  parroquiaMatrimonio: string;
  fechaPrevistaBoda: string;
  observaciones: string;
}): Promise<{ reservation: Reservation; encounter: EpimEncounter }> {
  const res = await fetch('/api/public/reservations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrError<{ reservation: Reservation; encounter: EpimEncounter }>(res);
}

export async function submitPublicInquiry(payload: {
  nombreRemitente: string;
  rolRemitente: Inquiry['rolRemitente'];
  telefono: string;
  correo: string;
  arciprestazgoInteres: string;
  parroquiaInteres: string;
  mensaje: string;
}): Promise<{ inquiry: Inquiry }> {
  const res = await fetch('/api/public/inquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrError<{ inquiry: Inquiry }>(res);
}

export async function fetchAdminStore(): Promise<EpimStore> {
  const headers = await adminHeaders();
  const res = await fetch('/api/admin/store', { headers });
  return parseJsonOrError<EpimStore>(res);
}

export async function updateAdminConfig(
  updates: Partial<EpimStore['config']>
): Promise<EpimStore> {
  const headers = await adminHeaders();
  const res = await fetch('/api/admin/config', {
    method: 'PUT',
    headers,
    body: JSON.stringify(updates),
  });
  return parseJsonOrError<EpimStore>(res);
}

export async function createAdminEncounter(
  payload: Partial<EpimEncounter>
): Promise<{ encounter: EpimEncounter; store: EpimStore }> {
  const headers = await adminHeaders();
  const res = await fetch('/api/admin/encounters', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return parseJsonOrError<{ encounter: EpimEncounter; store: EpimStore }>(res);
}

export async function createAnnualParishBatch(payload: {
  year: number;
  arciprestazgo: string;
  parroquia: string;
  telefonoContacto: string;
  coordinadores: string;
  items: AnnualParishBatchItem[];
}): Promise<{ createdCount: number; store: EpimStore }> {
  const headers = await adminHeaders();
  const res = await fetch('/api/admin/encounters/batch-parish', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return parseJsonOrError<{ createdCount: number; store: EpimStore }>(res);
}

export async function updateAdminEncounter(
  id: string,
  payload: Partial<EpimEncounter>
): Promise<{ encounter: EpimEncounter; store: EpimStore }> {
  const headers = await adminHeaders();
  const res = await fetch(`/api/admin/encounters/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });
  return parseJsonOrError<{ encounter: EpimEncounter; store: EpimStore }>(res);
}

export async function deleteAdminEncounter(id: string): Promise<{ store: EpimStore }> {
  const headers = await adminHeaders();
  const res = await fetch(`/api/admin/encounters/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers,
  });
  return parseJsonOrError<{ store: EpimStore }>(res);
}

export async function updateReservationStatus(
  id: string,
  estado: 'confirmada' | 'cancelada'
): Promise<{ store: EpimStore }> {
  const headers = await adminHeaders();
  const res = await fetch(`/api/admin/reservations/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ estado }),
  });
  return parseJsonOrError<{ store: EpimStore }>(res);
}

export async function createAdminInquiry(
  payload: Partial<Inquiry>
): Promise<{ inquiry: Inquiry; store: EpimStore }> {
  const headers = await adminHeaders();
  const res = await fetch('/api/admin/inquiries', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return parseJsonOrError<{ inquiry: Inquiry; store: EpimStore }>(res);
}

export async function updateAdminInquiry(
  id: string,
  payload: Partial<Inquiry> & {
    logEntry?: { tipo?: InquiryHistoryType; texto?: string };
    suppressAutoLog?: boolean;
  }
): Promise<{ inquiry: Inquiry; store: EpimStore }> {
  const headers = await adminHeaders();
  const res = await fetch(`/api/admin/inquiries/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });
  return parseJsonOrError<{ inquiry: Inquiry; store: EpimStore }>(res);
}

export async function addInquiryActivity(
  id: string,
  payload: { texto: string; tipo?: 'nota' | 'contacto' }
): Promise<{ inquiry: Inquiry; store: EpimStore }> {
  const headers = await adminHeaders();
  const res = await fetch(`/api/admin/inquiries/${encodeURIComponent(id)}/activity`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return parseJsonOrError<{ inquiry: Inquiry; store: EpimStore }>(res);
}

export async function deleteInquiryActivity(
  id: string,
  entryId: string
): Promise<{ inquiry: Inquiry; store: EpimStore }> {
  const headers = await adminHeaders();
  const res = await fetch(
    `/api/admin/inquiries/${encodeURIComponent(id)}/activity/${encodeURIComponent(
      entryId
    )}`,
    {
      method: 'DELETE',
      headers,
    }
  );
  return parseJsonOrError<{ inquiry: Inquiry; store: EpimStore }>(res);
}

export async function updateInquiryStatus(
  id: string,
  estadoOrEtapa:
    | 'pendiente'
    | 'atendida'
    | { estado?: 'pendiente' | 'atendida'; etapa?: InquiryStage }
): Promise<{ inquiry?: Inquiry; store: EpimStore }> {
  const headers = await adminHeaders();
  const body =
    typeof estadoOrEtapa === 'string' ? { estado: estadoOrEtapa } : estadoOrEtapa;
  const res = await fetch(`/api/admin/inquiries/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  return parseJsonOrError<{ inquiry?: Inquiry; store: EpimStore }>(res);
}

export async function deleteAdminInquiry(
  id: string
): Promise<{ store: EpimStore }> {
  const headers = await adminHeaders();
  const res = await fetch(`/api/admin/inquiries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers,
  });
  return parseJsonOrError<{ store: EpimStore }>(res);
}

export async function addCustomParish(
  arciprestazgo: string,
  parroquia: string
): Promise<{ store: EpimStore }> {
  const headers = await adminHeaders();
  const res = await fetch('/api/admin/parishes', {
    method: 'POST',
    headers,
    body: JSON.stringify({ arciprestazgo, parroquia }),
  });
  return parseJsonOrError<{ store: EpimStore }>(res);
}

export async function saveImportedSheetsData(payload: {
  encounters: EpimEncounter[];
  reservations: Reservation[];
  inquiries: Inquiry[];
  publicYear?: number;
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle: string;
}): Promise<EpimStore> {
  const headers = await adminHeaders();
  const res = await fetch('/api/admin/sheets/import', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return parseJsonOrError<EpimStore>(res);
}

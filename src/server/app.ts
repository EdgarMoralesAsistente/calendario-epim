import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  createInitialStore,
  formatEncounterDatesEs,
  normalizeIndividualDates,
} from '../data/maracaiboCatalog.js';
import type {
  AnnualParishBatchItem,
  EpimEncounter,
  EpimStore,
  Inquiry,
  PublicBoardResponse,
  Reservation,
} from '../types/epim.js';
import {
  extractSpreadsheetId,
  pullStoreFromSpreadsheet,
  pushStoreToSpreadsheet,
} from '../services/sheetsService.js';
import { fetchStoreFromPublicSheet } from './sheetsPublicReader.js';

dotenv.config();

const DATA_DIR = process.env.VERCEL
  ? '/tmp/epim-data'
  : path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'epim-store.json');

const FALLBACK_PASTORAL_SHEET_ID = '1fi0tziUAv-_Qt0Sop6INgQQuawPFGh6U7dyxpX6TxWc';

const ENV_SPREADSHEET_ID = extractSpreadsheetId(
  process.env.GOOGLE_SHEET_ID ||
    process.env.GOOGLE_SHEETS_URL ||
    process.env.SPREADSHEET_ID ||
    process.env.VITE_DEFAULT_SPREADSHEET_ID ||
    FALLBACK_PASTORAL_SHEET_ID
);

function loadStore(): EpimStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as EpimStore;
      if (parsed && parsed.config && Array.isArray(parsed.encounters)) {
        if (ENV_SPREADSHEET_ID && !parsed.config.spreadsheetId) {
          parsed.config.spreadsheetId = ENV_SPREADSHEET_ID;
          parsed.config.spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${ENV_SPREADSHEET_ID}/edit`;
        }
        if (
          !parsed.config.secretariadoTelefono ||
          parsed.config.secretariadoTelefono.startsWith('#ERROR')
        ) {
          parsed.config.secretariadoTelefono = '+58 414-6184520';
        }
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error loading epim-store.json, initializing default store:', err);
  }
  const initial = createInitialStore();
  if (ENV_SPREADSHEET_ID) {
    initial.config.spreadsheetId = ENV_SPREADSHEET_ID;
    initial.config.spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${ENV_SPREADSHEET_ID}/edit`;
  }
  saveStore(initial);
  return initial;
}

function saveStore(targetStore: EpimStore): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const yearSet = new Set<number>(targetStore.config.availableYears || []);
    yearSet.add(targetStore.config.publicYear);
    for (const enc of targetStore.encounters) {
      if (enc.year) yearSet.add(enc.year);
    }
    targetStore.config.availableYears = Array.from(yearSet).sort((a, b) => a - b);

    const tmpFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(targetStore, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DATA_FILE);
  } catch (err) {
    console.error('Error saving epim-store.json:', err);
  }
}

const store: EpimStore = loadStore();

// Merge env ADMIN_EMAILS into authorizedAdmins if provided
const envAdmins = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

for (const email of envAdmins) {
  if (!store.config.authorizedAdmins.map((a) => a.toLowerCase()).includes(email)) {
    store.config.authorizedAdmins.push(email);
  }
}
saveStore(store);

let lastPublicSheetHydrationMs = 0;
let hasLocalUnsyncedPublicMutations = false;

/**
 * Hydrates the in-memory store from the configured Google Sheet (when shared as Viewer)
 * so stateless Vercel Serverless cold starts immediately serve the real Google Sheet data.
 */
async function hydrateFromPublicSheetIfNeeded(force = false): Promise<void> {
  const sheetId = store.config.spreadsheetId || ENV_SPREADSHEET_ID;
  if (!sheetId) return;

  const now = Date.now();
  // Throttle public CSV refreshes to every 20 seconds unless forced, and preserve unsynced public reservations
  if (!force && (hasLocalUnsyncedPublicMutations || now - lastPublicSheetHydrationMs < 20_000)) {
    return;
  }

  lastPublicSheetHydrationMs = now;
  const remote = await fetchStoreFromPublicSheet(sheetId, store);
  if (!remote) return;

  if (remote.config) {
    store.config = {
      ...store.config,
      ...remote.config,
      spreadsheetId: sheetId,
      spreadsheetUrl:
        store.config.spreadsheetUrl ||
        `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
    };
  }
  if (remote.encounters && remote.encounters.length > 0) {
    store.encounters = remote.encounters;
  }
  if (remote.reservations && remote.reservations.length > 0) {
    store.reservations = remote.reservations;
  }
  if (remote.inquiries && remote.inquiries.length > 0) {
    store.inquiries = remote.inquiries;
  }
  saveStore(store);
}

interface AuthenticatedRequest extends Request {
  adminUser?: {
    email: string;
    name?: string;
    accessToken: string;
  };
}

async function verifyGoogleAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res
      .status(401)
      .json({ error: 'Se requiere autenticación con Google para acceder al panel.' });
    return;
  }

  const accessToken = authHeader.slice('Bearer '.length).trim();
  if (!accessToken) {
    res.status(401).json({ error: 'Token de acceso vacío.' });
    return;
  }

  try {
    await hydrateFromPublicSheetIfNeeded(false);

    let resolvedEmail = '';
    let resolvedName: string | undefined;

    // 1. Verify signed Firebase/Google OIDC ID token if present
    const idToken = (req.headers['x-firebase-id-token'] as string | undefined)?.trim();
    if (idToken) {
      const idTokenRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
      );
      if (idTokenRes.ok) {
        const idPayload = (await idTokenRes.json()) as {
          email?: string;
          name?: string;
        };
        if (idPayload.email) {
          resolvedEmail = idPayload.email.toLowerCase();
          resolvedName = idPayload.name;
        }
      }
    }

    // 2. Validate Google OAuth access token via tokeninfo / userinfo
    const tokenInfoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(
        accessToken
      )}`
    );
    if (!tokenInfoRes.ok) {
      res
        .status(401)
        .json({ error: 'La sesión de Google expiró. Vuelve a iniciar sesión.' });
      return;
    }

    const tokenInfo = (await tokenInfoRes.json()) as { email?: string };
    if (!resolvedEmail && tokenInfo.email) {
      resolvedEmail = tokenInfo.email.toLowerCase();
    }

    if (!resolvedEmail) {
      const userInfoRes = await fetch(
        'https://www.googleapis.com/oauth2/v3/userinfo',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      if (userInfoRes.ok) {
        const profile = (await userInfoRes.json()) as {
          email?: string;
          name?: string;
        };
        if (profile.email) {
          resolvedEmail = profile.email.toLowerCase();
          resolvedName = resolvedName || profile.name;
        }
      }
    }

    if (!resolvedEmail) {
      const emailHeader = (req.headers['x-admin-email'] as string | undefined)
        ?.trim()
        .toLowerCase();
      if (emailHeader) {
        resolvedEmail = emailHeader;
      }
    }

    const allowed = store.config.authorizedAdmins.map((e) => e.toLowerCase());
    if (!resolvedEmail || !allowed.includes(resolvedEmail)) {
      res.status(403).json({
        error: `La cuenta ${
          resolvedEmail || 'actual'
        } no tiene permisos administrativos. Inicia sesión con una cuenta autorizada (ej. lapastoralfamiliar.mcbo@gmail.com).`,
        email: resolvedEmail,
      });
      return;
    }

    req.adminUser = {
      email: resolvedEmail,
      name: resolvedName,
      accessToken,
    };
    next();
  } catch (err) {
    console.error('Error verifying Google token:', err);
    res.status(500).json({ error: 'Error al verificar las credenciales de Google.' });
  }
}

async function trySyncWithSheetsIfPossible(accessToken?: string): Promise<void> {
  const targetSheetId = store.config.spreadsheetId || ENV_SPREADSHEET_ID;
  if (!accessToken || !targetSheetId) return;
  try {
    const result = await pushStoreToSpreadsheet(targetSheetId, accessToken, store);
    store.config.spreadsheetId = targetSheetId;
    store.config.lastSyncedAt = result.syncedAt;
    store.config.spreadsheetTitle = result.title;
    store.config.spreadsheetUrl = result.spreadsheetUrl;
    hasLocalUnsyncedPublicMutations = false;
    lastPublicSheetHydrationMs = Date.now();
    saveStore(store);
  } catch (err) {
    console.warn('Background Google Sheets sync warning:', err);
  }
}

export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Normalize rewritten Vercel URLs if needed
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (!req.url.startsWith('/api/') && req.originalUrl?.startsWith('/api/')) {
      req.url = req.originalUrl;
    }
    next();
  });

  // ──────────────────────────────────────────────────────────────
  // PUBLIC ENDPOINTS (Cartelera, Calendario, Reservas, Consultas)
  // ──────────────────────────────────────────────────────────────

  app.get('/api/public/board', async (_req: Request, res: Response) => {
    await hydrateFromPublicSheetIfNeeded(false);

    const publicYear = store.config.publicYear;
    const encounters = store.encounters
      .filter((e) => e.year === publicYear)
      .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));

    const payload: PublicBoardResponse = {
      publicYear,
      encounters,
      secretariado: {
        telefono: store.config.secretariadoTelefono,
        correo: store.config.secretariadoCorreo,
        direccion: store.config.secretariadoDireccion,
      },
      customParishes: store.customParishes,
      spreadsheetConnected: Boolean(
        store.config.spreadsheetId || ENV_SPREADSHEET_ID
      ),
      lastSyncedAt: store.config.lastSyncedAt,
    };

    res.json(payload);
  });

  app.post('/api/public/reservations', async (req: Request, res: Response) => {
    await hydrateFromPublicSheetIfNeeded(false);

    const {
      encounterId,
      nombreNovia,
      nombreNovio,
      documentoIdentidad,
      telefonoPareja,
      correoPareja,
      parroquiaMatrimonio,
      fechaPrevistaBoda,
      observaciones,
    } = req.body as Partial<Reservation>;

    if (
      !encounterId ||
      !nombreNovia?.trim() ||
      !nombreNovio?.trim() ||
      !telefonoPareja?.trim()
    ) {
      res.status(400).json({
        error:
          'Por favor completa los nombres de ambos novios, el teléfono de contacto y selecciona un encuentro.',
      });
      return;
    }

    const encounter = store.encounters.find((e) => e.id === encounterId);
    if (!encounter) {
      res.status(404).json({ error: 'El encuentro EPIM seleccionado no existe.' });
      return;
    }

    if (encounter.year !== store.config.publicYear) {
      res.status(400).json({
        error: 'Solo se permiten reservaciones para el año público vigente.',
      });
      return;
    }

    const cuposDisponibles = encounter.cuposTotales - encounter.cuposReservados;
    if (encounter.estado !== 'abierto' || cuposDisponibles <= 0) {
      res.status(409).json({
        error:
          'Lo sentimos, los cupos para este encuentro EPIM se han agotado o la inscripción está cerrada.',
      });
      return;
    }

    encounter.cuposReservados += 1;
    if (encounter.cuposReservados >= encounter.cuposTotales) {
      encounter.estado = 'cerrado';
    }
    encounter.updatedAt = new Date().toISOString();

    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const reservation: Reservation = {
      id: `res-${Date.now()}-${randomDigits}`,
      codigoReserva: `EPIM-${encounter.year}-${randomDigits}`,
      encounterId: encounter.id,
      year: encounter.year,
      parroquiaEpim: encounter.parroquia,
      arciprestazgo: encounter.arciprestazgo,
      fechasEpim: formatEncounterDatesEs(encounter),
      nombreNovia: nombreNovia.trim().slice(0, 120),
      nombreNovio: nombreNovio.trim().slice(0, 120),
      documentoIdentidad: (documentoIdentidad || '').trim().slice(0, 80),
      telefonoPareja: telefonoPareja.trim().slice(0, 50),
      correoPareja: (correoPareja || '').trim().slice(0, 120),
      parroquiaMatrimonio: (parroquiaMatrimonio || '').trim().slice(0, 140),
      fechaPrevistaBoda: (fechaPrevistaBoda || '').trim().slice(0, 30),
      observaciones: (observaciones || '').trim().slice(0, 400),
      estado: 'confirmada',
      createdAt: new Date().toISOString(),
    };

    store.reservations.unshift(reservation);
    hasLocalUnsyncedPublicMutations = true;
    saveStore(store);

    res.status(201).json({
      reservation,
      encounter,
    });
  });

  app.post('/api/public/inquiries', async (req: Request, res: Response) => {
    await hydrateFromPublicSheetIfNeeded(false);

    const {
      nombreRemitente,
      rolRemitente,
      telefono,
      correo,
      arciprestazgoInteres,
      parroquiaInteres,
      mensaje,
    } = req.body as Partial<Inquiry>;

    if (!nombreRemitente?.trim() || !telefono?.trim() || !mensaje?.trim()) {
      res.status(400).json({
        error:
          'Por favor indica tu nombre, teléfono de contacto y el motivo de tu consulta.',
      });
      return;
    }

    const inquiry: Inquiry = {
      id: `inq-${Date.now()}`,
      nombreRemitente: nombreRemitente.trim().slice(0, 120),
      rolRemitente: rolRemitente || 'Pareja de novios',
      telefono: telefono.trim().slice(0, 50),
      correo: (correo || '').trim().slice(0, 120),
      arciprestazgoInteres: (arciprestazgoInteres || '').trim().slice(0, 140),
      parroquiaInteres: (parroquiaInteres || '').trim().slice(0, 140),
      mensaje: mensaje.trim().slice(0, 1000),
      estado: 'pendiente',
      createdAt: new Date().toISOString(),
    };

    store.inquiries.unshift(inquiry);
    hasLocalUnsyncedPublicMutations = true;
    saveStore(store);

    res.status(201).json({ inquiry });
  });

  // ──────────────────────────────────────────────────────────────
  // PROTECTED ADMIN ENDPOINTS
  // ──────────────────────────────────────────────────────────────

  app.get(
    '/api/admin/store',
    verifyGoogleAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const preferredHeaderId = extractSpreadsheetId(
        (req.headers['x-preferred-spreadsheet-id'] as string | undefined) || ''
      );
      const effectiveSheetId =
        store.config.spreadsheetId || ENV_SPREADSHEET_ID || preferredHeaderId;

      // On Vercel cold start, if a Sheet ID is known and we have the admin's OAuth token,
      // automatically pull live data from Google Sheets if not yet synced in this container!
      if (
        effectiveSheetId &&
        req.adminUser?.accessToken &&
        !store.config.lastSyncedAt &&
        !hasLocalUnsyncedPublicMutations
      ) {
        try {
          const pulled = await pullStoreFromSpreadsheet(
            effectiveSheetId,
            req.adminUser.accessToken,
            store
          );
          if (pulled.encounters.length > 0) {
            store.encounters = pulled.encounters;
          }
          if (pulled.reservations.length > 0) {
            store.reservations = pulled.reservations;
          }
          if (pulled.inquiries.length > 0) {
            store.inquiries = pulled.inquiries;
          }
          if (pulled.publicYear) {
            store.config.publicYear = pulled.publicYear;
          }
          store.config.spreadsheetId = effectiveSheetId;
          store.config.spreadsheetUrl = pulled.spreadsheetUrl;
          store.config.spreadsheetTitle = pulled.title;
          store.config.lastSyncedAt = new Date().toISOString();
          saveStore(store);
        } catch (err) {
          console.warn('Auto-restore from Google Sheets skipped:', err);
        }
      } else if (hasLocalUnsyncedPublicMutations && req.adminUser?.accessToken) {
        // Push any public reservations/inquiries received while admin was offline into Google Sheets!
        await trySyncWithSheetsIfPossible(req.adminUser.accessToken);
      }

      res.json(store);
    }
  );

  app.put(
    '/api/admin/config',
    verifyGoogleAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const updates = req.body as Partial<EpimStore['config']>;

      if (
        typeof updates.publicYear === 'number' &&
        updates.publicYear >= 2024 &&
        updates.publicYear <= 2035
      ) {
        store.config.publicYear = updates.publicYear;
      }
      if (Array.isArray(updates.availableYears)) {
        store.config.availableYears = updates.availableYears
          .map(Number)
          .filter((y) => y >= 2024 && y <= 2035);
      }
      if (typeof updates.spreadsheetId === 'string') {
        store.config.spreadsheetId = extractSpreadsheetId(updates.spreadsheetId);
      }
      if (typeof updates.spreadsheetUrl === 'string') {
        store.config.spreadsheetUrl = updates.spreadsheetUrl.trim();
      }
      if (typeof updates.spreadsheetTitle === 'string') {
        store.config.spreadsheetTitle = updates.spreadsheetTitle.trim();
      }
      if (typeof updates.lastSyncedAt === 'string') {
        store.config.lastSyncedAt = updates.lastSyncedAt;
      }
      if (typeof updates.secretariadoTelefono === 'string') {
        store.config.secretariadoTelefono = updates.secretariadoTelefono.trim();
      }
      if (typeof updates.secretariadoCorreo === 'string') {
        store.config.secretariadoCorreo = updates.secretariadoCorreo.trim();
      }
      if (typeof updates.secretariadoDireccion === 'string') {
        store.config.secretariadoDireccion = updates.secretariadoDireccion.trim();
      }
      if (Array.isArray(updates.authorizedAdmins)) {
        const cleaned = updates.authorizedAdmins
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean);
        if (!cleaned.includes('lapastoralfamiliar.mcbo@gmail.com')) {
          cleaned.unshift('lapastoralfamiliar.mcbo@gmail.com');
        }
        store.config.authorizedAdmins = Array.from(new Set(cleaned));
      }

      saveStore(store);
      await trySyncWithSheetsIfPossible(req.adminUser?.accessToken);
      res.json(store);
    }
  );

  app.post(
    '/api/admin/encounters',
    verifyGoogleAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const body = req.body as Partial<EpimEncounter>;
      const fechas = normalizeIndividualDates(
        body.fechas,
        body.sesiones,
        body.fechaInicio,
        body.fechaFin
      );

      if (!body.parroquia?.trim() || !body.arciprestazgo?.trim() || fechas.length < 2) {
        res.status(400).json({
          error:
            'Arciprestazgo, parroquia y al menos 2 fechas individuales del EPIM son obligatorios.',
        });
        return;
      }

      const firstDate = fechas[0];
      const lastDate = fechas[fechas.length - 1];
      const parsedMonth = Number(firstDate.split('-')[1]) || Number(body.mes) || 1;
      const parsedYear =
        Number(body.year) || Number(firstDate.split('-')[0]) || store.config.publicYear;
      const cuposTotales = Math.max(1, Number(body.cuposTotales) || 25);
      const cuposReservados = Math.max(
        0,
        Math.min(cuposTotales, Number(body.cuposReservados) || 0)
      );

      const encounter: EpimEncounter = {
        id: `epim-${parsedYear}-${Date.now()}`,
        year: parsedYear,
        arciprestazgo: body.arciprestazgo.trim(),
        parroquia: body.parroquia.trim(),
        mes: parsedMonth,
        fechaInicio: firstDate,
        fechaFin: lastDate,
        fechas,
        horario:
          body.horario?.trim() ||
          'Sábados 2:30 p.m. – 6:00 p.m. · Domingo cierre 8:30 a.m. – 1:00 p.m.',
        sedeDetalle: (body.sedeDetalle || '').trim(),
        telefonoContacto: (body.telefonoContacto || '').trim(),
        coordinadores: (body.coordinadores || '').trim(),
        cuposTotales,
        cuposReservados,
        aporteInfo: (body.aporteInfo || '').trim(),
        estado: body.estado || (cuposReservados >= cuposTotales ? 'cerrado' : 'abierto'),
        updatedAt: new Date().toISOString(),
      };

      store.encounters.push(encounter);
      saveStore(store);
      await trySyncWithSheetsIfPossible(req.adminUser?.accessToken);
      res.status(201).json({ encounter, store });
    }
  );

  app.post(
    '/api/admin/encounters/batch-parish',
    verifyGoogleAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const {
        year,
        arciprestazgo,
        parroquia,
        telefonoContacto,
        coordinadores,
        items,
      } = req.body as {
        year: number;
        arciprestazgo: string;
        parroquia: string;
        telefonoContacto: string;
        coordinadores: string;
        items: AnnualParishBatchItem[];
      };

      if (
        !year ||
        !arciprestazgo?.trim() ||
        !parroquia?.trim() ||
        !Array.isArray(items) ||
        items.length === 0
      ) {
        res.status(400).json({
          error:
            'Selecciona año, arciprestazgo, parroquia y al menos un encuentro con sus fechas.',
        });
        return;
      }

      const created: EpimEncounter[] = [];
      items.forEach((item, idx) => {
        const fechas = normalizeIndividualDates(
          item.fechas,
          item.sesiones,
          item.fechaInicio,
          item.fechaFin
        );
        if (fechas.length < 2) return;
        const firstDate = fechas[0];
        const lastDate = fechas[fechas.length - 1];
        const mesFromDate = Number(firstDate.split('-')[1]) || item.mes || 1;
        const enc: EpimEncounter = {
          id: `epim-${year}-${Date.now()}-${idx}`,
          year: Number(year),
          arciprestazgo: arciprestazgo.trim(),
          parroquia: parroquia.trim(),
          mes: mesFromDate,
          fechaInicio: firstDate,
          fechaFin: lastDate,
          fechas,
          horario:
            item.horario?.trim() ||
            'Sábados 2:30 p.m. – 6:00 p.m. · Domingo cierre 8:30 a.m. – 1:00 p.m.',
          sedeDetalle: (item.sedeDetalle || '').trim(),
          telefonoContacto: (telefonoContacto || '').trim(),
          coordinadores: (coordinadores || '').trim(),
          cuposTotales: Math.max(1, Number(item.cuposTotales) || 25),
          cuposReservados: 0,
          aporteInfo: (item.aporteInfo || '').trim(),
          estado: 'abierto',
          updatedAt: new Date().toISOString(),
        };
        store.encounters.push(enc);
        created.push(enc);
      });

      if (created.length === 0) {
        res.status(400).json({
          error: 'Cada encuentro EPIM debe registrar al menos 2 fechas individuales.',
        });
        return;
      }

      saveStore(store);
      await trySyncWithSheetsIfPossible(req.adminUser?.accessToken);
      res.status(201).json({ createdCount: created.length, store });
    }
  );

  app.put(
    '/api/admin/encounters/:id',
    verifyGoogleAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const idx = store.encounters.findIndex((e) => e.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ error: 'Encuentro no encontrado.' });
        return;
      }

      const existing = store.encounters[idx];
      const body = req.body as Partial<EpimEncounter>;
      const fechas = normalizeIndividualDates(
        body.fechas ?? existing.fechas,
        body.sesiones ?? existing.sesiones,
        body.fechaInicio || existing.fechaInicio,
        body.fechaFin ?? existing.fechaFin
      );
      if (fechas.length < 2) {
        res.status(400).json({
          error:
            'Cada encuentro EPIM debe tener al menos 2 fechas individuales registradas.',
        });
        return;
      }
      const fechaInicio = fechas[0];
      const fechaFin = fechas[fechas.length - 1];
      const mes =
        Number(fechaInicio.split('-')[1]) || Number(body.mes) || existing.mes;
      const cuposTotales =
        body.cuposTotales !== undefined
          ? Math.max(1, Number(body.cuposTotales))
          : existing.cuposTotales;
      const cuposReservados =
        body.cuposReservados !== undefined
          ? Math.max(0, Number(body.cuposReservados))
          : existing.cuposReservados;

      const updatedEncounter: EpimEncounter = {
        ...existing,
        year: body.year !== undefined ? Number(body.year) : existing.year,
        arciprestazgo: body.arciprestazgo?.trim() ?? existing.arciprestazgo,
        parroquia: body.parroquia?.trim() ?? existing.parroquia,
        mes,
        fechaInicio,
        fechaFin,
        fechas,
        horario: body.horario?.trim() ?? existing.horario,
        sedeDetalle: body.sedeDetalle?.trim() ?? existing.sedeDetalle,
        telefonoContacto: body.telefonoContacto?.trim() ?? existing.telefonoContacto,
        coordinadores: body.coordinadores?.trim() ?? existing.coordinadores,
        cuposTotales,
        cuposReservados,
        aporteInfo: body.aporteInfo?.trim() ?? existing.aporteInfo,
        estado: body.estado ?? existing.estado,
        updatedAt: new Date().toISOString(),
      };
      delete updatedEncounter.sesiones;

      store.encounters[idx] = updatedEncounter;

      saveStore(store);
      await trySyncWithSheetsIfPossible(req.adminUser?.accessToken);
      res.json({ encounter: store.encounters[idx], store });
    }
  );

  app.delete(
    '/api/admin/encounters/:id',
    verifyGoogleAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const idx = store.encounters.findIndex((e) => e.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ error: 'Encuentro no encontrado.' });
        return;
      }

      store.encounters.splice(idx, 1);
      saveStore(store);
      await trySyncWithSheetsIfPossible(req.adminUser?.accessToken);
      res.json({ store });
    }
  );

  app.patch(
    '/api/admin/reservations/:id/status',
    verifyGoogleAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const { estado } = req.body as { estado: 'confirmada' | 'cancelada' };
      const reservation = store.reservations.find((r) => r.id === req.params.id);
      if (!reservation) {
        res.status(404).json({ error: 'Reservación no encontrada.' });
        return;
      }

      if (reservation.estado !== estado) {
        const encounter = store.encounters.find(
          (e) => e.id === reservation.encounterId
        );
        if (encounter) {
          if (estado === 'cancelada' && reservation.estado === 'confirmada') {
            encounter.cuposReservados = Math.max(0, encounter.cuposReservados - 1);
            if (
              encounter.estado === 'cerrado' &&
              encounter.cuposReservados < encounter.cuposTotales
            ) {
              encounter.estado = 'abierto';
            }
          } else if (estado === 'confirmada' && reservation.estado === 'cancelada') {
            if (encounter.cuposReservados >= encounter.cuposTotales) {
              res.status(409).json({
                error:
                  'No quedan cupos disponibles en este encuentro para reactivar la reserva.',
              });
              return;
            }
            encounter.cuposReservados += 1;
            if (encounter.cuposReservados >= encounter.cuposTotales) {
              encounter.estado = 'cerrado';
            }
          }
          encounter.updatedAt = new Date().toISOString();
        }
        reservation.estado = estado;
        saveStore(store);
        await trySyncWithSheetsIfPossible(req.adminUser?.accessToken);
      }

      res.json({ store });
    }
  );

  app.patch(
    '/api/admin/inquiries/:id/status',
    verifyGoogleAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const { estado } = req.body as { estado: 'pendiente' | 'atendida' };
      const inquiry = store.inquiries.find((i) => i.id === req.params.id);
      if (!inquiry) {
        res.status(404).json({ error: 'Consulta no encontrada.' });
        return;
      }

      inquiry.estado = estado;
      saveStore(store);
      await trySyncWithSheetsIfPossible(req.adminUser?.accessToken);
      res.json({ store });
    }
  );

  app.post(
    '/api/admin/parishes',
    verifyGoogleAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const { arciprestazgo, parroquia } = req.body as {
        arciprestazgo?: string;
        parroquia?: string;
      };
      if (!arciprestazgo?.trim() || !parroquia?.trim()) {
        res
          .status(400)
          .json({ error: 'Indica el arciprestazgo y el nombre de la parroquia.' });
        return;
      }
      const exists = store.customParishes.some(
        (p) =>
          p.arciprestazgo.toLowerCase() === arciprestazgo.trim().toLowerCase() &&
          p.parroquia.toLowerCase() === parroquia.trim().toLowerCase()
      );
      if (!exists) {
        store.customParishes.push({
          arciprestazgo: arciprestazgo.trim(),
          parroquia: parroquia.trim(),
        });
        saveStore(store);
      }
      res.json({ store });
    }
  );

  app.post(
    '/api/admin/sheets/import',
    verifyGoogleAdmin,
    (req: AuthenticatedRequest, res: Response) => {
      const {
        encounters,
        reservations,
        inquiries,
        publicYear,
        spreadsheetId,
        spreadsheetUrl,
        spreadsheetTitle,
      } = req.body as {
        encounters?: EpimEncounter[];
        reservations?: Reservation[];
        inquiries?: Inquiry[];
        publicYear?: number;
        spreadsheetId?: string;
        spreadsheetUrl?: string;
        spreadsheetTitle?: string;
      };

      if (Array.isArray(encounters)) {
        store.encounters = encounters;
      }
      if (Array.isArray(reservations)) {
        store.reservations = reservations;
      }
      if (Array.isArray(inquiries)) {
        store.inquiries = inquiries;
      }
      if (typeof publicYear === 'number' && publicYear >= 2024) {
        store.config.publicYear = publicYear;
      }
      if (spreadsheetId) {
        store.config.spreadsheetId = extractSpreadsheetId(spreadsheetId);
      }
      if (spreadsheetUrl) store.config.spreadsheetUrl = spreadsheetUrl;
      if (spreadsheetTitle) store.config.spreadsheetTitle = spreadsheetTitle;
      store.config.lastSyncedAt = new Date().toISOString();
      hasLocalUnsyncedPublicMutations = false;
      lastPublicSheetHydrationMs = Date.now();

      saveStore(store);
      res.json(store);
    }
  );

  // Express global JSON error fallback
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('API Unhandled Error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Error interno del servidor al procesar la solicitud.',
      });
    }
  });

  return app;
}

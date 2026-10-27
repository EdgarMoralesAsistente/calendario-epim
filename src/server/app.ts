import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  buildDefaultInquirySubject,
  createInitialStore,
  formatEncounterDatesEs,
  getInquiryStageLabel,
  normalizeArciprestazgoName,
  normalizeEpimStoreNames,
  normalizeIndividualDates,
  normalizeInquiryRecord,
  normalizeParroquiaName,
} from '../data/maracaiboCatalog.js';
import type {
  AnnualParishBatchItem,
  EpimEncounter,
  EpimStore,
  Inquiry,
  InquiryChecklistItem,
  InquiryHistoryEntry,
  InquiryHistoryType,
  InquiryStage,
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
        return normalizeEpimStoreNames(parsed);
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
    normalizeEpimStoreNames(targetStore);
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
      parroquiaEpim: normalizeParroquiaName(encounter.parroquia),
      arciprestazgo: normalizeArciprestazgoName(encounter.arciprestazgo),
      fechasEpim: formatEncounterDatesEs(encounter),
      nombreNovia: nombreNovia.trim().slice(0, 120),
      nombreNovio: nombreNovio.trim().slice(0, 120),
      documentoIdentidad: (documentoIdentidad || '').trim().slice(0, 80),
      telefonoPareja: telefonoPareja.trim().slice(0, 50),
      correoPareja: (correoPareja || '').trim().slice(0, 120),
      parroquiaMatrimonio: parroquiaMatrimonio?.trim()
        ? normalizeParroquiaName(parroquiaMatrimonio).slice(0, 140)
        : '',
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

    const nowIso = new Date().toISOString();
    const rol = rolRemitente || 'Pareja de novios';
    const normArc = arciprestazgoInteres?.trim()
      ? normalizeArciprestazgoName(arciprestazgoInteres).slice(0, 140)
      : '';
    const normPar = parroquiaInteres?.trim()
      ? normalizeParroquiaName(parroquiaInteres).slice(0, 140)
      : '';

    const inquiry = normalizeInquiryRecord({
      id: `inq-${Date.now()}`,
      asunto: buildDefaultInquirySubject({
        nombreRemitente: nombreRemitente.trim(),
        rolRemitente: rol,
        parroquiaInteres: normPar,
      }),
      nombreRemitente: nombreRemitente.trim().slice(0, 120),
      rolRemitente: rol,
      telefono: telefono.trim().slice(0, 50),
      correo: (correo || '').trim().slice(0, 120),
      arciprestazgoInteres: normArc,
      parroquiaInteres: normPar,
      mensaje: mensaje.trim().slice(0, 1500),
      estado: 'pendiente',
      etapa: 'nuevas',
      prioridad: rol === 'Sacerdote / Diácono' ? 'alta' : 'media',
      canalOrigen: 'Formulario Web',
      notasInternas: '',
      checklist: [],
      historial: [
        {
          id: `hist-${Date.now()}`,
          tipo: 'creacion',
          autor: `${nombreRemitente.trim().slice(0, 80)} (${rol})`,
          texto: 'Consulta enviada desde el formulario público web.',
          createdAt: nowIso,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    });

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
        arciprestazgo: normalizeArciprestazgoName(body.arciprestazgo),
        parroquia: normalizeParroquiaName(body.parroquia),
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
          arciprestazgo: normalizeArciprestazgoName(arciprestazgo),
          parroquia: normalizeParroquiaName(parroquia),
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
        arciprestazgo: normalizeArciprestazgoName(
          body.arciprestazgo?.trim() ?? existing.arciprestazgo
        ),
        parroquia: normalizeParroquiaName(
          body.parroquia?.trim() ?? existing.parroquia
        ),
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

  app.post(
    '/api/admin/inquiries',
    verifyGoogleAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const body = req.body as Partial<Inquiry>;
      if (!body.nombreRemitente?.trim() || !body.mensaje?.trim()) {
        res.status(400).json({
          error: 'El nombre del remitente y la descripción de la consulta son obligatorios.',
        });
        return;
      }

      const nowIso = new Date().toISOString();
      const authorLabel =
        req.adminUser?.name || req.adminUser?.email || 'Coordinación Pastoral';
      const etapa: InquiryStage = body.etapa || 'nuevas';
      const estado: Inquiry['estado'] = etapa === 'atendidas' ? 'atendida' : 'pendiente';
      const canal = body.canalOrigen || 'WhatsApp';

      const created = normalizeInquiryRecord({
        id: `inq-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
        asunto: body.asunto?.trim() || undefined,
        nombreRemitente: body.nombreRemitente.trim().slice(0, 120),
        rolRemitente: body.rolRemitente || 'Pareja de novios',
        telefono: (body.telefono || '').trim().slice(0, 50),
        correo: (body.correo || '').trim().slice(0, 120),
        arciprestazgoInteres: body.arciprestazgoInteres?.trim()
          ? normalizeArciprestazgoName(body.arciprestazgoInteres)
          : '',
        parroquiaInteres: body.parroquiaInteres?.trim()
          ? normalizeParroquiaName(body.parroquiaInteres)
          : '',
        mensaje: body.mensaje.trim().slice(0, 2000),
        estado,
        etapa,
        prioridad: body.prioridad || 'media',
        responsable: (body.responsable || '').trim().slice(0, 120),
        fechaSeguimiento: (body.fechaSeguimiento || '').trim().slice(0, 20),
        canalOrigen: canal,
        notasInternas: (body.notasInternas || '').trim().slice(0, 2500),
        checklist: Array.isArray(body.checklist) ? body.checklist : [],
        historial: [
          {
            id: `hist-${Date.now()}`,
            tipo: 'creacion',
            autor: authorLabel,
            texto: `Ficha creada manualmente (${canal}) en la columna «${getInquiryStageLabel(
              etapa
            )}».`,
            createdAt: nowIso,
          },
        ],
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      store.inquiries.unshift(created);
      saveStore(store);
      await trySyncWithSheetsIfPossible(req.adminUser?.accessToken);
      res.status(201).json({ inquiry: created, store });
    }
  );

  app.put(
    '/api/admin/inquiries/:id',
    verifyGoogleAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const idx = store.inquiries.findIndex((i) => i.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ error: 'Consulta no encontrada.' });
        return;
      }

      const existing = normalizeInquiryRecord(store.inquiries[idx]);
      const body = req.body as Partial<Inquiry> & {
        logEntry?: { tipo?: InquiryHistoryType; texto?: string };
        suppressAutoLog?: boolean;
      };

      const nowIso = new Date().toISOString();
      const authorLabel =
        req.adminUser?.name || req.adminUser?.email || 'Coordinación Pastoral';

      let nextEtapa: InquiryStage = existing.etapa || 'nuevas';
      if (body.etapa) {
        nextEtapa = body.etapa;
      } else if (body.estado && body.estado !== existing.estado) {
        nextEtapa = body.estado === 'atendida' ? 'atendidas' : 'nuevas';
      }
      const nextEstado: Inquiry['estado'] =
        nextEtapa === 'atendidas' ? 'atendida' : 'pendiente';

      const nextChecklist: InquiryChecklistItem[] = Array.isArray(body.checklist)
        ? body.checklist
            .filter((c) => c && typeof c.texto === 'string' && c.texto.trim())
            .map((c, cIdx) => ({
              id: c.id || `${existing.id}-chk-${Date.now()}-${cIdx}`,
              texto: c.texto.trim().slice(0, 260),
              completado: Boolean(c.completado),
            }))
        : existing.checklist || [];

      const nextHistory: InquiryHistoryEntry[] = [...(existing.historial || [])];

      if (body.logEntry?.texto?.trim()) {
        nextHistory.push({
          id: `hist-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
          tipo: body.logEntry.tipo || 'edicion',
          autor: authorLabel,
          texto: body.logEntry.texto.trim().slice(0, 1000),
          createdAt: nowIso,
        });
      } else if (!body.suppressAutoLog) {
        const changes: Array<{ tipo: InquiryHistoryType; texto: string }> = [];

        if (nextEtapa !== existing.etapa) {
          changes.push({
            tipo: 'cambio_etapa',
            texto: `Movió la ficha de «${getInquiryStageLabel(
              existing.etapa
            )}» a «${getInquiryStageLabel(nextEtapa)}».`,
          });
        }
        if (body.prioridad && body.prioridad !== existing.prioridad) {
          const prioLabels = { alta: 'Alta', media: 'Media', baja: 'Baja' } as const;
          changes.push({
            tipo: 'edicion',
            texto: `Cambió la prioridad a ${prioLabels[body.prioridad]}.`,
          });
        }
        if (
          body.responsable !== undefined &&
          body.responsable.trim() !== (existing.responsable || '')
        ) {
          changes.push({
            tipo: 'edicion',
            texto: body.responsable.trim()
              ? `Asignó como responsable a ${body.responsable.trim()}.`
              : 'Quitó el responsable asignado.',
          });
        }
        if (
          body.fechaSeguimiento !== undefined &&
          body.fechaSeguimiento.trim() !== (existing.fechaSeguimiento || '')
        ) {
          changes.push({
            tipo: 'edicion',
            texto: body.fechaSeguimiento.trim()
              ? `Programó fecha de seguimiento para el ${body.fechaSeguimiento.trim()}.`
              : 'Quitó la fecha de próximo seguimiento.',
          });
        }

        const coreEdited =
          (body.asunto !== undefined && body.asunto.trim() !== (existing.asunto || '')) ||
          (body.nombreRemitente !== undefined &&
            body.nombreRemitente.trim() !== existing.nombreRemitente) ||
          (body.rolRemitente !== undefined &&
            body.rolRemitente !== existing.rolRemitente) ||
          (body.telefono !== undefined && body.telefono.trim() !== existing.telefono) ||
          (body.correo !== undefined && body.correo.trim() !== existing.correo) ||
          (body.mensaje !== undefined && body.mensaje.trim() !== existing.mensaje) ||
          (body.notasInternas !== undefined &&
            body.notasInternas.trim() !== (existing.notasInternas || '')) ||
          (body.arciprestazgoInteres !== undefined &&
            normalizeArciprestazgoName(body.arciprestazgoInteres) !==
              existing.arciprestazgoInteres) ||
          (body.parroquiaInteres !== undefined &&
            normalizeParroquiaName(body.parroquiaInteres) !== existing.parroquiaInteres);

        if (coreEdited && changes.length === 0) {
          changes.push({
            tipo: 'edicion',
            texto: 'Editó la información y notas internas de la ficha.',
          });
        }

        changes.forEach((ch, cIdx) => {
          nextHistory.push({
            id: `hist-${Date.now()}-${cIdx}`,
            tipo: ch.tipo,
            autor: authorLabel,
            texto: ch.texto,
            createdAt: nowIso,
          });
        });
      }

      const updated = normalizeInquiryRecord({
        ...existing,
        asunto:
          body.asunto !== undefined ? body.asunto.trim().slice(0, 180) : existing.asunto,
        nombreRemitente:
          body.nombreRemitente !== undefined && body.nombreRemitente.trim()
            ? body.nombreRemitente.trim().slice(0, 120)
            : existing.nombreRemitente,
        rolRemitente: body.rolRemitente ?? existing.rolRemitente,
        telefono:
          body.telefono !== undefined
            ? body.telefono.trim().slice(0, 50)
            : existing.telefono,
        correo:
          body.correo !== undefined ? body.correo.trim().slice(0, 120) : existing.correo,
        arciprestazgoInteres:
          body.arciprestazgoInteres !== undefined
            ? body.arciprestazgoInteres.trim()
              ? normalizeArciprestazgoName(body.arciprestazgoInteres)
              : ''
            : existing.arciprestazgoInteres,
        parroquiaInteres:
          body.parroquiaInteres !== undefined
            ? body.parroquiaInteres.trim()
              ? normalizeParroquiaName(body.parroquiaInteres)
              : ''
            : existing.parroquiaInteres,
        mensaje:
          body.mensaje !== undefined && body.mensaje.trim()
            ? body.mensaje.trim().slice(0, 2000)
            : existing.mensaje,
        estado: nextEstado,
        etapa: nextEtapa,
        prioridad: body.prioridad ?? existing.prioridad,
        responsable:
          body.responsable !== undefined
            ? body.responsable.trim().slice(0, 120)
            : existing.responsable,
        fechaSeguimiento:
          body.fechaSeguimiento !== undefined
            ? body.fechaSeguimiento.trim().slice(0, 20)
            : existing.fechaSeguimiento,
        canalOrigen: body.canalOrigen ?? existing.canalOrigen,
        notasInternas:
          body.notasInternas !== undefined
            ? body.notasInternas.trim().slice(0, 2500)
            : existing.notasInternas,
        checklist: nextChecklist,
        historial: nextHistory,
        updatedAt: nowIso,
      });

      store.inquiries[idx] = updated;
      saveStore(store);
      await trySyncWithSheetsIfPossible(req.adminUser?.accessToken);
      res.json({ inquiry: updated, store });
    }
  );

  app.post(
    '/api/admin/inquiries/:id/activity',
    verifyGoogleAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const idx = store.inquiries.findIndex((i) => i.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ error: 'Consulta no encontrada.' });
        return;
      }

      const { texto, tipo } = req.body as {
        texto?: string;
        tipo?: InquiryHistoryType;
      };
      if (!texto?.trim()) {
        res.status(400).json({ error: 'Escribe el contenido de la nota o gestión.' });
        return;
      }

      const existing = normalizeInquiryRecord(store.inquiries[idx]);
      const nowIso = new Date().toISOString();
      const authorLabel =
        req.adminUser?.name || req.adminUser?.email || 'Coordinación Pastoral';

      const entry: InquiryHistoryEntry = {
        id: `hist-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
        tipo: tipo === 'contacto' ? 'contacto' : 'nota',
        autor: authorLabel,
        texto: texto.trim().slice(0, 1200),
        createdAt: nowIso,
      };

      const updated = normalizeInquiryRecord({
        ...existing,
        historial: [...(existing.historial || []), entry],
        updatedAt: nowIso,
      });

      store.inquiries[idx] = updated;
      saveStore(store);
      await trySyncWithSheetsIfPossible(req.adminUser?.accessToken);
      res.status(201).json({ inquiry: updated, store });
    }
  );

  app.delete(
    '/api/admin/inquiries/:id/activity/:entryId',
    verifyGoogleAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const idx = store.inquiries.findIndex((i) => i.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ error: 'Consulta no encontrada.' });
        return;
      }

      const existing = normalizeInquiryRecord(store.inquiries[idx]);
      const filteredHistory = (existing.historial || []).filter(
        (h) =>
          !(
            h.id === req.params.entryId &&
            (h.tipo === 'nota' || h.tipo === 'contacto')
          )
      );

      const updated = normalizeInquiryRecord({
        ...existing,
        historial: filteredHistory,
        updatedAt: new Date().toISOString(),
      });

      store.inquiries[idx] = updated;
      saveStore(store);
      await trySyncWithSheetsIfPossible(req.adminUser?.accessToken);
      res.json({ inquiry: updated, store });
    }
  );

  app.patch(
    '/api/admin/inquiries/:id/status',
    verifyGoogleAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const { estado, etapa } = req.body as {
        estado?: 'pendiente' | 'atendida';
        etapa?: InquiryStage;
      };
      const idx = store.inquiries.findIndex((i) => i.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ error: 'Consulta no encontrada.' });
        return;
      }

      const existing = normalizeInquiryRecord(store.inquiries[idx]);
      const nextEtapa: InquiryStage =
        etapa || (estado === 'atendida' ? 'atendidas' : 'nuevas');
      const nextEstado: Inquiry['estado'] =
        nextEtapa === 'atendidas' ? 'atendida' : 'pendiente';
      const nowIso = new Date().toISOString();
      const authorLabel =
        req.adminUser?.name || req.adminUser?.email || 'Coordinación Pastoral';

      const nextHistory = [...(existing.historial || [])];
      if (nextEtapa !== existing.etapa) {
        nextHistory.push({
          id: `hist-${Date.now()}`,
          tipo: 'cambio_etapa',
          autor: authorLabel,
          texto: `Movió la ficha de «${getInquiryStageLabel(
            existing.etapa
          )}» a «${getInquiryStageLabel(nextEtapa)}».`,
          createdAt: nowIso,
        });
      }

      const updated = normalizeInquiryRecord({
        ...existing,
        etapa: nextEtapa,
        estado: nextEstado,
        historial: nextHistory,
        updatedAt: nowIso,
      });

      store.inquiries[idx] = updated;
      saveStore(store);
      await trySyncWithSheetsIfPossible(req.adminUser?.accessToken);
      res.json({ inquiry: updated, store });
    }
  );

  app.delete(
    '/api/admin/inquiries/:id',
    verifyGoogleAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const idx = store.inquiries.findIndex((i) => i.id === req.params.id);
      if (idx === -1) {
        res.status(404).json({ error: 'Consulta no encontrada.' });
        return;
      }

      store.inquiries.splice(idx, 1);
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
      const normArc = normalizeArciprestazgoName(arciprestazgo);
      const normPar = normalizeParroquiaName(parroquia);
      const exists = store.customParishes.some(
        (p) =>
          p.arciprestazgo.toLowerCase() === normArc.toLowerCase() &&
          p.parroquia.toLowerCase() === normPar.toLowerCase()
      );
      if (!exists) {
        store.customParishes.push({
          arciprestazgo: normArc,
          parroquia: normPar,
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

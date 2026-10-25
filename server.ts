import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  createInitialStore,
  formatEncounterDatesEs,
  normalizeIndividualDates,
} from './src/data/maracaiboCatalog.ts';
import type {
  AnnualParishBatchItem,
  EpimEncounter,
  EpimStore,
  Inquiry,
  PublicBoardResponse,
  Reservation,
} from './src/types/epim.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.VERCEL ? '/tmp/epim-data' : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'epim-store.json');

function loadStore(): EpimStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as EpimStore;
      if (parsed && parsed.config && Array.isArray(parsed.encounters)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error loading epim-store.json, initializing default store:', err);
  }
  const initial = createInitialStore();
  saveStore(initial);
  return initial;
}

function saveStore(store: EpimStore): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    // Keep availableYears sorted and including all encounter years
    const yearSet = new Set<number>(store.config.availableYears || []);
    yearSet.add(store.config.publicYear);
    for (const enc of store.encounters) {
      if (enc.year) yearSet.add(enc.year);
    }
    store.config.availableYears = Array.from(yearSet).sort((a, b) => a - b);

    const tmpFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DATA_FILE);
  } catch (err) {
    console.error('Error saving epim-store.json:', err);
  }
}

let store: EpimStore = loadStore();

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
    res.status(401).json({ error: 'Se requiere autenticación con Google para acceder al panel.' });
    return;
  }

  const accessToken = authHeader.slice('Bearer '.length).trim();
  if (!accessToken) {
    res.status(401).json({ error: 'Token de acceso vacío.' });
    return;
  }

  try {
    let resolvedEmail = '';
    let resolvedName: string | undefined;

    // 1. Verify signed Firebase/Google OIDC ID token if present (always carries verified email)
    const idToken = (req.headers['x-firebase-id-token'] as string | undefined)?.trim();
    if (idToken) {
      const idTokenRes = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
      );
      if (idTokenRes.ok) {
        const idPayload = (await idTokenRes.json()) as { email?: string; name?: string };
        if (idPayload.email) {
          resolvedEmail = idPayload.email.toLowerCase();
          resolvedName = idPayload.name;
        }
      }
    }

    // 2. Validate Google OAuth access token via userinfo / tokeninfo
    const tokenInfoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    if (!tokenInfoRes.ok) {
      res.status(401).json({ error: 'La sesión de Google expiró. Vuelve a iniciar sesión.' });
      return;
    }

    const tokenInfo = (await tokenInfoRes.json()) as { email?: string };
    if (!resolvedEmail && tokenInfo.email) {
      resolvedEmail = tokenInfo.email.toLowerCase();
    }

    if (!resolvedEmail) {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (userInfoRes.ok) {
        const profile = (await userInfoRes.json()) as { email?: string; name?: string };
        if (profile.email) {
          resolvedEmail = profile.email.toLowerCase();
          resolvedName = resolvedName || profile.name;
        }
      }
    }

    if (!resolvedEmail) {
      const emailHeader = (req.headers['x-admin-email'] as string | undefined)?.trim().toLowerCase();
      if (emailHeader) {
        resolvedEmail = emailHeader;
      }
    }

    const allowed = store.config.authorizedAdmins.map((e) => e.toLowerCase());
    if (!resolvedEmail || !allowed.includes(resolvedEmail)) {
      res.status(403).json({
        error: `La cuenta ${resolvedEmail || 'actual'} no tiene permisos administrativos. Inicia sesión con una cuenta autorizada (ej. lapastoralfamiliar.mcbo@gmail.com).`,
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

// Helper: Push latest server store to Google Sheets automatically when admin token & spreadsheetId exist
async function trySyncWithSheetsIfPossible(accessToken?: string): Promise<void> {
  if (!accessToken || !store.config.spreadsheetId) return;
  try {
    const { pushStoreToSpreadsheet } = await import('./src/services/sheetsService.ts');
    const result = await pushStoreToSpreadsheet(store.config.spreadsheetId, accessToken, store);
    store.config.lastSyncedAt = result.syncedAt;
    store.config.spreadsheetTitle = result.title;
    store.config.spreadsheetUrl = result.spreadsheetUrl;
    saveStore(store);
  } catch (err) {
    console.warn('Background Google Sheets sync warning:', err);
  }
}

export async function createServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // ──────────────────────────────────────────────────────────────
  // PUBLIC ENDPOINTS (Cartelera, Calendario, Reservas, Consultas)
  // ──────────────────────────────────────────────────────────────

  app.get('/api/public/board', (_req: Request, res: Response) => {
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
      spreadsheetConnected: Boolean(store.config.spreadsheetId),
      lastSyncedAt: store.config.lastSyncedAt,
    };

    res.json(payload);
  });

  app.post('/api/public/reservations', (req: Request, res: Response) => {
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

    if (!encounterId || !nombreNovia?.trim() || !nombreNovio?.trim() || !telefonoPareja?.trim()) {
      res.status(400).json({
        error: 'Por favor completa los nombres de ambos novios, el teléfono de contacto y selecciona un encuentro.',
      });
      return;
    }

    const encounter = store.encounters.find((e) => e.id === encounterId);
    if (!encounter) {
      res.status(404).json({ error: 'El encuentro EPIM seleccionado no existe.' });
      return;
    }

    if (encounter.year !== store.config.publicYear) {
      res.status(400).json({ error: 'Solo se permiten reservaciones para el año público vigente.' });
      return;
    }

    const cuposDisponibles = encounter.cuposTotales - encounter.cuposReservados;
    if (encounter.estado !== 'abierto' || cuposDisponibles <= 0) {
      res.status(409).json({
        error: 'Lo sentimos, los cupos para este encuentro EPIM se han agotado o la inscripción está cerrada.',
      });
      return;
    }

    // Atomic deduction of 1 couple slot from inventory
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
    saveStore(store);

    res.status(201).json({
      reservation,
      encounter,
    });
  });

  app.post('/api/public/inquiries', (req: Request, res: Response) => {
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
        error: 'Por favor indica tu nombre, teléfono de contacto y el motivo de tu consulta.',
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
    saveStore(store);

    res.status(201).json({ inquiry });
  });

  // ──────────────────────────────────────────────────────────────
  // PROTECTED ADMIN ENDPOINTS
  // ──────────────────────────────────────────────────────────────

  app.get('/api/admin/store', verifyGoogleAdmin, (_req: AuthenticatedRequest, res: Response) => {
    res.json(store);
  });

  app.put(
    '/api/admin/config',
    verifyGoogleAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const updates = req.body as Partial<EpimStore['config']>;

      if (typeof updates.publicYear === 'number' && updates.publicYear >= 2024 && updates.publicYear <= 2035) {
        store.config.publicYear = updates.publicYear;
      }
      if (Array.isArray(updates.availableYears)) {
        store.config.availableYears = updates.availableYears.map(Number).filter((y) => y >= 2024 && y <= 2035);
      }
      if (typeof updates.spreadsheetId === 'string') {
        store.config.spreadsheetId = updates.spreadsheetId.trim();
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
        // Never allow removing the primary pastoral email so admins cannot lock themselves out
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

  // Add single EPIM encounter
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

  // Batch load annual schedule for a Parish ("cargar por Parroquia los distintos EPIM de todo el año")
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
          error: 'Selecciona año, arciprestazgo, parroquia y al menos un encuentro con sus fechas.',
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

  // Edit single EPIM encounter
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
          error: 'Cada encuentro EPIM debe tener al menos 2 fechas individuales registradas.',
        });
        return;
      }
      const fechaInicio = fechas[0];
      const fechaFin = fechas[fechas.length - 1];
      const mes = Number(fechaInicio.split('-')[1]) || Number(body.mes) || existing.mes;
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

  // Delete EPIM encounter
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

  // Cancel or restore reservation (automatically updates encounter cuposReservados)
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
        const encounter = store.encounters.find((e) => e.id === reservation.encounterId);
        if (encounter) {
          if (estado === 'cancelada' && reservation.estado === 'confirmada') {
            encounter.cuposReservados = Math.max(0, encounter.cuposReservados - 1);
            if (encounter.estado === 'cerrado' && encounter.cuposReservados < encounter.cuposTotales) {
              encounter.estado = 'abierto';
            }
          } else if (estado === 'confirmada' && reservation.estado === 'cancelada') {
            if (encounter.cuposReservados >= encounter.cuposTotales) {
              res.status(409).json({ error: 'No quedan cupos disponibles en este encuentro para reactivar la reserva.' });
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

  // Update inquiry status
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

  // Add custom Parish to catalog
  app.post(
    '/api/admin/parishes',
    verifyGoogleAdmin,
    async (req: AuthenticatedRequest, res: Response) => {
      const { arciprestazgo, parroquia } = req.body as { arciprestazgo?: string; parroquia?: string };
      if (!arciprestazgo?.trim() || !parroquia?.trim()) {
        res.status(400).json({ error: 'Indica el arciprestazgo y el nombre de la parroquia.' });
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

  // Replace store data imported from Google Sheets
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

      if (Array.isArray(encounters) && encounters.length > 0) {
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
      if (spreadsheetId) store.config.spreadsheetId = spreadsheetId;
      if (spreadsheetUrl) store.config.spreadsheetUrl = spreadsheetUrl;
      if (spreadsheetTitle) store.config.spreadsheetTitle = spreadsheetTitle;
      store.config.lastSyncedAt = new Date().toISOString();

      saveStore(store);
      res.json(store);
    }
  );

  // Vite middleware in development, static dist in production (skip in Vercel serverless)
  if (!process.env.VERCEL) {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(__dirname, 'dist');
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  return app;
}

if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT) || 3000;
  createServer().then((app) => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`EPIM Arquidiócesis de Maracaibo server listening on http://0.0.0.0:${PORT}`);
    });
  });
}

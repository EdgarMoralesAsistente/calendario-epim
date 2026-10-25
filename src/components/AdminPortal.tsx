import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ArrowLeft,
  CalendarPlus,
  CalendarRange,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Inbox,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Settings,
  ShieldAlert,
  Trash2,
  Users,
} from 'lucide-react';
import type {
  AnnualParishBatchItem,
  EpimEncounter,
  EpimStore,
} from '../types/epim.ts';
import {
  addDaysIso,
  formatEncounterDatesEs,
  formatMonthName,
  formatSingleDateEs,
  getEncounterDates,
  LOGO_URL_FALLBACK,
  LOGO_URL_PRIMARY,
  MARACAIBO_ARCIPRESTAZGOS,
  normalizeIndividualDates,
} from '../data/maracaiboCatalog.ts';
import {
  getAccessToken,
  googleSignIn,
  initAuth,
  logout,
} from '../services/authService.ts';
import {
  createAdminEncounter,
  createAnnualParishBatch,
  deleteAdminEncounter,
  fetchAdminStore,
  saveImportedSheetsData,
  updateAdminConfig,
  updateAdminEncounter,
  updateInquiryStatus,
  updateReservationStatus,
} from '../services/api.ts';
import {
  createEpimSpreadsheet,
  extractSpreadsheetId,
  pullStoreFromSpreadsheet,
  pushStoreToSpreadsheet,
} from '../services/sheetsService.ts';
import { GoogleSignInButton } from './GoogleSignInButton.tsx';
import { ConfirmModal } from './ConfirmModal.tsx';
import { AdminReportsSection } from './AdminReportsSection.tsx';

interface AdminPortalProps {
  onBackToPublic: () => void;
  onPublicDataChanged: () => void;
}

type AdminSection =
  | 'resumen'
  | 'encuentros'
  | 'carga-parroquial'
  | 'informes'
  | 'reservaciones'
  | 'consultas'
  | 'sheets';

interface PendingConfirm {
  title: string;
  description: string;
  details?: string[];
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  action: () => Promise<void>;
}

const DEFAULT_HORARIO = 'Sábados 2:30 p.m. – 6:00 p.m. · Domingo cierre 8:30 a.m. – 1:00 p.m.';

export const AdminPortal: React.FC<AdminPortalProps> = ({
  onBackToPublic,
  onPublicDataChanged,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [store, setStore] = useState<EpimStore | null>(null);
  const [loadingStore, setLoadingStore] = useState<boolean>(false);
  const [activeSection, setActiveSection] = useState<AdminSection>('resumen');
  const [selectedAdminYear, setSelectedAdminYear] = useState<number>(2026);
  const [newYearInput, setNewYearInput] = useState<string>('');

  const [bannerMessage, setBannerMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState<boolean>(false);

  // Single Encounter Modal / Form State
  const [editingEncounter, setEditingEncounter] = useState<EpimEncounter | null>(null);
  const [showEncounterForm, setShowEncounterForm] = useState<boolean>(false);
  const [formYear, setFormYear] = useState<number>(2026);
  const [formArciprestazgo, setFormArciprestazgo] = useState<string>('');
  const [formParroquia, setFormParroquia] = useState<string>('');
  const [formFechas, setFormFechas] = useState<string[]>(['', '', '']);
  const [formHorario, setFormHorario] = useState<string>(DEFAULT_HORARIO);
  const [formSedeDetalle, setFormSedeDetalle] = useState<string>('');
  const [formTelefono, setFormTelefono] = useState<string>('');
  const [formCoordinadores, setFormCoordinadores] = useState<string>('');
  const [formCuposTotales, setFormCuposTotales] = useState<number>(25);
  const [formCuposReservados, setFormCuposReservados] = useState<number>(0);
  const [formAporteInfo, setFormAporteInfo] = useState<string>('');
  const [formEstado, setFormEstado] = useState<EpimEncounter['estado']>('abierto');

  // Filter in Admin Encounters list
  const [adminEncFilterArc, setAdminEncFilterArc] = useState<string>('todos');
  const [adminEncSearch, setAdminEncSearch] = useState<string>('');

  // Annual Parish Batch Builder State ("cargar por Parroquia los distintos EPIM de todo el año")
  const [batchYear, setBatchYear] = useState<number>(2026);
  const [batchArciprestazgo, setBatchArciprestazgo] = useState<string>('');
  const [batchParroquia, setBatchParroquia] = useState<string>('');
  const [batchTelefono, setBatchTelefono] = useState<string>('');
  const [batchCoordinadores, setBatchCoordinadores] = useState<string>('');
  const [batchItems, setBatchItems] = useState<AnnualParishBatchItem[]>([
    {
      mes: 2,
      fechaInicio: '',
      fechaFin: '',
      fechas: ['', '', ''],
      horario: DEFAULT_HORARIO,
      cuposTotales: 25,
      sedeDetalle: '',
      aporteInfo: '',
    },
    {
      mes: 6,
      fechaInicio: '',
      fechaFin: '',
      fechas: ['', '', ''],
      horario: DEFAULT_HORARIO,
      cuposTotales: 25,
      sedeDetalle: '',
      aporteInfo: '',
    },
  ]);


  // Reservations Filter
  const [resFilterEncounterId, setResFilterEncounterId] = useState<string>('todos');
  const [resSearch, setResSearch] = useState<string>('');

  // Google Sheets & Settings State
  const [sheetInputUrl, setSheetInputUrl] = useState<string>('');
  const [sheetsBusy, setSheetsBusy] = useState<boolean>(false);
  const [newAdminEmail, setNewAdminEmail] = useState<string>('');
  const [secTel, setSecTel] = useState<string>('');
  const [secEmail, setSecEmail] = useState<string>('');
  const [secDir, setSecDir] = useState<string>('');

  const [logoSrc, setLogoSrc] = useState<string>(LOGO_URL_PRIMARY);
  const [copiedTokenLabel, setCopiedTokenLabel] = useState<string | null>(null);

  const copyTextToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedTokenLabel(label);
      setTimeout(() => {
        setCopiedTokenLabel((prev) => (prev === label ? null : prev));
      }, 2500);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const loadAdminData = useCallback(async () => {
    setLoadingStore(true);
    setAuthError(null);
    try {
      const data = await fetchAdminStore();
      setStore(data);
      setSelectedAdminYear(data.config.publicYear);
      setFormYear(data.config.publicYear);
      setBatchYear(data.config.publicYear);
      const rememberedId =
        typeof window !== 'undefined'
          ? window.localStorage.getItem('epim_connected_spreadsheet_id') || ''
          : '';
      if (data.config.spreadsheetId && typeof window !== 'undefined') {
        window.localStorage.setItem(
          'epim_connected_spreadsheet_id',
          data.config.spreadsheetId
        );
      }
      setSheetInputUrl(
        data.config.spreadsheetUrl || data.config.spreadsheetId || rememberedId
      );
      setSecTel(data.config.secretariadoTelefono);
      setSecEmail(data.config.secretariadoCorreo);
      setSecDir(data.config.secretariadoDireccion);
      setNeedsAuth(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo cargar el panel.';
      setAuthError(msg);
      if (msg.toLowerCase().includes('expiró') || msg.toLowerCase().includes('autenticación')) {
        setNeedsAuth(true);
      }
    } finally {
      setLoadingStore(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = initAuth(
      (signedUser) => {
        setUser(signedUser);
        setNeedsAuth(false);
        loadAdminData();
      },
      (maybeUser) => {
        setUser(maybeUser ?? null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, [loadAdminData]);

  const handleLogin = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setNeedsAuth(false);
        await loadAdminData();
      }
    } catch (err) {
      const rawMsg =
        err instanceof Error
          ? err.message
          : 'No se pudo completar el inicio de sesión con Google.';
      if (rawMsg.includes('auth/popup-closed-by-user')) {
        setAuthError(
          'Cerraste la ventana de Google antes de terminar. Haz clic nuevamente en "Iniciar sesión con Google".'
        );
      } else if (rawMsg.includes('auth/popup-blocked')) {
        setAuthError(
          'Tu navegador bloqueó la ventana emergente de Google. Permite las ventanas emergentes en la barra de direcciones y vuelve a intentarlo.'
        );
      } else {
        setAuthError(rawMsg);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setStore(null);
    setUser(null);
    setNeedsAuth(true);
  };

  const notify = (type: 'success' | 'error', text: string) => {
    setBannerMessage({ type, text });
    setTimeout(() => {
      setBannerMessage((prev) => (prev?.text === text ? null : prev));
    }, 5000);
  };

  const executePendingConfirm = async () => {
    if (!pendingConfirm) return;
    setConfirmBusy(true);
    try {
      await pendingConfirm.action();
      setPendingConfirm(null);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Ocurrió un error al procesar el cambio.');
      setPendingConfirm(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  // Official Parroquias strictly associated with the selected Arciprestazgo
  const getParroquiasForArciprestazgo = useCallback((arcNombre: string) => {
    if (!arcNombre) return [];
    return (
      MARACAIBO_ARCIPRESTAZGOS.find((g) => g.nombre === arcNombre)?.parroquias || []
    );
  }, []);

  const adminArciprestazgoFilterOptions = useMemo(() => {
    const set = new Set<string>(MARACAIBO_ARCIPRESTAZGOS.map((g) => g.nombre));
    if (store) {
      for (const enc of store.encounters) {
        if (enc.year === selectedAdminYear && enc.arciprestazgo) {
          set.add(enc.arciprestazgo);
        }
      }
    }
    return Array.from(set);
  }, [store, selectedAdminYear]);

  // Metrics for selectedAdminYear
  const yearMetrics = useMemo(() => {
    if (!store) {
      return {
        totalEncuentros: 0,
        parroquiasActivas: 0,
        cuposTotales: 0,
        cuposDisponibles: 0,
        cuposReservados: 0,
        reservasConfirmadas: 0,
        consultasPendientes: 0,
        byArciprestazgo: [] as Array<{ nombre: string; encuentros: number; disponibles: number; totales: number }>,
      };
    }

    const encs = store.encounters.filter((e) => e.year === selectedAdminYear);
    const parishes = new Set(encs.map((e) => e.parroquia));
    const cuposTotales = encs.reduce((sum, e) => sum + e.cuposTotales, 0);
    const cuposReservados = encs.reduce((sum, e) => sum + e.cuposReservados, 0);
    const cuposDisponibles = encs.reduce(
      (sum, e) => sum + (e.estado === 'abierto' ? Math.max(0, e.cuposTotales - e.cuposReservados) : 0),
      0
    );
    const reservasConfirmadas = store.reservations.filter(
      (r) => r.year === selectedAdminYear && r.estado === 'confirmada'
    ).length;
    const consultasPendientes = store.inquiries.filter((i) => i.estado === 'pendiente').length;

    const arcMap = new Map<string, { encuentros: number; disponibles: number; totales: number }>();
    for (const e of encs) {
      const cur = arcMap.get(e.arciprestazgo) || { encuentros: 0, disponibles: 0, totales: 0 };
      cur.encuentros += 1;
      cur.totales += e.cuposTotales;
      if (e.estado === 'abierto') {
        cur.disponibles += Math.max(0, e.cuposTotales - e.cuposReservados);
      }
      arcMap.set(e.arciprestazgo, cur);
    }

    return {
      totalEncuentros: encs.length,
      parroquiasActivas: parishes.size,
      cuposTotales,
      cuposDisponibles,
      cuposReservados,
      reservasConfirmadas,
      consultasPendientes,
      byArciprestazgo: Array.from(arcMap.entries()).map(([nombre, vals]) => ({
        nombre,
        ...vals,
      })),
    };
  }, [store, selectedAdminYear]);

  const filteredAdminEncounters = useMemo(() => {
    if (!store) return [];
    const q = adminEncSearch.trim().toLowerCase();
    return store.encounters
      .filter((e) => e.year === selectedAdminYear)
      .filter((e) => adminEncFilterArc === 'todos' || e.arciprestazgo === adminEncFilterArc)
      .filter((e) => {
        if (!q) return true;
        return [
          e.parroquia,
          e.arciprestazgo,
          e.telefonoContacto,
          e.coordinadores,
          e.fechaInicio,
          formatEncounterDatesEs(e),
        ]
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
  }, [store, selectedAdminYear, adminEncFilterArc, adminEncSearch]);

  const filteredReservations = useMemo(() => {
    if (!store) return [];
    const q = resSearch.trim().toLowerCase();
    return store.reservations
      .filter((r) => r.year === selectedAdminYear)
      .filter((r) => resFilterEncounterId === 'todos' || r.encounterId === resFilterEncounterId)
      .filter((r) => {
        if (!q) return true;
        return [
          r.codigoReserva,
          r.nombreNovia,
          r.nombreNovio,
          r.parroquiaEpim,
          r.telefonoPareja,
          r.documentoIdentidad,
        ]
          .join(' ')
          .toLowerCase()
          .includes(q);
      });
  }, [store, selectedAdminYear, resFilterEncounterId, resSearch]);

  // Open Encounter Create / Edit Modal
  const openCreateEncounter = () => {
    setEditingEncounter(null);
    setFormYear(selectedAdminYear);
    setFormArciprestazgo('');
    setFormParroquia('');
    setFormFechas(['', '', '']);
    setFormHorario(DEFAULT_HORARIO);
    setFormSedeDetalle('');
    setFormTelefono('');
    setFormCoordinadores('');
    setFormCuposTotales(25);
    setFormCuposReservados(0);
    setFormAporteInfo('');
    setFormEstado('abierto');
    setShowEncounterForm(true);
  };

  const openEditEncounter = (enc: EpimEncounter) => {
    setEditingEncounter(enc);
    setFormYear(enc.year);
    setFormArciprestazgo(enc.arciprestazgo);
    setFormParroquia(enc.parroquia);
    const existingDates = getEncounterDates(enc);
    setFormFechas(
      existingDates.length >= 2
        ? existingDates
        : existingDates.length === 1
        ? [existingDates[0], addDaysIso(existingDates[0], 7)]
        : ['', '', '']
    );
    setFormHorario(enc.horario);
    setFormSedeDetalle(enc.sedeDetalle);
    setFormTelefono(enc.telefonoContacto);
    setFormCoordinadores(enc.coordinadores);
    setFormCuposTotales(enc.cuposTotales);
    setFormCuposReservados(enc.cuposReservados);
    setFormAporteInfo(enc.aporteInfo);
    setFormEstado(enc.estado);
    setShowEncounterForm(true);
  };

  const handleAppendDateOffset = (daysOffset: number | null) => {
    setFormFechas((prev) => {
      if (daysOffset === null) {
        return [...prev, ''];
      }
      const filled = [...prev].reverse().find((d) => Boolean(d));
      const base = filled || `${formYear}-11-07`;
      return [...prev, addDaysIso(base, daysOffset)];
    });
  };

  const handleEncounterFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formArciprestazgo || !formParroquia) {
      notify(
        'error',
        'Selecciona primero el Arciprestazgo y luego la Parroquia sede asociada.'
      );
      return;
    }
    const cleanedDates = normalizeIndividualDates(formFechas);
    if (cleanedDates.length < 2) {
      notify(
        'error',
        'Cada encuentro EPIM consta de varias fechas. Registra al menos 2 fechas individuales distintas.'
      );
      return;
    }

    const firstDate = cleanedDates[0];
    const lastDate = cleanedDates[cleanedDates.length - 1];
    const formattedDates = formatEncounterDatesEs({
      fechaInicio: firstDate,
      fechaFin: lastDate,
      fechas: cleanedDates,
    });

    const payload: Partial<EpimEncounter> = {
      year: formYear,
      arciprestazgo: formArciprestazgo,
      parroquia: formParroquia,
      fechaInicio: firstDate,
      fechaFin: lastDate,
      fechas: cleanedDates,
      horario: formHorario,
      sedeDetalle: formSedeDetalle,
      telefonoContacto: formTelefono,
      coordinadores: formCoordinadores,
      cuposTotales: formCuposTotales,
      cuposReservados: formCuposReservados,
      aporteInfo: formAporteInfo,
      estado: formEstado,
    };

    if (editingEncounter) {
      setPendingConfirm({
        title: '¿Guardar cambios en el encuentro EPIM?',
        description: store?.config.spreadsheetId
          ? 'Se actualizarán las fechas y datos del encuentro y se sincronizarán con Google Sheets.'
          : 'Se actualizarán las fechas y el inventario de cupos del encuentro seleccionado.',
        details: [
          `Parroquia: ${formParroquia}`,
          `Total de fechas: ${cleanedDates.length} fechas individuales`,
          `Programación: ${formattedDates}`,
          `Cupos configurados: ${formCuposTotales} totales (${Math.max(0, formCuposTotales - formCuposReservados)} disponibles)`,
        ],
        confirmLabel: 'Guardar cambios',
        action: async () => {
          const res = await updateAdminEncounter(editingEncounter.id, payload);
          setStore(res.store);
          setShowEncounterForm(false);
          onPublicDataChanged();
          notify('success', 'Encuentro actualizado correctamente.');
        },
      });
    } else {
      setPendingConfirm({
        title: '¿Registrar nuevo encuentro EPIM?',
        description: store?.config.spreadsheetId
          ? 'Se añadirá este encuentro al calendario y se escribirá en Google Sheets.'
          : 'Se añadirá este encuentro a la programación arquidiocesana.',
        details: [
          `Año: ${formYear} · ${formParroquia}`,
          `Total de fechas: ${cleanedDates.length} fechas individuales`,
          `Programación: ${formattedDates}`,
          `Cupos disponibles iniciales: ${formCuposTotales}`,
        ],
        confirmLabel: 'Crear encuentro',
        action: async () => {
          const res = await createAdminEncounter(payload);
          setStore(res.store);
          setShowEncounterForm(false);
          onPublicDataChanged();
          notify('success', 'Nuevo encuentro registrado con éxito.');
        },
      });
    }
  };

  const handleRequestDeleteEncounter = (enc: EpimEncounter) => {
    setPendingConfirm({
      title: '¿Eliminar encuentro EPIM?',
      description:
        'Esta acción eliminará permanentemente el encuentro de la cartelera y actualizará Google Sheets si está vinculado.',
      details: [
        `${enc.parroquia} (${enc.year})`,
        `Fechas: ${formatEncounterDatesEs(enc)}`,
      ],
      confirmLabel: 'Eliminar encuentro',
      variant: 'danger',
      action: async () => {
        const res = await deleteAdminEncounter(enc.id);
        setStore(res.store);
        onPublicDataChanged();
        notify('success', 'Encuentro eliminado.');
      },
    });
  };

  const handleRequestPublishYear = (targetYear: number) => {
    if (!store || store.config.publicYear === targetYear) return;
    setPendingConfirm({
      title: `¿Hacer público el año ${targetYear} en la cartelera web?`,
      description:
        'Todos los visitantes, sacerdotes y parejas verán únicamente los encuentros y cupos correspondientes a este año en la página pública.',
      details: [
        `Año público actual: ${store.config.publicYear}`,
        `Nuevo año público visible: ${targetYear}`,
      ],
      confirmLabel: `Publicar año ${targetYear}`,
      action: async () => {
        const updated = await updateAdminConfig({ publicYear: targetYear });
        setStore(updated);
        setSelectedAdminYear(targetYear);
        onPublicDataChanged();
        notify('success', `El año ${targetYear} ahora está activo en la cartelera pública.`);
      },
    });
  };

  const handleAddYear = async () => {
    const parsed = Number(newYearInput);
    if (!store || !Number.isInteger(parsed) || parsed < 2024 || parsed > 2035) {
      notify('error', 'Ingresa un año válido entre 2024 y 2035.');
      return;
    }
    const nextYears = Array.from(new Set([...store.config.availableYears, parsed])).sort(
      (a, b) => a - b
    );
    const updated = await updateAdminConfig({ availableYears: nextYears });
    setStore(updated);
    setSelectedAdminYear(parsed);
    setBatchYear(parsed);
    setNewYearInput('');
    notify('success', `Año ${parsed} habilitado para carga administrativa.`);
  };

  // Annual Parish Batch Submit
  const handleBatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchArciprestazgo || !batchParroquia) {
      notify(
        'error',
        'Selecciona primero el Arciprestazgo y luego la Parroquia sede asociada.'
      );
      return;
    }
    const preparedItems: AnnualParishBatchItem[] = batchItems
      .map((item): AnnualParishBatchItem | null => {
        const normalized = normalizeIndividualDates(
          item.fechas,
          item.sesiones,
          item.fechaInicio,
          item.fechaFin
        );
        if (normalized.length < 2) return null;
        const first = normalized[0];
        const last = normalized[normalized.length - 1];
        return {
          ...item,
          mes: Number(first.split('-')[1]) || item.mes,
          fechaInicio: first,
          fechaFin: last,
          fechas: normalized,
        };
      })
      .filter((it): it is AnnualParishBatchItem => it !== null);

    if (preparedItems.length === 0) {
      notify(
        'error',
        'Cada encuentro anual debe tener al menos 2 fechas individuales distintas registradas.'
      );
      return;
    }

    setPendingConfirm({
      title: `¿Cargar ${preparedItems.length} encuentro(s) anuales para esta parroquia?`,
      description:
        'Se registrarán todos los encuentros programados de la parroquia en lote y se sincronizarán con Google Sheets si está conectado.',
      details: [
        `Año: ${batchYear} · ${batchParroquia}`,
        ...preparedItems.map((it) => {
          const label = formatEncounterDatesEs({
            fechaInicio: it.fechaInicio,
            fechaFin: it.fechaFin,
            fechas: it.fechas,
          });
          const count = it.fechas?.length || 0;
          return `${label} · ${count} fechas (${it.cuposTotales} cupos)`;
        }),
      ],
      confirmLabel: `Guardar ${preparedItems.length} encuentro(s)`,
      action: async () => {
        const res = await createAnnualParishBatch({
          year: batchYear,
          arciprestazgo: batchArciprestazgo,
          parroquia: batchParroquia,
          telefonoContacto: batchTelefono,
          coordinadores: batchCoordinadores,
          items: preparedItems,
        });
        setStore(res.store);
        setSelectedAdminYear(batchYear);
        setActiveSection('encuentros');
        onPublicDataChanged();
        notify(
          'success',
          `Se cargaron ${res.createdCount} encuentros anuales para ${batchParroquia}.`
        );
      },
    });
  };

  // Google Sheets Handlers (with mandatory confirmation dialogs before mutating user spreadsheets)
  const handleCreateNewSheet = () => {
    if (!store) return;
    setPendingConfirm({
      title: '¿Crear nueva base de datos en Google Sheets?',
      description:
        'Se creará una hoja de cálculo nueva en tu cuenta de Google con las pestañas Encuentros, Reservaciones, Consultas y Configuracion, cargando los datos actuales.',
      confirmLabel: 'Crear en Google Sheets',
      action: async () => {
        setSheetsBusy(true);
        try {
          const token = await getAccessToken();
          if (!token) throw new Error('Sesión de Google no disponible. Vuelve a iniciar sesión.');
          const created = await createEpimSpreadsheet(token, store);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(
              'epim_connected_spreadsheet_id',
              created.spreadsheetId
            );
          }
          const updated = await updateAdminConfig({
            spreadsheetId: created.spreadsheetId,
            spreadsheetUrl: created.spreadsheetUrl,
            spreadsheetTitle: created.title,
            lastSyncedAt: new Date().toISOString(),
          });
          setStore(updated);
          setSheetInputUrl(created.spreadsheetUrl);
          onPublicDataChanged();
          notify('success', 'Hoja de cálculo creada y sincronizada en Google Sheets.');
        } finally {
          setSheetsBusy(false);
        }
      },
    });
  };

  const handlePushToExistingSheet = () => {
    if (!store) return;
    const id = extractSpreadsheetId(sheetInputUrl || store.config.spreadsheetId);
    if (!id) {
      notify('error', 'Pega el enlace completo de tu archivo de Google Sheets en el recuadro.');
      return;
    }

    setPendingConfirm({
      title: '¿Conectar y guardar datos en este Google Sheet?',
      description:
        'El sistema creará automáticamente las 4 pestañas necesarias (Encuentros, Reservaciones, Consultas y Configuracion) dentro de tu archivo de Google Sheets y guardará la programación actual.',
      details: [
        `ID detectado: ${id}`,
        `Encuentros a guardar: ${store.encounters.length}`,
        `Reservaciones registradas: ${store.reservations.length}`,
      ],
      confirmLabel: 'Conectar y guardar en Google Sheets',
      action: async () => {
        setSheetsBusy(true);
        try {
          const token = await getAccessToken();
          if (!token) throw new Error('Sesión de Google expirada. Inicia sesión nuevamente.');
          const result = await pushStoreToSpreadsheet(id, token, store);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('epim_connected_spreadsheet_id', id);
          }
          const updated = await updateAdminConfig({
            spreadsheetId: id,
            spreadsheetUrl: result.spreadsheetUrl,
            spreadsheetTitle: result.title,
            lastSyncedAt: result.syncedAt,
          });
          setStore(updated);
          setSheetInputUrl(result.spreadsheetUrl);
          onPublicDataChanged();
          notify(
            'success',
            'Tu archivo de Google Sheets quedó conectado y con todas sus pestañas creadas.'
          );
        } finally {
          setSheetsBusy(false);
        }
      },
    });
  };

  const handlePullFromSheet = () => {
    if (!store) return;
    const id = extractSpreadsheetId(sheetInputUrl || store.config.spreadsheetId);
    if (!id) {
      notify('error', 'Primero conecta o pega el enlace de una hoja de Google Sheets.');
      return;
    }

    setPendingConfirm({
      title: '¿Importar datos desde Google Sheets?',
      description:
        'Se leerán las filas actuales de tu archivo en Google Sheets para actualizar la página web.',
      details: [`ID Hoja: ${id}`],
      confirmLabel: 'Importar desde Sheets',
      action: async () => {
        setSheetsBusy(true);
        try {
          const token = await getAccessToken();
          if (!token) throw new Error('Sesión de Google expirada. Inicia sesión nuevamente.');
          const pulled = await pullStoreFromSpreadsheet(id, token, store);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('epim_connected_spreadsheet_id', id);
          }
          const updated = await saveImportedSheetsData({
            encounters: pulled.encounters,
            reservations: pulled.reservations,
            inquiries: pulled.inquiries,
            publicYear: pulled.publicYear,
            spreadsheetId: id,
            spreadsheetUrl: pulled.spreadsheetUrl,
            spreadsheetTitle: pulled.title,
          });
          setStore(updated);
          setSheetInputUrl(pulled.spreadsheetUrl);
          onPublicDataChanged();
          notify('success', 'Datos importados correctamente desde Google Sheets.');
        } finally {
          setSheetsBusy(false);
        }
      },
    });
  };

  const exportReservationsCsv = () => {
    const headers = [
      'Código Reserva',
      'Año',
      'Parroquia Sede EPIM',
      'Fechas EPIM',
      'Novia',
      'Novio',
      'Cédulas',
      'Teléfono',
      'Correo',
      'Parroquia Matrimonio',
      'Fecha Boda',
      'Estado',
    ];
    const rows = filteredReservations.map((r) => [
      r.codigoReserva,
      String(r.year),
      r.parroquiaEpim,
      r.fechasEpim,
      r.nombreNovia,
      r.nombreNovio,
      r.documentoIdentidad,
      r.telefonoPareja,
      r.correoPareja,
      r.parroquiaMatrimonio,
      r.fechaPrevistaBoda,
      r.estado,
    ]);
    const csv =
      '\uFEFF' +
      [headers, ...rows]
        .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reservaciones_EPIM_${selectedAdminYear}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ──────────────────────────────────────────────────────────────
  // AUTHENTICATION / LOGIN VIEW
  // ──────────────────────────────────────────────────────────────
  if (needsAuth || !store) {
    return (
      <div className="min-h-screen bg-white flex flex-col justify-between">
        <div className="border-b border-zinc-200 px-6 py-4">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <span className="font-display text-base font-bold text-zinc-900">
              EPIM Maracaibo · Administración
            </span>
            <button
              type="button"
              onClick={onBackToPublic}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900 whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a la cartelera pública
            </button>
          </div>
        </div>

        <main className="mx-auto flex w-full max-w-md flex-col items-center px-6 py-16 text-center">
          <img
            src={logoSrc}
            onError={() => setLogoSrc(LOGO_URL_FALLBACK)}
            referrerPolicy="no-referrer"
            alt="Logo Secretariado de Pastoral Familiar Arquidiócesis de Maracaibo"
            className="h-28 w-auto object-contain"
          />

          <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-zinc-900">
            Panel Administrativo Pastoral
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            Acceso exclusivo para coordinadores autorizados del Secretariado de Pastoral Familiar de la Arquidiócesis de Maracaibo para gestionar encuentros, cupos y sincronización con Google Sheets.
          </p>

          {authError &&
            (authError.toLowerCase().includes('unauthorized-domain') ? (
              <div className="mt-5 w-full rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-left text-xs text-zinc-800 space-y-3">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
                  <div>
                    <p className="font-semibold text-zinc-900">
                      Falta autorizar el dominio de esta web en Firebase (1 solo minuto)
                    </p>
                    <p className="mt-0.5 text-zinc-600 leading-relaxed">
                      Por seguridad de Google, cuando publicas la página en Vercel debes autorizar su dirección una sola vez para permitir el botón de inicio de sesión:
                    </p>
                  </div>
                </div>

                {typeof window !== 'undefined' && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2">
                    <span className="font-mono text-xs font-semibold text-zinc-900 truncate">
                      {window.location.hostname}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyTextToClipboard(window.location.hostname, 'domain')
                      }
                      className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-zinc-800 whitespace-nowrap shrink-0"
                    >
                      <Copy className="h-3 w-3" />
                      {copiedTokenLabel === 'domain' ? 'Copiado' : 'Copiar dominio'}
                    </button>
                  </div>
                )}

                <ol className="list-decimal pl-4 space-y-1.5 text-zinc-700 leading-relaxed">
                  <li>
                    Haz clic arriba en <strong>Copiar dominio</strong>.
                  </li>
                  <li>
                    Abre{' '}
                    <a
                      href="https://console.firebase.google.com/project/gmail-secretariado-de-pastoral/authentication/settings"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-[#DC1F26] underline hover:text-[#B9191F]"
                    >
                      Configuración de Firebase (Dominios autorizados)
                    </a>{' '}
                    con tu correo <strong>lapastoralfamiliar.mcbo@gmail.com</strong>.
                  </li>
                  <li>
                    Pulsa <strong>Agregar dominio</strong>, pega el dominio copiado y haz clic en <strong>Agregar</strong>. Luego vuelve aquí e inicia sesión.
                  </li>
                </ol>
              </div>
            ) : (
              <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-left text-xs text-[#DC1F26]">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Acceso restringido</p>
                  <p className="mt-0.5">{authError}</p>
                </div>
              </div>
            ))}

          <div className="mt-7">
            {loadingStore ? (
              <div className="text-sm font-medium text-zinc-600">
                Verificando permisos y cargando datos...
              </div>
            ) : (
              <GoogleSignInButton
                onClick={handleLogin}
                disabled={authLoading}
                label={authLoading ? 'Conectando...' : 'Iniciar sesión con Google'}
              />
            )}
          </div>

          {user && authError && (
            <button
              type="button"
              onClick={handleLogout}
              className="mt-4 text-xs font-medium text-zinc-500 underline hover:text-zinc-800"
            >
              Cambiar cuenta de Google ({user.email})
            </button>
          )}
        </main>

        <footer className="border-t border-zinc-200 py-5 text-center text-xs text-zinc-400">
          Secretariado de Pastoral Familiar · Arquidiócesis de Maracaibo
        </footer>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────
  // AUTHENTICATED ADMIN CONSOLE
  // ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-50/60">
      {/* Top Admin Workspace Bar */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBackToPublic}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Ver Cartelera Pública
            </button>
            <span className="hidden sm:inline text-zinc-300">/</span>
            <span className="truncate font-display text-sm font-bold text-zinc-900">
              Administración EPIM · Año público activo: {store.config.publicYear}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden md:inline text-xs text-zinc-500 truncate max-w-[220px]">
              {user?.email}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
              Salir
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {bannerMessage && (
          <div
            className={`mb-6 flex items-center justify-between rounded-xl border px-4 py-3 text-xs sm:text-sm font-medium ${
              bannerMessage.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-[#DC1F26]'
            }`}
          >
            <span>{bannerMessage.text}</span>
            <button
              type="button"
              onClick={() => setBannerMessage(null)}
              className="ml-4 text-xs underline"
            >
              Cerrar
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Sidebar Navigation */}
          <aside className="rounded-xl border border-zinc-200 bg-white p-3 lg:col-span-3">
            {/* Active Year Working Selector */}
            <div className="border-b border-zinc-100 px-2 pb-3 mb-2">
              <label
                htmlFor="admin-working-year"
                className="block text-[11px] font-semibold text-zinc-500"
              >
                Año en gestión administrativa
              </label>
              <select
                id="admin-working-year"
                value={selectedAdminYear}
                onChange={(e) => {
                  const y = Number(e.target.value);
                  setSelectedAdminYear(y);
                  setBatchYear(y);
                }}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-900 tabular-nums focus:border-[#DC1F26] focus:outline-none"
              >
                {store.config.availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    Año {yr} {yr === store.config.publicYear ? '(Público en web)' : '(Borrador / Archivo)'}
                  </option>
                ))}
              </select>
            </div>

            <nav className="space-y-1">
              <button
                type="button"
                onClick={() => setActiveSection('resumen')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  activeSection === 'resumen'
                    ? 'bg-[#FEF2F2] font-semibold text-[#DC1F26]'
                    : 'text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <LayoutDashboard className="h-4 w-4 shrink-0" />
                Métricas y Año Público
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('encuentros')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  activeSection === 'encuentros'
                    ? 'bg-[#FEF2F2] font-semibold text-[#DC1F26]'
                    : 'text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <CalendarRange className="h-4 w-4 shrink-0" />
                Encuentros ({yearMetrics.totalEncuentros})
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('carga-parroquial')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  activeSection === 'carga-parroquial'
                    ? 'bg-[#FEF2F2] font-semibold text-[#DC1F26]'
                    : 'text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <CalendarPlus className="h-4 w-4 shrink-0" />
                Carga Anual por Parroquia
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('informes')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  activeSection === 'informes'
                    ? 'bg-[#FEF2F2] font-semibold text-[#DC1F26]'
                    : 'text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <FileText className="h-4 w-4 shrink-0" />
                Informes PDF
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('reservaciones')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  activeSection === 'reservaciones'
                    ? 'bg-[#FEF2F2] font-semibold text-[#DC1F26]'
                    : 'text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <Users className="h-4 w-4 shrink-0" />
                Reservaciones ({yearMetrics.reservasConfirmadas})
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('consultas')}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  activeSection === 'consultas'
                    ? 'bg-[#FEF2F2] font-semibold text-[#DC1F26]'
                    : 'text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Inbox className="h-4 w-4 shrink-0" />
                  Consultas Directas
                </span>
                {yearMetrics.consultasPendientes > 0 && (
                  <span className="font-mono text-xs font-bold text-[#DC1F26] tabular-nums">
                    {yearMetrics.consultasPendientes}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveSection('sheets')}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  activeSection === 'sheets'
                    ? 'bg-[#FEF2F2] font-semibold text-[#DC1F26]'
                    : 'text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0" />
                Google Sheets y Ajustes
              </button>
            </nav>
          </aside>

          {/* Main Admin Workspace Content */}
          <div className="space-y-6 lg:col-span-9">
            {/* 1. RESUMEN Y AÑO PÚBLICO */}
            {activeSection === 'resumen' && (
              <div className="space-y-6">
                {/* Instant KPI Strip */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-xl border border-zinc-200 bg-white p-5">
                    <div className="text-xs text-zinc-500">Encuentros ({selectedAdminYear})</div>
                    <div className="mt-1.5 font-mono text-2xl font-bold text-zinc-900 tabular-nums">
                      {yearMetrics.totalEncuentros}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 tabular-nums">
                      En {yearMetrics.parroquiasActivas} parroquias sedes
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-white p-5">
                    <div className="text-xs text-zinc-500">Cupos Disponibles</div>
                    <div className="mt-1.5 font-mono text-2xl font-bold text-[#DC1F26] tabular-nums">
                      {yearMetrics.cuposDisponibles}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 tabular-nums">
                      De {yearMetrics.cuposTotales} cupos totales
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-white p-5">
                    <div className="text-xs text-zinc-500">Parejas Reservadas</div>
                    <div className="mt-1.5 font-mono text-2xl font-bold text-zinc-900 tabular-nums">
                      {yearMetrics.cuposReservados}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 tabular-nums">
                      {yearMetrics.cuposTotales > 0
                        ? `${Math.round((yearMetrics.cuposReservados / yearMetrics.cuposTotales) * 100)}% de ocupación`
                        : '0% de ocupación'}
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-white p-5">
                    <div className="text-xs text-zinc-500">Consultas Pendientes</div>
                    <div className="mt-1.5 font-mono text-2xl font-bold text-zinc-900 tabular-nums">
                      {yearMetrics.consultasPendientes}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {store.inquiries.length} recibidas en total
                    </div>
                  </div>
                </div>

                {/* Public Year Selector Control */}
                <div className="rounded-xl border border-zinc-200 bg-white p-6">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                      <h2 className="font-display text-base font-bold text-zinc-900">
                        Control de Año Visible en la Cartelera Pública
                      </h2>
                      <p className="mt-1 text-xs sm:text-sm text-zinc-600">
                        Puedes cargar con anticipación los EPIM de próximos años y elegir aquí qué año verá el público general en la web.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    {store.config.availableYears.map((yr) => {
                      const isPublic = yr === store.config.publicYear;
                      const count = store.encounters.filter((e) => e.year === yr).length;
                      return (
                        <button
                          key={yr}
                          type="button"
                          onClick={() => handleRequestPublishYear(yr)}
                          className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs sm:text-sm font-semibold transition-colors tabular-nums whitespace-nowrap shrink-0 ${
                            isPublic
                              ? 'border-[#DC1F26] bg-[#DC1F26] text-white'
                              : 'border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50'
                          }`}
                        >
                          {isPublic && <CheckCircle2 className="h-4 w-4" />}
                          <span>Año {yr}</span>
                          <span className={isPublic ? 'text-red-100' : 'text-zinc-400'}>
                            ({count} EPIM)
                          </span>
                          {isPublic && <span className="ml-1 text-xs font-normal">· Público</span>}
                        </button>
                      );
                    })}

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={2024}
                        max={2035}
                        value={newYearInput}
                        onChange={(e) => setNewYearInput(e.target.value)}
                        placeholder="Ej. 2028"
                        className="w-28 rounded-lg border border-zinc-200 px-3 py-2 text-xs sm:text-sm tabular-nums focus:border-[#DC1F26] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddYear}
                        className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 whitespace-nowrap shrink-0"
                      >
                        + Habilitar año
                      </button>
                    </div>
                  </div>
                </div>

                {/* Breakdown by Arciprestazgo */}
                <div className="rounded-xl border border-zinc-200 bg-white p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-display text-base font-bold text-zinc-900">
                      Distribución por Arciprestazgo ({selectedAdminYear})
                    </h3>
                    <div className="flex items-center gap-4 shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveSection('informes')}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 hover:text-zinc-950 hover:underline whitespace-nowrap shrink-0"
                      >
                        <FileText className="h-3.5 w-3.5 text-[#DC1F26]" />
                        Generar informe PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveSection('carga-parroquial')}
                        className="text-xs font-semibold text-[#DC1F26] hover:underline whitespace-nowrap shrink-0"
                      >
                        + Cargar fechas por parroquia
                      </button>
                    </div>
                  </div>

                  {yearMetrics.byArciprestazgo.length === 0 ? (
                    <p className="mt-4 text-sm text-zinc-500">
                      Aún no hay encuentros cargados para el año {selectedAdminYear}.
                    </p>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full border-collapse text-left text-xs sm:text-sm">
                        <thead>
                          <tr className="border-b border-zinc-200 text-zinc-500">
                            <th className="py-2.5 pr-4 font-semibold">Arciprestazgo / Zona Pastoral</th>
                            <th className="px-4 py-2.5 text-right font-semibold">Encuentros</th>
                            <th className="px-4 py-2.5 text-right font-semibold">Cupos Disponibles</th>
                            <th className="py-2.5 pl-4 text-right font-semibold">Capacidad Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 tabular-nums">
                          {yearMetrics.byArciprestazgo.map((row) => (
                            <tr key={row.nombre}>
                              <td className="py-3 pr-4 font-medium text-zinc-900">{row.nombre}</td>
                              <td className="px-4 py-3 text-right font-mono">{row.encuentros}</td>
                              <td className="px-4 py-3 text-right font-mono font-semibold text-[#DC1F26]">
                                {row.disponibles}
                              </td>
                              <td className="py-3 pl-4 text-right font-mono text-zinc-600">
                                {row.totales}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. GESTIÓN DE ENCUENTROS (CRUD INDIVIDUAL + CUPOS) */}
            {activeSection === 'encuentros' && (
              <div className="rounded-xl border border-zinc-200 bg-white p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="font-display text-lg font-bold text-zinc-900">
                      Encuentros Programados · Año {selectedAdminYear}
                    </h2>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Añade, edita fechas, ajusta la cantidad total de cupos o elimina encuentros.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveSection('informes')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 whitespace-nowrap shrink-0"
                    >
                      <FileText className="h-3.5 w-3.5 text-[#DC1F26]" />
                      Informes PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSection('carga-parroquial')}
                      className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 whitespace-nowrap shrink-0"
                    >
                      Carga anual por parroquia
                    </button>
                    <button
                      type="button"
                      onClick={openCreateEncounter}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B9191F] whitespace-nowrap shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Nuevo encuentro
                    </button>
                  </div>
                </div>

                {/* Filters */}
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <select
                    value={adminEncFilterArc}
                    onChange={(e) => setAdminEncFilterArc(e.target.value)}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs sm:text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                  >
                    <option value="todos">Todos los arciprestazgos</option>
                    {adminArciprestazgoFilterOptions.map((arc) => (
                      <option key={arc} value={arc}>
                        {arc}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={adminEncSearch}
                    onChange={(e) => setAdminEncSearch(e.target.value)}
                    placeholder="Buscar parroquia, coordinador o teléfono..."
                    className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs sm:text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                  />
                </div>

                {filteredAdminEncounters.length === 0 ? (
                  <div className="mt-6 rounded-xl border border-zinc-100 bg-zinc-50 p-10 text-center">
                    <p className="text-sm font-medium text-zinc-700">
                      No hay encuentros registrados para el año {selectedAdminYear} con este filtro.
                    </p>
                    <button
                      type="button"
                      onClick={openCreateEncounter}
                      className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
                    >
                      Registrar primer encuentro {selectedAdminYear}
                    </button>
                  </div>
                ) : (
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse text-left text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500">
                          <th className="py-3 pr-3">Fechas</th>
                          <th className="px-3 py-3">Parroquia y Arciprestazgo</th>
                          <th className="px-3 py-3">Contacto</th>
                          <th className="px-3 py-3 text-right">Disp. / Total</th>
                          <th className="px-3 py-3">Estado</th>
                          <th className="py-3 pl-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {filteredAdminEncounters.map((enc) => {
                          const disp = Math.max(0, enc.cuposTotales - enc.cuposReservados);
                          const dates = getEncounterDates(enc);
                          return (
                            <tr key={enc.id} className="hover:bg-zinc-50/80">
                              <td className="py-3.5 pr-3 align-top tabular-nums">
                                <div className="font-semibold text-zinc-900">
                                  {formatMonthName(enc.mes)}
                                  <span className="font-normal text-zinc-500">
                                    {' '}
                                    · {dates.length} fechas
                                  </span>
                                </div>
                                <div className="text-xs text-zinc-500">
                                  {formatEncounterDatesEs(enc)}
                                </div>
                              </td>
                              <td className="px-3 py-3.5 align-top">
                                <div className="font-semibold text-zinc-900">{enc.parroquia}</div>
                                <div className="text-xs text-zinc-500">{enc.arciprestazgo}</div>
                              </td>
                              <td className="px-3 py-3.5 align-top">
                                <div className="font-mono text-xs text-zinc-800 tabular-nums">
                                  {enc.telefonoContacto}
                                </div>
                                <div className="text-xs text-zinc-500">{enc.coordinadores}</div>
                              </td>
                              <td className="px-3 py-3.5 align-top text-right font-mono tabular-nums">
                                <span className="font-bold text-zinc-900">{disp}</span>
                                <span className="text-zinc-400"> / {enc.cuposTotales}</span>
                              </td>
                              <td className="px-3 py-3.5 align-top text-xs capitalize text-zinc-700">
                                {enc.estado}
                              </td>
                              <td className="py-3.5 pl-3 align-top text-right">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openEditEncounter(enc)}
                                    title="Editar encuentro y cupos"
                                    className="rounded-lg border border-zinc-200 p-1.5 text-zinc-700 hover:bg-zinc-100"
                                  >
                                    <Edit3 className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRequestDeleteEncounter(enc)}
                                    title="Eliminar encuentro"
                                    className="rounded-lg border border-zinc-200 p-1.5 text-[#DC1F26] hover:bg-red-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* 3. CARGA ANUAL POR PARROQUIA */}
            {activeSection === 'carga-parroquial' && (
              <div className="rounded-xl border border-zinc-200 bg-white p-6">
                <h2 className="font-display text-lg font-bold text-zinc-900">
                  Programación Anual por Parroquia
                </h2>
                <p className="mt-1 text-xs sm:text-sm text-zinc-600">
                  Selecciona una parroquia y carga de una sola vez todos los encuentros EPIM que tiene programados durante el año.
                </p>

                <form onSubmit={handleBatchSubmit} className="mt-6 space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-800">Año *</label>
                      <select
                        value={batchYear}
                        onChange={(e) => setBatchYear(Number(e.target.value))}
                        className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums"
                      >
                        {store.config.availableYears.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-zinc-800">
                        Arciprestazgo *
                      </label>
                      <select
                        required
                        value={batchArciprestazgo}
                        onChange={(e) => {
                          const arc = e.target.value;
                          setBatchArciprestazgo(arc);
                          setBatchParroquia('');
                        }}
                        className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                      >
                        <option value="" disabled>
                          Seleccione un Arciprestazgo...
                        </option>
                        {MARACAIBO_ARCIPRESTAZGOS.map((g) => (
                          <option key={g.nombre} value={g.nombre}>
                            {g.nombre}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-800">
                        Parroquia sede *
                      </label>
                      <select
                        required
                        disabled={!batchArciprestazgo}
                        value={batchParroquia}
                        onChange={(e) => setBatchParroquia(e.target.value)}
                        className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
                      >
                        {!batchArciprestazgo ? (
                          <option value="">Primero seleccione un Arciprestazgo...</option>
                        ) : (
                          <>
                            <option value="" disabled>
                              Seleccione la Parroquia sede...
                            </option>
                            {getParroquiasForArciprestazgo(batchArciprestazgo).map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </>
                        )}
                      </select>
                      <p className="mt-1.5 text-[11px] text-zinc-500">
                        {batchArciprestazgo
                          ? `${getParroquiasForArciprestazgo(batchArciprestazgo).length} parroquias asociadas al Arciprestazgo seleccionado.`
                          : 'Al elegir un Arciprestazgo solo aparecerán sus parroquias asociadas.'}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-800">
                          Teléfono de contacto parroquial / pastoral *
                        </label>
                        <input
                          type="tel"
                          required
                          value={batchTelefono}
                          onChange={(e) => setBatchTelefono(e.target.value)}
                          placeholder="+58 414-0000000"
                          className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-zinc-800">
                          Matrimonio o Equipo Coordinador
                        </label>
                        <input
                          type="text"
                          value={batchCoordinadores}
                          onChange={(e) => setBatchCoordinadores(e.target.value)}
                          placeholder="Ej. Esp. Pérez / Pastoral Familiar"
                          className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Annual Encounters with Individual Dates */}
                  <div className="border-t border-zinc-200 pt-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-display text-sm font-bold text-zinc-900">
                          Encuentros Programados durante el Año {batchYear}
                        </h3>
                        <p className="text-xs text-zinc-500">
                          Registra las fechas individuales (Fecha 1, Fecha 2, Fecha 3...) de cada EPIM de la parroquia.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setBatchItems((prev) => [
                            ...prev,
                            {
                              mes: 10,
                              fechaInicio: '',
                              fechaFin: '',
                              fechas: ['', '', ''],
                              horario: DEFAULT_HORARIO,
                              cuposTotales: 25,
                              sedeDetalle: '',
                              aporteInfo: '',
                            },
                          ])
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 whitespace-nowrap shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Añadir otro EPIM en el año
                      </button>
                    </div>

                    <div className="mt-3 divide-y divide-zinc-200 border-t border-b border-zinc-200">
                      {batchItems.map((item, index) => {
                        const rowDates: string[] =
                          item.fechas && item.fechas.length > 0
                            ? item.fechas
                            : ['', '', ''];

                        const updateRowDates = (nextDates: string[]) => {
                          const cleaned = normalizeIndividualDates(nextDates);
                          const first = cleaned[0] || '';
                          const last = cleaned[cleaned.length - 1] || first;
                          setBatchItems((prev) =>
                            prev.map((r, i) =>
                              i === index
                                ? {
                                    ...r,
                                    fechaInicio: first,
                                    fechaFin: last,
                                    mes: Number(first.split('-')[1]) || r.mes,
                                    fechas: nextDates,
                                  }
                                : r
                            )
                          );
                        };

                        const normalizedRowDates = normalizeIndividualDates(rowDates);
                        const previewText =
                          normalizedRowDates.length > 0
                            ? formatEncounterDatesEs({
                                fechaInicio: normalizedRowDates[0],
                                fechaFin: normalizedRowDates[normalizedRowDates.length - 1],
                                fechas: normalizedRowDates,
                              })
                            : '';

                        return (
                          <div key={index} className="py-5 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs text-zinc-500 tabular-nums">
                                <span className="font-semibold text-zinc-900">
                                  EPIM #{index + 1}
                                </span>
                                {previewText && (
                                  <span>
                                    {' '}
                                    · {previewText} ({normalizedRowDates.length} fechas)
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => updateRowDates([...rowDates, ''])}
                                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 whitespace-nowrap shrink-0"
                                >
                                  + Añadir Fecha {rowDates.length + 1}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const lastFilled = [...rowDates].reverse().find(Boolean);
                                    const base = lastFilled || `${batchYear}-11-07`;
                                    updateRowDates([...rowDates, addDaysIso(base, 7)]);
                                  }}
                                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 whitespace-nowrap shrink-0"
                                >
                                  + Fecha a +7 días
                                </button>
                                {batchItems.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setBatchItems((prev) => prev.filter((_, i) => i !== index))
                                    }
                                    title="Eliminar este encuentro anual"
                                    className="rounded-lg border border-zinc-200 bg-white p-1.5 text-[#DC1F26] hover:bg-red-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Individual Date Fields: Fecha 1, Fecha 2, Fecha 3... */}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                              {rowDates.map((dVal, dIdx) => (
                                <div key={dIdx}>
                                  <div className="flex items-center justify-between">
                                    <label className="block text-[11px] font-semibold text-zinc-700">
                                      Fecha {dIdx + 1} *
                                    </label>
                                    {dVal && (
                                      <span className="text-[11px] text-zinc-500 tabular-nums">
                                        {formatSingleDateEs(dVal).split(' de ')[0]}
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-1 flex items-center gap-1.5">
                                    <input
                                      type="date"
                                      required
                                      value={dVal}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        updateRowDates(
                                          rowDates.map((prevD, idx) =>
                                            idx === dIdx ? val : prevD
                                          )
                                        );
                                      }}
                                      className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-xs tabular-nums"
                                    />
                                    {rowDates.length > 2 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateRowDates(rowDates.filter((_, idx) => idx !== dIdx))
                                        }
                                        title={`Quitar Fecha ${dIdx + 1}`}
                                        className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 hover:text-[#DC1F26] shrink-0"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>

                            {/* Capacity and venue row */}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 items-end pt-1">
                              <div className="sm:col-span-3">
                                <label className="block text-[11px] font-semibold text-zinc-600">
                                  Cupos (Parejas)
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  max={300}
                                  value={item.cuposTotales}
                                  onChange={(e) => {
                                    const val = Math.max(1, Number(e.target.value) || 1);
                                    setBatchItems((prev) =>
                                      prev.map((row, i) =>
                                        i === index ? { ...row, cuposTotales: val } : row
                                      )
                                    );
                                  }}
                                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-xs tabular-nums"
                                />
                              </div>

                              <div className="sm:col-span-9">
                                <label className="block text-[11px] font-semibold text-zinc-600">
                                  Salón / Detalle de Sede
                                </label>
                                <input
                                  type="text"
                                  value={item.sedeDetalle}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setBatchItems((prev) =>
                                      prev.map((row, i) =>
                                        i === index ? { ...row, sedeDetalle: val } : row
                                      )
                                    );
                                  }}
                                  placeholder="Salón parroquial..."
                                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-xs"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      className="rounded-lg bg-[#DC1F26] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#B9191F] whitespace-nowrap shrink-0"
                    >
                      Guardar Programación Anual de la Parroquia
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* 4. RESERVACIONES E INVENTARIO */}
            {activeSection === 'reservaciones' && (
              <div className="rounded-xl border border-zinc-200 bg-white p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="font-display text-lg font-bold text-zinc-900">
                      Control de Reservaciones de Cupos ({selectedAdminYear})
                    </h2>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Cada reserva confirmada descuenta 1 cupo automáticamente. Si cancelas una reserva, el cupo vuelve a estar disponible.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={exportReservationsCsv}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 whitespace-nowrap shrink-0"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Exportar nómina CSV
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <select
                    value={resFilterEncounterId}
                    onChange={(e) => setResFilterEncounterId(e.target.value)}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs sm:text-sm"
                  >
                    <option value="todos">Todos los encuentros ({selectedAdminYear})</option>
                    {store.encounters
                      .filter((e) => e.year === selectedAdminYear)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {formatMonthName(e.mes)} — {e.parroquia}
                        </option>
                      ))}
                  </select>
                  <input
                    type="text"
                    value={resSearch}
                    onChange={(e) => setResSearch(e.target.value)}
                    placeholder="Buscar por código EPIM, nombres o cédula..."
                    className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs sm:text-sm"
                  />
                </div>

                {filteredReservations.length === 0 ? (
                  <p className="mt-8 py-8 text-center text-sm text-zinc-500">
                    No hay reservaciones registradas con estos criterios en {selectedAdminYear}.
                  </p>
                ) : (
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse text-left text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500">
                          <th className="py-3 pr-3">Código</th>
                          <th className="px-3 py-3">Pareja (Novia y Novio)</th>
                          <th className="px-3 py-3">Parroquia Sede EPIM</th>
                          <th className="px-3 py-3">Contacto</th>
                          <th className="px-3 py-3">Estado</th>
                          <th className="py-3 pl-3 text-right">Gestión</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {filteredReservations.map((resItem) => (
                          <tr key={resItem.id} className="hover:bg-zinc-50/70">
                            <td className="py-3.5 pr-3 align-top font-mono text-xs font-semibold text-[#DC1F26] tabular-nums">
                              {resItem.codigoReserva}
                            </td>
                            <td className="px-3 py-3.5 align-top">
                              <div className="font-semibold text-zinc-900">
                                {resItem.nombreNovia} & {resItem.nombreNovio}
                              </div>
                              {resItem.documentoIdentidad && (
                                <div className="text-xs text-zinc-500 tabular-nums">
                                  {resItem.documentoIdentidad}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3.5 align-top">
                              <div className="font-medium text-zinc-900">{resItem.parroquiaEpim}</div>
                              <div className="text-xs text-zinc-500">{resItem.fechasEpim}</div>
                            </td>
                            <td className="px-3 py-3.5 align-top">
                              <div className="font-mono text-xs text-zinc-800 tabular-nums">
                                {resItem.telefonoPareja}
                              </div>
                              <div className="text-xs text-zinc-500">{resItem.correoPareja}</div>
                            </td>
                            <td className="px-3 py-3.5 align-top text-xs font-medium capitalize">
                              {resItem.estado === 'confirmada' ? (
                                <span className="text-emerald-700">Confirmada</span>
                              ) : (
                                <span className="text-zinc-400">Cancelada</span>
                              )}
                            </td>
                            <td className="py-3.5 pl-3 align-top text-right">
                              {resItem.estado === 'confirmada' ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPendingConfirm({
                                      title: '¿Cancelar esta reservación y liberar el cupo?',
                                      description:
                                        'El cupo reservado regresará inmediatamente al inventario disponible del encuentro y se actualizará Google Sheets.',
                                      details: [
                                        `Código: ${resItem.codigoReserva}`,
                                        `Pareja: ${resItem.nombreNovia} y ${resItem.nombreNovio}`,
                                      ],
                                      confirmLabel: 'Cancelar reserva',
                                      variant: 'danger',
                                      action: async () => {
                                        const out = await updateReservationStatus(
                                          resItem.id,
                                          'cancelada'
                                        );
                                        setStore(out.store);
                                        onPublicDataChanged();
                                        notify('success', 'Reserva cancelada y cupo liberado.');
                                      },
                                    })
                                  }
                                  className="text-xs font-medium text-[#DC1F26] hover:underline whitespace-nowrap shrink-0"
                                >
                                  Liberar cupo
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPendingConfirm({
                                      title: '¿Reactivar esta reservación?',
                                      description:
                                        'Se volverá a descontar 1 cupo del inventario disponible del encuentro.',
                                      confirmLabel: 'Reactivar',
                                      action: async () => {
                                        const out = await updateReservationStatus(
                                          resItem.id,
                                          'confirmada'
                                        );
                                        setStore(out.store);
                                        onPublicDataChanged();
                                        notify('success', 'Reservación reactivada.');
                                      },
                                    })
                                  }
                                  className="text-xs font-medium text-zinc-600 hover:underline whitespace-nowrap shrink-0"
                                >
                                  Reactivar
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* 5. BANDEJA DE CONSULTAS DIRECTAS */}
            {activeSection === 'consultas' && (
              <div className="rounded-xl border border-zinc-200 bg-white p-6">
                <h2 className="font-display text-lg font-bold text-zinc-900">
                  Consultas Directas Recibidas
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Mensajes enviados desde el formulario público por novios, sacerdotes y agentes de pastoral.
                </p>

                {store.inquiries.length === 0 ? (
                  <p className="mt-8 py-8 text-center text-sm text-zinc-500">
                    No hay consultas registradas hasta el momento.
                  </p>
                ) : (
                  <div className="mt-5 divide-y divide-zinc-200">
                    {store.inquiries.map((inq) => {
                      const cleanDigits = inq.telefono.replace(/[^\d]/g, '');
                      return (
                        <div key={inq.id} className="py-4 first:pt-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-xs text-zinc-500">
                              <span className="font-semibold text-zinc-900">
                                {inq.nombreRemitente}
                              </span>
                              <span> · {inq.rolRemitente}</span>
                              {inq.parroquiaInteres && <span> · {inq.parroquiaInteres}</span>}
                            </div>

                            <div className="flex items-center gap-3 text-xs">
                              <span
                                className={
                                  inq.estado === 'pendiente'
                                    ? 'font-semibold text-[#DC1F26]'
                                    : 'text-emerald-700 font-medium'
                                }
                              >
                                {inq.estado === 'pendiente' ? 'Pendiente' : 'Atendida'}
                              </span>
                              <button
                                type="button"
                                onClick={async () => {
                                  const next =
                                    inq.estado === 'pendiente' ? 'atendida' : 'pendiente';
                                  const out = await updateInquiryStatus(inq.id, next);
                                  setStore(out.store);
                                }}
                                className="rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 whitespace-nowrap shrink-0"
                              >
                                {inq.estado === 'pendiente'
                                  ? 'Marcar atendida'
                                  : 'Reabrir pendiente'}
                              </button>
                            </div>
                          </div>

                          <p className="mt-2 text-sm leading-relaxed text-zinc-800">{inq.mensaje}</p>

                          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-zinc-500 tabular-nums">
                            <a
                              href={`tel:${inq.telefono}`}
                              className="font-mono hover:text-[#DC1F26]"
                            >
                              Tel: {inq.telefono}
                            </a>
                            {cleanDigits && (
                              <a
                                href={`https://wa.me/${cleanDigits}?text=${encodeURIComponent(
                                  `Hola ${inq.nombreRemitente}, le escribimos desde el Secretariado de Pastoral Familiar de la Arquidiócesis de Maracaibo respecto a su consulta sobre los EPIM.`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-zinc-700 underline hover:text-zinc-900"
                              >
                                Responder por WhatsApp
                              </a>
                            )}
                            {inq.correo && (
                              <a
                                href={`mailto:${inq.correo}`}
                                className="underline hover:text-zinc-900"
                              >
                                {inq.correo}
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 6. GOOGLE SHEETS EN TIEMPO REAL & CONFIGURACIÓN */}
            {activeSection === 'sheets' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-zinc-200 bg-white p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-display text-lg font-bold text-zinc-900">
                        Base de Datos Centralizada en Google Sheets
                      </h2>
                      <p className="mt-1 text-xs sm:text-sm leading-relaxed text-zinc-600">
                        Conecta o genera en un clic la hoja de cálculo oficial en Google Sheets. Cada cambio administrativo en encuentros, años o cupos se sincroniza automáticamente con las pestañas <strong>Encuentros</strong>, <strong>Reservaciones</strong>, <strong>Consultas</strong> y <strong>Configuracion</strong>.
                      </p>
                    </div>
                  </div>

                  {store.config.spreadsheetId && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs">
                      <div>
                        <div className="font-semibold text-emerald-950">
                          Conectado: {store.config.spreadsheetTitle || store.config.spreadsheetId}
                        </div>
                        {store.config.lastSyncedAt && (
                          <div className="mt-0.5 text-emerald-800 tabular-nums">
                            Última sincronización: {new Date(store.config.lastSyncedAt).toLocaleString('es-VE')}
                          </div>
                        )}
                      </div>
                      {store.config.spreadsheetUrl && (
                        <a
                          href={store.config.spreadsheetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-semibold text-emerald-900 border border-emerald-300 hover:bg-emerald-50 whitespace-nowrap shrink-0"
                        >
                          Abrir en Google Sheets
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  )}

                  <div className="mt-5 space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-800">
                        1. Pega aquí el enlace completo de tu archivo de Google Sheets
                      </label>
                      <input
                        type="text"
                        value={sheetInputUrl}
                        onChange={(e) => setSheetInputUrl(e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/1AbC.../edit"
                        className="mt-1.5 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={sheetsBusy}
                        onClick={handlePushToExistingSheet}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#DC1F26] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#B9191F] disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Conectar y guardar en mi Google Sheet
                      </button>

                      <button
                        type="button"
                        disabled={sheetsBusy}
                        onClick={handlePullFromSheet}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        Importar datos desde Google Sheets
                      </button>

                      <button
                        type="button"
                        disabled={sheetsBusy}
                        onClick={handleCreateNewSheet}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                        O crear hoja nueva automáticamente
                      </button>
                    </div>

                    {/* Non-technical 3-step guide for Google Sheets + Vercel */}
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 text-xs text-zinc-700 space-y-2.5">
                      <p className="font-semibold text-zinc-900">
                        Cómo dejar tu Google Sheet funcionando 24/7 en Vercel (paso a paso sencillo):
                      </p>
                      <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed">
                        <li>
                          Pega arriba el enlace de tu archivo de Google Sheets y pulsa{' '}
                          <strong>Conectar y guardar en mi Google Sheet</strong> (esto crea solo las pestañas <em>Encuentros</em>, <em>Reservaciones</em>, <em>Consultas</em> y <em>Configuracion</em>).
                        </li>
                        <li>
                          En tu archivo de Google Sheets, haz clic arriba a la derecha en el botón{' '}
                          <strong>Compartir</strong>: en <em>Acceso general</em> cambia &ldquo;Restringido&rdquo; por{' '}
                          <strong>Cualquier persona con el enlace → Lector</strong>. (Así los fieles ven la cartelera, pero nadie más puede modificarla).
                        </li>
                        <li>
                          En tu panel de <strong>Vercel</strong> entra a <em>Settings → Environment Variables</em>, añade una variable llamada{' '}
                          <button
                            type="button"
                            onClick={() =>
                              copyTextToClipboard('GOOGLE_SHEET_ID', 'env_key')
                            }
                            className="inline-flex items-center gap-1 font-mono font-semibold text-zinc-900 underline"
                          >
                            GOOGLE_SHEET_ID
                            <Copy className="h-3 w-3" />
                          </button>{' '}
                          {copiedTokenLabel === 'env_key' && (
                            <span className="text-emerald-700 font-semibold">(copiado) </span>
                          )}
                          y en su valor pega el mismo enlace de tu Google Sheet. Luego pulsa <em>Save</em> y <em>Redeploy</em>.
                        </li>
                      </ol>
                    </div>
                  </div>
                </div>

                {/* Authorized Administrators & Secretariat Contact */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="rounded-xl border border-zinc-200 bg-white p-6">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-[#DC1F26]" />
                      <h3 className="font-display text-base font-bold text-zinc-900">
                        Administradores Autorizados
                      </h3>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      Solo estas cuentas de Google pueden acceder a este panel administrativo.
                    </p>

                    <ul className="mt-4 divide-y divide-zinc-100 text-xs">
                      {store.config.authorizedAdmins.map((email) => (
                        <li key={email} className="flex items-center justify-between py-2">
                          <span className="font-mono text-zinc-800">{email}</span>
                          {email.toLowerCase() !== 'lapastoralfamiliar.mcbo@gmail.com' ? (
                            <button
                              type="button"
                              onClick={() =>
                                setPendingConfirm({
                                  title: '¿Revocar acceso administrativo?',
                                  description: `El correo ${email} ya no podrá entrar al panel administrativo.`,
                                  confirmLabel: 'Revocar acceso',
                                  variant: 'danger',
                                  action: async () => {
                                    const filtered = store.config.authorizedAdmins.filter(
                                      (a) => a !== email
                                    );
                                    const updated = await updateAdminConfig({
                                      authorizedAdmins: filtered,
                                    });
                                    setStore(updated);
                                    notify('success', 'Permiso revocado.');
                                  },
                                })
                              }
                              className="text-[#DC1F26] hover:underline"
                            >
                              Quitar
                            </button>
                          ) : (
                            <span className="text-zinc-400">Principal</span>
                          )}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-4 flex items-center gap-2">
                      <input
                        type="email"
                        value={newAdminEmail}
                        onChange={(e) => setNewAdminEmail(e.target.value)}
                        placeholder="nuevo.coordinador@gmail.com"
                        className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const mail = newAdminEmail.trim().toLowerCase();
                          if (!mail || !mail.includes('@')) return;
                          const updated = await updateAdminConfig({
                            authorizedAdmins: [...store.config.authorizedAdmins, mail],
                          });
                          setStore(updated);
                          setNewAdminEmail('');
                          notify('success', `Correo ${mail} autorizado como administrador.`);
                        }}
                        className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 whitespace-nowrap shrink-0"
                      >
                        Autorizar
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-white p-6">
                    <h3 className="font-display text-base font-bold text-zinc-900">
                      Datos Públicos del Secretariado
                    </h3>
                    <div className="mt-3 space-y-3 text-xs">
                      <div>
                        <label className="font-semibold text-zinc-700">Teléfono oficial</label>
                        <input
                          type="text"
                          value={secTel}
                          onChange={(e) => setSecTel(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-zinc-700">Correo electrónico</label>
                        <input
                          type="email"
                          value={secEmail}
                          onChange={(e) => setSecEmail(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-zinc-700">Dirección sede</label>
                        <input
                          type="text"
                          value={secDir}
                          onChange={(e) => setSecDir(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setPendingConfirm({
                            title: '¿Actualizar datos de contacto del Secretariado?',
                            description:
                              'Estos datos se mostrarán en el pie de página y en la sección de consultas públicas.',
                            confirmLabel: 'Guardar datos',
                            action: async () => {
                              const updated = await updateAdminConfig({
                                secretariadoTelefono: secTel,
                                secretariadoCorreo: secEmail,
                                secretariadoDireccion: secDir,
                              });
                              setStore(updated);
                              onPublicDataChanged();
                              notify('success', 'Datos de contacto actualizados.');
                            },
                          })
                        }
                        className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
                      >
                        Guardar información de contacto
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 7. GENERADOR DE INFORMES PDF */}
            {activeSection === 'informes' && (
              <AdminReportsSection
                store={store}
                defaultYear={selectedAdminYear}
                onNotify={notify}
              />
            )}
          </div>
        </div>
      </div>

      {/* Modal Form for Adding / Editing Single Encounter */}
      {showEncounterForm && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/45 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="my-8 w-full max-w-2xl rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h3 className="font-display text-lg font-bold text-zinc-900">
              {editingEncounter ? 'Editar Encuentro EPIM' : 'Nuevo Encuentro EPIM'}
            </h3>

            <form onSubmit={handleEncounterFormSubmit} className="mt-4 space-y-4 text-xs sm:text-sm">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">Año *</label>
                  <select
                    value={formYear}
                    onChange={(e) => setFormYear(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 tabular-nums"
                  >
                    {store.config.availableYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="enc-form-arciprestazgo"
                    className="block text-xs font-semibold text-zinc-700"
                  >
                    Arciprestazgo *
                  </label>
                  <select
                    id="enc-form-arciprestazgo"
                    required
                    value={formArciprestazgo}
                    onChange={(e) => {
                      const arc = e.target.value;
                      setFormArciprestazgo(arc);
                      setFormParroquia('');
                    }}
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                  >
                    <option value="" disabled>
                      Seleccione un Arciprestazgo...
                    </option>
                    {formArciprestazgo &&
                      !MARACAIBO_ARCIPRESTAZGOS.some(
                        (g) => g.nombre === formArciprestazgo
                      ) && (
                        <option value={formArciprestazgo}>
                          {formArciprestazgo} (registro anterior)
                        </option>
                      )}
                    {MARACAIBO_ARCIPRESTAZGOS.map((g) => (
                      <option key={g.nombre} value={g.nombre}>
                        {g.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="enc-form-parroquia"
                  className="block text-xs font-semibold text-zinc-700"
                >
                  Parroquia sede *
                </label>
                <select
                  id="enc-form-parroquia"
                  required
                  disabled={!formArciprestazgo}
                  value={formParroquia}
                  onChange={(e) => setFormParroquia(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
                >
                  {!formArciprestazgo ? (
                    <option value="">Primero seleccione un Arciprestazgo...</option>
                  ) : (
                    <>
                      <option value="" disabled>
                        Seleccione la Parroquia sede...
                      </option>
                      {formParroquia &&
                        !getParroquiasForArciprestazgo(formArciprestazgo).includes(
                          formParroquia
                        ) && (
                          <option value={formParroquia}>
                            {formParroquia} (registro anterior)
                          </option>
                        )}
                      {getParroquiasForArciprestazgo(formArciprestazgo).map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                <p className="mt-1 text-[11px] text-zinc-500">
                  {formArciprestazgo
                    ? `${getParroquiasForArciprestazgo(formArciprestazgo).length} parroquias asociadas a ${formArciprestazgo}.`
                    : 'Elige primero el Arciprestazgo para desplegar únicamente sus parroquias asociadas.'}
                </p>
              </div>

              {/* Individual Dates Builder (Fecha 1, Fecha 2, Fecha 3...) */}
              <div className="border-t border-b border-zinc-200 py-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-800">
                    Fechas individuales del Encuentro EPIM *
                  </label>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    Registra cada fecha individual del encuentro (Fecha 1, Fecha 2, Fecha 3...). Puedes añadir cuantas fechas sean necesarias.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {formFechas.map((fechaVal, idx) => (
                    <div key={idx}>
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] font-semibold text-zinc-700">
                          Fecha {idx + 1} *
                        </label>
                        {fechaVal && (
                          <span className="text-[11px] text-zinc-500 tabular-nums">
                            {formatSingleDateEs(fechaVal)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <input
                          type="date"
                          required
                          value={fechaVal}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormFechas((prev) =>
                              prev.map((d, i) => (i === idx ? val : d))
                            );
                          }}
                          className="w-full rounded-lg border border-zinc-200 px-3 py-2 tabular-nums focus:border-[#DC1F26] focus:outline-none"
                        />
                        {formFechas.length > 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              setFormFechas((prev) => prev.filter((_, i) => i !== idx))
                            }
                            title={`Eliminar Fecha ${idx + 1}`}
                            className="rounded-lg border border-zinc-200 p-2 text-zinc-500 hover:bg-red-50 hover:text-[#DC1F26] shrink-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAppendDateOffset(null)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-zinc-100 whitespace-nowrap"
                    >
                      <Plus className="h-3.5 w-3.5 text-[#DC1F26]" />
                      Añadir Fecha {formFechas.length + 1}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAppendDateOffset(7)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 whitespace-nowrap"
                    >
                      + Sumar fecha (+7 días)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAppendDateOffset(1)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 whitespace-nowrap"
                    >
                      + Día siguiente (+1 día)
                    </button>
                  </div>

                  {normalizeIndividualDates(formFechas).length > 0 && (
                    <div className="text-xs text-zinc-600 tabular-nums">
                      <span className="text-zinc-400">
                        Vista previa ({normalizeIndividualDates(formFechas).length}{' '}
                        {normalizeIndividualDates(formFechas).length === 1 ? 'fecha' : 'fechas'}):{' '}
                      </span>
                      <span className="font-semibold text-zinc-900">
                        {formatEncounterDatesEs({
                          fechaInicio: normalizeIndividualDates(formFechas)[0],
                          fechaFin:
                            normalizeIndividualDates(formFechas)[
                              normalizeIndividualDates(formFechas).length - 1
                            ],
                          fechas: normalizeIndividualDates(formFechas),
                        })}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">Horario</label>
                  <input
                    type="text"
                    value={formHorario}
                    onChange={(e) => setFormHorario(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Salón o Lugar Específico
                  </label>
                  <input
                    type="text"
                    value={formSedeDetalle}
                    onChange={(e) => setFormSedeDetalle(e.target.value)}
                    placeholder="Salón parroquial..."
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Teléfono de Contacto *
                  </label>
                  <input
                    type="tel"
                    required
                    value={formTelefono}
                    onChange={(e) => setFormTelefono(e.target.value)}
                    placeholder="+58 414-0000000"
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Equipo / Matrimonio Coordinador
                  </label>
                  <input
                    type="text"
                    value={formCoordinadores}
                    onChange={(e) => setFormCoordinadores(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Cupos Totales (Parejas) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    required
                    value={formCuposTotales}
                    onChange={(e) => setFormCuposTotales(Math.max(1, Number(e.target.value) || 1))}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Cupos ya Reservados
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={formCuposTotales}
                    value={formCuposReservados}
                    onChange={(e) =>
                      setFormCuposReservados(Math.max(0, Number(e.target.value) || 0))
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">Estado</label>
                  <select
                    value={formEstado}
                    onChange={(e) => setFormEstado(e.target.value as EpimEncounter['estado'])}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                  >
                    <option value="abierto">Abierto</option>
                    <option value="cerrado">Cerrado (Cupos llenos)</option>
                    <option value="finalizado">Finalizado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700">
                  Información adicional / Requisitos
                </label>
                <input
                  type="text"
                  value={formAporteInfo}
                  onChange={(e) => setFormAporteInfo(e.target.value)}
                  placeholder="Ej. Incluye material formativo y certificado oficial..."
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-zinc-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowEncounterForm(false)}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B9191F]"
                >
                  {editingEncounter ? 'Continuar y guardar' : 'Continuar y registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Mandatory Confirmation Modal */}
      <ConfirmModal
        open={Boolean(pendingConfirm)}
        title={pendingConfirm?.title || ''}
        description={pendingConfirm?.description || ''}
        details={pendingConfirm?.details}
        confirmLabel={pendingConfirm?.confirmLabel}
        variant={pendingConfirm?.variant}
        loading={confirmBusy}
        onConfirm={executePendingConfirm}
        onCancel={() => {
          if (!confirmBusy) setPendingConfirm(null);
        }}
      />
    </div>
  );
};

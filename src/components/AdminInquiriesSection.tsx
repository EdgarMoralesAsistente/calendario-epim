import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckSquare,
  Clock,
  Copy,
  Download,
  Edit3,
  History,
  Kanban,
  List,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  EpimStore,
  Inquiry,
  InquiryChannel,
  InquiryChecklistItem,
  InquiryPriority,
  InquiryStage,
} from '../types/epim.ts';
import {
  getInquiryStageLabel,
  getShortArciprestazgoLabel,
  INQUIRY_STAGES,
  MARACAIBO_ARCIPRESTAZGOS,
  normalizeArciprestazgoName,
  normalizeInquiryRecord,
  normalizeParroquiaName,
} from '../data/maracaiboCatalog.ts';
import {
  addInquiryActivity,
  createAdminInquiry,
  deleteAdminInquiry,
  deleteInquiryActivity,
  updateAdminInquiry,
  updateInquiryStatus,
} from '../services/api.ts';

interface PendingConfirmPayload {
  title: string;
  description: string;
  details?: string[];
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  action: () => Promise<void>;
}

interface AdminInquiriesSectionProps {
  store: EpimStore;
  currentUserEmail?: string | null;
  onStoreChange: (nextStore: EpimStore) => void;
  onNotify: (type: 'success' | 'error', text: string) => void;
  onRequestConfirm: (confirm: PendingConfirmPayload) => void;
}

const PRIORITY_OPTIONS: Array<{
  value: InquiryPriority;
  label: string;
  dotClass: string;
  textClass: string;
}> = [
  {
    value: 'alta',
    label: 'Prioridad alta',
    dotClass: 'bg-[#DC1F26]',
    textClass: 'text-[#DC1F26] font-semibold',
  },
  {
    value: 'media',
    label: 'Prioridad media',
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-700 font-medium',
  },
  {
    value: 'baja',
    label: 'Prioridad baja',
    dotClass: 'bg-zinc-400',
    textClass: 'text-zinc-600 font-medium',
  },
];

const ROLE_OPTIONS: Inquiry['rolRemitente'][] = [
  'Pareja de novios',
  'Sacerdote / Diácono',
  'Agente de Pastoral',
  'Otro',
];

const CHANNEL_OPTIONS: InquiryChannel[] = [
  'Formulario Web',
  'WhatsApp',
  'Llamada telefónica',
  'Correo electrónico',
  'Presencial',
];

function getPriorityMeta(priority?: InquiryPriority) {
  return (
    PRIORITY_OPTIONS.find((p) => p.value === priority) || PRIORITY_OPTIONS[1]
  );
}

function formatDateTimeShortEs(iso?: string): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateShortEs(isoDate?: string): string {
  if (!isoDate) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    const [y, m, d] = isoDate.split('-').map(Number);
    const months = [
      'ene',
      'feb',
      'mar',
      'abr',
      'may',
      'jun',
      'jul',
      'ago',
      'sep',
      'oct',
      'nov',
      'dic',
    ];
    return `${String(d).padStart(2, '0')} ${months[(m || 1) - 1]} ${y}`;
  }
  const dt = new Date(isoDate);
  if (Number.isNaN(dt.getTime())) return isoDate;
  return dt.toLocaleDateString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getTodayIsoLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isFollowUpOverdue(inq: Inquiry, todayIso: string): boolean {
  if (!inq.fechaSeguimiento || inq.etapa === 'atendidas') return false;
  return inq.fechaSeguimiento < todayIso;
}

export const AdminInquiriesSection: React.FC<AdminInquiriesSectionProps> = ({
  store,
  currentUserEmail,
  onStoreChange,
  onNotify,
  onRequestConfirm,
}) => {
  const [viewMode, setViewMode] = useState<'kanban' | 'lista'>('kanban');

  // Multi-filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStage, setFilterStage] = useState<string>('todas'); // 'todas' | 'abiertas' | InquiryStage
  const [filterRole, setFilterRole] = useState<string>('todos');
  const [filterPriority, setFilterPriority] = useState<string>('todas');
  const [filterArc, setFilterArc] = useState<string>('todos');
  const [filterParroquia, setFilterParroquia] = useState<string>('todas');
  const [filterFollowUp, setFilterFollowUp] = useState<string>('todos'); // 'todos' | 'vencidas' | 'con_fecha' | 'mias' | 'sin_asignar'

  // Drag & Drop Kanban State
  const [draggedInquiryId, setDraggedInquiryId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<InquiryStage | null>(null);

  // Selected Card Modal State (Trello Card Back)
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null);
  const [isEditingCard, setIsEditingCard] = useState<boolean>(false);
  const [busyCardAction, setBusyCardAction] = useState<boolean>(false);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);

  // Edit Card Form State inside Modal
  const [editAsunto, setEditAsunto] = useState<string>('');
  const [editNombre, setEditNombre] = useState<string>('');
  const [editRol, setEditRol] = useState<Inquiry['rolRemitente']>('Pareja de novios');
  const [editTelefono, setEditTelefono] = useState<string>('');
  const [editCorreo, setEditCorreo] = useState<string>('');
  const [editCanal, setEditCanal] = useState<InquiryChannel>('Formulario Web');
  const [editArc, setEditArc] = useState<string>('');
  const [editParroquia, setEditParroquia] = useState<string>('');
  const [editMensaje, setEditMensaje] = useState<string>('');
  const [editNotas, setEditNotas] = useState<string>('');
  const [editResponsable, setEditResponsable] = useState<string>('');

  // Quick Checklist & Activity Composer State inside Modal
  const [newChecklistText, setNewChecklistText] = useState<string>('');
  const [activityText, setActivityText] = useState<string>('');
  const [activityType, setActivityType] = useState<'nota' | 'contacto'>('nota');

  // New Manual Inquiry Modal State
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [newStage, setNewStage] = useState<InquiryStage>('nuevas');
  const [newPriority, setNewPriority] = useState<InquiryPriority>('media');
  const [newAsunto, setNewAsunto] = useState<string>('');
  const [newNombre, setNewNombre] = useState<string>('');
  const [newRol, setNewRol] = useState<Inquiry['rolRemitente']>('Pareja de novios');
  const [newTelefono, setNewTelefono] = useState<string>('');
  const [newCorreo, setNewCorreo] = useState<string>('');
  const [newCanal, setNewCanal] = useState<InquiryChannel>('WhatsApp');
  const [newArc, setNewArc] = useState<string>('');
  const [newParroquia, setNewParroquia] = useState<string>('');
  const [newResponsable, setNewResponsable] = useState<string>('');
  const [newFechaSeg, setNewFechaSeg] = useState<string>('');
  const [newMensaje, setNewMensaje] = useState<string>('');
  const [newNotas, setNewNotas] = useState<string>('');
  const [creatingBusy, setCreatingBusy] = useState<boolean>(false);

  const todayIso = useMemo(() => getTodayIsoLocal(), []);

  const normalizedInquiries = useMemo(
    () => store.inquiries.map((i) => normalizeInquiryRecord(i)),
    [store.inquiries]
  );

  const selectedInquiry = useMemo(
    () =>
      selectedInquiryId
        ? normalizedInquiries.find((i) => i.id === selectedInquiryId) || null
        : null,
    [normalizedInquiries, selectedInquiryId]
  );

  // Sync edit form whenever a card is opened
  const hydrateEditFormFromInquiry = useCallback((inq: Inquiry) => {
    setEditAsunto(inq.asunto || '');
    setEditNombre(inq.nombreRemitente || '');
    setEditRol(inq.rolRemitente || 'Pareja de novios');
    setEditTelefono(inq.telefono || '');
    setEditCorreo(inq.correo || '');
    setEditCanal(inq.canalOrigen || 'Formulario Web');
    setEditArc(inq.arciprestazgoInteres || '');
    setEditParroquia(inq.parroquiaInteres || '');
    setEditMensaje(inq.mensaje || '');
    setEditNotas(inq.notasInternas || '');
    setEditResponsable(inq.responsable || '');
  }, []);

  useEffect(() => {
    if (selectedInquiry && !isEditingCard) {
      hydrateEditFormFromInquiry(selectedInquiry);
    }
  }, [selectedInquiry, isEditingCard, hydrateEditFormFromInquiry]);

  const getParroquiasForArc = useCallback((arcName: string) => {
    if (!arcName || arcName === 'todos' || arcName === 'sin_especificar') return [];
    return (
      MARACAIBO_ARCIPRESTAZGOS.find((g) => g.nombre === arcName)?.parroquias || []
    );
  }, []);

  const filterParroquiaOptions = useMemo(() => {
    if (filterArc === 'todos' || filterArc === 'sin_especificar') {
      const all = new Set<string>();
      for (const g of MARACAIBO_ARCIPRESTAZGOS) {
        for (const p of g.parroquias) all.add(p);
      }
      for (const i of normalizedInquiries) {
        if (i.parroquiaInteres) all.add(i.parroquiaInteres);
      }
      return Array.from(all).sort((a, b) =>
        a.localeCompare(b, 'es', { sensitivity: 'base' })
      );
    }
    return getParroquiasForArc(filterArc);
  }, [filterArc, normalizedInquiries, getParroquiasForArc]);

  useEffect(() => {
    if (
      filterParroquia !== 'todas' &&
      !filterParroquiaOptions.includes(filterParroquia)
    ) {
      setFilterParroquia('todas');
    }
  }, [filterParroquia, filterParroquiaOptions]);

  const filteredInquiries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const myEmail = (currentUserEmail || '').trim().toLowerCase();

    return normalizedInquiries.filter((inq) => {
      if (filterStage === 'abiertas' && inq.etapa === 'atendidas') return false;
      if (
        filterStage !== 'todas' &&
        filterStage !== 'abiertas' &&
        inq.etapa !== filterStage
      ) {
        return false;
      }

      if (filterRole !== 'todos' && inq.rolRemitente !== filterRole) return false;
      if (filterPriority !== 'todas' && inq.prioridad !== filterPriority) {
        return false;
      }

      if (filterArc === 'sin_especificar' && inq.arciprestazgoInteres) {
        return false;
      }
      if (
        filterArc !== 'todos' &&
        filterArc !== 'sin_especificar' &&
        inq.arciprestazgoInteres !== filterArc
      ) {
        return false;
      }

      if (filterParroquia !== 'todas' && inq.parroquiaInteres !== filterParroquia) {
        return false;
      }

      if (filterFollowUp === 'vencidas' && !isFollowUpOverdue(inq, todayIso)) {
        return false;
      }
      if (filterFollowUp === 'con_fecha' && !inq.fechaSeguimiento) {
        return false;
      }
      if (filterFollowUp === 'sin_asignar' && inq.responsable) {
        return false;
      }
      if (
        filterFollowUp === 'mias' &&
        (!myEmail || !(inq.responsable || '').toLowerCase().includes(myEmail))
      ) {
        return false;
      }

      if (q) {
        const historyText = (inq.historial || [])
          .map((h) => `${h.autor} ${h.texto}`)
          .join(' ');
        const checklistText = (inq.checklist || [])
          .map((c) => c.texto)
          .join(' ');
        const haystack = [
          inq.asunto,
          inq.nombreRemitente,
          inq.rolRemitente,
          inq.telefono,
          inq.correo,
          inq.arciprestazgoInteres,
          inq.parroquiaInteres,
          inq.mensaje,
          inq.notasInternas,
          inq.responsable,
          inq.canalOrigen,
          historyText,
          checklistText,
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [
    normalizedInquiries,
    searchQuery,
    filterStage,
    filterRole,
    filterPriority,
    filterArc,
    filterParroquia,
    filterFollowUp,
    currentUserEmail,
    todayIso,
  ]);

  const metrics = useMemo(() => {
    let nuevas = 0;
    let enGestion = 0;
    let atendidas = 0;
    let urgentesOVencidas = 0;

    for (const inq of normalizedInquiries) {
      if (inq.etapa === 'nuevas') nuevas += 1;
      else if (inq.etapa === 'atendidas') atendidas += 1;
      else enGestion += 1;

      if (
        inq.etapa !== 'atendidas' &&
        (inq.prioridad === 'alta' || isFollowUpOverdue(inq, todayIso))
      ) {
        urgentesOVencidas += 1;
      }
    }

    return {
      total: normalizedInquiries.length,
      nuevas,
      enGestion,
      atendidas,
      urgentesOVencidas,
    };
  }, [normalizedInquiries, todayIso]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    filterStage !== 'todas' ||
    filterRole !== 'todos' ||
    filterPriority !== 'todas' ||
    filterArc !== 'todos' ||
    filterParroquia !== 'todas' ||
    filterFollowUp !== 'todos';

  const resetFilters = () => {
    setSearchQuery('');
    setFilterStage('todas');
    setFilterRole('todos');
    setFilterPriority('todas');
    setFilterArc('todos');
    setFilterParroquia('todas');
    setFilterFollowUp('todos');
  };

  const openNewModalForStage = (stage: InquiryStage = 'nuevas') => {
    setNewStage(stage);
    setNewPriority('media');
    setNewAsunto('');
    setNewNombre('');
    setNewRol('Pareja de novios');
    setNewTelefono('');
    setNewCorreo('');
    setNewCanal('WhatsApp');
    setNewArc('');
    setNewParroquia('');
    setNewResponsable(currentUserEmail || '');
    setNewFechaSeg('');
    setNewMensaje('');
    setNewNotas('');
    setShowNewModal(true);
  };

  const handleCreateInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNombre.trim() || !newMensaje.trim()) {
      onNotify(
        'error',
        'Por favor indica el nombre del remitente y la descripción de la consulta.'
      );
      return;
    }

    setCreatingBusy(true);
    try {
      const out = await createAdminInquiry({
        asunto: newAsunto.trim() || undefined,
        nombreRemitente: newNombre.trim(),
        rolRemitente: newRol,
        telefono: newTelefono.trim(),
        correo: newCorreo.trim(),
        canalOrigen: newCanal,
        etapa: newStage,
        prioridad: newPriority,
        arciprestazgoInteres: newArc,
        parroquiaInteres: newParroquia,
        responsable: newResponsable.trim(),
        fechaSeguimiento: newFechaSeg,
        mensaje: newMensaje.trim(),
        notasInternas: newNotas.trim(),
      });
      onStoreChange(out.store);
      setShowNewModal(false);
      setSelectedInquiryId(out.inquiry.id);
      setIsEditingCard(false);
      onNotify('success', 'Nueva ficha de consulta creada y sincronizada.');
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'No se pudo registrar la consulta.'
      );
    } finally {
      setCreatingBusy(false);
    }
  };

  const handleMoveStage = async (inq: Inquiry, targetStage: InquiryStage) => {
    if (inq.etapa === targetStage) return;
    setBusyCardAction(true);
    try {
      const out = await updateInquiryStatus(inq.id, { etapa: targetStage });
      onStoreChange(out.store);
      onNotify(
        'success',
        `Ficha movida a «${getInquiryStageLabel(targetStage)}».`
      );
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'No se pudo mover la ficha.'
      );
    } finally {
      setBusyCardAction(false);
    }
  };

  const handleSaveCardEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInquiry) return;
    if (!editNombre.trim() || !editMensaje.trim()) {
      onNotify(
        'error',
        'El nombre del remitente y el mensaje principal no pueden quedar vacíos.'
      );
      return;
    }

    setBusyCardAction(true);
    try {
      const out = await updateAdminInquiry(selectedInquiry.id, {
        asunto: editAsunto.trim(),
        nombreRemitente: editNombre.trim(),
        rolRemitente: editRol,
        telefono: editTelefono.trim(),
        correo: editCorreo.trim(),
        canalOrigen: editCanal,
        arciprestazgoInteres: editArc,
        parroquiaInteres: editParroquia,
        mensaje: editMensaje.trim(),
        notasInternas: editNotas.trim(),
        responsable: editResponsable.trim(),
      });
      onStoreChange(out.store);
      setIsEditingCard(false);
      onNotify('success', 'Cambios guardados en la ficha y registrados en el historial.');
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'Error al guardar los cambios.'
      );
    } finally {
      setBusyCardAction(false);
    }
  };

  const handleQuickFieldUpdate = async (
    inq: Inquiry,
    patch: Partial<Inquiry>,
    successMsg?: string
  ) => {
    setBusyCardAction(true);
    try {
      const out = await updateAdminInquiry(inq.id, patch);
      onStoreChange(out.store);
      if (successMsg) onNotify('success', successMsg);
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'No se pudo actualizar la ficha.'
      );
    } finally {
      setBusyCardAction(false);
    }
  };

  const handleAddChecklistItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInquiry || !newChecklistText.trim()) return;
    const itemText = newChecklistText.trim();
    const nextList: InquiryChecklistItem[] = [
      ...(selectedInquiry.checklist || []),
      {
        id: `chk-${Date.now()}`,
        texto: itemText,
        completado: false,
      },
    ];
    setNewChecklistText('');
    setBusyCardAction(true);
    try {
      const out = await updateAdminInquiry(selectedInquiry.id, {
        checklist: nextList,
        logEntry: {
          tipo: 'checklist',
          texto: `Añadió tarea de seguimiento: «${itemText}».`,
        },
      });
      onStoreChange(out.store);
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'No se pudo añadir la tarea.'
      );
    } finally {
      setBusyCardAction(false);
    }
  };

  const handleToggleChecklistItem = async (
    inq: Inquiry,
    item: InquiryChecklistItem
  ) => {
    const nextCompleted = !item.completado;
    const nextList = (inq.checklist || []).map((c) =>
      c.id === item.id ? { ...c, completado: nextCompleted } : c
    );
    setBusyCardAction(true);
    try {
      const out = await updateAdminInquiry(inq.id, {
        checklist: nextList,
        logEntry: {
          tipo: 'checklist',
          texto: nextCompleted
            ? `Completó tarea: «${item.texto}».`
            : `Reabrió tarea: «${item.texto}».`,
        },
      });
      onStoreChange(out.store);
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'No se pudo actualizar la tarea.'
      );
    } finally {
      setBusyCardAction(false);
    }
  };

  const handleDeleteChecklistItem = async (
    inq: Inquiry,
    item: InquiryChecklistItem
  ) => {
    const nextList = (inq.checklist || []).filter((c) => c.id !== item.id);
    setBusyCardAction(true);
    try {
      const out = await updateAdminInquiry(inq.id, {
        checklist: nextList,
        suppressAutoLog: true,
      });
      onStoreChange(out.store);
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'No se pudo quitar la tarea.'
      );
    } finally {
      setBusyCardAction(false);
    }
  };

  const handleAddActivitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInquiry || !activityText.trim()) return;
    setBusyCardAction(true);
    try {
      const out = await addInquiryActivity(selectedInquiry.id, {
        texto: activityText.trim(),
        tipo: activityType,
      });
      onStoreChange(out.store);
      setActivityText('');
      onNotify('success', 'Gestión registrada en el historial de la ficha.');
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'No se pudo guardar la nota.'
      );
    } finally {
      setBusyCardAction(false);
    }
  };

  const handleRemoveActivityEntry = async (inq: Inquiry, entryId: string) => {
    setBusyCardAction(true);
    try {
      const out = await deleteInquiryActivity(inq.id, entryId);
      onStoreChange(out.store);
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'No se pudo eliminar la nota.'
      );
    } finally {
      setBusyCardAction(false);
    }
  };

  const requestDeleteInquiry = (inq: Inquiry) => {
    onRequestConfirm({
      title: '¿Eliminar permanentemente esta ficha de consulta?',
      description:
        'Se borrarán los datos de la consulta, sus tareas y todo su historial de seguimiento, actualizando también Google Sheets.',
      details: [
        `Asunto: ${inq.asunto || 'Consulta directa'}`,
        `Remitente: ${inq.nombreRemitente} (${inq.rolRemitente})`,
      ],
      confirmLabel: 'Eliminar consulta',
      variant: 'danger',
      action: async () => {
        const out = await deleteAdminInquiry(inq.id);
        if (selectedInquiryId === inq.id) {
          setSelectedInquiryId(null);
          setIsEditingCard(false);
        }
        onStoreChange(out.store);
        onNotify('success', 'Ficha de consulta eliminada.');
      },
    });
  };

  const exportInquiriesCsv = () => {
    const headers = [
      'ID',
      'Etapa',
      'Prioridad',
      'Asunto',
      'Remitente',
      'Rol',
      'Teléfono',
      'Correo',
      'Canal',
      'Arciprestazgo Interés',
      'Parroquia Interés',
      'Responsable',
      'Fecha Seguimiento',
      'Mensaje',
      'Notas Internas',
      'Fecha Recepción',
      'Última Actualización',
    ];
    const rows = filteredInquiries.map((q) => [
      q.id,
      getInquiryStageLabel(q.etapa),
      q.prioridad || 'media',
      q.asunto || '',
      q.nombreRemitente,
      q.rolRemitente,
      q.telefono,
      q.correo,
      q.canalOrigen || 'Formulario Web',
      q.arciprestazgoInteres,
      q.parroquiaInteres,
      q.responsable || '',
      q.fechaSeguimiento || '',
      q.mensaje,
      q.notasInternas || '',
      q.createdAt,
      q.updatedAt || q.createdAt,
    ]);
    const csv =
      '\uFEFF' +
      [headers, ...rows]
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Consultas_Directas_EPIM_${todayIso}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyPhone = async (phone: string, id: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedPhoneId(id);
      setTimeout(() => {
        setCopiedPhoneId((prev) => (prev === id ? null : prev));
      }, 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Workspace Header & KPI Summary */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-col gap-4 border-b border-zinc-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-zinc-900">
              Consultas Directas · Gestión y Seguimiento
            </h2>
            <p className="mt-1 max-w-2xl text-xs sm:text-sm text-zinc-600">
              Organiza cada consulta de novios, párrocos y agentes de pastoral en fichas con bitácora completa de llamadas, notas internas, tareas y flujo Kanban sincronizado con Google Sheets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={exportInquiriesCsv}
              disabled={filteredInquiries.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar CSV
            </button>

            <button
              type="button"
              onClick={() => openNewModalForStage('nuevas')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#DC1F26] px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-[#B9191F] whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              Nueva consulta
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => setFilterStage(filterStage === 'nuevas' ? 'todas' : 'nuevas')}
            className={`rounded-lg border p-3.5 text-left transition-colors ${
              filterStage === 'nuevas'
                ? 'border-[#DC1F26] bg-[#FEF2F2]/60'
                : 'border-zinc-200 bg-zinc-50/50 hover:bg-zinc-50'
            }`}
          >
            <p className="text-xs text-zinc-500">Recibidas por revisar</p>
            <p className="mt-1 font-mono text-xl font-bold text-[#DC1F26] tabular-nums">
              {metrics.nuevas}
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              setFilterStage(
                filterStage === 'en_seguimiento' ? 'todas' : 'en_seguimiento'
              )
            }
            className={`rounded-lg border p-3.5 text-left transition-colors ${
              filterStage === 'en_seguimiento'
                ? 'border-zinc-900 bg-zinc-100/70'
                : 'border-zinc-200 bg-zinc-50/50 hover:bg-zinc-50'
            }`}
          >
            <p className="text-xs text-zinc-500">En gestión activa</p>
            <p className="mt-1 font-mono text-xl font-bold text-zinc-900 tabular-nums">
              {metrics.enGestion}
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              setFilterStage(filterStage === 'atendidas' ? 'todas' : 'atendidas')
            }
            className={`rounded-lg border p-3.5 text-left transition-colors ${
              filterStage === 'atendidas'
                ? 'border-emerald-600 bg-emerald-50/50'
                : 'border-zinc-200 bg-zinc-50/50 hover:bg-zinc-50'
            }`}
          >
            <p className="text-xs text-zinc-500">Atendidas y resueltas</p>
            <p className="mt-1 font-mono text-xl font-bold text-emerald-700 tabular-nums">
              {metrics.atendidas}
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              setFilterPriority(filterPriority === 'alta' ? 'todas' : 'alta')
            }
            className={`rounded-lg border p-3.5 text-left transition-colors ${
              filterPriority === 'alta'
                ? 'border-amber-500 bg-amber-50/50'
                : 'border-zinc-200 bg-zinc-50/50 hover:bg-zinc-50'
            }`}
          >
            <p className="text-xs text-zinc-500">Prioridad alta o vencidas</p>
            <p className="mt-1 font-mono text-xl font-bold text-zinc-900 tabular-nums">
              {metrics.urgentesOVencidas}
            </p>
          </button>
        </div>

        {/* Multi-Filter Bar & View Mode Switcher */}
        <div className="mt-5 space-y-3 border-t border-zinc-100 pt-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, asunto, teléfono, parroquia, notas o historial..."
                className="w-full rounded-lg border border-zinc-200 bg-white py-2 pr-3 pl-9 text-xs sm:text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#DC1F26] focus:outline-none"
              />
            </div>

            {/* Segmented View Switcher: Kanban vs Lista */}
            <div className="flex items-center justify-between gap-3 sm:justify-end shrink-0">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Limpiar filtros
                </button>
              )}

              <div className="inline-flex rounded-lg bg-zinc-100 p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('kanban')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    viewMode === 'kanban'
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <Kanban className="h-3.5 w-3.5" />
                  Vista Kanban
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('lista')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    viewMode === 'lista'
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <List className="h-3.5 w-3.5" />
                  Vista Lista
                </button>
              </div>
            </div>
          </div>

          {/* Detailed Filters Grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-600">
                Etapa
              </label>
              <select
                value={filterStage}
                onChange={(e) => setFilterStage(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
              >
                <option value="todas">Todas las etapas</option>
                <option value="abiertas">Solo abiertas (sin cerrar)</option>
                {INQUIRY_STAGES.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.shortLabel}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600">
                Perfil remitente
              </label>
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
              >
                <option value="todos">Todos los perfiles</option>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600">
                Prioridad
              </label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
              >
                <option value="todas">Todas las prioridades</option>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600">
                Arciprestazgo
              </label>
              <select
                value={filterArc}
                onChange={(e) => {
                  setFilterArc(e.target.value);
                  setFilterParroquia('todas');
                }}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
              >
                <option value="todos">Todos los Arciprestazgos</option>
                <option value="sin_especificar">Sin Arciprestazgo indicado</option>
                {MARACAIBO_ARCIPRESTAZGOS.map((g) => (
                  <option key={g.nombre} value={g.nombre}>
                    {g.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600">
                Parroquia de interés
              </label>
              <select
                value={filterParroquia}
                onChange={(e) => setFilterParroquia(e.target.value)}
                disabled={filterArc === 'sin_especificar'}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 focus:border-[#DC1F26] focus:outline-none disabled:bg-zinc-100 disabled:text-zinc-400"
              >
                <option value="todas">Todas las Parroquias</option>
                {filterParroquiaOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-600">
                Seguimiento y asignación
              </label>
              <select
                value={filterFollowUp}
                onChange={(e) => setFilterFollowUp(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
              >
                <option value="todos">Todas las fichas</option>
                <option value="vencidas">Con seguimiento vencido</option>
                <option value="con_fecha">Con fecha programada</option>
                <option value="sin_asignar">Sin responsable asignado</option>
                {currentUserEmail && (
                  <option value="mias">Asignadas a mi correo</option>
                )}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-zinc-500 tabular-nums">
            <span>
              Mostrando <strong className="text-zinc-900">{filteredInquiries.length}</strong>{' '}
              de {metrics.total} {metrics.total === 1 ? 'consulta' : 'consultas'}
            </span>
            {viewMode === 'kanban' && (
              <span>
                Arrastra una ficha entre columnas o haz clic sobre ella para abrir su historial completo.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────── */}
      {/* KANBAN BOARD VIEW (Trello-style Columns + Cards)               */}
      {/* ────────────────────────────────────────────────────────────── */}
      {viewMode === 'kanban' ? (
        <div className="flex flex-col gap-4 md:flex-row md:overflow-x-auto md:pb-3 items-stretch md:items-start">
          {INQUIRY_STAGES.map((stage, stageIdx) => {
            const stageCards = filteredInquiries.filter(
              (i) => (i.etapa || 'nuevas') === stage.id
            );
            const isDropTarget = dragOverStage === stage.id;
            const prevStage =
              stageIdx > 0 ? INQUIRY_STAGES[stageIdx - 1].id : null;
            const nextStage =
              stageIdx < INQUIRY_STAGES.length - 1
                ? INQUIRY_STAGES[stageIdx + 1].id
                : null;

            return (
              <div
                key={stage.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverStage !== stage.id) {
                    setDragOverStage(stage.id);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverStage === stage.id) {
                    setDragOverStage(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverStage(null);
                  const droppedId =
                    e.dataTransfer.getData('text/plain') || draggedInquiryId;
                  setDraggedInquiryId(null);
                  if (!droppedId) return;
                  const found = normalizedInquiries.find(
                    (item) => item.id === droppedId
                  );
                  if (found && found.etapa !== stage.id) {
                    handleMoveStage(found, stage.id);
                  }
                }}
                className={`flex flex-col rounded-xl border p-3 transition-colors md:w-[278px] md:shrink-0 xl:flex-1 xl:min-w-[248px] ${
                  isDropTarget
                    ? 'border-[#DC1F26] bg-[#FEF2F2]/60'
                    : 'border-zinc-200 bg-zinc-100/80'
                }`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between gap-2 px-1 pb-2.5">
                  <div className="min-w-0">
                    <h3 className="font-display text-xs sm:text-sm font-bold text-zinc-900 truncate">
                      {stage.shortLabel}
                    </h3>
                    <p className="text-[11px] text-zinc-500 truncate">
                      {stage.description}
                    </p>
                  </div>
                  <span className="font-mono text-xs font-bold text-zinc-700 tabular-nums shrink-0">
                    {stageCards.length}
                  </span>
                </div>

                {/* Cards Stack */}
                <div className="space-y-2.5 min-h-[76px]">
                  {stageCards.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-zinc-300/90 bg-white/50 px-3 py-6 text-center text-xs text-zinc-400">
                      Sin fichas en esta etapa
                    </div>
                  ) : (
                    stageCards.map((inq) => {
                      const prio = getPriorityMeta(inq.prioridad);
                      const checklistTotal = inq.checklist?.length || 0;
                      const checklistDone =
                        inq.checklist?.filter((c) => c.completado).length || 0;
                      const historyCount = inq.historial?.length || 0;
                      const overdue = isFollowUpOverdue(inq, todayIso);

                      return (
                        <article
                          key={inq.id}
                          draggable
                          onDragStart={(e) => {
                            setDraggedInquiryId(inq.id);
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', inq.id);
                          }}
                          onDragEnd={() => {
                            setDraggedInquiryId(null);
                            setDragOverStage(null);
                          }}
                          onClick={() => {
                            setSelectedInquiryId(inq.id);
                            setIsEditingCard(false);
                          }}
                          className={`group rounded-lg border border-zinc-200 bg-white p-3.5 transition-all hover:border-zinc-300 hover:shadow-xs cursor-pointer ${
                            draggedInquiryId === inq.id ? 'opacity-50' : ''
                          }`}
                        >
                          {/* Unboxed Priority Dot + Role Kicker */}
                          <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                            <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
                              <span
                                className={`h-2 w-2 rounded-full shrink-0 ${prio.dotClass}`}
                                aria-hidden="true"
                              />
                              <span className={prio.textClass}>
                                {inq.prioridad === 'alta'
                                  ? 'Alta'
                                  : inq.prioridad === 'baja'
                                  ? 'Baja'
                                  : 'Media'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="truncate">{inq.rolRemitente}</span>
                            </span>
                          </div>

                          {/* Card Title & Sender */}
                          <h4 className="mt-1.5 font-display text-sm font-bold leading-snug text-zinc-900 line-clamp-2">
                            {inq.asunto || inq.nombreRemitente}
                          </h4>
                          <p className="mt-0.5 text-xs font-medium text-zinc-700 truncate">
                            {inq.nombreRemitente}
                          </p>

                          {/* Message Excerpt */}
                          <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 line-clamp-2">
                            {inq.mensaje}
                          </p>

                          {/* Optional Parish / Notes Context */}
                          {(inq.parroquiaInteres || inq.arciprestazgoInteres) && (
                            <p className="mt-2 truncate text-[11px] font-medium text-zinc-600">
                              {inq.parroquiaInteres ||
                                getShortArciprestazgoLabel(inq.arciprestazgoInteres)}
                            </p>
                          )}

                          {inq.responsable && (
                            <p className="mt-1 truncate text-[11px] text-zinc-500">
                              Resp: {inq.responsable}
                            </p>
                          )}

                          {/* Trello Card Footer Indicators + Quick Stage Arrows */}
                          <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-100 pt-2.5 text-[11px] text-zinc-500 tabular-nums">
                            <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                              {inq.fechaSeguimiento ? (
                                <span
                                  className={`inline-flex items-center gap-1 ${
                                    overdue
                                      ? 'font-semibold text-[#DC1F26]'
                                      : 'text-zinc-600'
                                  }`}
                                  title={
                                    overdue
                                      ? 'Seguimiento vencido'
                                      : 'Próximo seguimiento'
                                  }
                                >
                                  <Calendar className="h-3 w-3 shrink-0" />
                                  {formatDateShortEs(inq.fechaSeguimiento)}
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1"
                                  title="Fecha de recepción"
                                >
                                  <Clock className="h-3 w-3 shrink-0" />
                                  {formatDateShortEs(inq.createdAt)}
                                </span>
                              )}

                              {checklistTotal > 0 && (
                                <span
                                  className={`inline-flex items-center gap-1 ${
                                    checklistDone === checklistTotal
                                      ? 'font-semibold text-emerald-700'
                                      : ''
                                  }`}
                                  title="Tareas de seguimiento"
                                >
                                  <CheckSquare className="h-3 w-3 shrink-0" />
                                  {checklistDone}/{checklistTotal}
                                </span>
                              )}

                              {historyCount > 0 && (
                                <span
                                  className="inline-flex items-center gap-1"
                                  title="Registros en el historial"
                                >
                                  <MessageSquare className="h-3 w-3 shrink-0" />
                                  {historyCount}
                                </span>
                              )}
                            </div>

                            {/* Quick Stage Move Controls (Stop propagation so card modal doesn't open) */}
                            <div
                              className="flex items-center gap-1 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {prevStage && (
                                <button
                                  type="button"
                                  disabled={busyCardAction}
                                  onClick={() => handleMoveStage(inq, prevStage)}
                                  title={`Mover a ${getInquiryStageLabel(prevStage)}`}
                                  className="rounded border border-zinc-200 p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40"
                                >
                                  <ArrowLeft className="h-3 w-3" />
                                </button>
                              )}
                              {nextStage && (
                                <button
                                  type="button"
                                  disabled={busyCardAction}
                                  onClick={() => handleMoveStage(inq, nextStage)}
                                  title={`Avanzar a ${getInquiryStageLabel(nextStage)}`}
                                  className="rounded border border-zinc-200 p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40"
                                >
                                  <ArrowRight className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>

                {/* Add Card to This Column */}
                <button
                  type="button"
                  onClick={() => openNewModalForStage(stage.id)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-200/70 hover:text-zinc-900"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Añadir ficha aquí
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        /* ────────────────────────────────────────────────────────────── */
        /* DETAILED LIST VIEW                                             */
        /* ────────────────────────────────────────────────────────────── */
        <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
          {filteredInquiries.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-zinc-700">
                No hay consultas que coincidan con los filtros seleccionados.
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Ajusta los criterios de búsqueda o registra una nueva consulta manualmente.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm border-collapse">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-600">
                    <th className="py-3 px-4">Ficha y Remitente</th>
                    <th className="py-3 px-3">Parroquia / Interés</th>
                    <th className="py-3 px-3">Etapa Kanban</th>
                    <th className="py-3 px-3">Prioridad y Seguimiento</th>
                    <th className="py-3 px-3">Bitácora</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredInquiries.map((inq) => {
                    const prio = getPriorityMeta(inq.prioridad);
                    const overdue = isFollowUpOverdue(inq, todayIso);
                    const cleanDigits = inq.telefono.replace(/[^\d]/g, '');

                    return (
                      <tr
                        key={inq.id}
                        onClick={() => {
                          setSelectedInquiryId(inq.id);
                          setIsEditingCard(false);
                        }}
                        className="align-top hover:bg-zinc-50/80 cursor-pointer"
                      >
                        <td className="py-3.5 px-4 max-w-[290px]">
                          <p className="font-semibold text-zinc-900 line-clamp-1">
                            {inq.asunto || inq.nombreRemitente}
                          </p>
                          <p className="mt-0.5 text-xs text-zinc-700">
                            {inq.nombreRemitente} ·{' '}
                            <span className="text-zinc-500">{inq.rolRemitente}</span>
                          </p>
                          <p className="mt-1 text-xs text-zinc-500 line-clamp-2">
                            {inq.mensaje}
                          </p>
                        </td>

                        <td className="py-3.5 px-3 text-xs text-zinc-700">
                          {inq.parroquiaInteres ? (
                            <>
                              <p className="font-medium text-zinc-900">
                                {inq.parroquiaInteres}
                              </p>
                              <p className="mt-0.5 text-zinc-500">
                                {inq.arciprestazgoInteres}
                              </p>
                            </>
                          ) : inq.arciprestazgoInteres ? (
                            <p>{inq.arciprestazgoInteres}</p>
                          ) : (
                            <span className="text-zinc-400">General</span>
                          )}
                        </td>

                        <td
                          className="py-3.5 px-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            value={inq.etapa || 'nuevas'}
                            disabled={busyCardAction}
                            onChange={(e) =>
                              handleMoveStage(inq, e.target.value as InquiryStage)
                            }
                            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 focus:border-[#DC1F26] focus:outline-none"
                          >
                            {INQUIRY_STAGES.map((st) => (
                              <option key={st.id} value={st.id}>
                                {st.shortLabel}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="py-3.5 px-3 text-xs tabular-nums">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`h-2 w-2 rounded-full ${prio.dotClass}`}
                            />
                            <span className={prio.textClass}>{prio.label}</span>
                          </div>
                          {inq.fechaSeguimiento ? (
                            <p
                              className={`mt-1 ${
                                overdue
                                  ? 'font-semibold text-[#DC1F26]'
                                  : 'text-zinc-600'
                              }`}
                            >
                              Seg: {formatDateShortEs(inq.fechaSeguimiento)}
                            </p>
                          ) : (
                            <p className="mt-1 text-zinc-400">
                              Recibida: {formatDateShortEs(inq.createdAt)}
                            </p>
                          )}
                          {inq.responsable && (
                            <p className="mt-0.5 text-zinc-500 truncate max-w-[160px]">
                              Resp: {inq.responsable}
                            </p>
                          )}
                        </td>

                        <td className="py-3.5 px-3 text-xs text-zinc-600 tabular-nums whitespace-nowrap">
                          <p>{inq.historial?.length || 1} reg.</p>
                          {(inq.checklist?.length || 0) > 0 && (
                            <p className="mt-0.5 text-zinc-500">
                              Tareas:{' '}
                              {inq.checklist?.filter((c) => c.completado).length}/
                              {inq.checklist?.length}
                            </p>
                          )}
                        </td>

                        <td
                          className="py-3.5 px-4 text-right whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-2.5 text-xs">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedInquiryId(inq.id);
                                setIsEditingCard(false);
                              }}
                              className="font-semibold text-zinc-900 hover:text-[#DC1F26] hover:underline"
                            >
                              Abrir ficha
                            </button>
                            {cleanDigits && (
                              <a
                                href={`https://wa.me/${cleanDigits}?text=${encodeURIComponent(
                                  `Hola ${inq.nombreRemitente}, paz y bien. Le escribimos desde el Secretariado de Pastoral Familiar de la Arquidiócesis de Maracaibo respecto a su consulta sobre los EPIM.`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-zinc-600 underline hover:text-zinc-900"
                              >
                                WhatsApp
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={() => requestDeleteInquiry(inq)}
                              className="text-zinc-400 hover:text-[#DC1F26]"
                              title="Eliminar ficha"
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

      {/* ────────────────────────────────────────────────────────────── */}
      {/* TRELLO-STYLE CARD DETAIL MODAL (Edit, Checklist, Full History) */}
      {/* ────────────────────────────────────────────────────────────── */}
      {selectedInquiry && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center bg-zinc-950/50 p-3 sm:p-6 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setSelectedInquiryId(null);
            setIsEditingCard(false);
          }}
        >
          <div
            className="my-4 w-full max-w-4xl rounded-xl border border-zinc-200 bg-white shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Crimson Hairline */}
            <div className="h-1.5 w-full bg-[#DC1F26]" />

            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-6 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 tabular-nums">
                  <span>
                    En columna:{' '}
                    <strong className="text-zinc-900">
                      {getInquiryStageLabel(selectedInquiry.etapa)}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedInquiry.canalOrigen || 'Formulario Web'}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Recibida: {formatDateTimeShortEs(selectedInquiry.createdAt)}
                  </span>
                </div>

                <h3 className="mt-1 font-display text-lg sm:text-xl font-bold text-zinc-900">
                  {selectedInquiry.asunto || selectedInquiry.nombreRemitente}
                </h3>
                <p className="mt-0.5 text-xs sm:text-sm text-zinc-600">
                  Remitente:{' '}
                  <strong className="text-zinc-900">
                    {selectedInquiry.nombreRemitente}
                  </strong>{' '}
                  · {selectedInquiry.rolRemitente}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedInquiryId(null);
                  setIsEditingCard(false);
                }}
                className="rounded-lg border border-zinc-200 p-2 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 shrink-0"
                aria-label="Cerrar ficha"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Two-Column Body (Trello Layout) */}
            <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-12">
              {/* LEFT COLUMN: Contact, Details/Editor, Checklist, Full Activity Log */}
              <div className="space-y-6 lg:col-span-8">
                {/* 1. Direct Contact Bar */}
                <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 text-xs">
                  {selectedInquiry.telefono ? (
                    <>
                      <a
                        href={`tel:${selectedInquiry.telefono}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 font-mono font-medium text-zinc-900 hover:border-[#DC1F26] tabular-nums"
                      >
                        <Phone className="h-3.5 w-3.5 text-[#DC1F26]" />
                        {selectedInquiry.telefono}
                      </a>

                      <button
                        type="button"
                        onClick={() =>
                          copyPhone(selectedInquiry.telefono, selectedInquiry.id)
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copiedPhoneId === selectedInquiry.id
                          ? 'Copiado'
                          : 'Copiar'}
                      </button>

                      {selectedInquiry.telefono.replace(/[^\d]/g, '') && (
                        <a
                          href={`https://wa.me/${selectedInquiry.telefono.replace(
                            /[^\d]/g,
                            ''
                          )}?text=${encodeURIComponent(
                            `Hola ${selectedInquiry.nombreRemitente}, paz y bien. Le escribimos desde el Secretariado de Pastoral Familiar de la Arquidiócesis de Maracaibo en relación con su consulta sobre los Encuentros EPIM.`
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 font-semibold text-white hover:bg-zinc-800"
                        >
                          Responder por WhatsApp
                        </a>
                      )}
                    </>
                  ) : (
                    <span className="text-zinc-500">Sin teléfono registrado</span>
                  )}

                  {selectedInquiry.correo && (
                    <a
                      href={`mailto:${selectedInquiry.correo}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      <Mail className="h-3.5 w-3.5 text-zinc-500" />
                      {selectedInquiry.correo}
                    </a>
                  )}
                </div>

                {/* 2. Card Content & Full Editor */}
                <div className="rounded-xl border border-zinc-200 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-display text-sm font-bold text-zinc-900">
                      Información de la Consulta y Notas Internas
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isEditingCard) {
                          hydrateEditFormFromInquiry(selectedInquiry);
                        }
                        setIsEditingCard((prev) => !prev);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      {isEditingCard ? 'Cancelar edición' : 'Editar ficha'}
                    </button>
                  </div>

                  {isEditingCard ? (
                    <form onSubmit={handleSaveCardEdits} className="space-y-3.5 text-xs">
                      <div>
                        <label className="block font-semibold text-zinc-700">
                          Título / Asunto de la ficha
                        </label>
                        <input
                          type="text"
                          value={editAsunto}
                          onChange={(e) => setEditAsunto(e.target.value)}
                          placeholder="Ej. Solicitud de cupo o aval parroquial..."
                          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block font-semibold text-zinc-700">
                            Nombre del remitente *
                          </label>
                          <input
                            type="text"
                            required
                            value={editNombre}
                            onChange={(e) => setEditNombre(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-zinc-700">
                            Perfil / Rol
                          </label>
                          <select
                            value={editRol}
                            onChange={(e) =>
                              setEditRol(e.target.value as Inquiry['rolRemitente'])
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                          <label className="block font-semibold text-zinc-700">
                            Teléfono
                          </label>
                          <input
                            type="text"
                            value={editTelefono}
                            onChange={(e) => setEditTelefono(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-zinc-900 tabular-nums focus:border-[#DC1F26] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-zinc-700">
                            Correo electrónico
                          </label>
                          <input
                            type="email"
                            value={editCorreo}
                            onChange={(e) => setEditCorreo(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-zinc-700">
                            Canal de origen
                          </label>
                          <select
                            value={editCanal}
                            onChange={(e) =>
                              setEditCanal(e.target.value as InquiryChannel)
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                          >
                            {CHANNEL_OPTIONS.map((ch) => (
                              <option key={ch} value={ch}>
                                {ch}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block font-semibold text-zinc-700">
                            Arciprestazgo de interés
                          </label>
                          <select
                            value={editArc}
                            onChange={(e) => {
                              setEditArc(e.target.value);
                              setEditParroquia('');
                            }}
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                          >
                            <option value="">Sin especificar</option>
                            {MARACAIBO_ARCIPRESTAZGOS.map((g) => (
                              <option key={g.nombre} value={g.nombre}>
                                {g.nombre}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block font-semibold text-zinc-700">
                            Parroquia de interés
                          </label>
                          <select
                            value={editParroquia}
                            disabled={!editArc}
                            onChange={(e) => setEditParroquia(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none disabled:bg-zinc-100 disabled:text-zinc-400"
                          >
                            <option value="">
                              {editArc
                                ? 'Sin especificar / Todas'
                                : 'Seleccione primero Arciprestazgo...'}
                            </option>
                            {editParroquia &&
                              !getParroquiasForArc(editArc).includes(
                                editParroquia
                              ) && (
                                <option value={editParroquia}>
                                  {editParroquia}
                                </option>
                              )}
                            {getParroquiasForArc(editArc).map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block font-semibold text-zinc-700">
                          Mensaje / Planteamiento de la consulta *
                        </label>
                        <textarea
                          rows={3}
                          required
                          value={editMensaje}
                          onChange={(e) => setEditMensaje(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block font-semibold text-zinc-700">
                          Notas internas y acuerdos pastorales
                        </label>
                        <textarea
                          rows={3}
                          value={editNotas}
                          onChange={(e) => setEditNotas(e.target.value)}
                          placeholder="Registra resumen de acuerdos, parroquia asignada, observaciones..."
                          className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setIsEditingCard(false)}
                          className="rounded-lg border border-zinc-200 px-3.5 py-2 font-semibold text-zinc-700 hover:bg-zinc-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={busyCardAction}
                          className="rounded-lg bg-[#DC1F26] px-4 py-2 font-semibold text-white hover:bg-[#B9191F] disabled:opacity-50"
                        >
                          {busyCardAction ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-3 text-xs sm:text-sm">
                      <div>
                        <p className="text-[11px] font-semibold text-zinc-500">
                          Mensaje recibido
                        </p>
                        <p className="mt-1 whitespace-pre-line leading-relaxed text-zinc-800">
                          {selectedInquiry.mensaje}
                        </p>
                      </div>

                      {(selectedInquiry.arciprestazgoInteres ||
                        selectedInquiry.parroquiaInteres) && (
                        <div className="border-t border-zinc-100 pt-2.5 text-xs text-zinc-600">
                          <span className="font-semibold text-zinc-800">
                            Ubicación de interés:{' '}
                          </span>
                          {[
                            selectedInquiry.arciprestazgoInteres,
                            selectedInquiry.parroquiaInteres,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      )}

                      <div className="border-t border-zinc-100 pt-2.5">
                        <p className="text-[11px] font-semibold text-zinc-500">
                          Notas internas / Resumen de acuerdos
                        </p>
                        {selectedInquiry.notasInternas ? (
                          <p className="mt-1 whitespace-pre-line text-xs sm:text-sm leading-relaxed text-zinc-800">
                            {selectedInquiry.notasInternas}
                          </p>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              hydrateEditFormFromInquiry(selectedInquiry);
                              setIsEditingCard(true);
                            }}
                            className="mt-1 text-xs text-zinc-500 underline hover:text-zinc-800"
                          >
                            + Añadir notas internas o acuerdos sobre esta consulta
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Trello-style Follow-up Checklist */}
                <div className="rounded-xl border border-zinc-200 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="h-4 w-4 text-[#DC1F26]" />
                      <h4 className="font-display text-sm font-bold text-zinc-900">
                        Lista de Tareas y Pasos de Seguimiento
                      </h4>
                    </div>
                    {(selectedInquiry.checklist?.length || 0) > 0 && (
                      <span className="font-mono text-xs text-zinc-600 tabular-nums">
                        {
                          selectedInquiry.checklist?.filter((c) => c.completado)
                            .length
                        }{' '}
                        de {selectedInquiry.checklist?.length} completadas
                      </span>
                    )}
                  </div>

                  {(selectedInquiry.checklist?.length || 0) > 0 && (
                    <ul className="divide-y divide-zinc-100">
                      {selectedInquiry.checklist?.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-3 py-2 text-xs sm:text-sm"
                        >
                          <label className="flex items-start gap-2.5 cursor-pointer min-w-0">
                            <input
                              type="checkbox"
                              checked={item.completado}
                              disabled={busyCardAction}
                              onChange={() =>
                                handleToggleChecklistItem(selectedInquiry, item)
                              }
                              className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-[#DC1F26]"
                            />
                            <span
                              className={
                                item.completado
                                  ? 'line-through text-zinc-400'
                                  : 'text-zinc-800'
                              }
                            >
                              {item.texto}
                            </span>
                          </label>
                          <button
                            type="button"
                            disabled={busyCardAction}
                            onClick={() =>
                              handleDeleteChecklistItem(selectedInquiry, item)
                            }
                            className="text-zinc-400 hover:text-[#DC1F26] shrink-0"
                            title="Quitar tarea"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <form
                    onSubmit={handleAddChecklistItem}
                    className="flex items-center gap-2 pt-1"
                  >
                    <input
                      type="text"
                      value={newChecklistText}
                      onChange={(e) => setNewChecklistText(e.target.value)}
                      placeholder="Añadir paso (ej. Confirmar cupo con párroco, enviar planilla...)"
                      className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={busyCardAction || !newChecklistText.trim()}
                      className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      Añadir tarea
                    </button>
                  </form>
                </div>

                {/* 4. Complete Activity & Audit History Stream (Trello Bitácora) */}
                <div className="rounded-xl border border-zinc-200 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-[#DC1F26]" />
                      <h4 className="font-display text-sm font-bold text-zinc-900">
                        Actividad e Historial Completo
                      </h4>
                    </div>
                    <span className="font-mono text-xs text-zinc-500 tabular-nums">
                      {selectedInquiry.historial?.length || 0} registros
                    </span>
                  </div>

                  {/* New Note / Contact Log Composer */}
                  <form
                    onSubmit={handleAddActivitySubmit}
                    className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-zinc-700">
                        Registrar nueva gestión o comentario en la bitácora:
                      </span>
                      <div className="inline-flex rounded-md bg-zinc-200/70 p-0.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setActivityType('nota')}
                          className={`rounded px-2.5 py-1 font-medium transition-colors ${
                            activityType === 'nota'
                              ? 'bg-white text-zinc-900 shadow-xs'
                              : 'text-zinc-600 hover:text-zinc-900'
                          }`}
                        >
                          Nota interna
                        </button>
                        <button
                          type="button"
                          onClick={() => setActivityType('contacto')}
                          className={`rounded px-2.5 py-1 font-medium transition-colors ${
                            activityType === 'contacto'
                              ? 'bg-white text-zinc-900 shadow-xs'
                              : 'text-zinc-600 hover:text-zinc-900'
                          }`}
                        >
                          Llamada / WhatsApp
                        </button>
                      </div>
                    </div>

                    <textarea
                      rows={2}
                      value={activityText}
                      onChange={(e) => setActivityText(e.target.value)}
                      placeholder={
                        activityType === 'contacto'
                          ? 'Ej. Se conversó por WhatsApp con los novios; asistirán al EPIM de octubre en La Consolación...'
                          : 'Escribe una observación, acuerdo o seguimiento interno...'
                      }
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs sm:text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                    />

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={busyCardAction || !activityText.trim()}
                        className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                      >
                        Guardar en historial
                      </button>
                    </div>
                  </form>

                  {/* Reverse-Chronological Timeline */}
                  <ol className="divide-y divide-zinc-100">
                    {[...(selectedInquiry.historial || [])]
                      .reverse()
                      .map((entry) => {
                        const isManualNote =
                          entry.tipo === 'nota' || entry.tipo === 'contacto';
                        return (
                          <li key={entry.id} className="py-3 first:pt-1 last:pb-1">
                            <div className="flex items-start justify-between gap-2 text-[11px] text-zinc-500 tabular-nums">
                              <div>
                                <span className="font-semibold text-zinc-900">
                                  {entry.autor}
                                </span>
                                {entry.tipo === 'contacto' && (
                                  <span className="text-[#DC1F26] font-semibold">
                                    {' '}
                                    · Contacto directo
                                  </span>
                                )}
                                {entry.tipo === 'nota' && (
                                  <span className="text-zinc-700 font-medium">
                                    {' '}
                                    · Nota interna
                                  </span>
                                )}
                                <span>
                                  {' '}
                                  · {formatDateTimeShortEs(entry.createdAt)}
                                </span>
                              </div>

                              {isManualNote && (
                                <button
                                  type="button"
                                  disabled={busyCardAction}
                                  onClick={() =>
                                    handleRemoveActivityEntry(
                                      selectedInquiry,
                                      entry.id
                                    )
                                  }
                                  className="text-zinc-400 hover:text-[#DC1F26]"
                                  title="Borrar esta nota"
                                >
                                  Borrar
                                </button>
                              )}
                            </div>

                            <p
                              className={`mt-1 whitespace-pre-line text-xs sm:text-sm leading-relaxed ${
                                isManualNote ? 'text-zinc-900' : 'text-zinc-600'
                              }`}
                            >
                              {entry.texto}
                            </p>
                          </li>
                        );
                      })}
                  </ol>
                </div>
              </div>

              {/* RIGHT SIDEBAR: Card Stage, Priority, Responsible, Follow-up Date, Delete */}
              <div className="space-y-4 lg:col-span-4">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 space-y-4 text-xs">
                  <h4 className="font-display text-xs font-bold text-zinc-900">
                    Estado y Seguimiento de la Ficha
                  </h4>

                  {/* Stage Selector */}
                  <div>
                    <label className="block font-semibold text-zinc-700">
                      Columna Kanban (Etapa)
                    </label>
                    <select
                      value={selectedInquiry.etapa || 'nuevas'}
                      disabled={busyCardAction}
                      onChange={(e) =>
                        handleMoveStage(
                          selectedInquiry,
                          e.target.value as InquiryStage
                        )
                      }
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                    >
                      {INQUIRY_STAGES.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Priority Selector */}
                  <div>
                    <label className="block font-semibold text-zinc-700">
                      Prioridad de atención
                    </label>
                    <select
                      value={selectedInquiry.prioridad || 'media'}
                      disabled={busyCardAction}
                      onChange={(e) =>
                        handleQuickFieldUpdate(
                          selectedInquiry,
                          { prioridad: e.target.value as InquiryPriority },
                          'Prioridad actualizada.'
                        )
                      }
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                    >
                      <option value="alta">Alta</option>
                      <option value="media">Media</option>
                      <option value="baja">Baja</option>
                    </select>
                  </div>

                  {/* Responsible Coordinator */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-zinc-700">
                        Responsable asignado
                      </label>
                      {currentUserEmail &&
                        selectedInquiry.responsable !== currentUserEmail && (
                          <button
                            type="button"
                            disabled={busyCardAction}
                            onClick={() => {
                              setEditResponsable(currentUserEmail);
                              handleQuickFieldUpdate(
                                selectedInquiry,
                                { responsable: currentUserEmail },
                                'Ficha asignada a tu correo.'
                              );
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#DC1F26] hover:underline"
                          >
                            <UserCheck className="h-3 w-3" />
                            Asignarme
                          </button>
                        )}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <input
                        type="text"
                        value={editResponsable}
                        onChange={(e) => setEditResponsable(e.target.value)}
                        placeholder="Nombre o correo del coordinador..."
                        className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                      />
                      {editResponsable.trim() !==
                        (selectedInquiry.responsable || '') && (
                        <button
                          type="button"
                          disabled={busyCardAction}
                          onClick={() =>
                            handleQuickFieldUpdate(
                              selectedInquiry,
                              { responsable: editResponsable.trim() },
                              'Responsable actualizado.'
                            )
                          }
                          className="rounded-lg bg-zinc-900 px-2.5 py-1.5 font-semibold text-white hover:bg-zinc-800 shrink-0"
                        >
                          Guardar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Follow-up Date */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="font-semibold text-zinc-700">
                        Próximo seguimiento
                      </label>
                      {selectedInquiry.fechaSeguimiento && (
                        <button
                          type="button"
                          disabled={busyCardAction}
                          onClick={() =>
                            handleQuickFieldUpdate(
                              selectedInquiry,
                              { fechaSeguimiento: '' },
                              'Fecha de seguimiento eliminada.'
                            )
                          }
                          className="text-[11px] text-zinc-500 hover:text-zinc-900 hover:underline"
                        >
                          Quitar fecha
                        </button>
                      )}
                    </div>
                    <input
                      type="date"
                      value={selectedInquiry.fechaSeguimiento || ''}
                      disabled={busyCardAction}
                      onChange={(e) =>
                        handleQuickFieldUpdate(
                          selectedInquiry,
                          { fechaSeguimiento: e.target.value },
                          'Fecha de seguimiento actualizada.'
                        )
                      }
                      className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-zinc-900 tabular-nums focus:border-[#DC1F26] focus:outline-none"
                    />
                    {isFollowUpOverdue(selectedInquiry, todayIso) && (
                      <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#DC1F26]">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        La fecha de seguimiento está vencida.
                      </p>
                    )}
                  </div>

                  {/* Metadata Timestamps */}
                  <div className="border-t border-zinc-200/80 pt-3 space-y-1 text-[11px] text-zinc-500 tabular-nums">
                    <p>ID Ficha: {selectedInquiry.id}</p>
                    <p>
                      Última actualización:{' '}
                      {formatDateTimeShortEs(
                        selectedInquiry.updatedAt || selectedInquiry.createdAt
                      )}
                    </p>
                  </div>
                </div>

                {/* Danger Action: Delete Card */}
                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <button
                    type="button"
                    onClick={() => requestDeleteInquiry(selectedInquiry)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-xs font-semibold text-[#DC1F26] transition-colors hover:bg-red-100/70"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar ficha de consulta
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────── */}
      {/* NEW MANUAL INQUIRY MODAL                                       */}
      {/* ────────────────────────────────────────────────────────────── */}
      {showNewModal && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/50 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowNewModal(false)}
        >
          <div
            className="my-8 w-full max-w-2xl rounded-xl border border-zinc-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-4">
              <div>
                <h3 className="font-display text-lg font-bold text-zinc-900">
                  Registrar Nueva Ficha de Consulta
                </h3>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Registra consultas recibidas por WhatsApp, llamada telefónica, correo o despacho para llevar su seguimiento completo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="rounded-lg border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleCreateInquirySubmit}
              className="mt-4 space-y-4 text-xs sm:text-sm"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Columna inicial
                  </label>
                  <select
                    value={newStage}
                    onChange={(e) => setNewStage(e.target.value as InquiryStage)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                  >
                    {INQUIRY_STAGES.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.shortLabel}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Prioridad
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) =>
                      setNewPriority(e.target.value as InquiryPriority)
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                  >
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Canal de recepción
                  </label>
                  <select
                    value={newCanal}
                    onChange={(e) =>
                      setNewCanal(e.target.value as InquiryChannel)
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                  >
                    {CHANNEL_OPTIONS.map((ch) => (
                      <option key={ch} value={ch}>
                        {ch}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700">
                  Asunto corto de la ficha (opcional)
                </label>
                <input
                  type="text"
                  value={newAsunto}
                  onChange={(e) => setNewAsunto(e.target.value)}
                  placeholder="Ej. Consulta de cupo urgente / Solicitud de aval parroquial..."
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Nombre del remitente *
                  </label>
                  <input
                    type="text"
                    required
                    value={newNombre}
                    onChange={(e) => setNewNombre(e.target.value)}
                    placeholder="Ej. Pbro. José Pérez / María y Carlos"
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Perfil / Rol
                  </label>
                  <select
                    value={newRol}
                    onChange={(e) =>
                      setNewRol(e.target.value as Inquiry['rolRemitente'])
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Teléfono / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={newTelefono}
                    onChange={(e) => setNewTelefono(e.target.value)}
                    placeholder="+58 414-0000000"
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-zinc-900 tabular-nums focus:border-[#DC1F26] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    value={newCorreo}
                    onChange={(e) => setNewCorreo(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Arciprestazgo de interés
                  </label>
                  <select
                    value={newArc}
                    onChange={(e) => {
                      setNewArc(normalizeArciprestazgoName(e.target.value));
                      setNewParroquia('');
                    }}
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                  >
                    <option value="">Sin especificar</option>
                    {MARACAIBO_ARCIPRESTAZGOS.map((g) => (
                      <option key={g.nombre} value={g.nombre}>
                        {g.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Parroquia de interés
                  </label>
                  <select
                    value={newParroquia}
                    disabled={!newArc}
                    onChange={(e) =>
                      setNewParroquia(
                        e.target.value
                          ? normalizeParroquiaName(e.target.value)
                          : ''
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none disabled:bg-zinc-100 disabled:text-zinc-400"
                  >
                    <option value="">
                      {newArc
                        ? 'Sin especificar'
                        : 'Seleccione primero un Arciprestazgo...'}
                    </option>
                    {getParroquiasForArc(newArc).map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Responsable asignado
                  </label>
                  <input
                    type="text"
                    value={newResponsable}
                    onChange={(e) => setNewResponsable(e.target.value)}
                    placeholder="Correo o nombre del coordinador"
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700">
                    Fecha de próximo seguimiento
                  </label>
                  <input
                    type="date"
                    value={newFechaSeg}
                    onChange={(e) => setNewFechaSeg(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-zinc-900 tabular-nums focus:border-[#DC1F26] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700">
                  Descripción de la consulta *
                </label>
                <textarea
                  rows={3}
                  required
                  value={newMensaje}
                  onChange={(e) => setNewMensaje(e.target.value)}
                  placeholder="Describe el motivo de la consulta..."
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700">
                  Notas internas iniciales (opcional)
                </label>
                <textarea
                  rows={2}
                  value={newNotas}
                  onChange={(e) => setNewNotas(e.target.value)}
                  placeholder="Observaciones adicionales para el equipo..."
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-zinc-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingBusy}
                  className="rounded-lg bg-[#DC1F26] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B9191F] disabled:opacity-50"
                >
                  {creatingBusy ? 'Creando ficha...' : 'Crear ficha de consulta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

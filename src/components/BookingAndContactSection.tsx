import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, Check, Mail, MapPin, Phone, Printer } from 'lucide-react';
import type { EpimEncounter, Inquiry, Reservation } from '../types/epim.ts';
import {
  formatEncounterDatesEs,
  formatSingleDateEs,
  getEncounterDates,
  MARACAIBO_ARCIPRESTAZGOS,
} from '../data/maracaiboCatalog.ts';
import { submitPublicInquiry, submitPublicReservation } from '../services/api.ts';

interface BookingAndContactSectionProps {
  publicYear: number;
  encounters: EpimEncounter[];
  preselectedEncounterId: string;
  activeTab: 'reserva' | 'consulta';
  onTabChange: (tab: 'reserva' | 'consulta') => void;
  secretariado: {
    telefono: string;
    correo: string;
    direccion: string;
  };
  onReservationCreated: (updatedEncounter: EpimEncounter) => void;
}

export const BookingAndContactSection: React.FC<BookingAndContactSectionProps> = ({
  publicYear,
  encounters,
  preselectedEncounterId,
  activeTab,
  onTabChange,
  secretariado,
  onReservationCreated,
}) => {
  const openEncounters = useMemo(
    () =>
      encounters.filter(
        (e) => e.estado === 'abierto' && e.cuposTotales - e.cuposReservados > 0
      ),
    [encounters]
  );

  // Reservation Form State
  const [encounterId, setEncounterId] = useState<string>('');
  const [nombreNovia, setNombreNovia] = useState('');
  const [nombreNovio, setNombreNovio] = useState('');
  const [documentoIdentidad, setDocumentoIdentidad] = useState('');
  const [telefonoPareja, setTelefonoPareja] = useState('');
  const [correoPareja, setCorreoPareja] = useState('');
  const [parroquiaMatrimonio, setParroquiaMatrimonio] = useState('');
  const [fechaPrevistaBoda, setFechaPrevistaBoda] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [submittingRes, setSubmittingRes] = useState(false);
  const [resError, setResError] = useState<string | null>(null);
  const [confirmedReservation, setConfirmedReservation] = useState<Reservation | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Inquiry Form State
  const [nombreRemitente, setNombreRemitente] = useState('');
  const [rolRemitente, setRolRemitente] = useState<Inquiry['rolRemitente']>('Pareja de novios');
  const [telefonoConsulta, setTelefonoConsulta] = useState('');
  const [correoConsulta, setCorreoConsulta] = useState('');
  const [arciprestazgoInteres, setArciprestazgoInteres] = useState('');
  const [parroquiaInteres, setParroquiaInteres] = useState('');
  const [mensajeConsulta, setMensajeConsulta] = useState('');
  const [submittingInq, setSubmittingInq] = useState(false);
  const [inqError, setInqError] = useState<string | null>(null);
  const [inqSuccess, setInqSuccess] = useState(false);

  useEffect(() => {
    if (preselectedEncounterId) {
      setEncounterId(preselectedEncounterId);
      setConfirmedReservation(null);
      setResError(null);
    } else if (!encounterId && openEncounters.length > 0) {
      setEncounterId(openEncounters[0].id);
    }
  }, [preselectedEncounterId, openEncounters, encounterId]);

  const selectedEncounter = useMemo(
    () => openEncounters.find((e) => e.id === encounterId) || null,
    [openEncounters, encounterId]
  );

  const handleReservationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResError(null);
    if (!encounterId) {
      setResError('Por favor selecciona un encuentro EPIM con cupos disponibles.');
      return;
    }

    setSubmittingRes(true);
    try {
      const { reservation, encounter } = await submitPublicReservation({
        encounterId,
        nombreNovia,
        nombreNovio,
        documentoIdentidad,
        telefonoPareja,
        correoPareja,
        parroquiaMatrimonio,
        fechaPrevistaBoda,
        observaciones,
      });
      setConfirmedReservation(reservation);
      onReservationCreated(encounter);
      setNombreNovia('');
      setNombreNovio('');
      setDocumentoIdentidad('');
      setTelefonoPareja('');
      setCorreoPareja('');
      setParroquiaMatrimonio('');
      setFechaPrevistaBoda('');
      setObservaciones('');
    } catch (err) {
      setResError(err instanceof Error ? err.message : 'No se pudo procesar la reservación.');
    } finally {
      setSubmittingRes(false);
    }
  };

  const handleInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInqError(null);
    setInqSuccess(false);
    setSubmittingInq(true);
    try {
      await submitPublicInquiry({
        nombreRemitente,
        rolRemitente,
        telefono: telefonoConsulta,
        correo: correoConsulta,
        arciprestazgoInteres,
        parroquiaInteres,
        mensaje: mensajeConsulta,
      });
      setInqSuccess(true);
      setNombreRemitente('');
      setTelefonoConsulta('');
      setCorreoConsulta('');
      setMensajeConsulta('');
    } catch (err) {
      setInqError(err instanceof Error ? err.message : 'Error al enviar la consulta.');
    } finally {
      setSubmittingInq(false);
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Clipboard optional
    }
  };

  return (
    <section
      id="reservas"
      className="no-print scroll-mt-20 border-b border-zinc-200 bg-white py-14 sm:py-18"
    >
      <div id="consultas" className="scroll-mt-24 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 items-start">
          {/* Left Column: Pastoral Contact & Orientation Info */}
          <div className="lg:col-span-5">
            <p className="text-xs font-medium text-[#DC1F26]">
              Atención Pastoral y Registro en Línea
            </p>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
              Reservación de Cupos y Consultas Directas
            </h2>
            <p className="mt-3 text-sm sm:text-base leading-relaxed text-zinc-600">
              Reserva en línea el cupo de tu pareja para el próximo Encuentro de Preparación Inmediata al Matrimonio o envía una consulta directa al Secretariado de Pastoral Familiar.
            </p>

            {/* Segmented Mode Selector */}
            <div className="mt-6 inline-flex items-center gap-1 rounded-lg bg-zinc-100 p-1">
              <button
                type="button"
                onClick={() => onTabChange('reserva')}
                className={`rounded-md px-4 py-2 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'reserva'
                    ? 'bg-white text-[#DC1F26] shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Reservar Cupo de Pareja
              </button>
              <button
                type="button"
                onClick={() => onTabChange('consulta')}
                className={`rounded-md px-4 py-2 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'consulta'
                    ? 'bg-white text-[#DC1F26] shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Enviar Consulta Directa
              </button>
            </div>

            {/* Institutional Pastoral Information */}
            <div className="mt-8 divide-y divide-zinc-200 border-t border-zinc-200 text-sm">
              <div className="py-4">
                <h3 className="font-display text-sm font-semibold text-zinc-900">
                  Orientaciones para los novios y párrocos
                </h3>
                <ul className="mt-2 space-y-1.5 text-xs sm:text-sm text-zinc-600">
                  <li>· Cada reservación corresponde a 1 cupo de pareja (novia y novio) y se descuenta en tiempo real.</li>
                  <li>· Es indispensable la asistencia completa de ambos novios durante toda la jornada del encuentro.</li>
                  <li>· El certificado arquidiocesano EPIM es válido para el expediente matrimonial en toda la Arquidiócesis.</li>
                </ul>
              </div>

              <div className="space-y-2.5 py-4 text-xs sm:text-sm text-zinc-700">
                <div className="font-display text-sm font-semibold text-zinc-900">
                  Secretariado Arquidiocesano de Pastoral Familiar
                </div>
                <div className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#DC1F26]" />
                  <span>{secretariado.direccion}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Phone className="h-4 w-4 shrink-0 text-[#DC1F26]" />
                  <a
                    href={`tel:${secretariado.telefono}`}
                    className="font-mono hover:text-[#DC1F26] tabular-nums"
                  >
                    {secretariado.telefono}
                  </a>
                </div>
                <div className="flex items-center gap-2.5">
                  <Mail className="h-4 w-4 shrink-0 text-[#DC1F26]" />
                  <a
                    href={`mailto:${secretariado.correo}`}
                    className="hover:text-[#DC1F26] underline decoration-zinc-300 underline-offset-4"
                  >
                    {secretariado.correo}
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Active Form */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/40 p-6 sm:p-8 lg:col-span-7">
            {activeTab === 'reserva' ? (
              confirmedReservation ? (
                <div className="space-y-5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
                    <div>
                      <h3 className="font-display text-lg font-bold text-zinc-900">
                        Cupo Reservado con Éxito
                      </h3>
                      <p className="mt-1 text-sm text-zinc-600">
                        El cupo de su pareja ha sido descontado del inventario y registrado oficialmente. Presenten este código al equipo coordinador de la parroquia sede.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-200 bg-white p-5">
                    <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                      <div>
                        <div className="text-xs text-zinc-500">Código de Comprobante</div>
                        <div className="mt-0.5 font-mono text-lg font-bold text-[#DC1F26] tabular-nums">
                          {confirmedReservation.codigoReserva}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyCode(confirmedReservation.codigoReserva)}
                        className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 whitespace-nowrap shrink-0"
                      >
                        {copiedCode ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                            Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Copiar código
                          </>
                        )}
                      </button>
                    </div>

                    <dl className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="text-zinc-500">Pareja Registrada</dt>
                        <dd className="mt-0.5 font-semibold text-zinc-900">
                          {confirmedReservation.nombreNovia} y {confirmedReservation.nombreNovio}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500">Parroquia Sede EPIM</dt>
                        <dd className="mt-0.5 font-semibold text-zinc-900">
                          {confirmedReservation.parroquiaEpim}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500">Fechas del Encuentro</dt>
                        <dd className="mt-0.5 font-medium text-zinc-800">
                          {confirmedReservation.fechasEpim}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500">Teléfono Registrado</dt>
                        <dd className="mt-0.5 font-mono text-zinc-800 tabular-nums">
                          {confirmedReservation.telefonoPareja}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800 whitespace-nowrap shrink-0"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      Imprimir comprobante
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmedReservation(null)}
                      className="rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 whitespace-nowrap shrink-0"
                    >
                      Realizar otra reservación
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleReservationSubmit} className="space-y-4">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-zinc-900">
                      Formulario de Reservación de Cupo ({publicYear})
                    </h3>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Selecciona la parroquia sede y completa los datos de ambos contrayentes.
                    </p>
                  </div>

                  {resError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-[#DC1F26]">
                      {resError}
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="res-encounter"
                      className="block text-xs font-semibold text-zinc-800"
                    >
                      Encuentro EPIM disponible *
                    </label>
                    {openEncounters.length === 0 ? (
                      <p className="mt-1.5 rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-600">
                        Actualmente no hay encuentros con cupos abiertos para el año {publicYear}. Envía una consulta directa para recibir orientación.
                      </p>
                    ) : (
                      <select
                        id="res-encounter"
                        required
                        value={encounterId}
                        onChange={(e) => setEncounterId(e.target.value)}
                        className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                      >
                        {openEncounters.map((enc) => {
                          const disp = Math.max(0, enc.cuposTotales - enc.cuposReservados);
                          return (
                            <option key={enc.id} value={enc.id}>
                              {formatEncounterDatesEs(enc)} — {enc.parroquia} ({disp} cupos disp.)
                            </option>
                          );
                        })}
                      </select>
                    )}

                    {selectedEncounter && (
                      <div className="mt-2 space-y-1 text-xs text-zinc-600 tabular-nums">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-zinc-800">
                            {getEncounterDates(selectedEncounter).length} fechas obligatorias
                          </span>
                          <span>·</span>
                          <span>{selectedEncounter.horario}</span>
                          <span>·</span>
                          <span className="font-semibold text-[#DC1F26]">
                            Quedan{' '}
                            {Math.max(
                              0,
                              selectedEncounter.cuposTotales - selectedEncounter.cuposReservados
                            )}{' '}
                            de {selectedEncounter.cuposTotales} cupos
                          </span>
                        </div>
                        <div className="text-zinc-500">
                          {getEncounterDates(selectedEncounter)
                            .map((d, idx) => `Fecha ${idx + 1}: ${formatSingleDateEs(d)}`)
                            .join(' · ')}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="res-novia"
                        className="block text-xs font-semibold text-zinc-800"
                      >
                        Nombres y apellidos de la novia *
                      </label>
                      <input
                        id="res-novia"
                        type="text"
                        required
                        value={nombreNovia}
                        onChange={(e) => setNombreNovia(e.target.value)}
                        placeholder="Ej. María Chiquinquirá Pérez"
                        className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="res-novio"
                        className="block text-xs font-semibold text-zinc-800"
                      >
                        Nombres y apellidos del novio *
                      </label>
                      <input
                        id="res-novio"
                        type="text"
                        required
                        value={nombreNovio}
                        onChange={(e) => setNombreNovio(e.target.value)}
                        placeholder="Ej. José Gregorio Urdaneta"
                        className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="res-doc"
                        className="block text-xs font-semibold text-zinc-800"
                      >
                        Cédulas de identidad (Novia / Novio)
                      </label>
                      <input
                        id="res-doc"
                        type="text"
                        value={documentoIdentidad}
                        onChange={(e) => setDocumentoIdentidad(e.target.value)}
                        placeholder="V-00.000.000 / V-00.000.000"
                        className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="res-tel"
                        className="block text-xs font-semibold text-zinc-800"
                      >
                        Teléfono / WhatsApp de contacto *
                      </label>
                      <input
                        id="res-tel"
                        type="tel"
                        required
                        value={telefonoPareja}
                        onChange={(e) => setTelefonoPareja(e.target.value)}
                        placeholder="+58 414-0000000"
                        className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="res-email"
                        className="block text-xs font-semibold text-zinc-800"
                      >
                        Correo electrónico
                      </label>
                      <input
                        id="res-email"
                        type="email"
                        value={correoPareja}
                        onChange={(e) => setCorreoPareja(e.target.value)}
                        placeholder="pareja@correo.com"
                        className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="res-fecha-boda"
                        className="block text-xs font-semibold text-zinc-800"
                      >
                        Fecha prevista de matrimonio
                      </label>
                      <input
                        id="res-fecha-boda"
                        type="date"
                        value={fechaPrevistaBoda}
                        onChange={(e) => setFechaPrevistaBoda(e.target.value)}
                        className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="res-parroquia-boda"
                      className="block text-xs font-semibold text-zinc-800"
                    >
                      Parroquia donde celebrarán el matrimonio o arman expediente
                    </label>
                    <input
                      id="res-parroquia-boda"
                      type="text"
                      value={parroquiaMatrimonio}
                      onChange={(e) => setParroquiaMatrimonio(e.target.value)}
                      placeholder="Ej. Parroquia Santa Lucía"
                      className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="res-obs" className="block text-xs font-semibold text-zinc-800">
                      Observaciones adicionales (opcional)
                    </label>
                    <textarea
                      id="res-obs"
                      rows={2}
                      value={observaciones}
                      onChange={(e) => setObservaciones(e.target.value)}
                      placeholder="Indica si requieren alguna consideración especial o remisión parroquial..."
                      className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submittingRes || openEncounters.length === 0}
                    className="w-full rounded-lg bg-[#DC1F26] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B9191F] disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    {submittingRes ? 'Confirmando cupo en inventario...' : 'Confirmar Reservación de Cupo'}
                  </button>
                </form>
              )
            ) : (
              /* Direct Inquiry Form */
              <form onSubmit={handleInquirySubmit} className="space-y-4">
                <div>
                  <h3 className="font-display text-lg font-semibold text-zinc-900">
                    Consulta Directa al Secretariado
                  </h3>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Para sacerdotes, diáconos, agentes de pastoral familiar o parejas que necesiten orientación.
                  </p>
                </div>

                {inqError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-[#DC1F26]">
                    {inqError}
                  </div>
                )}

                {inqSuccess && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
                    Tu consulta ha sido recibida por el Secretariado de Pastoral Familiar. Nos comunicaremos contigo a la brevedad.
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="inq-nombre"
                      className="block text-xs font-semibold text-zinc-800"
                    >
                      Nombre completo *
                    </label>
                    <input
                      id="inq-nombre"
                      type="text"
                      required
                      value={nombreRemitente}
                      onChange={(e) => setNombreRemitente(e.target.value)}
                      placeholder="Nombre y apellido"
                      className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="inq-rol" className="block text-xs font-semibold text-zinc-800">
                      Perfil *
                    </label>
                    <select
                      id="inq-rol"
                      value={rolRemitente}
                      onChange={(e) => setRolRemitente(e.target.value as Inquiry['rolRemitente'])}
                      className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                    >
                      <option value="Pareja de novios">Pareja de novios</option>
                      <option value="Sacerdote / Diácono">Sacerdote / Diácono</option>
                      <option value="Agente de Pastoral">Agente de Pastoral Familiar</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="inq-tel" className="block text-xs font-semibold text-zinc-800">
                      Teléfono / WhatsApp *
                    </label>
                    <input
                      id="inq-tel"
                      type="tel"
                      required
                      value={telefonoConsulta}
                      onChange={(e) => setTelefonoConsulta(e.target.value)}
                      placeholder="+58 414-0000000"
                      className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="inq-email"
                      className="block text-xs font-semibold text-zinc-800"
                    >
                      Correo electrónico
                    </label>
                    <input
                      id="inq-email"
                      type="email"
                      value={correoConsulta}
                      onChange={(e) => setCorreoConsulta(e.target.value)}
                      placeholder="correo@ejemplo.com"
                      className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="inq-arc" className="block text-xs font-semibold text-zinc-800">
                      Arciprestazgo (opcional)
                    </label>
                    <select
                      id="inq-arc"
                      value={arciprestazgoInteres}
                      onChange={(e) => {
                        setArciprestazgoInteres(e.target.value);
                        setParroquiaInteres('');
                      }}
                      className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                    >
                      <option value="">Seleccionar Arciprestazgo...</option>
                      {MARACAIBO_ARCIPRESTAZGOS.map((g) => (
                        <option key={g.nombre} value={g.nombre}>
                          {g.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="inq-par" className="block text-xs font-semibold text-zinc-800">
                      Parroquia de procedencia (opcional)
                    </label>
                    <select
                      id="inq-par"
                      disabled={!arciprestazgoInteres}
                      value={parroquiaInteres}
                      onChange={(e) => setParroquiaInteres(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
                    >
                      {!arciprestazgoInteres ? (
                        <option value="">Primero selecciona un Arciprestazgo...</option>
                      ) : (
                        <>
                          <option value="">Seleccionar Parroquia...</option>
                          {(
                            MARACAIBO_ARCIPRESTAZGOS.find(
                              (g) => g.nombre === arciprestazgoInteres
                            )?.parroquias || []
                          ).map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="inq-msg" className="block text-xs font-semibold text-zinc-800">
                    Mensaje o consulta *
                  </label>
                  <textarea
                    id="inq-msg"
                    rows={4}
                    required
                    value={mensajeConsulta}
                    onChange={(e) => setMensajeConsulta(e.target.value)}
                    placeholder="Escribe tu consulta sobre fechas, requisitos canónicos, traslados o coordinación parroquial..."
                    className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingInq}
                  className="w-full rounded-lg bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  {submittingInq ? 'Enviando consulta...' : 'Enviar Consulta al Secretariado'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

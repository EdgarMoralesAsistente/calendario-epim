import React, { useMemo, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Phone } from 'lucide-react';
import type { EpimEncounter } from '../types/epim.ts';
import {
  doesEncounterIncludeDate,
  doesEncounterMatchMonth,
  formatEncounterDatesEs,
  formatMonthName,
  formatSingleDateEs,
  getEncounterDates,
  getShortArciprestazgoLabel,
  MONTHS_ES,
  normalizeParroquiaName,
} from '../data/maracaiboCatalog.ts';

interface CalendarSectionProps {
  publicYear: number;
  encounters: EpimEncounter[];
  onSelectForReservation: (encounter: EpimEncounter) => void;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const CalendarSection: React.FC<CalendarSectionProps> = ({
  publicYear,
  encounters,
  onSelectForReservation,
}) => {
  // Default to the first upcoming open month, or current month if in publicYear
  const initialMonth = useMemo(() => {
    const openEnc = encounters.find(
      (e) => e.estado === 'abierto' && e.cuposTotales - e.cuposReservados > 0
    );
    if (openEnc) return openEnc.mes;
    if (encounters.length > 0) return encounters[0].mes;
    return new Date().getMonth() + 1;
  }, [encounters]);

  const [activeMonth, setActiveMonth] = useState<number>(initialMonth);
  const [selectedDayIso, setSelectedDayIso] = useState<string | null>(null);

  useEffect(() => {
    setActiveMonth(initialMonth);
    setSelectedDayIso(null);
  }, [publicYear, initialMonth]);

  // Count encounters per month (including multi-weekend encounters spanning two months)
  const monthCounts = useMemo(() => {
    const map = new Map<number, { total: number; openSlots: number }>();
    for (let m = 1; m <= 12; m++) {
      const monthEncs = encounters.filter((e) => doesEncounterMatchMonth(e, m));
      if (monthEncs.length > 0) {
        const openSlots = monthEncs.reduce(
          (sum, e) => sum + (e.estado === 'abierto' ? Math.max(0, e.cuposTotales - e.cuposReservados) : 0),
          0
        );
        map.set(m, { total: monthEncs.length, openSlots });
      }
    }
    return map;
  }, [encounters]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(publicYear, activeMonth - 1, 1);
    const totalDays = new Date(publicYear, activeMonth, 0).getDate();
    // Convert Sunday=0..Saturday=6 into Monday=0..Sunday=6
    const startOffset = (firstDay.getDay() + 6) % 7;

    const cells: Array<{
      dayNumber: number | null;
      isoDate: string | null;
      dayEncounters: EpimEncounter[];
    }> = [];

    for (let i = 0; i < startOffset; i++) {
      cells.push({ dayNumber: null, isoDate: null, dayEncounters: [] });
    }

    for (let d = 1; d <= totalDays; d++) {
      const mm = String(activeMonth).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      const isoDate = `${publicYear}-${mm}-${dd}`;
      const dayEncounters = encounters.filter((enc) => doesEncounterIncludeDate(enc, isoDate));
      cells.push({ dayNumber: d, isoDate, dayEncounters });
    }

    return cells;
  }, [publicYear, activeMonth, encounters]);

  const displayedEncounters = useMemo(() => {
    if (selectedDayIso) {
      return encounters.filter((enc) => doesEncounterIncludeDate(enc, selectedDayIso));
    }
    return encounters.filter((enc) => doesEncounterMatchMonth(enc, activeMonth));
  }, [selectedDayIso, activeMonth, encounters]);

  return (
    <section
      id="calendario"
      className="no-print scroll-mt-20 border-b border-zinc-200 bg-zinc-50/50 py-14 sm:py-18"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-medium text-[#DC1F26]">
              Disponibilidad en Tiempo Real · Año {publicYear}
            </p>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
              Calendario Arquidiocesano de Cupos
            </h2>
            <p className="mt-2 max-w-2xl text-sm sm:text-base leading-relaxed text-zinc-600">
              Selecciona un mes o un día marcado para verificar qué parroquias tienen cupos abiertos en tiempo real.
            </p>
          </div>
        </div>

        {/* Month Quick Navigation Strip */}
        <div className="mt-6 flex items-center gap-1.5 overflow-x-auto pb-2">
          {MONTHS_ES.map((m) => {
            const info = monthCounts.get(m.value);
            const isSelected = activeMonth === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => {
                  setActiveMonth(m.value);
                  setSelectedDayIso(null);
                }}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                  isSelected
                    ? 'border-[#DC1F26] bg-[#DC1F26] text-white'
                    : info && info.total > 0
                    ? 'border-zinc-200 bg-white text-zinc-900 hover:border-zinc-300'
                    : 'border-transparent bg-zinc-100/80 text-zinc-400 hover:text-zinc-700'
                }`}
              >
                {m.short}
                {info && info.total > 0 ? ` (${info.total})` : ''}
              </button>
            );
          })}
        </div>

        {/* Split Calendar Grid + Availability Inspector */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Left: Monthly Calendar Grid */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6 lg:col-span-7">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
              <button
                type="button"
                onClick={() => {
                  setActiveMonth((prev) => (prev === 1 ? 12 : prev - 1));
                  setSelectedDayIso(null);
                }}
                aria-label="Mes anterior"
                className="rounded-lg border border-zinc-200 p-2 text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="text-center">
                <h3 className="font-display text-lg font-bold text-zinc-900">
                  {formatMonthName(activeMonth)} {publicYear}
                </h3>
                {selectedDayIso && (
                  <button
                    type="button"
                    onClick={() => setSelectedDayIso(null)}
                    className="mt-0.5 text-xs font-medium text-[#DC1F26] hover:underline"
                  >
                    Ver todo el mes
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setActiveMonth((prev) => (prev === 12 ? 1 : prev + 1));
                  setSelectedDayIso(null);
                }}
                aria-label="Mes siguiente"
                className="rounded-lg border border-zinc-200 p-2 text-zinc-700 transition-colors hover:bg-zinc-50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Weekday Headers */}
            <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-zinc-500">
              {WEEKDAYS.map((wd) => (
                <div key={wd} className="py-1.5">
                  {wd}
                </div>
              ))}
            </div>

            {/* Day Cells */}
            <div className="mt-1 grid grid-cols-7 gap-1.5">
              {calendarDays.map((cell, idx) => {
                if (!cell.dayNumber || !cell.isoDate) {
                  return <div key={`empty-${idx}`} className="h-14 sm:h-16 rounded-lg bg-zinc-50/40" />;
                }

                const hasEvents = cell.dayEncounters.length > 0;
                const openCuposCount = cell.dayEncounters.reduce((acc, e) => {
                  if (e.estado !== 'abierto') return acc;
                  return acc + Math.max(0, e.cuposTotales - e.cuposReservados);
                }, 0);
                const isSelected = selectedDayIso === cell.isoDate;

                return (
                  <button
                    key={cell.isoDate}
                    type="button"
                    onClick={() => {
                      if (hasEvents) {
                        setSelectedDayIso(isSelected ? null : cell.isoDate);
                      }
                    }}
                    className={`flex h-14 sm:h-16 flex-col justify-between rounded-lg border p-2 text-left transition-colors tabular-nums ${
                      isSelected
                        ? 'border-[#DC1F26] bg-[#FEF2F2] ring-1 ring-[#DC1F26]'
                        : hasEvents
                        ? openCuposCount > 0
                          ? 'border-[#DC1F26]/40 bg-red-50/40 hover:border-[#DC1F26]'
                          : 'border-zinc-200 bg-zinc-100/70 hover:border-zinc-300'
                        : 'border-zinc-100 bg-white text-zinc-400 cursor-default'
                    }`}
                  >
                    <span
                      className={`font-mono text-xs font-semibold ${
                        hasEvents ? 'text-zinc-900' : 'text-zinc-400'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>

                    {hasEvents && (
                      <div className="truncate text-[10px] sm:text-[11px] font-medium leading-tight">
                        {openCuposCount > 0 ? (
                          <span className="text-[#DC1F26]">{openCuposCount} cupos</span>
                        ) : (
                          <span className="text-zinc-500">Cerrado</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
              <span>Fechas resaltadas en rojo: cupos disponibles para reservar</span>
              <span>·</span>
              <span>Fechas en gris: encuentro realizado o cupos agotados</span>
            </div>
          </div>

          {/* Right: Month / Day Availability Detail List */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6 lg:col-span-5">
            <div className="border-b border-zinc-100 pb-3.5">
              <h3 className="font-display text-base font-semibold text-zinc-900">
                {selectedDayIso
                  ? `Encuentros del ${formatSingleDateEs(selectedDayIso)}`
                  : `Encuentros en ${formatMonthName(activeMonth)} ${publicYear}`}
              </h3>
              <p className="mt-0.5 text-xs text-zinc-500 tabular-nums">
                {displayedEncounters.length}{' '}
                {displayedEncounters.length === 1 ? 'encuentro programado' : 'encuentros programados'}
              </p>
            </div>

            {displayedEncounters.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm text-zinc-600">
                  No hay encuentros EPIM programados para {formatMonthName(activeMonth).toLowerCase()} de{' '}
                  {publicYear}.
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Selecciona otro mes en la barra superior para ver próximas fechas.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {displayedEncounters.map((enc) => {
                  const disponibles = Math.max(0, enc.cuposTotales - enc.cuposReservados);
                  const isOpen = enc.estado === 'abierto' && disponibles > 0;
                  return (
                    <div key={enc.id} className="py-4 first:pt-3 last:pb-0">
                      <div className="text-xs text-zinc-500">
                        <span className="font-medium text-[#DC1F26]">
                          {formatEncounterDatesEs(enc)}
                        </span>
                        <span> · {getEncounterDates(enc).length} fechas</span>
                        <span> · </span>
                        <span>{getShortArciprestazgoLabel(enc.arciprestazgo)}</span>
                      </div>

                      <h4 className="mt-1 font-display text-sm font-semibold text-zinc-900">
                        {normalizeParroquiaName(enc.parroquia)}
                      </h4>
                      <p className="mt-0.5 text-xs text-zinc-600">{enc.horario}</p>

                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs tabular-nums">
                          {isOpen ? (
                            <span className="font-semibold text-zinc-900">
                              Disponibles: {disponibles} de {enc.cuposTotales} cupos
                            </span>
                          ) : (
                            <span className="text-zinc-400">
                              {enc.estado === 'finalizado' ? 'Realizado' : 'Cupos agotados'}
                            </span>
                          )}
                          {enc.telefonoContacto && (
                            <span className="ml-2 inline-flex items-center gap-1 font-mono text-zinc-500">
                              · <Phone className="h-3 w-3" /> {enc.telefonoContacto}
                            </span>
                          )}
                        </div>

                        {isOpen && (
                          <button
                            type="button"
                            onClick={() => onSelectForReservation(enc)}
                            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 whitespace-nowrap shrink-0"
                          >
                            Elegir fecha
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

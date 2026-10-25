import React, { useMemo, useState } from 'react';
import {
  Download,
  LayoutGrid,
  Phone,
  Printer,
  RotateCcw,
  Search,
  Table as TableIcon,
} from 'lucide-react';
import type { EpimEncounter } from '../types/epim.ts';
import {
  doesEncounterMatchMonth,
  formatEncounterDatesEs,
  formatMonthName,
  formatSingleDateEs,
  getEncounterDates,
  MARACAIBO_ARCIPRESTAZGOS,
  MONTHS_ES,
} from '../data/maracaiboCatalog.ts';

interface CarteleraSectionProps {
  publicYear: number;
  encounters: EpimEncounter[];
  customParishes: { arciprestazgo: string; parroquia: string }[];
  onSelectForReservation: (encounter: EpimEncounter) => void;
}

export const CarteleraSection: React.FC<CarteleraSectionProps> = ({
  publicYear,
  encounters,
  customParishes,
  onSelectForReservation,
}) => {
  const [selectedArciprestazgo, setSelectedArciprestazgo] = useState<string>('todos');
  const [selectedParroquia, setSelectedParroquia] = useState<string>('todas');
  const [selectedMes, setSelectedMes] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Build dynamic list of Arciprestazgos & Parroquias combining official catalog + scheduled encounters
  const arciprestazgoOptions = useMemo(() => {
    const set = new Set<string>(MARACAIBO_ARCIPRESTAZGOS.map((g) => g.nombre));
    encounters.forEach((e) => set.add(e.arciprestazgo));
    customParishes.forEach((p) => set.add(p.arciprestazgo));
    return Array.from(set);
  }, [encounters, customParishes]);

  const parroquiaOptions = useMemo(() => {
    const set = new Set<string>();
    MARACAIBO_ARCIPRESTAZGOS.forEach((g) => {
      if (selectedArciprestazgo === 'todos' || g.nombre === selectedArciprestazgo) {
        g.parroquias.forEach((p) => set.add(p));
      }
    });
    customParishes.forEach((cp) => {
      if (selectedArciprestazgo === 'todos' || cp.arciprestazgo === selectedArciprestazgo) {
        set.add(cp.parroquia);
      }
    });
    encounters.forEach((e) => {
      if (selectedArciprestazgo === 'todos' || e.arciprestazgo === selectedArciprestazgo) {
        set.add(e.parroquia);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [selectedArciprestazgo, encounters, customParishes]);

  const filteredEncounters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return encounters.filter((enc) => {
      if (selectedArciprestazgo !== 'todos' && enc.arciprestazgo !== selectedArciprestazgo) {
        return false;
      }
      if (selectedParroquia !== 'todas' && enc.parroquia !== selectedParroquia) {
        return false;
      }
      if (selectedMes !== 'todos' && !doesEncounterMatchMonth(enc, Number(selectedMes))) {
        return false;
      }
      const disponibles = Math.max(0, enc.cuposTotales - enc.cuposReservados);
      if (onlyAvailable && (enc.estado !== 'abierto' || disponibles <= 0)) {
        return false;
      }
      if (q) {
        const searchable = [
          enc.parroquia,
          enc.arciprestazgo,
          enc.telefonoContacto,
          enc.coordinadores,
          enc.sedeDetalle,
          enc.fechaInicio,
          formatEncounterDatesEs(enc),
        ]
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
  }, [
    encounters,
    selectedArciprestazgo,
    selectedParroquia,
    selectedMes,
    onlyAvailable,
    searchQuery,
  ]);

  const hasActiveFilters =
    selectedArciprestazgo !== 'todos' ||
    selectedParroquia !== 'todas' ||
    selectedMes !== 'todos' ||
    onlyAvailable ||
    searchQuery.trim() !== '';

  const resetFilters = () => {
    setSelectedArciprestazgo('todos');
    setSelectedParroquia('todas');
    setSelectedMes('todos');
    setOnlyAvailable(false);
    setSearchQuery('');
  };

  const handleExportCsv = () => {
    const headers = [
      'Año',
      'Mes',
      'Fechas',
      'Arciprestazgo',
      'Parroquia',
      'Horario',
      'Lugar / Salón',
      'Teléfono de Contacto',
      'Coordinadores',
      'Cupos Disponibles',
      'Cupos Totales',
      'Estado',
    ];
    const rows = filteredEncounters.map((e) => [
      String(e.year),
      formatMonthName(e.mes),
      formatEncounterDatesEs(e),
      e.arciprestazgo,
      e.parroquia,
      e.horario,
      e.sedeDetalle,
      e.telefonoContacto,
      e.coordinadores,
      String(Math.max(0, e.cuposTotales - e.cuposReservados)),
      String(e.cuposTotales),
      e.estado,
    ]);
    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Cartelera_EPIM_Maracaibo_${publicYear}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const cleanPhoneForWhatsApp = (phone: string) => phone.replace(/[^\d]/g, '');

  return (
    <section id="cartelera" className="scroll-mt-20 border-b border-zinc-200 bg-white py-14 sm:py-18">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-medium text-[#DC1F26]">
              Secretariado de Pastoral Familiar · Programación {publicYear}
            </p>
            <h2 className="mt-1 font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">
              Cartelera Arquidiocesana de Encuentros EPIM
            </h2>
            <p className="mt-2 max-w-2xl text-sm sm:text-base leading-relaxed text-zinc-600">
              Consulta las fechas programadas por arciprestazgo y parroquia para sacerdotes, agentes de pastoral y parejas de novios.
            </p>
          </div>

          <div className="no-print flex flex-wrap items-center gap-2 shrink-0">
            {/* Segmented View Toggle */}
            <div className="flex items-center gap-1 rounded-lg bg-zinc-100 p-1">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === 'cards'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Cartelera
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === 'table'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <TableIcon className="h-3.5 w-3.5" />
                Directorio
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              Descargar CSV
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 whitespace-nowrap shrink-0"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir
            </button>
          </div>
        </div>

        {/* Interactive Filter Panel */}
        <div className="no-print mt-8 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {/* Arciprestazgo Filter */}
            <div>
              <label
                htmlFor="filter-arciprestazgo"
                className="block text-xs font-medium text-zinc-700"
              >
                Arciprestazgo / Zona Pastoral
              </label>
              <select
                id="filter-arciprestazgo"
                value={selectedArciprestazgo}
                onChange={(e) => {
                  setSelectedArciprestazgo(e.target.value);
                  setSelectedParroquia('todas');
                }}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
              >
                <option value="todos">Todos los arciprestazgos</option>
                {arciprestazgoOptions.map((arc) => (
                  <option key={arc} value={arc}>
                    {arc}
                  </option>
                ))}
              </select>
            </div>

            {/* Parroquia Filter */}
            <div>
              <label
                htmlFor="filter-parroquia"
                className="block text-xs font-medium text-zinc-700"
              >
                Parroquia Sede
              </label>
              <select
                id="filter-parroquia"
                value={selectedParroquia}
                onChange={(e) => setSelectedParroquia(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
              >
                <option value="todas">Todas las parroquias</option>
                {parroquiaOptions.map((par) => (
                  <option key={par} value={par}>
                    {par}
                  </option>
                ))}
              </select>
            </div>

            {/* Mes Filter */}
            <div>
              <label htmlFor="filter-mes" className="block text-xs font-medium text-zinc-700">
                Mes del Encuentro
              </label>
              <select
                id="filter-mes"
                value={selectedMes}
                onChange={(e) => setSelectedMes(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
              >
                <option value="todos">Todos los meses ({publicYear})</option>
                {MONTHS_ES.map((m) => (
                  <option key={m.value} value={String(m.value)}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Search by Phone, Coordinator, Date */}
            <div>
              <label htmlFor="filter-search" className="block text-xs font-medium text-zinc-700">
                Teléfono, fecha o coordinador
              </label>
              <div className="relative mt-1.5">
                <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-zinc-400" />
                <input
                  id="filter-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ej. 0414, Claret, noviembre..."
                  className="w-full rounded-lg border border-zinc-200 bg-white py-2 pr-3 pl-9 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#DC1F26] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200/80 pt-3.5">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg bg-zinc-200/70 p-0.5">
                <button
                  type="button"
                  onClick={() => setOnlyAvailable(false)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    !onlyAvailable
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Todos ({encounters.length})
                </button>
                <button
                  type="button"
                  onClick={() => setOnlyAvailable(true)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    onlyAvailable
                      ? 'bg-white text-[#DC1F26] shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Solo con cupos abiertos
                </button>
              </div>
              <span className="text-xs text-zinc-500 tabular-nums">
                Mostrando {filteredEncounters.length} de {encounters.length} encuentros
              </span>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="flex items-center gap-1.5 text-xs font-medium text-[#DC1F26] hover:underline whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* Empty State */}
        {filteredEncounters.length === 0 ? (
          <div className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50/40 px-6 py-14 text-center">
            <h3 className="font-display text-base font-semibold text-zinc-900">
              No se encontraron encuentros con los filtros seleccionados
            </h3>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-zinc-600">
              Prueba seleccionando otro mes o arciprestazgo, o restablece la búsqueda para ver toda la programación {publicYear}.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-5 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-800 whitespace-nowrap shrink-0"
            >
              Ver todos los encuentros {publicYear}
            </button>
          </div>
        ) : viewMode === 'cards' ? (
          /* Cartelera Card Grid (Zero-Pill Metadata Discipline + Single-Elevation Depth) */
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredEncounters.map((enc) => {
              const disponibles = Math.max(0, enc.cuposTotales - enc.cuposReservados);
              const isOpen = enc.estado === 'abierto' && disponibles > 0;
              const occupancyPct = Math.min(
                100,
                Math.round((enc.cuposReservados / Math.max(1, enc.cuposTotales)) * 100)
              );
              const waPhone = cleanPhoneForWhatsApp(enc.telefonoContacto);

              return (
                <article
                  key={enc.id}
                  className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-6 transition-colors hover:border-zinc-300"
                >
                  <div>
                    {/* Quiet Unboxed Metadata Line (Zero-Pill Rule) */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                      <span className="font-medium text-[#DC1F26]">
                        {formatMonthName(enc.mes)} {enc.year}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate max-w-[220px]" title={enc.arciprestazgo}>
                        {enc.arciprestazgo.split('·')[0].trim()}
                      </span>
                    </div>

                    {/* Lead Directly with Parish Title */}
                    <h3 className="mt-2 font-display text-lg font-semibold leading-snug text-zinc-900">
                      {enc.parroquia}
                    </h3>

                    <p className="mt-1 text-xs text-zinc-500">{enc.arciprestazgo}</p>

                    {/* Structured Hairline Details */}
                    <dl className="mt-4 divide-y divide-zinc-100 border-t border-zinc-100 text-xs sm:text-sm">
                      <div className="py-2.5">
                        <dt className="text-xs text-zinc-500">
                          Fechas programadas ({getEncounterDates(enc).length} fechas)
                        </dt>
                        <dd className="mt-0.5 font-medium text-zinc-900 tabular-nums">
                          {formatEncounterDatesEs(enc)}
                        </dd>
                        <dd className="mt-1 space-y-0.5 text-xs text-zinc-600 tabular-nums">
                          {getEncounterDates(enc).map((isoDate, dIdx) => (
                            <div key={isoDate}>
                              · Fecha {dIdx + 1}: {formatSingleDateEs(isoDate)}
                            </div>
                          ))}
                        </dd>
                        <dd className="mt-1 text-xs text-zinc-600">{enc.horario}</dd>
                      </div>

                      {enc.sedeDetalle && (
                        <div className="py-2.5">
                          <dt className="text-xs text-zinc-500">Lugar</dt>
                          <dd className="mt-0.5 text-zinc-800">{enc.sedeDetalle}</dd>
                        </div>
                      )}

                      <div className="py-2.5">
                        <dt className="text-xs text-zinc-500">Contacto pastoral</dt>
                        <dd className="mt-0.5 flex flex-wrap items-center justify-between gap-2">
                          <a
                            href={`tel:${enc.telefonoContacto}`}
                            className="inline-flex items-center gap-1.5 font-mono text-xs font-medium text-zinc-900 hover:text-[#DC1F26] tabular-nums"
                          >
                            <Phone className="h-3.5 w-3.5 text-[#DC1F26]" />
                            {enc.telefonoContacto || 'Consultar en despacho'}
                          </a>
                          {waPhone && (
                            <a
                              href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
                                `Hola, paz y bien. Deseo consultar información sobre el EPIM en ${enc.parroquia} (${formatEncounterDatesEs(
                                  enc
                                )}).`
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium text-zinc-600 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-900 whitespace-nowrap shrink-0"
                            >
                              WhatsApp
                            </a>
                          )}
                        </dd>
                        {enc.coordinadores && (
                          <dd className="mt-0.5 text-xs text-zinc-500">{enc.coordinadores}</dd>
                        )}
                      </div>
                    </dl>
                  </div>

                  {/* Inventory Bar + Action Footer */}
                  <div className="mt-4 border-t border-zinc-100 pt-4">
                    <div className="flex items-center justify-between text-xs tabular-nums">
                      <span
                        className={
                          isOpen
                            ? disponibles <= 5
                              ? 'font-semibold text-amber-700'
                              : 'font-medium text-zinc-700'
                            : 'font-medium text-zinc-400'
                        }
                      >
                        {enc.estado === 'finalizado'
                          ? 'Encuentro realizado'
                          : isOpen
                          ? `${disponibles} de ${enc.cuposTotales} cupos disponibles`
                          : 'Cupos agotados'}
                      </span>
                      <span className="font-mono text-zinc-500">{occupancyPct}%</span>
                    </div>

                    <svg
                      viewBox="0 0 100 4"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                      className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100"
                    >
                      <rect
                        x="0"
                        y="0"
                        width={occupancyPct}
                        height="4"
                        className={
                          !isOpen
                            ? 'fill-zinc-400'
                            : disponibles <= 5
                            ? 'fill-amber-500'
                            : 'fill-[#DC1F26]'
                        }
                      />
                    </svg>

                    {enc.aporteInfo && (
                      <p className="mt-2.5 text-xs text-zinc-500">{enc.aporteInfo}</p>
                    )}

                    <div className="no-print mt-4">
                      {isOpen ? (
                        <button
                          type="button"
                          onClick={() => onSelectForReservation(enc)}
                          className="w-full rounded-lg bg-[#DC1F26] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#B9191F] whitespace-nowrap shrink-0"
                        >
                          Reservar cupo en esta parroquia
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="w-full cursor-not-allowed rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-xs font-medium text-zinc-400 whitespace-nowrap shrink-0"
                        >
                          {enc.estado === 'finalizado' ? 'Encuentro finalizado' : 'Sin cupos disponibles'}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          /* High-Density Pastoral Directory Table View */
          <div className="mt-8 overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-600">
                  <th className="px-4 py-3">Mes y Fechas</th>
                  <th className="px-4 py-3">Arciprestazgo</th>
                  <th className="px-4 py-3">Parroquia y Sede</th>
                  <th className="px-4 py-3">Teléfono y Coordinación</th>
                  <th className="px-4 py-3 text-right">Cupos</th>
                  <th className="no-print px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {filteredEncounters.map((enc) => {
                  const disponibles = Math.max(0, enc.cuposTotales - enc.cuposReservados);
                  const isOpen = enc.estado === 'abierto' && disponibles > 0;
                  return (
                    <tr key={enc.id} className="transition-colors hover:bg-zinc-50/80">
                      <td className="px-4 py-3.5 align-top tabular-nums">
                        <div className="font-semibold text-zinc-900">
                          {formatMonthName(enc.mes)} {enc.year}
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-600">
                          {formatEncounterDatesEs(enc)}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 align-top text-xs text-zinc-600">
                        {enc.arciprestazgo}
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <div className="font-medium text-zinc-900">{enc.parroquia}</div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {enc.sedeDetalle || enc.horario}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <a
                          href={`tel:${enc.telefonoContacto}`}
                          className="font-mono text-xs font-medium text-zinc-900 hover:text-[#DC1F26] tabular-nums"
                        >
                          {enc.telefonoContacto}
                        </a>
                        {enc.coordinadores && (
                          <div className="mt-0.5 text-xs text-zinc-500">{enc.coordinadores}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 align-top text-right font-mono text-xs tabular-nums">
                        {enc.estado === 'finalizado' ? (
                          <span className="text-zinc-400">Realizado</span>
                        ) : isOpen ? (
                          <span className="font-semibold text-zinc-900">
                            {disponibles} / {enc.cuposTotales}
                          </span>
                        ) : (
                          <span className="text-zinc-400">Agotado (0/{enc.cuposTotales})</span>
                        )}
                      </td>
                      <td className="no-print px-4 py-3.5 align-top text-right">
                        {isOpen ? (
                          <button
                            type="button"
                            onClick={() => onSelectForReservation(enc)}
                            className="rounded-lg bg-[#DC1F26] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#B9191F] whitespace-nowrap shrink-0"
                          >
                            Reservar
                          </button>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};

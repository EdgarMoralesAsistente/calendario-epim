import React, { useEffect, useMemo, useState } from 'react';
import { FileDown, RotateCcw } from 'lucide-react';
import type { EpimStore } from '../types/epim.ts';
import {
  formatEncounterDatesEs,
  formatSingleDateEs,
  getEncounterDates,
  LOGO_URL_FALLBACK,
  LOGO_URL_PRIMARY,
  MARACAIBO_ARCIPRESTAZGOS,
} from '../data/maracaiboCatalog.ts';
import {
  type EpimReportFilters,
  filterAndSortEncountersForReport,
  generateAndDownloadEpimPdf,
  groupEncountersByArciprestazgo,
} from '../services/pdfReportService.ts';

interface AdminReportsSectionProps {
  store: EpimStore;
  defaultYear: number;
  onNotify: (type: 'success' | 'error', text: string) => void;
}

export const AdminReportsSection: React.FC<AdminReportsSectionProps> = ({
  store,
  defaultYear,
  onNotify,
}) => {
  const [filterYear, setFilterYear] = useState<'todos' | number>(defaultYear);
  const [filterArciprestazgo, setFilterArciprestazgo] = useState<string>('todos');
  const [filterParroquia, setFilterParroquia] = useState<string>('todas');
  const [filterEstado, setFilterEstado] = useState<
    'todos' | 'abierto' | 'cerrado' | 'finalizado'
  >('todos');
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [includeReservationsAppendix, setIncludeReservationsAppendix] =
    useState<boolean>(false);
  const [downloadingPdf, setDownloadingPdf] = useState<boolean>(false);
  const [logoSrc, setLogoSrc] = useState<string>(LOGO_URL_PRIMARY);

  useEffect(() => {
    setFilterYear(defaultYear);
  }, [defaultYear]);

  // Build complete Arciprestazgo options (catalog + any custom ones in data)
  const arciprestazgoOptions = useMemo(() => {
    const base = MARACAIBO_ARCIPRESTAZGOS.map((g) => g.nombre);
    const set = new Set(base);
    for (const enc of store.encounters) {
      if (enc.arciprestazgo) set.add(enc.arciprestazgo);
    }
    return Array.from(set);
  }, [store.encounters]);

  // Build Parroquia options scoped to selected Year & Arciprestazgo, including encounter counts
  const parroquiaOptions = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const enc of store.encounters) {
      if (filterYear !== 'todos' && enc.year !== filterYear) continue;
      if (filterArciprestazgo !== 'todos' && enc.arciprestazgo !== filterArciprestazgo) {
        continue;
      }
      countMap.set(enc.parroquia, (countMap.get(enc.parroquia) || 0) + 1);
    }

    const parishSet = new Set<string>();
    for (const group of MARACAIBO_ARCIPRESTAZGOS) {
      if (filterArciprestazgo === 'todos' || group.nombre === filterArciprestazgo) {
        for (const p of group.parroquias) parishSet.add(p);
      }
    }
    for (const cp of store.customParishes) {
      if (filterArciprestazgo === 'todos' || cp.arciprestazgo === filterArciprestazgo) {
        parishSet.add(cp.parroquia);
      }
    }
    for (const p of countMap.keys()) {
      parishSet.add(p);
    }

    return Array.from(parishSet)
      .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
      .map((nombre) => ({
        nombre,
        count: countMap.get(nombre) || 0,
      }));
  }, [store.encounters, store.customParishes, filterYear, filterArciprestazgo]);

  // Reset parroquia filter if it no longer belongs to the newly chosen arciprestazgo
  useEffect(() => {
    if (
      filterParroquia !== 'todas' &&
      !parroquiaOptions.some((opt) => opt.nombre === filterParroquia)
    ) {
      setFilterParroquia('todas');
    }
  }, [filterParroquia, parroquiaOptions]);

  const filteredEncounters = useMemo(
    () =>
      filterAndSortEncountersForReport(store.encounters, {
        year: filterYear,
        arciprestazgo: filterArciprestazgo,
        parroquia: filterParroquia,
        estado: filterEstado,
      }),
    [store.encounters, filterYear, filterArciprestazgo, filterParroquia, filterEstado]
  );

  const groupedPreview = useMemo(
    () => groupEncountersByArciprestazgo(filteredEncounters),
    [filteredEncounters]
  );

  const summaryStats = useMemo(() => {
    const totalCupos = filteredEncounters.reduce((acc, e) => acc + e.cuposTotales, 0);
    const totalReservados = filteredEncounters.reduce(
      (acc, e) => acc + e.cuposReservados,
      0
    );
    const totalDisponibles = filteredEncounters.reduce(
      (acc, e) => acc + Math.max(0, e.cuposTotales - e.cuposReservados),
      0
    );
    const uniqueParishes = new Set(filteredEncounters.map((e) => e.parroquia)).size;
    const encounterIds = new Set(filteredEncounters.map((e) => e.id));
    const confirmedReservations = store.reservations.filter(
      (r) => r.estado === 'confirmada' && encounterIds.has(r.encounterId)
    ).length;

    return {
      totalEncuentros: filteredEncounters.length,
      totalArciprestazgos: groupedPreview.length,
      uniqueParishes,
      totalCupos,
      totalReservados,
      totalDisponibles,
      confirmedReservations,
    };
  }, [filteredEncounters, groupedPreview.length, store.reservations]);

  const hasCustomFilters =
    filterYear !== defaultYear ||
    filterArciprestazgo !== 'todos' ||
    filterParroquia !== 'todas' ||
    filterEstado !== 'todos';

  const handleResetFilters = () => {
    setFilterYear(defaultYear);
    setFilterArciprestazgo('todos');
    setFilterParroquia('todas');
    setFilterEstado('todos');
  };

  const handleDownloadPdf = async () => {
    if (filteredEncounters.length === 0) {
      onNotify(
        'error',
        'No hay encuentros en la selección actual para generar el archivo PDF.'
      );
      return;
    }

    setDownloadingPdf(true);
    try {
      const reportFilters: EpimReportFilters = {
        year: filterYear,
        arciprestazgo: filterArciprestazgo,
        parroquia: filterParroquia,
        estado: filterEstado,
        orientation,
        includeReservationsAppendix,
      };
      const result = await generateAndDownloadEpimPdf({
        encounters: filteredEncounters,
        reservations: store.reservations,
        config: store.config,
        filters: reportFilters,
      });
      onNotify(
        'success',
        `Archivo PDF descargado: ${result.filename} (${result.totalPages} ${
          result.totalPages === 1 ? 'página' : 'páginas'
        }).`
      );
    } catch (err) {
      onNotify(
        'error',
        err instanceof Error
          ? err.message
          : 'Ocurrió un error al construir el documento PDF.'
      );
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Main Controls & Filter Surface */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-col gap-4 border-b border-zinc-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-zinc-900">
              Informes Oficiales EPIM en PDF
            </h2>
            <p className="mt-1 max-w-2xl text-xs sm:text-sm text-zinc-600">
              Filtra la programación por año, Arciprestazgo y Parroquia. El documento se
              genera automáticamente ordenado por Arciprestazgo, Parroquia y fechas, con
              membrete institucional en cada página y diagramación anti-solapamiento.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {hasCustomFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restablecer filtros
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={downloadingPdf || filteredEncounters.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-[#DC1F26] px-4 py-2.5 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-[#B9191F] disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <FileDown className="h-4 w-4" />
              {downloadingPdf
                ? 'Generando documento PDF...'
                : `Descargar Informe .PDF (${summaryStats.totalEncuentros})`}
            </button>
          </div>
        </div>

        {/* Filter Controls Grid */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label
              htmlFor="report-filter-year"
              className="block text-xs font-semibold text-zinc-700"
            >
              Año pastoral
            </label>
            <select
              id="report-filter-year"
              value={filterYear === 'todos' ? 'todos' : String(filterYear)}
              onChange={(e) => {
                const val = e.target.value;
                setFilterYear(val === 'todos' ? 'todos' : Number(val));
              }}
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs sm:text-sm text-zinc-900 tabular-nums focus:border-[#DC1F26] focus:outline-none"
            >
              <option value="todos">Todos los años registrados</option>
              {store.config.availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  Año {yr} {yr === store.config.publicYear ? '(Público)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="report-filter-arc"
              className="block text-xs font-semibold text-zinc-700"
            >
              Arciprestazgo
            </label>
            <select
              id="report-filter-arc"
              value={filterArciprestazgo}
              onChange={(e) => setFilterArciprestazgo(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs sm:text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
            >
              <option value="todos">Todos los Arciprestazgos</option>
              {arciprestazgoOptions.map((arc) => (
                <option key={arc} value={arc}>
                  {arc}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="report-filter-parish"
              className="block text-xs font-semibold text-zinc-700"
            >
              Parroquia Sede
            </label>
            <select
              id="report-filter-parish"
              value={filterParroquia}
              onChange={(e) => setFilterParroquia(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs sm:text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
            >
              <option value="todas">Todas las Parroquias</option>
              {parroquiaOptions.map((p) => (
                <option key={p.nombre} value={p.nombre}>
                  {p.nombre} {p.count > 0 ? `(${p.count})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="report-filter-estado"
              className="block text-xs font-semibold text-zinc-700"
            >
              Estado de inscripción
            </label>
            <select
              id="report-filter-estado"
              value={filterEstado}
              onChange={(e) =>
                setFilterEstado(
                  e.target.value as 'todos' | 'abierto' | 'cerrado' | 'finalizado'
                )
              }
              className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs sm:text-sm text-zinc-900 focus:border-[#DC1F26] focus:outline-none"
            >
              <option value="todos">Todos los estados</option>
              <option value="abierto">Solo abiertos</option>
              <option value="cerrado">Cupos llenos (cerrados)</option>
              <option value="finalizado">Finalizados</option>
            </select>
          </div>
        </div>

        {/* Document Layout Options */}
        <div className="mt-4 flex flex-col gap-4 border-t border-zinc-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-700">
                Orientación del PDF:
              </span>
              <div className="inline-flex rounded-lg bg-zinc-100 p-1">
                <button
                  type="button"
                  onClick={() => setOrientation('landscape')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    orientation === 'landscape'
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Horizontal · Carta
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation('portrait')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    orientation === 'portrait'
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Vertical · Carta
                </button>
              </div>
            </div>

            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-700">
              <input
                type="checkbox"
                checked={includeReservationsAppendix}
                onChange={(e) => setIncludeReservationsAppendix(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 accent-[#DC1F26]"
              />
              <span>
                Incluir anexo de parejas con reserva confirmada (
                <span className="font-semibold tabular-nums">
                  {summaryStats.confirmedReservations}
                </span>
                )
              </span>
            </label>
          </div>

          <p className="text-xs text-zinc-500">
            Orden fijo: Arciprestazgo · Parroquia · Fechas
          </p>
        </div>
      </div>

      {/* Document Preview Surface (Mirrors PDF Header + Grouped Content) */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {/* Top Institutional Red Rule */}
        <div className="h-1.5 w-full bg-[#DC1F26]" />

        <div className="p-6">
          {/* Institutional Header Preview */}
          <div className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <img
                src={logoSrc}
                alt="Logo Secretariado de Pastoral Familiar"
                onError={() => setLogoSrc(LOGO_URL_FALLBACK)}
                className="h-16 w-auto object-contain shrink-0"
              />
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-wide text-[#DC1F26]">
                  Arquidiócesis de Maracaibo
                </p>
                <h3 className="font-display text-base sm:text-lg font-bold text-zinc-900">
                  Secretariado de Pastoral Familiar — Programa EPIM
                </h3>
                <p className="mt-0.5 text-xs text-zinc-600">
                  Encuentros de Preparación Inmediata al Matrimonio · Vista previa del
                  documento oficial
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right text-xs text-zinc-600 shrink-0 tabular-nums">
              <p className="font-semibold text-zinc-900">
                {filterYear === 'todos'
                  ? 'Todos los años registrados'
                  : `Programación Año ${filterYear}`}
              </p>
              <p className="mt-0.5">
                {summaryStats.totalEncuentros} encuentro(s) ·{' '}
                {summaryStats.uniqueParishes} parroquia(s)
              </p>
              <p className="mt-0.5 text-zinc-500">
                Disponibles: {summaryStats.totalDisponibles} de {summaryStats.totalCupos}{' '}
                cupos
              </p>
            </div>
          </div>

          {/* KPI Summary Strip */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3.5">
              <p className="text-xs text-zinc-500">Encuentros filtrados</p>
              <p className="mt-1 font-display text-xl font-bold text-zinc-900 tabular-nums">
                {summaryStats.totalEncuentros}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3.5">
              <p className="text-xs text-zinc-500">Zonas y Parroquias</p>
              <p className="mt-1 font-display text-xl font-bold text-zinc-900 tabular-nums">
                {summaryStats.totalArciprestazgos} · {summaryStats.uniqueParishes}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3.5">
              <p className="text-xs text-zinc-500">Cupos reservados</p>
              <p className="mt-1 font-display text-xl font-bold text-zinc-900 tabular-nums">
                {summaryStats.totalReservados}{' '}
                <span className="text-xs font-normal text-zinc-500">
                  / {summaryStats.totalCupos}
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3.5">
              <p className="text-xs text-zinc-500">Cupos disponibles</p>
              <p className="mt-1 font-display text-xl font-bold text-[#DC1F26] tabular-nums">
                {summaryStats.totalDisponibles}
              </p>
            </div>
          </div>

          {/* Grouped & Sorted Preview Table */}
          {groupedPreview.length === 0 ? (
            <div className="mt-6 rounded-lg border border-zinc-200 py-12 text-center">
              <p className="text-sm font-medium text-zinc-700">
                No se encontraron encuentros EPIM con los filtros seleccionados.
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Ajusta el año, Arciprestazgo, Parroquia o estado para visualizar y
                descargar el informe.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              {groupedPreview.map((group) => (
                <div
                  key={group.arciprestazgo}
                  className="rounded-lg border border-zinc-200 overflow-hidden"
                >
                  <div className="flex flex-col gap-1 border-b border-zinc-200 bg-[#FEF2F2] px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <h4 className="text-xs sm:text-sm font-bold text-[#B9191F]">
                      {group.arciprestazgo}
                    </h4>
                    <span className="text-xs text-zinc-700 tabular-nums">
                      {group.encounters.length} encuentro(s) · {group.totalDisponibles}{' '}
                      cupos disponibles de {group.totalCupos}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
                          <th className="py-2.5 px-4 font-semibold">
                            Parroquia Sede y Lugar
                          </th>
                          <th className="py-2.5 px-4 font-semibold">
                            Fechas Individuales Programadas
                          </th>
                          <th className="py-2.5 px-4 font-semibold">
                            Horario y Contacto
                          </th>
                          <th className="py-2.5 px-4 font-semibold text-right">
                            Cupos y Estado
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {group.encounters.map((enc) => {
                          const dates = getEncounterDates(enc);
                          const disp = Math.max(
                            0,
                            enc.cuposTotales - enc.cuposReservados
                          );
                          return (
                            <tr key={enc.id} className="align-top hover:bg-zinc-50/60">
                              <td className="py-3 px-4">
                                <p className="font-semibold text-zinc-900">
                                  {enc.parroquia}
                                </p>
                                <p className="mt-0.5 text-zinc-500">
                                  {filterYear === 'todos' ? `Año ${enc.year} · ` : ''}
                                  {enc.sedeDetalle || 'Salón Parroquial'}
                                </p>
                              </td>

                              <td className="py-3 px-4 tabular-nums">
                                <p className="font-semibold text-zinc-900">
                                  {formatEncounterDatesEs(enc)}
                                </p>
                                <ul className="mt-1 space-y-0.5 text-[11px] text-zinc-600">
                                  {dates.map((iso, idx) => (
                                    <li key={iso}>
                                      · Fecha {idx + 1}: {formatSingleDateEs(iso)}
                                    </li>
                                  ))}
                                </ul>
                              </td>

                              <td className="py-3 px-4">
                                <p className="text-zinc-800">{enc.horario}</p>
                                <p className="mt-1 text-zinc-600 tabular-nums">
                                  Tel: {enc.telefonoContacto}
                                  {enc.coordinadores ? ` · ${enc.coordinadores}` : ''}
                                </p>
                              </td>

                              <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap">
                                <p className="font-semibold text-zinc-900">
                                  {disp} disp. / {enc.cuposTotales} tot.
                                </p>
                                <p className="mt-0.5 text-zinc-500">
                                  {enc.cuposReservados} reservados ·{' '}
                                  <span
                                    className={
                                      enc.estado === 'abierto'
                                        ? 'font-semibold text-emerald-700'
                                        : enc.estado === 'cerrado'
                                        ? 'font-semibold text-[#DC1F26]'
                                        : 'text-zinc-500'
                                    }
                                  >
                                    {enc.estado === 'abierto'
                                      ? 'Abierto'
                                      : enc.estado === 'cerrado'
                                      ? 'Cupos llenos'
                                      : 'Finalizado'}
                                  </span>
                                </p>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

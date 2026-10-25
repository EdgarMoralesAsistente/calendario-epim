/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Lock, ArrowRight, LayoutDashboard } from 'lucide-react';
import type { EpimEncounter, PublicBoardResponse } from './types/epim.ts';
import {
  formatEncounterDatesEs,
  LOGO_URL_FALLBACK,
  LOGO_URL_PRIMARY,
} from './data/maracaiboCatalog.ts';
import { fetchPublicBoard } from './services/api.ts';
import { getAccessToken, initAuth } from './services/authService.ts';
import { PublicHeader } from './components/PublicHeader.tsx';
import { CarteleraSection } from './components/CarteleraSection.tsx';
import { CalendarSection } from './components/CalendarSection.tsx';
import { BookingAndContactSection } from './components/BookingAndContactSection.tsx';
import { AdminPortal } from './components/AdminPortal.tsx';

function detectAdminRouteFromLocation(): boolean {
  const params = new URLSearchParams(window.location.search);
  const hash = window.location.hash.toLowerCase();
  const pathname = window.location.pathname.toLowerCase();
  return (
    params.get('acceso') === 'admin' ||
    hash === '#admin' ||
    pathname === '/admin' ||
    pathname.endsWith('/admin')
  );
}

export default function App() {
  const [routeMode, setRouteMode] = useState<'public' | 'admin'>(() =>
    detectAdminRouteFromLocation() ? 'admin' : 'public'
  );
  const [hasActiveAdminSession, setHasActiveAdminSession] = useState<boolean>(false);

  const [board, setBoard] = useState<PublicBoardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [preselectedEncounterId, setPreselectedEncounterId] = useState<string>('');
  const [contactTab, setContactTab] = useState<'reserva' | 'consulta'>('reserva');
  const [heroLogoSrc, setHeroLogoSrc] = useState<string>(LOGO_URL_PRIMARY);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPublicBoard();
      setBoard(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar la cartelera de encuentros EPIM.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    const unsub = initAuth(
      async () => {
        const token = await getAccessToken();
        setHasActiveAdminSession(Boolean(token));
      },
      () => {
        setHasActiveAdminSession(false);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const syncRoute = () => {
      setRouteMode(detectAdminRouteFromLocation() ? 'admin' : 'public');
    };
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  const switchMode = (nextMode: 'public' | 'admin') => {
    setRouteMode(nextMode);
    const url = new URL(window.location.href);
    if (nextMode === 'admin') {
      url.searchParams.set('acceso', 'admin');
      url.hash = 'admin';
    } else {
      url.searchParams.delete('acceso');
      if (url.hash === '#admin') {
        url.hash = '';
      }
      if (url.pathname.toLowerCase().endsWith('/admin')) {
        url.pathname = '/';
      }
    }
    window.history.pushState({}, '', url.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateSection = (sectionId: string) => {
    if (sectionId === 'consultas') {
      setContactTab('consulta');
    } else if (sectionId === 'reservas') {
      setContactTab('reserva');
    }
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSelectEncounterForReservation = (encounter: EpimEncounter) => {
    setPreselectedEncounterId(encounter.id);
    setContactTab('reserva');
    const el = document.getElementById('reservas');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleReservationCreated = (updatedEncounter: EpimEncounter) => {
    setBoard((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        encounters: prev.encounters.map((e) =>
          e.id === updatedEncounter.id ? updatedEncounter : e
        ),
      };
    });
  };

  const summaryStats = useMemo(() => {
    const encounters = board?.encounters || [];
    const parroquiasSet = new Set(encounters.map((e) => e.parroquia));
    const openEncounters = encounters.filter(
      (e) => e.estado === 'abierto' && e.cuposTotales - e.cuposReservados > 0
    );
    const totalAvailableCupos = openEncounters.reduce(
      (sum, e) => sum + Math.max(0, e.cuposTotales - e.cuposReservados),
      0
    );
    const nextEncounter = openEncounters[0] || null;
    return {
      totalEncounters: encounters.length,
      parishesCount: parroquiasSet.size,
      totalAvailableCupos,
      nextEncounter,
    };
  }, [board]);

  if (routeMode === 'admin') {
    return (
      <AdminPortal
        onBackToPublic={async () => {
          const token = await getAccessToken();
          setHasActiveAdminSession(Boolean(token));
          loadBoard();
          switchMode('public');
        }}
        onPublicDataChanged={loadBoard}
      />
    );
  }

  return (
    <div id="inicio" className="min-h-screen bg-white text-zinc-900">
      {/* Visible only to an administrator who already authenticated in this session */}
      {hasActiveAdminSession && (
        <div className="no-print border-b border-zinc-800 bg-zinc-900 px-4 py-2 text-xs text-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <span>Vista previa de la Cartelera Pública</span>
            <button
              type="button"
              onClick={() => switchMode('admin')}
              className="inline-flex items-center gap-1.5 font-semibold text-amber-300 hover:underline whitespace-nowrap shrink-0"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Volver al Panel de Control
            </button>
          </div>
        </div>
      )}

      <PublicHeader
        onNavigateSection={handleNavigateSection}
        onOpenAdmin={() => switchMode('admin')}
        isAdminAuthenticated={hasActiveAdminSession}
      />

      {/* Minimalist White Institutional Hero with Official Pastoral Familiar Logo */}
      <section className="border-b border-zinc-200 bg-white pt-10 pb-12 sm:pt-14 sm:pb-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 items-center">
            <div className="lg:col-span-7">
              <p className="text-xs sm:text-sm font-medium text-[#4A4B4E]">
                Arquidiócesis de Maracaibo · Secretariado de Pastoral Familiar
              </p>

              <h1 className="mt-2.5 max-w-2xl font-display text-3xl sm:text-4xl lg:text-[2.65rem] font-bold leading-[1.15] tracking-tight text-zinc-950 [text-wrap:balance]">
                Encuentros de Preparación Inmediata al Matrimonio{' '}
                {board ? `(${board.publicYear})` : ''}
              </h1>

              <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-600">
                Cartelera informativa oficial para sacerdotes, agentes de pastoral y parejas de novios. Consulta las fechas por arciprestazgo y parroquia, verifica los cupos en tiempo real y gestiona tu reservación en línea.
              </p>

              <div className="no-print mt-7 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleNavigateSection('cartelera')}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#DC1F26] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#B9191F] whitespace-nowrap shrink-0"
                >
                  Explorar Cartelera {board?.publicYear || ''}
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateSection('calendario')}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-50 whitespace-nowrap shrink-0"
                >
                  <Calendar className="h-4 w-4 text-[#DC1F26]" />
                  Ver Disponibilidad en Calendario
                </button>
              </div>
            </div>

            {/* Official Logo Presentation */}
            <div className="flex justify-center lg:col-span-5 lg:justify-end">
              <div className="flex flex-col items-center rounded-2xl border border-zinc-100 bg-zinc-50/40 px-8 py-7 text-center">
                <img
                  src={heroLogoSrc}
                  onError={() => setHeroLogoSrc(LOGO_URL_FALLBACK)}
                  referrerPolicy="no-referrer"
                  alt="Logo oficial del Secretariado de Pastoral Familiar de la Arquidiócesis de Maracaibo"
                  className="h-44 sm:h-52 w-auto object-contain"
                />
                {summaryStats.nextEncounter && (
                  <div className="mt-4 border-t border-zinc-200/80 pt-3 text-xs text-zinc-600">
                    <span>Próximo encuentro con cupos: </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleSelectEncounterForReservation(summaryStats.nextEncounter!)
                      }
                      className="font-semibold text-[#DC1F26] hover:underline"
                    >
                      {summaryStats.nextEncounter.parroquia} (
                      {formatEncounterDatesEs(summaryStats.nextEncounter)})
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Full-Width Key Operational Strip Below Hero Split */}
          <div className="mt-10 grid grid-cols-2 gap-4 border-t border-zinc-200 pt-8 sm:grid-cols-4">
            <div>
              <div className="text-xs text-zinc-500">Año Pastoral Vigente</div>
              <div className="mt-1 font-mono text-xl sm:text-2xl font-bold text-zinc-900 tabular-nums">
                {board ? board.publicYear : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Encuentros Programados</div>
              <div className="mt-1 font-mono text-xl sm:text-2xl font-bold text-zinc-900 tabular-nums">
                {loading ? '...' : summaryStats.totalEncounters}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Parroquias Sedes</div>
              <div className="mt-1 font-mono text-xl sm:text-2xl font-bold text-zinc-900 tabular-nums">
                {loading ? '...' : summaryStats.parishesCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Cupos de Pareja Disponibles</div>
              <div className="mt-1 font-mono text-xl sm:text-2xl font-bold text-[#DC1F26] tabular-nums">
                {loading ? '...' : summaryStats.totalAvailableCupos}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Loading / Error / Main Public Content */}
      {loading ? (
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-64 animate-pulse rounded-xl border border-zinc-200 bg-zinc-50 p-6"
              />
            ))}
          </div>
        </div>
      ) : error || !board ? (
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <p className="text-sm font-medium text-[#DC1F26]">
            {error || 'No se pudo conectar con la cartelera.'}
          </p>
          <button
            type="button"
            onClick={loadBoard}
            className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white"
          >
            Reintentar carga
          </button>
        </div>
      ) : (
        <main>
          <CarteleraSection
            publicYear={board.publicYear}
            encounters={board.encounters}
            customParishes={board.customParishes}
            onSelectForReservation={handleSelectEncounterForReservation}
          />

          <CalendarSection
            publicYear={board.publicYear}
            encounters={board.encounters}
            onSelectForReservation={handleSelectEncounterForReservation}
          />

          <BookingAndContactSection
            publicYear={board.publicYear}
            encounters={board.encounters}
            preselectedEncounterId={preselectedEncounterId}
            activeTab={contactTab}
            onTabChange={setContactTab}
            secretariado={board.secretariado}
            onReservationCreated={handleReservationCreated}
          />
        </main>
      )}

      {/* Clean Institutional Footer with Pastoral Admin Access */}
      <footer className="bg-white py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <div>
            <div className="font-display text-sm font-bold text-zinc-900">
              Secretariado de Pastoral Familiar · Arquidiócesis de Maracaibo
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Cartelera oficial de los Encuentros de Preparación Inmediata al Matrimonio (EPIM).
            </p>
          </div>

          <div className="no-print flex flex-wrap items-center gap-6 text-xs font-medium text-zinc-500">
            <a
              href="#cartelera"
              onClick={(e) => {
                e.preventDefault();
                handleNavigateSection('cartelera');
              }}
              className="hover:text-zinc-900 whitespace-nowrap shrink-0"
            >
              Cartelera
            </a>
            <a
              href="#calendario"
              onClick={(e) => {
                e.preventDefault();
                handleNavigateSection('calendario');
              }}
              className="hover:text-zinc-900 whitespace-nowrap shrink-0"
            >
              Calendario
            </a>
            <button
              type="button"
              onClick={() => switchMode('admin')}
              className="inline-flex items-center gap-1.5 font-semibold text-zinc-700 transition-colors hover:text-[#DC1F26] whitespace-nowrap shrink-0"
            >
              <Lock className="h-3.5 w-3.5 text-[#DC1F26]" />
              Panel de Control Administrativo
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

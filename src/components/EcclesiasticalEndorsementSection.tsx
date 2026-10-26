import React from 'react';
import { ArrowRight } from 'lucide-react';
import { LOGO_URL_FALLBACK } from '../data/maracaiboCatalog.ts';

interface EcclesiasticalEndorsementSectionProps {
  onExploreApprovedEncounters: () => void;
}

interface HierarchyInstitution {
  orden: string;
  nivel: string;
  nombre: string;
  logoUrl: string;
}

const TALLY_POPUP_HREF =
  '#tally-open=rjZMvL&tally-width=300&tally-hide-title=1&tally-emoji-text=👋&tally-emoji-animation=wave&tally-auto-close=13000';

const ECCLESIASTICAL_HIERARCHY: HierarchyInstitution[] = [
  {
    orden: '01',
    nivel: 'Episcopado Nacional',
    nombre: 'Conferencia Episcopal Venezolana',
    logoUrl:
      'https://res.cloudinary.com/djvpapwvq/image/upload/v1793013599/Logo_CEV_-_Sin_fondo_io7ffu.png',
  },
  {
    orden: '02',
    nivel: 'Instancia Pastoral Nacional',
    nombre: 'Centro de Laicos, Familia y Juventud',
    logoUrl:
      'https://res.cloudinary.com/djvpapwvq/image/upload/v1793013754/SPEV-removebg-preview_kz5xgm.png',
  },
  {
    orden: '03',
    nivel: 'Iglesia Particular',
    nombre: 'Arquidiócesis de Maracaibo',
    logoUrl:
      'https://res.cloudinary.com/djvpapwvq/image/upload/v1793013599/Arquidiocesis_de_Maracaibo_xbbppk.png',
  },
  {
    orden: '04',
    nivel: 'Coordinación Arquidiocesana',
    nombre: 'Secretariado de Pastoral Familiar de la Arquidiócesis de Maracaibo',
    logoUrl:
      'https://res.cloudinary.com/djvpapwvq/image/upload/v1793013600/Logo_del_Secretariado_de_Pastoral_Familiar_Sin_fondo_fsghaw.png',
  },
];

export const EcclesiasticalEndorsementSection: React.FC<
  EcclesiasticalEndorsementSectionProps
> = ({ onExploreApprovedEncounters }) => {
  return (
    <section
      id="aval-arquidiocesano"
      className="no-print scroll-mt-20 border-b border-zinc-200 bg-white py-16 sm:py-20"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Persuasive Header & Dual Pastoral Call (Priests & Engaged Couples) */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="text-xs font-medium text-[#DC1F26]">
              Respaldo Eclesiástico y Validez Canónica
            </p>

            <h2 className="mt-1.5 max-w-2xl font-display text-2xl sm:text-3xl font-bold leading-tight tracking-tight text-zinc-950 [text-wrap:balance]">
              El único certificado EPIM avalado por la Arquidiócesis de Maracaibo
            </h2>

            <p className="mt-3 max-w-2xl text-sm sm:text-base leading-relaxed text-zinc-600">
              Solo los Encuentros de Preparación Inmediata al Matrimonio avalados por el{' '}
              <strong className="font-semibold text-zinc-900">
                Secretariado de Pastoral Familiar
              </strong>{' '}
              cumplen fielmente con el manual oficial emitido por la{' '}
              <strong className="font-semibold text-zinc-900">
                Conferencia Episcopal Venezolana (CEV)
              </strong>{' '}
              y el{' '}
              <strong className="font-semibold text-zinc-900">
                Departamento de Laicos, Familia y Juventud
              </strong>
              .
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 border-t border-zinc-200 pt-6 sm:grid-cols-2 lg:col-span-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
            <div>
              <h3 className="font-display text-sm font-semibold text-zinc-900">
                Para los novios
              </h3>
              <p className="mt-1 text-xs sm:text-sm leading-relaxed text-zinc-600">
                Inscríbete en un encuentro oficial y recibe el único certificado reconocido en toda la Arquidiócesis para tu expediente matrimonial.
              </p>
              <button
                type="button"
                onClick={onExploreApprovedEncounters}
                className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-[#DC1F26] transition-colors hover:text-[#B9191F] hover:underline whitespace-nowrap"
              >
                Elegir un EPIM avalado
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </button>
            </div>

            <div>
              <h3 className="font-display text-sm font-semibold text-zinc-900">
                Para los párrocos
              </h3>
              <p className="mt-1 text-xs sm:text-sm leading-relaxed text-zinc-600">
                Articula el EPIM de tu parroquia con el Secretariado para contar con el aval arquidiocesano y el itinerario oficial de la CEV.
              </p>
              <a
                href={TALLY_POPUP_HREF}
                className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-900 transition-colors hover:text-[#DC1F26] hover:underline whitespace-nowrap"
              >
                Solicitar aval parroquial
                <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              </a>
            </div>
          </div>
        </div>

        {/* Graphic Composition of Ecclesiastical Endorsement Hierarchy (Order 1 -> 4) */}
        <div className="mt-12">
          <div className="mb-4 flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
            <span className="text-xs font-semibold text-zinc-800">
              Instancias eclesiásticas que avalan el Programa EPIM
            </span>
            <span className="text-xs text-zinc-500">
              Orden jerárquico en la Iglesia en Venezuela
            </span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50/45">
            <ol className="grid grid-cols-1 divide-y divide-zinc-200/80 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
              {ECCLESIASTICAL_HIERARCHY.map((item, idx) => (
                <li
                  key={item.nombre}
                  className={`flex flex-col justify-between p-6 sm:p-7 ${
                    idx >= 2 ? 'sm:border-t sm:border-zinc-200/80 lg:border-t-0' : ''
                  } ${idx % 2 === 1 ? 'sm:border-l sm:border-zinc-200/80 lg:border-l-0' : ''}`}
                >
                  {/* Unboxed Hierarchy Step */}
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span className="font-mono font-semibold text-[#DC1F26] tabular-nums">
                      {item.orden}
                    </span>
                    <span aria-hidden="true" className="mx-1.5 text-zinc-300">
                      ·
                    </span>
                    <span className="truncate font-medium text-zinc-500">
                      {item.nivel}
                    </span>
                  </div>

                  {/* Balanced Institutional Crest / Logo Stage */}
                  <div className="my-6 flex h-32 items-center justify-center px-2">
                    <img
                      src={item.logoUrl}
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (target.src !== window.location.origin + LOGO_URL_FALLBACK) {
                          target.src = LOGO_URL_FALLBACK;
                        }
                      }}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      alt={`Logo oficial de ${item.nombre}`}
                      className="max-h-28 w-auto max-w-[190px] object-contain"
                    />
                  </div>

                  {/* Official Ecclesiastical Name */}
                  <div className="border-t border-zinc-200/70 pt-3.5 text-center">
                    <p className="font-display text-xs sm:text-sm font-semibold leading-snug text-zinc-900 [text-wrap:balance]">
                      {item.nombre}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
};

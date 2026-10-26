import React from 'react';
import { ArrowRight } from 'lucide-react';

const TALLY_POPUP_HREF =
  '#tally-open=rjZMvL&tally-width=300&tally-hide-title=1&tally-emoji-text=👋&tally-emoji-animation=wave&tally-auto-close=13000';

export const ParishRegistrationPromoSection: React.FC = () => {
  return (
    <section
      id="registrar-epim"
      className="no-print scroll-mt-20 border-b border-zinc-200 bg-zinc-50/70 py-14 sm:py-18"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-center">
          {/* Persuasive Pastoral Pitch + Tally Popup CTA */}
          <div className="lg:col-span-7">
            <p className="text-xs font-medium text-[#DC1F26]">
              Invitación a Párrocos y Equipos de Pastoral Familiar
            </p>

            <h2 className="mt-1.5 max-w-xl font-display text-2xl sm:text-3xl font-bold leading-tight tracking-tight text-zinc-950 [text-wrap:balance]">
              ¿Tu parroquia realiza encuentros EPIM y aún no aparece en la web?
            </h2>

            <p className="mt-3 max-w-xl text-sm sm:text-base leading-relaxed text-zinc-600">
              Suma los encuentros de tu parroquia a la cartelera oficial de la Arquidiócesis de Maracaibo. Facilita que los novios conozcan tus fechas a tiempo, reserven su cupo con orden y vivan su preparación al matrimonio en plena comunión arquidiocesana.
            </p>

            <div className="mt-7 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <a
                href={TALLY_POPUP_HREF}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#DC1F26] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#B9191F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC1F26] whitespace-nowrap shrink-0"
              >
                Solicitar registro de nuestro EPIM
                <ArrowRight className="h-4 w-4 shrink-0" />
              </a>

              <span className="text-xs text-zinc-500">
                Formulario rápido · Atención directa del Secretariado
              </span>
            </div>
          </div>

          {/* Concise Editorial Reasons for Parishes */}
          <div className="lg:col-span-5">
            <dl className="divide-y divide-zinc-200/90 border-t border-b border-zinc-200/90">
              <div className="py-4">
                <dt className="font-display text-sm font-semibold text-zinc-900">
                  01. Mayor alcance para los novios
                </dt>
                <dd className="mt-1 text-xs sm:text-sm leading-relaxed text-zinc-600">
                  Las parejas de tu comunidad y de todo tu arciprestazgo podrán consultar tus fechas desde cualquier dispositivo.
                </dd>
              </div>

              <div className="py-4">
                <dt className="font-display text-sm font-semibold text-zinc-900">
                  02. Inscripciones organizadas a tiempo
                </dt>
                <dd className="mt-1 text-xs sm:text-sm leading-relaxed text-zinc-600">
                  Ayuda a tu despacho parroquial y al equipo coordinador a prever la asistencia y disponibilidad de cupos con antelación.
                </dd>
              </div>

              <div className="py-4">
                <dt className="font-display text-sm font-semibold text-zinc-900">
                  03. Comunión en toda la Arquidiócesis
                </dt>
                <dd className="mt-1 text-xs sm:text-sm leading-relaxed text-zinc-600">
                  Integra tu programación al directorio oficial y a los informes pastorales del Secretariado de Pastoral Familiar.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
};

import React, { useState } from 'react';
import { Lock, Menu, X } from 'lucide-react';

interface PublicHeaderProps {
  onNavigateSection: (sectionId: string) => void;
  onOpenAdmin: () => void;
  isAdminAuthenticated?: boolean;
}

export const PublicHeader: React.FC<PublicHeaderProps> = ({
  onNavigateSection,
  onOpenAdmin,
  isAdminAuthenticated = false,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleMobileNav = (sectionId: string) => {
    setMobileMenuOpen(false);
    onNavigateSection(sectionId);
  };

  return (
    <header className="no-print sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6 lg:px-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <a
          href="#inicio"
          onClick={(e) => {
            e.preventDefault();
            onNavigateSection('inicio');
          }}
          className="font-display text-lg font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#DC1F26]"
        >
          EPIM Maracaibo
        </a>

        {/* Zone 2: 5 Single-line Navigation Links (including protected Panel Admin) */}
        <nav
          aria-label="Navegación principal"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-600"
        >
          <a
            href="#cartelera"
            onClick={(e) => {
              e.preventDefault();
              onNavigateSection('cartelera');
            }}
            className="py-1 transition-colors hover:text-zinc-950 hover:underline hover:underline-offset-8 whitespace-nowrap shrink-0"
          >
            Cartelera
          </a>
          <a
            href="#calendario"
            onClick={(e) => {
              e.preventDefault();
              onNavigateSection('calendario');
            }}
            className="py-1 transition-colors hover:text-zinc-950 hover:underline hover:underline-offset-8 whitespace-nowrap shrink-0"
          >
            Calendario
          </a>
          <a
            href="#reservas"
            onClick={(e) => {
              e.preventDefault();
              onNavigateSection('reservas');
            }}
            className="py-1 transition-colors hover:text-zinc-950 hover:underline hover:underline-offset-8 whitespace-nowrap shrink-0"
          >
            Reservaciones
          </a>
          <a
            href="#consultas"
            onClick={(e) => {
              e.preventDefault();
              onNavigateSection('consultas');
            }}
            className="py-1 transition-colors hover:text-zinc-950 hover:underline hover:underline-offset-8 whitespace-nowrap shrink-0"
          >
            Consultas
          </a>
          <a
            href="#admin"
            onClick={(e) => {
              e.preventDefault();
              onOpenAdmin();
            }}
            className="inline-flex items-center gap-1.5 py-1 text-zinc-700 transition-colors hover:text-[#DC1F26] hover:underline hover:underline-offset-8 whitespace-nowrap shrink-0"
          >
            <Lock className="h-3.5 w-3.5 text-[#DC1F26]" />
            {isAdminAuthenticated ? 'Panel Activo' : 'Panel Admin'}
          </a>
        </nav>

        {/* Zone 3: 1 Primary Action (+ Mobile Menu Button on small screens) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateSection('reservas')}
            className="rounded-lg bg-[#DC1F26] px-4 py-2 text-xs sm:text-sm font-semibold text-white transition-colors hover:bg-[#B9191F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#DC1F26] whitespace-nowrap shrink-0"
          >
            Reservar Cupo
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-200 p-2 text-zinc-700 hover:bg-zinc-50 md:hidden"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Responsive Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="border-t border-zinc-200 bg-white px-4 py-3 md:hidden">
          <nav className="flex flex-col space-y-1 text-sm font-medium text-zinc-700">
            <button
              type="button"
              onClick={() => handleMobileNav('cartelera')}
              className="rounded-lg px-3 py-2.5 text-left hover:bg-zinc-50"
            >
              Cartelera de Encuentros
            </button>
            <button
              type="button"
              onClick={() => handleMobileNav('calendario')}
              className="rounded-lg px-3 py-2.5 text-left hover:bg-zinc-50"
            >
              Calendario de Disponibilidad
            </button>
            <button
              type="button"
              onClick={() => handleMobileNav('reservas')}
              className="rounded-lg px-3 py-2.5 text-left hover:bg-zinc-50"
            >
              Reservar Cupo
            </button>
            <button
              type="button"
              onClick={() => handleMobileNav('consultas')}
              className="rounded-lg px-3 py-2.5 text-left hover:bg-zinc-50"
            >
              Enviar Consulta Directa
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenAdmin();
              }}
              className="mt-1 flex items-center gap-2 rounded-lg border-t border-zinc-100 px-3 pt-3 pb-2 text-left font-semibold text-[#DC1F26] hover:bg-red-50/50"
            >
              <Lock className="h-4 w-4" />
              Panel de Control (Administradores)
            </button>
          </nav>
        </div>
      )}
    </header>
  );
};

import React, { useState } from 'react';
import { useGame } from '../state/store';
import { formatDateBR, WEEKDAYS_SHORT } from '../lib/date';
import {
  LayoutDashboard, Users, ClipboardList, Trophy, CalendarDays, ArrowLeftRight, Landmark,
  Wallet, Dumbbell, Newspaper, Building2, Medal, Settings, Menu, X, Bell, Briefcase, ChevronRight, Rocket,
} from 'lucide-react';
import { ClubCrest, PlayerAvatar } from './components';
import { nextMatchForClub } from '../game/competitions';
import { overallOf } from '../game/overall';
import { isUpdateAvailable, openUpdateModal } from '../game/updateNotes';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Painel', icon: <LayoutDashboard size={17} /> },
  { id: 'squad', label: 'Elenco', icon: <Users size={17} /> },
  { id: 'tactics', label: 'Táticas', icon: <ClipboardList size={17} /> },
  { id: 'competitions', label: 'Competições', icon: <Trophy size={17} /> },
  { id: 'calendar', label: 'Calendário', icon: <CalendarDays size={17} /> },
  { id: 'transfers', label: 'Mercado', icon: <ArrowLeftRight size={17} /> },
  { id: 'stadium', label: 'Estádio', icon: <Landmark size={17} /> },
  { id: 'finances', label: 'Finanças', icon: <Wallet size={17} /> },
  { id: 'training', label: 'Treino', icon: <Dumbbell size={17} /> },
  { id: 'news', label: 'Notícias', icon: <Newspaper size={17} /> },
  { id: 'staff', label: 'Comissão', icon: <Briefcase size={17} /> },
  { id: 'records', label: 'Recordes', icon: <Medal size={17} /> },
];

export function Shell({ children, active }: { children: React.ReactNode; active: string }) {
  const { career, navigate, user, settings, saveNow, lastSaved } = useGame();
  const [open, setOpen] = useState(false);
  if (!career) return null;

  const club = career.world.clubs[career.clubId];
  const unread = career.notifications.filter((n) => !n.read).length;
  const next = career.clubId ? nextMatchForClub(career.world, career.clubId, career.world.date) : null;
  const dow = WEEKDAYS_SHORT[new Date(career.world.date + 'T12:00:00').getDay()];

  const SidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-surface-700/60">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-sky-500 flex items-center justify-center font-display font-extrabold text-surface-950">FS</div>
        <div>
          <p className="font-display font-bold text-slate-100 leading-tight">FootballSim</p>
          <p className="text-[10px] text-slate-500">Temporada {career.world.season}</p>
        </div>
      </div>

      <div className="px-3 py-3 border-b border-surface-700/60">
        {club ? (
          <button onClick={() => navigate('club')} className="w-full flex items-center gap-2.5 rounded-xl p-2 hover:bg-surface-800 transition group">
            <ClubCrest club={club} size={38} />
            <div className="text-left flex-1 min-w-0">
              <p className="font-semibold text-sm text-slate-100 truncate">{club.shortName}</p>
              <p className="text-[11px] text-slate-500 truncate">{career.manager.name}</p>
            </div>
            <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400" />
          </button>
        ) : (
          <button onClick={() => navigate('jobs')} className="w-full flex items-center gap-2.5 rounded-xl p-2 bg-gold/10 border border-gold/30 hover:bg-gold/15 transition">
            <div className="w-9 h-9 rounded-lg bg-gold/20 flex items-center justify-center text-gold">💼</div>
            <div className="text-left">
              <p className="font-semibold text-sm text-gold">Desempregado</p>
              <p className="text-[11px] text-slate-400">Buscar ofertas</p>
            </div>
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {NAV.map((item) => (
          <button
            key={item.id}
            onClick={() => { navigate(item.id); setOpen(false); }}
            className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${active === item.id ? 'bg-accent/15 text-accent' : 'text-slate-400 hover:bg-surface-800 hover:text-slate-200'}`}
          >
            {item.icon}
            {item.label}
            {item.id === 'news' && unread > 0 && (
              <span className="ml-auto text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{unread}</span>
            )}
          </button>
        ))}
        {!career.clubId && (
          <button onClick={() => { navigate('jobs'); setOpen(false); }} className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${active === 'jobs' ? 'bg-gold/15 text-gold' : 'text-slate-400 hover:bg-surface-800 hover:text-slate-200'}`}>
            <Briefcase size={17} /> Ofertas de emprego
          </button>
        )}
        <div className="pt-3 mt-3 border-t border-surface-700/60 space-y-0.5">
          {isUpdateAvailable() && (
            <button
              onClick={() => { openUpdateModal(); setOpen(false); }}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gold hover:bg-gold/10 transition"
            >
              <Rocket size={17} /> Atualização disponível
              <span className="ml-auto text-[10px] font-bold bg-gold text-surface-950 rounded-full px-1.5 py-0.5">NOVA</span>
            </button>
          )}
          <button onClick={() => { navigate('settings'); setOpen(false); }} className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-surface-800 hover:text-slate-200 transition">
            <Settings size={17} /> Configurações
          </button>
          <button onClick={() => { void saveNow(); }} className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-surface-800 hover:text-slate-300 transition">
            💾 Salvar agora
          </button>
        </div>
      </nav>

      <div className="px-4 py-3 border-t border-surface-700/60 text-[11px] text-slate-500">
        <p className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          {lastSaved ? `Salvo ${lastSaved.toLocaleTimeString('pt-BR')}` : 'Autosave ativo'}
        </p>
        <p className="mt-0.5 text-slate-600">{user?.name}</p>
      </div>
    </div>
  );

  return (
    <div className="h-full flex">
      {/* Sidebar desktop */}
      <aside className="hidden lg:block w-60 shrink-0 bg-surface-900/70 border-r border-surface-700/50">
        {SidebarContent}
      </aside>

      {/* Sidebar mobile */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-surface-900 border-r border-surface-700 animate-slideIn">
            {SidebarContent}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-surface-700/50 bg-surface-900/50 backdrop-blur sticky top-0 z-30">
          <button onClick={() => setOpen(true)} className="lg:hidden rounded-lg p-2 text-slate-400 hover:bg-surface-700">
            <Menu size={20} />
          </button>
          <div className="hidden sm:flex items-center gap-2 text-sm">
            <span className="text-slate-500">📅</span>
            <span className="font-mono font-semibold text-slate-300">{dow}, {formatDateBR(career.world.date)}</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-xs text-slate-400">
            {club && (
              <>
                <span className="hidden md:inline">💰 {Math.round(club.balance / 1_000_000)}M</span>
                <span className="hidden md:inline text-slate-600">·</span>
                <span className="hidden md:inline">📊 {club.squadStrength.toFixed(1)}</span>
              </>
            )}
          </div>
          {next && (
            <button onClick={() => navigate('calendar')} className="hidden md:flex items-center gap-1.5 rounded-lg bg-accent/10 border border-accent/30 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20 transition">
              ⚽ vs {next.homeId === career.clubId ? career.world.clubs[next.awayId].shortName : career.world.clubs[next.homeId].shortName}
            </button>
          )}
          <button onClick={() => navigate('news')} className="relative rounded-lg p-2 text-slate-400 hover:bg-surface-700">
            <Bell size={18} />
            {unread > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" />}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export { overallOf, PlayerAvatar };

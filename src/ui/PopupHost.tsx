// ============================================================
// FootballSim — Host dos popups na tela
// Mostra os eventos importantes como um modal central (um por
// vez, em fila) e os eventos menores como toasts no canto
// superior direito que somem sozinhos. Durante uma partida os
// modais ficam em espera — nada interrompe o jogo.
// ============================================================
import { useEffect, useRef } from 'react';
import { useGame } from '../state/store';
import type { GamePopup } from '../game/popups';

const TYPE_STYLE: Record<GamePopup['type'], { iconBg: string; border: string; bar: string }> = {
  proposal: { iconBg: 'bg-gold/20', border: 'border-gold/50', bar: 'bg-gold' },
  'player-accepted': { iconBg: 'bg-emerald-500/20', border: 'border-emerald-500/50', bar: 'bg-emerald-500' },
  'player-refused': { iconBg: 'bg-red-500/20', border: 'border-red-500/50', bar: 'bg-red-500' },
  'club-refused': { iconBg: 'bg-red-500/20', border: 'border-red-500/50', bar: 'bg-red-500' },
  'transfer-concluded': { iconBg: 'bg-emerald-500/20', border: 'border-emerald-500/50', bar: 'bg-emerald-500' },
  inquiry: { iconBg: 'bg-sky-500/20', border: 'border-sky-500/50', bar: 'bg-sky-500' },
  'player-talk': { iconBg: 'bg-sky-500/20', border: 'border-sky-500/50', bar: 'bg-sky-500' },
  interest: { iconBg: 'bg-surface-700', border: 'border-surface-600', bar: 'bg-slate-400' },
  info: { iconBg: 'bg-surface-700', border: 'border-surface-600', bar: 'bg-slate-400' },
};

function PopupIcon({ p, size }: { p: GamePopup; size: 'lg' | 'sm' }) {
  const s = TYPE_STYLE[p.type];
  return (
    <div className={`${s.iconBg} ${size === 'lg' ? 'w-14 h-14 text-2xl' : 'w-9 h-9 text-base'} rounded-xl flex items-center justify-center shrink-0`}>
      {p.icon}
    </div>
  );
}

function PopupModal({ p, onClose }: { p: GamePopup; onClose: () => void }) {
  const { navigate } = useGame();
  const s = TYPE_STYLE[p.type];
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div className={`card w-full max-w-md overflow-hidden animate-fadeUp border ${s.border}`} onClick={(e) => e.stopPropagation()}>
        <div className={`h-1 w-full ${s.bar}`} />
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <PopupIcon p={p} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{p.type === 'proposal' ? 'Transferências' : p.type === 'player-talk' ? 'Elenco' : 'Mercado'}</p>
              <h3 className="font-display font-bold text-lg text-slate-100 leading-tight">{p.icon} {p.title}</h3>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-surface-700 hover:text-slate-200">✕</button>
          </div>
          <p className="text-sm text-slate-300 mb-3">{p.message}</p>
          {p.meta.length > 0 && (
            <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-3 space-y-1.5 mb-4">
              {p.meta.map((m, i) => (
                <div key={i} className="flex justify-between gap-3 text-sm">
                  <span className="text-slate-500 shrink-0">{m.label}</span>
                  <span className="text-slate-200 font-semibold text-right">{m.value}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => { navigate(p.link); onClose(); }}
              className="btn-primary flex-1 !py-2.5 text-sm"
            >
              {p.actionLabel} →
            </button>
            <button onClick={onClose} className="btn-ghost !px-5 text-sm">Fechar</button>
          </div>
          <p className="text-[10px] text-slate-600 mt-3 text-center">O evento também fica registrado na Central de Mensagens.</p>
        </div>
      </div>
    </div>
  );
}

function PopupToast({ p, onClose }: { p: GamePopup; onClose: () => void }) {
  const { navigate } = useGame();
  const s = TYPE_STYLE[p.type];
  return (
    <div
      onClick={() => { navigate(p.link); onClose(); }}
      className={`w-full max-w-xs text-left rounded-xl border ${s.border} bg-surface-900/95 backdrop-blur p-3 flex items-start gap-2.5 shadow-lg animate-slideIn hover:border-accent/60 transition cursor-pointer`}
    >
      <PopupIcon p={p} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-slate-100 truncate">{p.icon} {p.title}</p>
        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{p.message}</p>
      </div>
      <button
        className="text-[10px] text-slate-500 shrink-0 hover:text-slate-200"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Fechar notificação"
      >✕</button>
    </div>
  );
}

export function PopupHost() {
  const { popups, dismissPopup, route } = useGame();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const inMatch = route === 'live' || route.startsWith('matchday') || route.startsWith('season-end');

  // toasts somem sozinhos após alguns segundos
  const toasts = popups.filter((p) => p.priority === 'normal');
  useEffect(() => {
    const current = new Set(toasts.map((t) => t.id));
    for (const id of Object.keys(timers.current)) {
      if (!current.has(id)) {
        clearTimeout(timers.current[id]);
        delete timers.current[id];
      }
    }
    for (const t of toasts) {
      if (timers.current[t.id]) continue;
      timers.current[t.id] = setTimeout(() => {
        dismissPopup(t.id);
        delete timers.current[t.id];
      }, 6000);
    }
  }, [toasts, dismissPopup]);

  // modais: um por vez (fila) — em partida ficam em espera
  const modal = inMatch ? undefined : popups.find((p) => p.priority !== 'normal');

  return (
    <>
      {modal && <PopupModal p={modal} onClose={() => dismissPopup(modal.id)} />}
      <div className="fixed top-4 right-4 z-[75] flex flex-col gap-2 w-full max-w-xs pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto"><PopupToast p={t} onClose={() => dismissPopup(t.id)} /></div>
        ))}
      </div>
    </>
  );
}

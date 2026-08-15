import { useGame } from '../../state/store';
import { formatDateBR } from '../../lib/date';
import { ArrowLeft } from 'lucide-react';

const CAT_ICON: Record<string, string> = {
  'Transferências': '💼', 'Partidas': '⚽', 'Mercado': '📈', 'Lesões': '🩹',
  'Clubes': '🏟️', 'Seleções': '🌍', 'Títulos': '🏆', 'Carreira': '🎯',
};

export function NewsScreen() {
  const { career, navigate, goBack, touch } = useGame();
  const world = career!.world;
  const unread = career!.notifications.filter((n) => !n.read);

  const markAll = () => {
    career!.notifications.forEach((n) => { n.read = true; });
    world.news.forEach((n) => { n.read = true; });
    touch();
  };

  return (
    <div className="space-y-5 animate-fadeUp">
      <div className="flex items-center gap-3">
        <button onClick={() => goBack()} className="btn-ghost !px-2 !py-1 text-xs"><ArrowLeft size={14} /> Voltar</button>
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100">Notícias</h1>
          <p className="text-sm text-slate-500">O mundo do futebol nunca para.</p>
        </div>
        <div className="flex-1" />
        <button onClick={markAll} className="btn-ghost text-xs">Marcar todas como lidas</button>
      </div>

      {unread.length > 0 && (
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Notificações ({unread.length})</p>
          <div className="space-y-2">
            {unread.slice(0, 8).map((n) => (
              <div key={n.id} className={`flex items-start gap-2.5 rounded-lg bg-surface-800/40 p-3 text-sm ${n.link ? 'cursor-pointer hover:bg-surface-700/60' : ''}`} onClick={() => { n.read = true; touch(); if (n.link) navigate(n.link); }}>
                <span className="text-lg">{n.icon}</span>
                <p className={`flex-1 ${n.kind === 'danger' ? 'text-red-300' : n.kind === 'success' ? 'text-accent' : n.kind === 'warning' ? 'text-gold' : 'text-slate-300'}`}>{n.text}</p>
                <span className="text-[10px] text-slate-600 shrink-0">{formatDateBR(n.date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Feed de notícias do mundo</p>
        <div className="space-y-1">
          {world.news.slice(0, 60).map((n) => (
            <div key={n.id} className="flex items-start gap-3 py-2.5 border-b border-surface-700/40 last:border-0">
              <span className="text-xl shrink-0">{CAT_ICON[n.category] ?? '📰'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 leading-snug">{n.title}</p>
                {n.subtitle && <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{n.subtitle}</p>}
                <div className="flex items-center gap-2 mt-1">
                  <span className="badge bg-surface-800 text-slate-400 border border-surface-600">{n.category}</span>
                  {n.playerId && <button onClick={() => navigate(`player:${n.playerId}`)} className="text-[11px] text-accent hover:underline">ver jogador</button>}
                  {n.clubId && !n.playerId && <button onClick={() => navigate(`club:${n.clubId}`)} className="text-[11px] text-accent hover:underline">ver clube</button>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] text-slate-600">{formatDateBR(n.date)}</span>
                {n.importance >= 80 && <p className="text-[10px] text-gold mt-0.5">🔥 Destaque</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

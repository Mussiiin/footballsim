import { useState } from 'react';
import { ArrowLeft, MailOpen, Inbox as InboxIcon } from 'lucide-react';
import { useGame } from '../../state/store';
import { PlayerAvatar } from '../components';
import { CATEGORY_LABELS, PRIORITY_LABELS, markAllInboxRead, openPlayerConversation, unreadInboxCount } from '../../game/messages';
import { formatDateBR } from '../../lib/date';
import type { InboxCategory } from '../../lib/types';

type Filter = 'all' | 'unread' | InboxCategory;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'unread', label: 'Não lidas' },
  { id: 'transfer', label: 'Transferências' },
  { id: 'squad', label: 'Elenco' },
  { id: 'contract', label: 'Contratos' },
  { id: 'board', label: 'Diretoria' },
  { id: 'finance', label: 'Finanças' },
];

const PRIORITY_STYLE: Record<string, string> = {
  low: 'bg-slate-500',
  normal: 'bg-sky-500',
  important: 'bg-gold',
  urgent: 'bg-red-500',
};

export function MessagesScreen() {
  const { career, touch, goBack, navigate } = useGame();
  const world = career!.world;
  const [filter, setFilter] = useState<Filter>('all');

  const messages = world.inbox.filter((m) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !m.read;
    return m.category === filter;
  });

  const unread = unreadInboxCount(world);

  const open = (id: string, playerId?: string, link?: string) => {
    const m = world.inbox.find((x) => x.id === id);
    if (m && !m.read) {
      m.read = true;
      touch();
    }
    if (playerId) {
      openPlayerConversation(playerId);
    } else if (link) {
      navigate(link);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 animate-fadeUp">
      <div className="flex items-center gap-3">
        <button onClick={goBack} className="btn-ghost !px-3 text-sm"><ArrowLeft size={16} /> Voltar</button>
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100">💬 Mensagens</h1>
          <p className="text-sm text-slate-500">
            {unread > 0 ? <span className="text-accent font-semibold">{unread} não lida(s)</span> : 'Caixa de entrada em dia'} · Conversas, propostas e avisos do clube
          </p>
        </div>
        {unread > 0 && (
          <button
            onClick={() => { markAllInboxRead(world); touch(); }}
            className="btn-secondary ml-auto !py-1.5 text-xs"
          >
            <MailOpen size={13} /> Marcar todas como lidas
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${filter === f.id ? 'bg-accent/15 text-accent border border-accent/40' : 'text-slate-400 border border-surface-700 hover:bg-surface-800'}`}
          >
            {f.label}
            {f.id === 'unread' && unread > 0 && <span className="ml-1.5 bg-red-500 text-white rounded-full px-1.5 text-[10px] font-bold">{unread}</span>}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {messages.length === 0 ? (
          <div className="card p-10 text-center">
            <InboxIcon size={36} className="mx-auto text-slate-600 mb-3" />
            <p className="text-slate-300 font-semibold">Caixa de entrada vazia</p>
            <p className="text-xs text-slate-500 mt-1">Quando jogadores, clubes ou a diretoria tiverem algo a dizer, aparecerá aqui.</p>
          </div>
        ) : (
          messages.map((m) => {
            const p = m.playerId ? world.players[m.playerId] : undefined;
            return (
              <button
                key={m.id}
                onClick={() => open(m.id, m.playerId, m.link)}
                className={`w-full text-left flex items-start gap-3 rounded-xl border p-3.5 transition hover:border-accent/50 ${m.read ? 'border-surface-700 bg-surface-900/40' : 'border-accent/30 bg-surface-800/60'}`}
              >
                <div className="relative shrink-0">
                  {p ? <PlayerAvatar player={p} size={40} /> : (
                    <div className="w-10 h-10 rounded-full bg-surface-700 flex items-center justify-center text-lg">
                      {m.category === 'transfer' ? '📩' : m.category === 'board' ? '🏢' : m.category === 'contract' ? '📄' : '💬'}
                    </div>
                  )}
                  {!m.read && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-semibold truncate ${m.read ? 'text-slate-300' : 'text-slate-100'}`}>{m.senderName}</p>
                    <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_STYLE[m.priority]} shrink-0`} title={`Prioridade ${PRIORITY_LABELS[m.priority]}`} />
                    <span className="text-[10px] text-slate-500 shrink-0">{formatDateBR(m.date)}</span>
                  </div>
                  <p className={`text-sm mt-0.5 truncate ${m.read ? 'text-slate-400' : 'text-slate-200'}`}>
                    <span className="font-semibold">{m.title}:</span> {m.preview}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1 uppercase tracking-wider">{CATEGORY_LABELS[m.category]} · {PRIORITY_LABELS[m.priority]}</p>
                </div>
              </button>
            );
          })
        )}
      </div>

      <p className="text-[11px] text-slate-600">
        💡 Toque numa conversa de jogador para respondê-lo. Respostas afetam moral, satisfação e relação — promessas feitas aqui são registradas.
      </p>
    </div>
  );
}

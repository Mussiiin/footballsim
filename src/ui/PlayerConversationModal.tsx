import React, { useEffect, useRef, useState } from 'react';
import { X, Send } from 'lucide-react';
import { useGame } from '../state/store';
import { PlayerAvatar, PositionBadge } from './components';
import { overallOf } from '../game/overall';
import { activeTalkForPlayer, respondTalk, startManagerTalk, startRecruitTalk, talkTopicLabel } from '../game/playerTalks';
import { roleForPlayer, computeInterest } from '../game/negotiation';
import type { PlayerTalk } from '../lib/types';

function humorOf(p: { happiness: number; morale: number }): { emoji: string; label: string } {
  const avg = (p.happiness + p.morale) / 2;
  if (avg >= 75) return { emoji: '😄', label: 'Feliz' };
  if (avg >= 60) return { emoji: '🙂', label: 'Satisfeito' };
  if (avg >= 45) return { emoji: '😐', label: 'Neutro' };
  if (avg >= 30) return { emoji: '😕', label: 'Insatisfeito' };
  return { emoji: '😡', label: 'Muito insatisfeito' };
}

/**
 * PlayerConversationModal — modal reutilizável de conversa com jogador.
 * Usado pela Central de Mensagens, perfil do jogador, propostas e renovações.
 */
export function PlayerConversationModal({ playerId, onClose }: { playerId: string; onClose: () => void }) {
  const { career, touch } = useGame();
  const world = career!.world;
  const p = world.players[playerId];
  const [talk, setTalk] = useState<PlayerTalk | null>(() => activeTalkForPlayer(world, playerId));
  const [answered, setAnswered] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [talk?.line, talk?.result, answered]);

  if (!p) return null;
  // jogador de outro clube → conversa de RECRUTAMENTO (projeto, papel, salário, interesse)
  // jogador do meu clube → conversa de GESTÃO DO ELENCO (minutos, banco, renovação, queixas)
  const isRecruit = p.clubId !== career!.clubId;
  const role = roleForPlayer(world, career!.clubId, p);
  const humor = humorOf(p);
  const interest = computeInterest(world, p, career!.clubId);

  const start = () => {
    setTalk(isRecruit ? startRecruitTalk(world, career!, playerId) : startManagerTalk(world, career!, playerId));
    touch();
  };

  const answer = (optionId: string) => {
    if (!talk) return;
    const updated = respondTalk(world, career!, talk.id, optionId);
    if (updated) setTalk(updated);
    setAnswered(true);
    touch();
  };

  const reset = () => {
    // em conversas encadeadas (recrutamento), continua no próximo estágio salvo
    setTalk(activeTalkForPlayer(world, playerId));
    setAnswered(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[88vh] flex flex-col rounded-2xl border border-surface-600 bg-surface-900 shadow-2xl animate-fadeUp overflow-hidden">
        {/* Header do jogador */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-700/60 bg-surface-800/40">
          <PlayerAvatar player={p} size={44} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-100 truncate">{p.firstName} {p.lastName}</p>
            <p className="text-[11px] text-slate-500">
              {isRecruit
                ? `${p.age} anos · ${p.clubId ? (world.clubs[p.clubId]?.shortName ?? 'Agente livre') : 'Agente livre'}`
                : `${p.age} anos · #${p.squadNumber || '—'} · ${role}`}
            </p>
          </div>
          <PositionBadge pos={p.position} />
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-surface-700 transition" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {/* Linha de contexto: humor/overall (elenco) ou interesse (recrutamento) */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-surface-700/40 bg-surface-900/60 text-[11px] text-slate-400">
          {isRecruit ? (
            <>
              <span>🎯 Interesse: <b className="text-slate-200">{interest.level}</b> ({interest.score})</span>
              <span className="text-slate-600">·</span>
              <span>{overallOf(p)} ovr · Potencial {p.potential}</span>
              <span className="text-slate-600">·</span>
              <span>Personalidade: {p.personality}</span>
            </>
          ) : (
            <>
              <span>{humor.emoji} {humor.label}</span>
              <span className="text-slate-600">·</span>
              <span>{overallOf(p)} ovr · Potencial {p.potential}</span>
              <span className="text-slate-600">·</span>
              <span>Personalidade: {p.personality}</span>
              <span className="ml-auto">Moral {p.morale}% · Satisfação {p.happiness}%</span>
            </>
          )}
        </div>

        {/* Balões da conversa */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-[220px] max-h-[46vh]">
          {!talk ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-8">
              <p className="text-sm text-slate-400 mb-1">💬 {isRecruit ? `Converse com ${p.firstName} sobre a transferência` : `Inicie uma conversa com ${p.firstName}`}</p>
              <p className="text-xs text-slate-600">
                {isRecruit
                  ? 'Projeto do clube, papel no elenco, salário e interesse — tudo alinhado antes da proposta.'
                  : 'Pedidos, queixas, elogios e planos — suas respostas têm consequências reais.'}
              </p>
            </div>
          ) : (
            <>
              <div className="flex gap-2.5 items-end">
                <PlayerAvatar player={p} size={28} />
                <div className="max-w-[82%] rounded-2xl rounded-bl-sm bg-surface-800 border border-surface-700 px-3.5 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{talkTopicLabel(talk.topic)}</p>
                  <p className="text-sm text-slate-100 leading-relaxed">“{talk.line}”</p>
                  <p className="text-[10px] text-slate-500 mt-1.5">{talk.context}</p>
                </div>
              </div>

              {answered && talk.result ? (
                <div className="flex gap-2.5 items-end justify-end">
                  <div className="max-w-[82%] rounded-2xl rounded-br-sm bg-accent/15 border border-accent/40 px-3.5 py-2.5">
                    <p className="text-sm text-slate-100 leading-relaxed">{talk.result}</p>
                  </div>
                  <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent shrink-0">VC</div>
                </div>
              ) : (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Escolha sua resposta</p>
                  {talk.options.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => answer(o.id)}
                      className="w-full text-left flex items-center gap-2 rounded-lg border border-surface-600 bg-surface-800/60 hover:border-accent hover:bg-surface-700/60 px-3 py-2 text-sm text-slate-200 transition group"
                    >
                      <Send size={12} className="text-slate-500 group-hover:text-accent shrink-0" />
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-surface-700/60 bg-surface-800/40">
          {!talk ? (
            <button onClick={start} className="btn-primary flex-1">💬 Conversar com {p.firstName}</button>
          ) : answered ? (
            <>
              <button onClick={reset} className="btn-secondary flex-1">Continuar conversa</button>
              <button onClick={onClose} className="btn-ghost">Encerrar</button>
            </>
          ) : (
            <button onClick={onClose} className="btn-ghost w-full">Fechar</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Gate global: ouve o evento OPEN_CONVERSATION_EVENT e abre o modal
// ------------------------------------------------------------
import { OPEN_CONVERSATION_EVENT } from '../game/messages';

export function ConversationGate() {
  const [open, setOpen] = useState(false);
  const [playerId, setPlayerId] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { playerId?: string } | undefined;
      if (detail?.playerId) {
        setPlayerId(detail.playerId);
        setOpen(true);
      }
    };
    window.addEventListener(OPEN_CONVERSATION_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CONVERSATION_EVENT, onOpen);
  }, []);

  if (!open || !playerId) return null;
  return <PlayerConversationModal playerId={playerId} onClose={() => setOpen(false)} />;
}

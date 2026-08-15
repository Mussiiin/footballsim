import { useState } from 'react';
import { useGame } from '../../state/store';
import { PlayerAvatar, PositionBadge } from '../components';
import { overallOf } from '../../game/overall';
import { talkTopicLabel, activeTalkForPlayer, respondTalk, startManagerTalk } from '../../game/playerTalks';
import { PlayerTalk } from '../../lib/types';

export function PlayerTalkScreen({ playerId }: { playerId: string }) {
  const { career, touch, goBack, navigate } = useGame();
  const world = career!.world;
  const p = world.players[playerId];
  const [talk, setTalk] = useState<PlayerTalk | null>(() => activeTalkForPlayer(world, playerId));
  const [answered, setAnswered] = useState(false);

  if (!p) {
    return (
      <div className="space-y-4 animate-fadeUp">
        <button onClick={goBack} className="btn-ghost !px-3 text-sm">← Voltar</button>
        <div className="card p-6 text-slate-500">Jogador não encontrado.</div>
      </div>
    );
  }

  const start = () => {
    setTalk(startManagerTalk(world, career!, playerId));
    touch();
  };

  const answer = (optionId: string) => {
    if (!talk) return;
    const updated = respondTalk(world, career!, talk.id, optionId);
    if (updated) setTalk(updated);
    setAnswered(true);
    touch();
  };

  const label = talk ? talkTopicLabel(talk.topic) : 'Conversa';

  return (
    <div className="max-w-2xl mx-auto space-y-4 animate-fadeUp">
      <div className="flex items-center gap-3">
        <button onClick={goBack} className="btn-ghost !px-3 text-sm">← Voltar</button>
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100">💬 {label}</h1>
          <p className="text-sm text-slate-500">Conversa com {p.firstName} {p.lastName}</p>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(`player:${p.id}`)} title="Ver perfil">
            <PlayerAvatar player={p} size={48} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-100">{p.firstName} {p.lastName}</p>
            <p className="text-xs text-slate-500">
              {overallOf(p)} ovr · {p.age} anos · {talk ? talk.initiatedBy === 'player' ? 'Pediu para conversar' : 'Conversa iniciada por você' : '—'}
            </p>
          </div>
          <PositionBadge pos={p.position} />
        </div>

        {!talk ? (
          <div className="py-6 text-center">
            <p className="text-sm text-slate-400 mb-4">Chame o jogador para conversar. Ele pode fazer pedidos ou reclamar — suas respostas geram consequências reais.</p>
            <button onClick={start} className="btn-primary">💬 Conversar com {p.firstName}</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-3">
              <PlayerAvatar player={p} size={32} />
              <div className="flex-1 rounded-2xl rounded-tl-sm bg-surface-800 border border-surface-700 p-3.5">
                <p className="text-sm text-slate-200 leading-relaxed">“{talk.line}”</p>
                <p className="text-[10px] text-slate-500 mt-2">{talk.context}</p>
              </div>
            </div>

            {answered && talk.result ? (
              <div className="flex gap-3">
                <div className="w-8" />
                <div className="flex-1 rounded-2xl rounded-tl-sm bg-accent/10 border border-accent/30 p-3.5">
                  <p className="text-sm text-slate-200 leading-relaxed">{talk.result}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sua resposta</p>
                {talk.options.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => answer(o.id)}
                    className="w-full text-left rounded-lg border border-surface-600 bg-surface-800/60 hover:border-accent hover:bg-surface-700/60 px-3.5 py-2.5 text-sm text-slate-200 transition"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}

            {answered && (
              <div className="flex flex-wrap gap-2 pt-1">
                <button onClick={() => { setAnswered(false); setTalk(null); }} className="btn-secondary">Nova conversa</button>
                <button onClick={() => navigate(`player:${p.id}`)} className="btn-ghost">Ver perfil</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card p-4 text-xs text-slate-500">
        💡 Respostas afetam moral, satisfação e relação. Promessas feitas aqui são registradas no contrato — se você não cumprir, o jogador pode pedir para sair.
      </div>
    </div>
  );
}

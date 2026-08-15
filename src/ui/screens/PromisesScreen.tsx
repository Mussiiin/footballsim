import { useMemo } from 'react';
import { useGame } from '../../state/store';
import { PlayerAvatar, Bar, Empty } from '../components';
import { promiseProgress, promiseDifficultyFactor } from '../../game/negotiation';
import { formatDateBR } from '../../lib/date';
import { PlayerPromise } from '../../lib/types';

const KIND_LABEL: Record<PlayerPromise['kind'], string> = {
  'titularidade': 'Titularidade',
  'min-jogos': 'Partidas mínimas',
  'posicao': 'Posição preferida',
  'competicoes': 'Competições',
  'desenvolvimento': 'Desenvolvimento',
  'aumento': 'Aumento salarial',
  'venda': 'Venda',
};

export function PromisesScreen() {
  const { career, goBack, navigate } = useGame();
  const world = career!.world;

  const promises = useMemo(() => [...career!.promises].reverse(), [career]);

  const active = promises.filter((pr) => !pr.fulfilled && !pr.broken);
  const fulfilled = promises.filter((pr) => pr.fulfilled);
  const broken = promises.filter((pr) => pr.broken);

  const row = (pr: PlayerPromise) => {
    const p = world.players[pr.playerId];
    if (!p) return null;
    const prog = promiseProgress(world, career!, pr);
    const statusCls = pr.fulfilled
      ? 'text-emerald-400'
      : pr.broken
        ? 'text-red-400'
        : 'text-slate-300';
    return (
      <div
        key={pr.id}
        className={`rounded-xl border p-3.5 ${pr.broken ? 'border-red-500/30 bg-red-500/5' : pr.fulfilled ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-surface-700 bg-surface-800/50'}`}
      >
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`player:${p.id}`)} title="Ver jogador">
            <PlayerAvatar player={p} size={38} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-slate-100">{p.firstName} {p.lastName}</p>
              <span className="badge border border-surface-600 bg-surface-800 text-[10px] text-slate-400">{KIND_LABEL[pr.kind]}</span>
              <span className={`text-xs font-bold ${statusCls}`}>
                {pr.fulfilled ? '✅ Cumprida' : pr.broken ? '💔 Quebrada' : '⏳ Em andamento'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">"{pr.text}"</p>
            <div className="flex items-center gap-2 mt-2">
              <Bar value={prog.pct} className="h-1.5 flex-1" color={pr.broken ? 'bg-red-500' : pr.fulfilled ? 'bg-emerald-500' : undefined} />
              <span className="text-[10px] text-slate-500 whitespace-nowrap">{prog.label}</span>
            </div>
            <p className="text-[10px] text-slate-600 mt-1">
              Feita em {formatDateBR(pr.madeAt)} · Prazo {formatDateBR(pr.deadline)}
            </p>
            {!pr.fulfilled && !pr.broken && (
              <p className="text-[10px] text-slate-500 mt-0.5" title="Dificuldade escolhida × tamanho do clube — metas maiores em clubes grandes e dificuldades altas">
                Meta escalada pela dificuldade do clube · fator {promiseDifficultyFactor(career!).toFixed(2)}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-fadeUp">
      <div className="flex items-center gap-3">
        <button onClick={goBack} className="btn-ghost !px-3 text-sm">← Voltar</button>
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100">📋 Promessas</h1>
          <p className="text-sm text-slate-500">Compromissos feitos em renovações e contratações</p>
        </div>
        <div className="flex-1" />
        <div className="text-right text-xs text-slate-500">
          <p><span className="text-slate-300 font-semibold">{active.length}</span> ativas · <span className="text-emerald-400 font-semibold">{fulfilled.length}</span> cumpridas · <span className="text-red-400 font-semibold">{broken.length}</span> quebradas</p>
        </div>
      </div>

      {(career!.flags.promisesBrokenSeason ?? 0) >= 3 && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 animate-fadeUp">
          <p className="font-display font-bold text-red-400">🚨 Crise institucional</p>
          <p className="text-sm text-slate-300 mt-1">
            {career!.flags.promisesBrokenSeason} promessas quebradas nesta temporada. A diretoria pode emitir
            nota pública e o seu cargo está em risco — cumpra as promessas ativas antes que a situação piore.
          </p>
        </div>
      )}

      <div className="card p-4">
        <p className="font-display font-bold text-slate-100 mb-3">⏳ Em andamento ({active.length})</p>
        {active.length > 0 ? (
          <div className="space-y-2.5">{active.map(row)}</div>
        ) : (
          <Empty icon="📋" title="Nenhuma promessa ativa" subtitle="Promessas feitas em renovações e contratações aparecem aqui com seu progresso." />
        )}
      </div>

      {fulfilled.length > 0 && (
        <div className="card p-4">
          <p className="font-display font-bold text-emerald-400 mb-3">✅ Cumpridas ({fulfilled.length})</p>
          <div className="space-y-2.5">{fulfilled.map(row)}</div>
        </div>
      )}

      {broken.length > 0 && (
        <div className="card p-4">
          <p className="font-display font-bold text-red-400 mb-3">💔 Quebradas ({broken.length})</p>
          <p className="text-xs text-slate-500 mb-3">Promessas quebradas derrubam a moral e podem levar o jogador a pedir transferência.</p>
          <div className="space-y-2.5">{broken.map(row)}</div>
        </div>
      )}
    </div>
  );
}

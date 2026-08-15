import { useGame } from '../../state/store';
import { Tabs } from '../components';
import { useState } from 'react';
import { ACHIEVEMENTS } from '../../lib/types';
import { fmtMoney } from '../../lib/format';

export function RecordsScreen() {
  const { career } = useGame();
  const [tab, setTab] = useState('records');
  const world = career!.world;

  return (
    <div className="space-y-5 animate-fadeUp">
      <div>
        <h1 className="font-display font-bold text-2xl text-slate-100">Recordes &amp; Conquistas</h1>
        <p className="text-sm text-slate-500">A história do mundo do futebol.</p>
      </div>

      <Tabs
        tabs={[
          { id: 'records', label: 'Recordes' },
          { id: 'hall', label: 'Hall da Fama' },
          { id: 'achiev', label: 'Suas conquistas' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'records' && (
        <div className="grid sm:grid-cols-2 gap-3">
          {world.records.map((r) => (
            <div key={r.key} className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{r.label}</p>
              <p className="mt-2 font-display font-extrabold text-2xl text-gold">{r.value}</p>
              <p className="text-sm text-slate-300 mt-1">{r.holder}</p>
              <p className="text-xs text-slate-500">{r.season}</p>
            </div>
          ))}
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sua maior goleada</p>
            <p className="mt-2 font-display font-extrabold text-2xl text-accent">{career!.flags.biggestWin > 0 ? `${career!.flags.biggestWin} gols de diferença` : '—'}</p>
            <p className="text-xs text-slate-500 mt-1">Maior sequência invicta: {career!.flags.bestUnbeatenRun}</p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Suas transferências</p>
            <p className="mt-2 font-display font-extrabold text-2xl text-accent">{fmtMoney(career!.flags.recordBuy)}</p>
            <p className="text-sm text-slate-300">maior compra</p>
            <p className="mt-1 font-display font-extrabold text-2xl text-gold">{fmtMoney(career!.flags.recordSale)}</p>
            <p className="text-sm text-slate-300">maior venda</p>
          </div>
        </div>
      )}

      {tab === 'hall' && (
        <div className="card p-5">
          {world.hallOfFame.length === 0 ? (
            <p className="text-sm text-slate-500">O Hall da Fama ainda está vazio. Grandes feitos serão registrados aqui.</p>
          ) : (
            <div className="space-y-2">
              {[...world.hallOfFame].reverse().map((h, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg bg-surface-800/40 p-3">
                  <span className="text-xl">{h.kind === 'clube' ? '🏟️' : h.kind === 'jogador' ? '⭐' : '🧑‍💼'}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-100">{h.name}</p>
                    <p className="text-xs text-slate-400">{h.detail}</p>
                  </div>
                  <span className="text-xs text-slate-500">{h.season}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'achiev' && (
        <div className="grid sm:grid-cols-2 gap-3">
          {ACHIEVEMENTS.map((a) => {
            const unlocked = career!.achievements.includes(a.id);
            return (
              <div key={a.id} className={`card p-4 flex items-center gap-3 ${unlocked ? 'border-accent/40' : 'opacity-50'}`}>
                <span className="text-2xl">{unlocked ? a.icon : '🔒'}</span>
                <div className="flex-1">
                  <p className={`font-semibold ${unlocked ? 'text-accent' : 'text-slate-400'}`}>{a.name}</p>
                  <p className="text-xs text-slate-500">{a.description}</p>
                </div>
                {unlocked && <span className="badge bg-accent/15 text-accent border border-accent/30">✓</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

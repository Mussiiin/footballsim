import { useMemo, useState } from 'react';
import { useGame } from '../../state/store';
import { PlayerAvatar, OverallBadge, PositionBadge, FormBadge } from '../components';
import { ALL_POSITIONS, Position, POSITION_LABELS } from '../../lib/types';
import { fmtMoney } from '../../lib/format';
import { overallOf } from '../../game/overall';

type SortKey = 'name' | 'pos' | 'age' | 'ov' | 'pot' | 'value' | 'wage' | 'form' | 'morale' | 'cond';

export function SquadScreen() {
  const { career, navigate, goBack } = useGame();
  const [posFilter, setPosFilter] = useState<Position | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('ov');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const players = useMemo(() => {
    const world = career!.world;
    return Object.values(world.players)
      .filter((p) => p.clubId === career!.clubId && p.status === 'active');
  }, [career]);

  const filtered = useMemo(() => {
    let list = [...players];
    if (posFilter !== 'ALL') {
      list = list.filter((p) => p.position === posFilter || p.secondaryPositions.includes(posFilter));
    }
    if (search) {
      list = list.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()));
    }
    const get = (p: (typeof list)[0]): number | string => {
      switch (sortKey) {
        case 'name': return `${p.firstName} ${p.lastName}`;
        case 'pos': return p.position;
        case 'age': return p.age;
        case 'ov': return overallOf(p);
        case 'pot': return p.potential;
        case 'value': return p.value;
        case 'wage': return p.contract?.wage ?? 0;
        case 'form': return p.form;
        case 'morale': return p.morale;
        case 'cond': return p.condition;
      }
    };
    list.sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * sortDir;
      return ((va as number) - (vb as number)) * sortDir;
    });
    return list;
  }, [players, posFilter, search, sortKey, sortDir]);

  const setSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === -1 ? 1 : -1));
    else {
      setSortKey(k);
      setSortDir(-1);
    }
  };
  const Th = ({ k, children, className = '' }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th onClick={() => setSort(k)} className={`table-th cursor-pointer hover:text-slate-300 ${className}`}>
      {children} {sortKey === k && <span className="text-accent">{sortDir === -1 ? '↓' : '↑'}</span>}
    </th>
  );

  return (
    <div className="space-y-4 animate-fadeUp">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={goBack} className="btn-ghost !px-3 text-sm">← Voltar</button>
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100">Elenco</h1>
          <p className="text-sm text-slate-500">{filtered.length} jogadores</p>
        </div>
        <div className="flex-1" />
        <button onClick={() => navigate('promises')} className="btn-secondary !px-3 !py-1.5 text-sm">
          📋 Promessas ({career!.promises.filter((pr) => !pr.fulfilled && !pr.broken).length})
        </button>
        <input className="input w-48" placeholder="Buscar jogador…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button onClick={() => setPosFilter('ALL')} className={`badge border px-3 py-1.5 ${posFilter === 'ALL' ? 'bg-accent text-surface-950 border-accent' : 'bg-surface-800 text-slate-300 border-surface-600'}`}>
          Todos
        </button>
        {ALL_POSITIONS.map((p) => (
          <button key={p} onClick={() => setPosFilter(posFilter === p ? 'ALL' : p)} className={`badge border px-3 py-1.5 ${posFilter === p ? 'bg-accent text-surface-950 border-accent' : 'bg-surface-800 text-slate-300 border-surface-600'}`}>
            {POSITION_LABELS[p]}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="bg-surface-800/50">
            <tr>
              <th className="table-th">Jogador</th>
              <Th k="pos">Pos</Th>
              <Th k="age" className="text-center">Idade</Th>
              <Th k="ov" className="text-center">Ovr</Th>
              <Th k="pot" className="text-center">Pot</Th>
              <Th k="value" className="text-right">Valor</Th>
              <Th k="wage" className="text-right">Salário</Th>
              <Th k="form" className="text-center">Forma</Th>
              <Th k="morale" className="text-center">Moral</Th>
              <Th k="cond" className="text-center">Cond.</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} onClick={() => navigate(`player:${p.id}`)} className="border-t border-surface-700/40 hover:bg-surface-800/60 cursor-pointer">
                <td className="table-td">
                  <div className="flex items-center gap-3">
                    <PlayerAvatar player={p} size={36} />
                    <div>
                      <p className="font-medium text-slate-100">{p.firstName} {p.lastName}</p>
                      <p className="text-[11px] text-slate-500">{p.nationality}{p.injury && ' · 🩹'}{p.suspension > 0 && ' · 🟥'}</p>
                    </div>
                  </div>
                </td>
                <td className="table-td"><PositionBadge pos={p.position} /></td>
                <td className="table-td text-center text-slate-300">{p.age}</td>
                <td className="table-td text-center"><OverallBadge player={p} /></td>
                <td className="table-td text-center text-slate-500">{p.potential}</td>
                <td className="table-td text-right text-slate-300">{fmtMoney(p.value)}</td>
                <td className="table-td text-right text-slate-400">{fmtMoney(p.contract?.wage ?? 0)}</td>
                <td className="table-td text-center"><FormBadge rating={p.form / 10} /></td>
                <td className="table-td text-center">
                  <span className="text-sm">{p.morale >= 75 ? '😄' : p.morale >= 55 ? '🙂' : p.morale >= 35 ? '😐' : '😠'}</span>
                </td>
                <td className="table-td text-center">
                  <span className={`font-mono text-xs font-bold ${p.condition >= 70 ? 'text-accent' : p.condition >= 45 ? 'text-gold' : 'text-red-400'}`}>{p.condition}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { useGame } from '../../state/store';
import { daysBetween } from '../../lib/date';
import { PlayerAvatar, OverallBadge, PositionBadge, AttrBar, Bar, Modal } from '../components';
import { formatDateBR } from '../../lib/date';
import { fmtMoney } from '../../lib/format';
import { overallOf } from '../../game/overall';
import { computeInterest } from '../../game/negotiation';
import { Player, PlayerAttributes } from '../../lib/types';
import { ArrowLeft } from 'lucide-react';

const GENERAL_ATTRS: { key: keyof PlayerAttributes; label: string }[] = [
  { key: 'pace', label: 'Velocidade' }, { key: 'acceleration', label: 'Aceleração' },
  { key: 'finishing', label: 'Finalização' }, { key: 'shotPower', label: 'Chute' },
  { key: 'passing', label: 'Passe' }, { key: 'vision', label: 'Visão' },
  { key: 'dribbling', label: 'Drible' }, { key: 'control', label: 'Controle' },
  { key: 'defending', label: 'Defesa' }, { key: 'physical', label: 'Físico' },
  { key: 'stamina', label: 'Resistência' }, { key: 'strength', label: 'Força' },
  { key: 'agility', label: 'Agilidade' }, { key: 'balance', label: 'Equilíbrio' },
  { key: 'technique', label: 'Técnica' }, { key: 'attackPositioning', label: 'Posicionamento (ataque)' },
];

const GK_ATTRS: { key: keyof PlayerAttributes; label: string }[] = [
  { key: 'reflexes', label: 'Reflexos' }, { key: 'handling', label: 'Defesa de gol' },
  { key: 'gkPositioning', label: 'Posicionamento' }, { key: 'rushing', label: 'Saída do gol' },
  { key: 'kicking', label: 'Jogo com os pés' },
];

const DEF_ATTRS: { key: keyof PlayerAttributes; label: string }[] = [
  { key: 'marking', label: 'Marcação' }, { key: 'tackling', label: 'Desarme' },
  { key: 'interception', label: 'Interceptação' }, { key: 'defPositioning', label: 'Posicionamento' },
  { key: 'heading', label: 'Cabeceio' },
];

export function PlayerScreen({ playerId }: { playerId: string }) {
  const { career, goBack, startRenewal, navigate } = useGame();
  const p: Player | undefined = career?.world.players[playerId];

  const recent = useMemo(() => {
    if (!p || !career) return [];
    return career.world.news.filter((n) => n.playerId === p.id).slice(0, 5);
  }, [p, career]);

  if (!p || !career) return <div className="card p-8 text-slate-500">Jogador não encontrado.</div>;
  const club = p.clubId ? career.world.clubs[p.clubId] : null;
  const interest = computeInterest(career.world, p, career.clubId);
  const ov = overallOf(p);
  const pot = p.potential;
  const dev = pot - ov;
  const attrs = p.position === 'GK' ? GK_ATTRS : p.position === 'CB' || p.position === 'LB' || p.position === 'RB' ? DEF_ATTRS : GENERAL_ATTRS;

  return (
    <div className="space-y-5 animate-fadeUp">
      <button onClick={() => goBack()} className="btn-ghost !px-2 !py-1 text-xs"><ArrowLeft size={14} /> Voltar</button>

      <div className="card p-6">
        <div className="flex flex-wrap items-center gap-5">
          <PlayerAvatar player={p} size={84} />
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-display font-bold text-2xl text-slate-100">{p.firstName} {p.lastName}</h1>
              <PositionBadge pos={p.position} />
              <OverallBadge player={p} size="md" />
            </div>
            <p className="text-sm text-slate-400 mt-1">
              {p.nationality} · {p.age} anos · {p.height}cm / {p.weight}kg · Pé {p.foot.toLowerCase()} · #{p.squadNumber}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {club ? `Clube: ${club.name}` : 'Sem clube'} · Personalidade: <span className="text-slate-300">{p.personality}</span>
            </p>
            <div className="flex gap-1.5 mt-2">
              {p.secondaryPositions.map((s) => <PositionBadge key={s} pos={s} />)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-surface-800/80 p-4">
              <p className="font-display font-extrabold text-3xl text-slate-100">{ov}</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Overall</p>
            </div>
            <div className="rounded-xl bg-surface-800/80 p-4">
              <p className={`font-display font-extrabold text-3xl ${dev > 5 ? 'text-accent' : dev > 0 ? 'text-gold' : 'text-slate-300'}`}>{pot}</p>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Potencial</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="space-y-5">
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Situação</p>
            <div className="space-y-3 text-sm">
              <div>
                <div className="flex justify-between mb-1"><span className="text-slate-400">Forma</span><span className="font-mono font-bold text-slate-200">{p.form}</span></div>
                <Bar value={p.form} />
              </div>
              <div>
                <div className="flex justify-between mb-1"><span className="text-slate-400">Moral</span><span className="text-slate-200">{p.morale >= 75 ? '😄' : p.morale >= 55 ? '🙂' : p.morale >= 35 ? '😐' : '😠'} {p.morale}</span></div>
                <Bar value={p.morale} />
              </div>
              <div>
                <div className="flex justify-between mb-1"><span className="text-slate-400">Condição física</span><span className={`font-mono font-bold ${p.condition >= 70 ? 'text-accent' : 'text-gold'}`}>{p.condition.toFixed(1)}%</span></div>
                <Bar value={p.condition} />
              </div>
              <div>
                <div className="flex justify-between mb-1"><span className="text-slate-400">Satisfação</span><span className="text-slate-200">{p.happiness}</span></div>
                <Bar value={p.happiness} />
              </div>
              {p.injury && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-300">
                  🩹 {p.injury.type} ({p.injury.bodyPart}) — <span className="font-semibold">{p.injury.severity}</span><br />
                  <span className="text-xs">Retorno previsto: {formatDateBR(p.injury.recoveryDate)}</span>
                </div>
              )}
              {p.suspension > 0 && (
                <div className="rounded-lg bg-gold/10 border border-gold/30 p-3 text-sm text-gold">🟥 Suspenso por {p.suspension} partida(s)</div>
              )}
            </div>
          </div>

          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Contrato</p>
            {p.contract ? (
              <div className="space-y-1.5 text-sm">
                <p className="flex justify-between"><span className="text-slate-400">Salário</span><span className="text-slate-200 font-semibold">{fmtMoney(p.contract.wage)}/sem</span></p>
                <p className="flex justify-between"><span className="text-slate-400">Vence em</span><span className="text-slate-200">{formatDateBR(p.contract.until)}</span></p>
                {p.contract.releaseClause && <p className="flex justify-between"><span className="text-slate-400">Cláusula</span><span className="text-gold font-semibold">{fmtMoney(p.contract.releaseClause)}</span></p>}
                {p.contract.bonus > 0 && <p className="flex justify-between"><span className="text-slate-400">Bônus</span><span className="text-slate-300">{fmtMoney(p.contract.bonus)}</span></p>}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Sem contrato (jogador livre)</p>
            )}
            <div className="mt-3 pt-3 border-t border-surface-700/60">
              <p className="flex justify-between text-sm"><span className="text-slate-400">Valor de mercado</span><span className="text-gold font-display font-bold">{fmtMoney(p.value)}</span></p>
            </div>
            {p.clubId === career.clubId && interest.competing.length > 0 && (
              <div className="mt-3 pt-3 border-t border-surface-700/60">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Clubes interessados</p>
                <div className="flex flex-wrap gap-1.5">
                  {interest.competing.map((c) => {
                    const dot = c.level === 'Muito interessado' ? '🟢' : c.level === 'Interessado' ? '🟢' : c.level === 'Pouco interessado' ? '🟡' : c.level === 'Neutro' ? '⚪' : c.level === 'Desinteressado' ? '🟠' : '🔴';
                    const cls = c.level === 'Muito interessado' || c.level === 'Interessado' ? 'border-accent/40 bg-accent/10 text-accent' : 'border-surface-600 bg-surface-800 text-slate-400';
                    return (
                      <span key={c.clubId} className={`badge border text-[10px] ${cls}`} title={c.level}>
                        {dot} {career.world.clubs[c.clubId]?.shortName ?? '—'} · {c.level}
                      </span>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5">Interesse do jogador: {interest.level} ({interest.score}/100)</p>
              </div>
            )}
            {p.contract && (
              <div className="mt-3 pt-3 border-t border-surface-700/60 space-y-2">
                <p className="text-[10px] text-slate-500">
                  {daysBetween(p.contract.until, career.world.date) <= 730
                    ? '⚠️ Contrato termina em menos de 2 anos — renove para evitar perder o jogador de graça.'
                    : 'Contrato com mais de 2 anos — renovação antecipada possível.'}
                </p>
                <button
                  onClick={() => { const ren = startRenewal(p.id); navigate(`renewal:${p.id}`); void ren; }}
                  className="btn-primary w-full !py-2 text-sm"
                >
                  📄 Conversar sobre renovação
                </button>
                <button
                  onClick={() => navigate(`talk:${p.id}`)}
                  className="btn-secondary w-full !py-2 text-sm"
                  title="Conversar sobre papel, minutos, salário e mais"
                >
                  💬 Conversar
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="card p-5 lg:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Atributos</p>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
            {attrs.map((a) => <AttrBar key={a.key} label={a.label} value={p.attrs[a.key]} />)}
            {p.position === 'GK' && GENERAL_ATTRS.slice(0, 6).map((a) => <AttrBar key={a.key} label={a.label} value={p.attrs[a.key]} />)}
          </div>
          <div className="mt-5 pt-4 border-t border-surface-700/60 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div><p className="font-display font-bold text-lg text-slate-100">{p.seasonStats.apps}</p><p className="text-[10px] text-slate-500 uppercase">Jogos (temp.)</p></div>
            <div><p className="font-display font-bold text-lg text-accent">{p.seasonStats.goals}</p><p className="text-[10px] text-slate-500 uppercase">Gols</p></div>
            <div><p className="font-display font-bold text-lg text-sky-400">{p.seasonStats.assists}</p><p className="text-[10px] text-slate-500 uppercase">Assist.</p></div>
            <div><p className="font-display font-bold text-lg text-gold">{p.avgRating?.toFixed(1) ?? '—'}</p><p className="text-[10px] text-slate-500 uppercase">Nota média</p></div>
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs text-slate-500">
            <p>🟨 {p.seasonStats.yellows} amarelos</p>
            <p>🟥 {p.seasonStats.reds} vermelhos</p>
            <p>🧤 {p.seasonStats.cleanSheets} sem sofrer</p>
            <p>⭐ {p.seasonStats.manOfMatch} melhor em campo</p>
          </div>
        </div>
      </div>

      {/* histórico */}
      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Histórico por temporada</p>
        {p.history.length === 0 ? (
          <p className="text-sm text-slate-500">Sem histórico — primeira temporada no clube.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr>
                  <th className="table-th">Temporada</th>
                  <th className="table-th">Clube</th>
                  <th className="table-th text-center">Jogos</th>
                  <th className="table-th text-center">Gols</th>
                  <th className="table-th text-center">Assist.</th>
                  <th className="table-th text-center">Nota</th>
                  <th className="table-th">Títulos</th>
                </tr>
              </thead>
              <tbody>
                {[...p.history].reverse().map((h, i) => (
                  <tr key={i} className="border-t border-surface-700/40">
                    <td className="table-td text-slate-400">{h.season}</td>
                    <td className="table-td text-slate-300">{h.clubName}</td>
                    <td className="table-td text-center text-slate-300">{h.apps}</td>
                    <td className="table-td text-center text-accent">{h.goals}</td>
                    <td className="table-td text-center text-sky-400">{h.assists}</td>
                    <td className="table-td text-center text-gold">{h.rating.toFixed(1)}</td>
                    <td className="table-td text-xs text-slate-400">{h.titles.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Menções na imprensa</p>
          {recent.map((n) => <p key={n.id} className="text-sm text-slate-400 py-1 border-b border-surface-700/40 last:border-0">📰 {n.title}</p>)}
        </div>
      )}
    </div>
  );
}

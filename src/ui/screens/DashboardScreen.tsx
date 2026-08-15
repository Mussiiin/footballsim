import { useMemo, useState } from 'react';
import { useGame } from '../../state/store';
import { ClubCrest, StatCard, FormRow, PlayerAvatar, Modal, ResultPill } from '../components';
import { formatDateBR } from '../../lib/date';
import { fmtMoney, fmtInt } from '../../lib/format';
import { nextMatchForClub, lastMatchForClub, positionOf, sortedStandings } from '../../game/competitions';
import { overallOf } from '../../game/overall';
import { CalendarDays, ChevronRight, Users, Wallet, AlertTriangle } from 'lucide-react';

export function DashboardScreen() {
  const { career, navigate, advanceDay, advanceWeek, advanceToMatch } = useGame();
  const [advancing, setAdvancing] = useState<'day' | 'week' | 'match' | null>(null);
  const [advanceResult, setAdvanceResult] = useState<string | null>(null);
  const [modal, setModal] = useState<string | null>(null);

  const world = career!.world;
  const clubId = career!.clubId;

  const next = useMemo(() => (clubId ? nextMatchForClub(world, clubId, world.date) : null), [world, clubId]);
  const last = useMemo(() => (clubId ? lastMatchForClub(world, clubId) : null), [world, clubId]);
  const club = clubId ? world.clubs[clubId] : null;
  const squad = useMemo(() => (clubId ? Object.values(world.players).filter((p) => p.clubId === clubId && p.status === 'active') : []), [world, clubId]);
  const injured = squad.filter((p) => p.injury);
  const suspended = squad.filter((p) => p.suspension > 0);
  const lowCondition = squad.filter((p) => p.condition < 55);

  const leagueComp = club ? world.competitions[club.leagueId] : null;
  const pos = leagueComp && club ? positionOf(leagueComp, club.id) : 0;
  const standings = leagueComp ? sortedStandings(leagueComp).slice(0, 8) : [];

  const doAdvance = async (kind: 'day' | 'week' | 'match') => {
    setAdvancing(kind);
    setAdvanceResult(null);
    // deixa a UI atualizar
    await new Promise((r) => setTimeout(r, 30));
    let r;
    if (kind === 'day') r = advanceDay();
    else if (kind === 'week') r = advanceWeek();
    else r = advanceToMatch();
    setAdvancing(null);
    if (r?.userMatch) {
      navigate('matchday');
      return;
    }
    if (r?.seasonAdvanced) {
      setModal('Nova temporada começou! Bem-vindo a ' + world.season + '.');
      return;
    }
    setAdvanceResult(r ? `Simulado até ${formatDateBR(r.date)} · ${r.simulated} partida(s)` : null);
  };

  if (!club) {
    return <JobsScreen />;
  }

  return (
    <div className="space-y-5 animate-fadeUp">
      {/* barra de avanço de tempo */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 mr-auto">
          <span className="text-2xl">📅</span>
          <div>
            <p className="font-display font-bold text-slate-100">{formatDateBR(world.date)}</p>
            <p className="text-[11px] text-slate-500">Temporada {world.season} · {club.name}</p>
          </div>
        </div>
        {advanceResult && <span className="text-xs text-accent animate-fadeIn">{advanceResult}</span>}
        <div className="flex gap-2">
          <button onClick={() => void doAdvance('day')} disabled={!!advancing} className="btn-secondary">{advancing === 'day' ? '…' : 'Avançar dia'}</button>
          <button onClick={() => void doAdvance('week')} disabled={!!advancing} className="btn-secondary">{advancing === 'week' ? '…' : 'Avançar semana'}</button>
          <button onClick={() => void doAdvance('match')} disabled={!!advancing} className="btn-primary">{advancing === 'match' ? '…' : '⚽ Próxima partida'}</button>
        </div>
      </div>

      {/* mensagem da diretoria */}
      {club.boardMessage && (
        <div className="rounded-xl border border-gold/40 bg-gold/10 p-4 flex items-center gap-3 animate-fadeIn">
          <AlertTriangle className="text-gold shrink-0" size={20} />
          <div>
            <p className="text-sm font-semibold text-gold">Diretoria</p>
            <p className="text-sm text-slate-300">{club.boardMessage}</p>
          </div>
        </div>
      )}

      {/* stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<CalendarDays size={18} />} label="Próxima partida" value={next ? `vs ${next.homeId === clubId ? world.clubs[next.awayId].shortName : world.clubs[next.homeId].shortName}` : '—'} sub={next ? `${world.competitions[next.competitionId]?.name ?? ''} · ${formatDateBR(next.date)}` : 'Sem partidas'} />
        <StatCard icon={<Users size={18} />} label="Posição na liga" value={`${pos}º`} sub={leagueComp?.name ?? ''} />
        <StatCard icon={<Wallet size={18} />} label="Caixa" value={fmtMoney(club.balance)} sub={`Orçamento ${fmtMoney(club.budget)}`} accent="bg-gold/10 text-gold" />
        <StatCard label="Força do elenco" value={club.squadStrength.toFixed(1)} sub={`${squad.length} jogadores · ${club.averageAge.toFixed(1)} anos`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* próxima partida */}
          {next ? (
            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                Próxima partida · {world.competitions[next.competitionId]?.name} · {formatDateBR(next.date)}
              </p>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1">
                  <ClubCrest club={world.clubs[next.homeId]} size={48} />
                  <div>
                    <p className="font-semibold text-slate-100">{world.clubs[next.homeId].name}</p>
                    <p className="text-xs text-slate-500">{next.homeId === clubId ? '🏠 Casa' : 'Fora'}</p>
                  </div>
                </div>
                <div className="text-center text-3xl font-display font-extrabold text-slate-200">VS</div>
                <div className="flex items-center gap-3 flex-1 justify-end">
                  <div className="text-right">
                    <p className="font-semibold text-slate-100">{world.clubs[next.awayId].name}</p>
                    <p className="text-xs text-slate-500">{next.awayId === clubId ? '🏠 Casa' : 'Fora'}</p>
                  </div>
                  <ClubCrest club={world.clubs[next.awayId]} size={48} />
                </div>
              </div>
              <div className="flex justify-center mt-4">
                <button onClick={() => navigate('matchday')} className="btn-primary px-8">Dia de jogo →</button>
              </div>
            </div>
          ) : (
            <div className="card p-5 text-center text-slate-500 text-sm">Sem partidas agendadas. Avance o tempo.</div>
          )}

          {/* última partida */}
          {last && (
            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Última partida · {formatDateBR(last.date)}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ClubCrest club={world.clubs[last.homeId]} size={36} />
                  <span className="text-sm text-slate-300">{world.clubs[last.homeId].shortName}</span>
                </div>
                <span className="text-2xl font-display font-extrabold text-slate-100">{last.homeScore} - {last.awayScore}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-300">{world.clubs[last.awayId].shortName}</span>
                  <ClubCrest club={world.clubs[last.awayId]} size={36} />
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-500">
                {world.competitions[last.competitionId]?.name} · {last.stats ? `${last.stats.shots[0]}x${last.stats.shots[1]} finalizações · posse ${last.stats.possession[0]}%` : ''}
              </div>
            </div>
          )}

          {/* classificação resumida */}
          {leagueComp && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{leagueComp.name}</p>
                <button onClick={() => navigate('competitions')} className="text-xs text-accent flex items-center gap-1 hover:underline">ver tabela <ChevronRight size={12} /></button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="table-th">#</th>
                      <th className="table-th">Clube</th>
                      <th className="table-th text-center">Pts</th>
                      <th className="table-th text-center">J</th>
                      <th className="table-th text-center">SG</th>
                      <th className="table-th">Forma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((s, i) => {
                      const c = world.clubs[s.clubId];
                      const isUser = s.clubId === clubId;
                      return (
                        <tr key={s.clubId} className={isUser ? 'bg-accent/10' : 'hover:bg-surface-800/50'} onClick={() => navigate(`club:${s.clubId}`)}>
                          <td className="table-td text-slate-500">{i + 1}</td>
                          <td className="table-td">
                            <div className="flex items-center gap-2">
                              <ClubCrest club={c} size={22} />
                              <span className={isUser ? 'font-bold text-accent' : 'text-slate-300'}>{c?.shortName}</span>
                            </div>
                          </td>
                          <td className="table-td text-center font-display font-bold text-slate-100">{s.points}</td>
                          <td className="table-td text-center text-slate-400">{s.played}</td>
                          <td className={`table-td text-center ${s.gd > 0 ? 'text-accent' : s.gd < 0 ? 'text-red-400' : 'text-slate-400'}`}>{s.gd > 0 ? '+' : ''}{s.gd}</td>
                          <td className="table-td"><FormRow results={s.form} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-5">
          {/* objetivos */}
          {club.objectives.length > 0 && (
            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Objetivos da diretoria</p>
              <ul className="space-y-2">
                {club.objectives.map((o, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span>{o.status === 'achieved' ? '✅' : o.status === 'failed' ? '❌' : '🎯'}</span>
                    <span className={o.status === 'achieved' ? 'text-accent' : o.status === 'failed' ? 'text-red-400 line-through' : 'text-slate-300'}>{o.text}</span>
                    <span className="ml-auto text-[10px] text-slate-600">{'★'.repeat(o.weight)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 pt-3 border-t border-surface-700/60">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500">Paciência da diretoria</span>
                  <span className={club.boardPatience > 50 ? 'text-accent' : club.boardPatience > 25 ? 'text-gold' : 'text-red-400'}>{club.boardPatience}%</span>
                </div>
                <div className="h-2 rounded-full bg-surface-700 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${club.boardPatience > 50 ? 'bg-accent' : club.boardPatience > 25 ? 'bg-gold' : 'bg-red-500'}`} style={{ width: `${club.boardPatience}%` }} />
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-surface-700/60">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500">Confiança da torcida</span>
                  <span className={club.fanTrust > 50 ? 'text-accent' : club.fanTrust > 25 ? 'text-gold' : 'text-red-400'}>{club.fanTrust}%</span>
                </div>
                <div className="h-2 rounded-full bg-surface-700 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${club.fanTrust > 50 ? 'bg-accent' : club.fanTrust > 25 ? 'bg-gold' : 'bg-red-500'}`} style={{ width: `${club.fanTrust}%` }} />
                </div>
                <p className="text-[10px] text-slate-600 mt-1.5">
                  {club.fanTrust < 35 ? '💢 Torcida revoltada com a gestão das promessas.' : club.fanTrust < 55 ? '😠 Torcida desconfiada do comando.' : '🙂 Torcida confia no projeto.'}
                </p>
              </div>
            </div>
          )}

          {/* lesões e suspensões */}
          {(injured.length > 0 || suspended.length > 0 || lowCondition.length > 0) && (
            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Departamento médico</p>
              {injured.map((p) => (
                <div key={p.id} className="flex items-center gap-2 py-1.5 text-sm" onClick={() => navigate(`player:${p.id}`)}>
                  <PlayerAvatar player={p} size={28} showPos={false} />
                  <span className="text-slate-300 flex-1 truncate">{p.firstName} {p.lastName}</span>
                  <span className="badge bg-red-500/15 text-red-400 border border-red-500/30">🩹 {p.injury?.type} ({p.injury?.weeks} sem)</span>
                </div>
              ))}
              {suspended.map((p) => (
                <div key={p.id} className="flex items-center gap-2 py-1.5 text-sm" onClick={() => navigate(`player:${p.id}`)}>
                  <PlayerAvatar player={p} size={28} showPos={false} />
                  <span className="text-slate-300 flex-1 truncate">{p.firstName} {p.lastName}</span>
                  <span className="badge bg-gold/15 text-gold border border-gold/30">🟥 suspenso</span>
                </div>
              ))}
              {lowCondition.length > 0 && <p className="text-xs text-slate-500 mt-2">{lowCondition.length} jogador(es) abaixo de 55% de condição</p>}
            </div>
          )}

          {/* moral do elenco */}
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Moral do elenco</p>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">{club.morale >= 70 ? '😄' : club.morale >= 50 ? '🙂' : club.morale >= 30 ? '😐' : '😠'}</span>
              <div className="flex-1">
                <div className="h-2.5 rounded-full bg-surface-700 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-red-500 via-gold to-accent" style={{ width: `${club.morale}%` }} />
                </div>
              </div>
              <span className="font-display font-bold text-slate-100">{Math.round(club.morale)}%</span>
            </div>
            <div className="text-xs text-slate-500">Forma recente: <FormRow results={club.lastResults} /></div>
          </div>

          {/* finanças rápidas */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Finanças</p>
              <button onClick={() => navigate('finances')} className="text-xs text-accent flex items-center gap-1 hover:underline">detalhes <ChevronRight size={12} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-surface-800/70 p-3">
                <p className="text-[10px] text-slate-500 uppercase">Folha mensal</p>
                <p className="font-display font-bold text-slate-200">{fmtMoney(club.wageBill)}</p>
              </div>
              <div className="rounded-lg bg-surface-800/70 p-3">
                <p className="text-[10px] text-slate-500 uppercase">Valor do clube</p>
                <p className="font-display font-bold text-gold">{fmtMoney(club.clubValue)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* notícias recentes */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Últimas notícias</p>
          <button onClick={() => navigate('news')} className="text-xs text-accent flex items-center gap-1 hover:underline">ver todas <ChevronRight size={12} /></button>
        </div>
        <div className="space-y-2">
          {world.news.slice(0, 4).map((n) => (
            <div key={n.id} className="flex items-start gap-3 py-2 border-b border-surface-700/40 last:border-0">
              <div className="text-xl">{n.category === 'Títulos' ? '🏆' : n.category === 'Transferências' ? '💼' : n.category === 'Lesões' ? '🩹' : n.category === 'Partidas' ? '⚽' : '📰'}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 line-clamp-2">{n.title}</p>
                {n.subtitle && <p className="text-xs text-slate-500 line-clamp-1">{n.subtitle}</p>}
              </div>
              <span className="text-[10px] text-slate-600 shrink-0">{formatDateBR(n.date)}</span>
            </div>
          ))}
        </div>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title="🎉 Nova temporada">
        <p className="text-sm text-slate-300">{modal}</p>
        <div className="flex justify-end mt-5">
          <button onClick={() => { setModal(null); navigate('dashboard'); }} className="btn-primary">Continuar</button>
        </div>
      </Modal>
    </div>
  );
}

import { JobsScreen } from './JobsScreen';

import { useMemo, useState } from 'react';
import { useGame } from '../../state/store';
import { Modal, PlayerAvatar, OverallBadge, PositionBadge, Bar, Empty } from '../components';
import { overallOf } from '../../game/overall';
import { fmtMoney, fmtRating } from '../../lib/format';
import { Player, POSITION_GROUPS } from '../../lib/types';
import {
  marketAnalysis, computeInterest, latestReport, officerAdvice,
  negotiationForPlayer, negotiationStatusLabel, roleForPlayer, estimateFormLabel,
  injuryDaysTotal, isEligibleForPreContract,
} from '../../game/negotiation';
import { squadOf } from '../../game/transfers';
import { NegotiationKind } from '../../game/negotiation';
import { sendInquiry, inquiryForPlayer, INQUIRY_LABEL, inquiryIcon } from '../../game/sondagem';
import { openPlayerConversation } from '../../game/messages';

function arrow(prev: number, cur: number): string {
  if (cur > prev + 0.05) return '↑';
  if (cur < prev - 0.05) return '↓';
  return '→';
}

export function PlayerMarketModal({ player, onClose, readOnly = false }: { player: Player; onClose: () => void; readOnly?: boolean }) {
  const { career, scoutPlayer: scout, toggleShortlist, startNegotiation, negotiationRoute, touch } = useGame();
  const world = career!.world;
  const club = world.clubs[career!.clubId];
  const [scouting, setScouting] = useState(false);
  const inq = inquiryForPlayer(world, player.id);

  const analysis = useMemo(() => marketAnalysis(world, player), [world, player]);
  const interest = useMemo(() => computeInterest(world, player, career!.clubId), [world, player, career]);
  const report = latestReport(world, player.id);
  const rawNeg = negotiationForPlayer(world, player.id);
  const neg = rawNeg && !['rejeitada', 'cancelada', 'expirada', 'concluida'].includes(rawNeg.status) ? rawNeg : null;
  const onWatch = career!.shortlist.includes(player.id);
  const prevSeason = player.history[player.history.length - 1];
  const cur = player.seasonStats;
  const form = estimateFormLabel(player);
  const officer = career!.recruitment;
  const advice = useMemo(() => officerAdvice(world, career!, player.id), [world, career, player.id]);

  const mySquad = useMemo(() => squadOf(world, career!.clubId), [world, career]);
  const samePos = mySquad.filter((s) => POSITION_GROUPS[s.position] === POSITION_GROUPS[player.position]);
  const bestSamePos = samePos.length ? Math.max(...samePos.map((s) => overallOf(s))) : 0;
  const squadCompare = overallOf(player) >= bestSamePos + 3 ? 'Excelente necessidade' : overallOf(player) >= bestSamePos - 2 ? 'Boa opção' : 'Reforço de elenco';
  const price = analysis.value;
  const budgetRatio = price / Math.max(1, club.budget);
  const wageRatio = (player.contract?.wage ?? 0) / Math.max(1, club.wageBill / 25);
  const role = roleForPlayer(world, career!.clubId, player);
  const inWindow = world.date.slice(5) >= world.windows.summer.start && world.date.slice(5) <= world.windows.summer.end
    || world.date.slice(5) >= world.windows.winter.start && world.date.slice(5) <= world.windows.winter.end;

  const canPre = player.clubId !== career!.clubId && isEligibleForPreContract(player, world.date);

  const startKind = (kind: NegotiationKind) => {
    const n = startNegotiation(player.id, kind);
    negotiationRoute(n.playerId);
  };

  const avgRating = cur.ratingCount > 0 ? cur.ratingSum / cur.ratingCount : 0;

  return (
    <Modal open onClose={onClose} title="Perfil de mercado" wide>
      <div className="space-y-5">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-start gap-4">
          <PlayerAvatar player={player} size={64} />
          <div className="flex-1 min-w-[220px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display font-bold text-xl text-slate-100">{player.firstName} {player.lastName}</h2>
              <PositionBadge pos={player.position} />
              <OverallBadge player={player} />
            </div>
            <p className="text-sm text-slate-400 mt-1">
              {player.nationality} · {player.age} anos · {player.foot} · {player.height}cm · {player.personality}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Clube: {player.clubId ? world.clubs[player.clubId]?.name ?? '—' : 'Sem clube'}
              {player.secondaryPositions.length > 0 ? ` · Posições: ${player.secondaryPositions.join(', ')}` : ''}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500 space-y-0.5">
            <p>Potencial: <span className="text-slate-200 font-semibold">{player.potential}</span></p>
            <p>Reputação: <span className="text-slate-200 font-semibold">{player.reputation}</span></p>
            <p>Contrato até: <span className="text-slate-300">{player.contract ? player.contract.until : 'livre'}</span></p>
            <p>Salário: <span className="text-gold font-semibold">{fmtMoney(player.contract?.wage ?? 0)}/sem</span></p>
            {player.contract?.releaseClause ? <p>Cláusula: <span className="text-gold">{fmtMoney(player.contract.releaseClause)}</span></p> : null}
          </div>
        </div>

        {/* Valor e orçamento */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <InfoBox label="Valor de mercado" value={fmtMoney(analysis.value)} sub={`${analysis.trend === 'alta' ? '📈' : analysis.trend === 'queda' ? '📉' : '➖'} ${analysis.trend}`} />
          <InfoBox label="Preço estimado" value={`${fmtMoney(analysis.min)} – ${fmtMoney(analysis.max)}`} sub="faixa provável de negociação" />
          <InfoBox label="Orçamento do clube" value={fmtMoney(club.budget)} sub={budgetRatio > 1 ? `⚠️ ${Math.round(budgetRatio * 100)}% do orçamento` : `${Math.round(budgetRatio * 100)}% do orçamento`} />
          <InfoBox label="Demanda" value={`${analysis.demand} clube(s)`} sub={analysis.demand > 0 ? 'disputa pela contratação' : 'sem concorrência aparente'} />
        </div>

        {/* Estatísticas — temporada atual e anterior */}
        <div>
          <h3 className="font-display font-semibold text-slate-200 mb-2">Estatísticas — {world.season}</h3>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2 text-center">
            <Stat label="Jogos" value={cur.apps} />
            <Stat label="Titular" value={cur.starts} />
            <Stat label="Minutos" value={cur.minutes.toLocaleString('pt-BR')} />
            <Stat label="Gols" value={cur.goals} />
            <Stat label="Assist." value={cur.assists} />
            <Stat label="Nota" value={avgRating > 0 ? fmtRating(avgRating) : '—'} />
            <Stat label="xG" value={cur.xg.toFixed(1)} />
            <Stat label="xA" value={cur.xa.toFixed(1)} />
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mt-2 text-center">
            <Stat label="Finalizações" value={cur.shots} />
            <Stat label="No alvo" value={cur.shotsOnTarget} />
            <Stat label="Passes" value={cur.passes} />
            <Stat label="Desarmes" value={cur.tackles} />
            <Stat label="Interceptações" value={cur.interceptions} />
            <Stat label="Cartões" value={`${cur.yellows} / ${cur.reds}`} />
          </div>
        </div>

        {prevSeason && (
          <div>
            <h3 className="font-display font-semibold text-slate-200 mb-2">Temporada anterior — {prevSeason.season} <span className="text-slate-500 font-normal text-xs">({prevSeason.clubName})</span></h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-center">
              <CompareStat label="Jogos" prev={prevSeason.apps} cur={cur.apps} />
              <CompareStat label="Gols" prev={prevSeason.goals} cur={cur.goals} />
              <CompareStat label="Assist." prev={prevSeason.assists} cur={cur.assists} />
              <CompareStat label="Nota" prev={prevSeason.rating} cur={avgRating} />
              <CompareStat label="Minutos" prev={prevSeason.minutes} cur={cur.minutes} />
              <CompareStat label="xG" prev={prevSeason.xg} cur={cur.xg} />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">↑ melhorou · ↓ piorou · → estável</p>
          </div>
        )}

        {/* Histórico por temporada */}
        {player.history.length > 0 && (
          <div>
            <h3 className="font-display font-semibold text-slate-200 mb-2">Histórico por temporada</h3>
            <div className="space-y-1.5">
              {[...player.history].reverse().slice(0, 6).map((h) => (
                <div key={h.season} className="flex items-center gap-3 rounded-lg bg-surface-800/50 px-3 py-2 text-sm">
                  <span className="font-mono text-slate-300 w-16">{h.season}</span>
                  <span className="text-slate-400 flex-1">{h.clubName}</span>
                  <span className="text-slate-300">{h.apps} jogos</span>
                  <span className="text-accent font-semibold">{h.goals} gols</span>
                  <span className="text-sky-400 font-semibold">{h.assists} ass.</span>
                  <span className="text-slate-400">{fmtRating(h.rating)}</span>
                  {h.titles.length > 0 && <span className="text-gold text-xs">🏆 {h.titles.length}x</span>}
                  {h.awards.length > 0 && <span className="text-gold text-xs">⭐ {h.awards.join(', ')}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Títulos e prêmios */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <h3 className="font-display font-semibold text-slate-200 mb-2">Títulos</h3>
            {player.history.some((h) => h.titles.length > 0) ? (
              <div className="space-y-1 text-sm">
                {player.history.filter((h) => h.titles.length > 0).slice(-5).map((h) => (
                  <p key={h.season} className="text-slate-300">🏆 <span className="text-gold">{h.titles.join(', ')}</span> — {h.season} ({h.clubName})</p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">🏆 Nenhum título conquistado</p>
            )}
          </div>
          <div>
            <h3 className="font-display font-semibold text-slate-200 mb-2">Prêmios individuais</h3>
            {player.awards.length > 0 ? (
              <div className="space-y-1 text-sm">
                {[...player.awards].reverse().slice(0, 5).map((a, i) => (
                  <p key={i} className="text-slate-300">⭐ {a.award} <span className="text-slate-500">— {a.season}{a.detail ? ` (${a.detail})` : ''}</span></p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Nenhum prêmio individual</p>
            )}
          </div>
        </div>

        {/* Forma e lesões */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <h3 className="font-display font-semibold text-slate-200 mb-2">Forma atual</h3>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {player.lastRatings.slice(-5).map((r, i) => (
                  <span key={i} className="rounded bg-surface-800 px-2 py-1 font-mono text-sm font-bold text-slate-200">{fmtRating(r)}</span>
                ))}
                {player.lastRatings.length === 0 && <span className="text-xs text-slate-500">Sem partidas na temporada</span>}
              </div>
              <span className={`text-sm font-semibold ${form.color}`}>{form.emoji} {form.label}</span>
            </div>
          </div>
          <div>
            <h3 className="font-display font-semibold text-slate-200 mb-2">Lesões</h3>
            {player.injury ? (
              <p className="text-sm text-red-400">🔴 Atualmente lesionado: {player.injury.type} ({player.injury.bodyPart}) — volta em {player.injury.recoveryDate}</p>
            ) : (
              <p className="text-sm text-slate-400">✓ Sem lesões no momento</p>
            )}
            {player.injuryHistory.length > 0 ? (
              <div className="mt-1 space-y-0.5 text-xs text-slate-400">
                {[...player.injuryHistory].reverse().slice(0, 4).map((i, idx) => (
                  <p key={idx}>• {i.date.slice(0, 4)} — {i.type} ({i.bodyPart}) — {i.daysOut} dias</p>
                ))}
                <p className="text-slate-500 pt-1">Total: {player.injuryHistory.length} lesões · {injuryDaysTotal(player)} dias perdidos</p>
              </div>
            ) : (
              <p className="text-xs text-slate-500 mt-1">Sem histórico de lesões registrado</p>
            )}
          </div>
        </div>

        {/* Scouting */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display font-semibold text-slate-200">Análise — {officer.name.split(' ')[0]} (responsável por contratações)</h3>
            {!readOnly && !report && (
              <button
                disabled={scouting}
                onClick={() => { setScouting(true); setTimeout(() => { scout(player.id); setScouting(false); }, 600); }}
                className="btn-secondary !px-4 !py-2 text-sm"
              >
                {scouting ? 'Analisando…' : '🔎 Solicitar análise'}
              </button>
            )}
          </div>
          {report ? (
            <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-4 space-y-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <p className="text-slate-300">Overall: <span className="font-mono font-bold text-slate-100">{report.overallLow === report.overallHigh ? report.overallLow : `${report.overallLow} – ${report.overallHigh}`}</span></p>
                <p className="text-slate-300">Potencial: <span className="font-mono font-bold text-slate-100">{report.potLow === report.potHigh ? report.potLow : `${report.potLow} – ${report.potHigh}`}</span></p>
                <p className="text-slate-300">Valor: <span className="font-mono font-bold text-gold">{fmtMoney(report.valueLow)} – {fmtMoney(report.valueHigh)}</span></p>
                <p className="text-slate-300">Salário estimado: <span className="font-mono text-slate-100">{fmtMoney(report.wageEst)}/sem</span></p>
                <p className="text-slate-300">Risco: <span className={`font-semibold ${report.risk === 'Baixo' ? 'text-accent' : report.risk === 'Médio' ? 'text-gold' : 'text-red-400'}`}>{report.risk}</span></p>
              </div>
              <p className="text-sm text-slate-400">{report.analysis}</p>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-accent font-semibold mb-1">Pontos fortes</p>
                  {report.strengths.map((s, i) => <p key={i} className="text-slate-300">• {s}</p>)}
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-red-400 font-semibold mb-1">Pontos fracos</p>
                  {report.weaknesses.map((s, i) => <p key={i} className="text-slate-300">• {s}</p>)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-slate-400">Avaliação: <span className="text-gold font-bold">{'★'.repeat(report.stars)}{'☆'.repeat(5 - report.stars)}</span></span>
                <span className="text-slate-400">Encaixe: <span className="text-slate-200 font-medium">{report.squadFit}</span></span>
                <span className={`ml-auto font-bold ${report.recommendation === 'Contratar' ? 'text-accent' : report.recommendation === 'Não recomendo' ? 'text-red-400' : 'text-gold'}`}>
                  {report.recommendation === 'Contratar' ? '✅ ' : report.recommendation === 'Não recomendo' ? '⛔ ' : '🤔 '}{report.recommendation}
                </span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-surface-700 p-4 text-sm text-slate-500">
              Peça uma análise ao responsável por contratações para obter avaliação, pontos fortes/fracos, faixa de valor e recomendação.
              <div className="mt-3 space-y-1 text-xs text-slate-400">
                <p>💬 Estimativa dele: €{fmtMoney(advice.estLow)} – €{fmtMoney(advice.estHigh)}</p>
                <p>💬 "Eu não pagaria mais que €{fmtMoney(advice.maxRec)}"</p>
                <p>💬 "O salário atual dele é de €{fmtMoney(player.contract?.wage ?? 0)}/semana"</p>
              </div>
            </div>
          )}
        </div>

        {/* Interesse */}
        <div>
          <h3 className="font-display font-semibold text-slate-200 mb-2">Interesse do jogador</h3>
          <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{interest.score >= 62 ? '🟢' : interest.score >= 40 ? '⚪' : '🔴'}</span>
              <span className="font-semibold text-slate-100">{interest.level}</span>
              <span className="text-xs text-slate-500">({interest.score}/100)</span>
              <div className="flex-1"><Bar value={interest.score} className="h-2" /></div>
            </div>
            {interest.reasons.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-slate-400">
                {interest.reasons.map((r, i) => <li key={i}>• {r}</li>)}
              </ul>
            )}
            {interest.competing.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-slate-500 mb-1">{interest.competing.length} clube(s) monitoram o jogador:</p>
                <div className="flex flex-wrap gap-1.5">
                  {interest.competing.map((c) => {
                    const dot = c.level === 'Muito interessado' ? '🟢' : c.level === 'Interessado' ? '🟢' : c.level === 'Pouco interessado' ? '🟡' : c.level === 'Neutro' ? '⚪' : c.level === 'Desinteressado' ? '🟠' : '🔴';
                    const cls = c.level === 'Muito interessado' || c.level === 'Interessado' ? 'border-accent/40 bg-accent/10 text-accent' : 'border-surface-600 bg-surface-800 text-slate-400';
                    return (
                      <span key={c.clubId} className={`badge border text-[10px] ${cls}`}>
                        {dot} {world.clubs[c.clubId]?.shortName ?? '—'} · {c.level}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Comparação com elenco + recomendação */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-4">
            <h3 className="font-display font-semibold text-slate-200 mb-2 text-sm">Como ele se compara ao nosso elenco?</h3>
            <div className="space-y-1.5 text-sm">
              <p className="text-slate-300">Overall dele: <span className="font-mono font-bold text-slate-100">{overallOf(player)}</span></p>
              <p className="text-slate-300">Nosso melhor na posição: <span className="font-mono font-bold text-slate-100">{bestSamePos || '—'}</span></p>
              <p className="text-slate-300">Necessidade: <span className={`font-semibold ${squadCompare === 'Excelente necessidade' ? 'text-accent' : 'text-slate-200'}`}>{squadCompare}</span></p>
              <p className="text-slate-300">Papel esperado: <span className="text-slate-200 font-medium">{role}</span></p>
              <p className="text-slate-300">Custo: <span className={budgetRatio > 0.8 ? 'text-red-400' : 'text-gold'}>€{fmtMoney(price)}{budgetRatio > 0.8 ? ' — alto p/ o orçamento' : ''}</span></p>
              <p className="text-slate-300">Impacto na folha: <span className="text-slate-200">+€{fmtMoney(player.contract?.wage ?? 0)}/sem</span></p>
            </div>
          </div>
          <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-4">
            <h3 className="font-display font-semibold text-slate-200 mb-2 text-sm">Recomendação do responsável</h3>
            {report ? (
              <div className="space-y-2">
                <p className="text-2xl text-gold">{'★'.repeat(report.stars)}{'☆'.repeat(5 - report.stars)}</p>
                <p className={`font-bold ${report.recommendation === 'Contratar' ? 'text-accent' : report.recommendation === 'Não recomendo' ? 'text-red-400' : 'text-gold'}`}>{report.recommendation}</p>
                <p className="text-xs text-slate-500">{report.squadFit} · Risco {report.risk.toLowerCase()}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Solicite a análise para obter a recomendação final.</p>
            )}
            {wageRatio > 1.4 && (
              <p className="mt-3 text-xs text-red-400">⚠️ O salário atual dele é {Math.round(wageRatio * 100) - 100}% maior que a média do elenco.</p>
            )}
          </div>
        </div>

        {/* Transferências anteriores */}
        <div>
          <h3 className="font-display font-semibold text-slate-200 mb-2">Histórico de transferências</h3>
          {world.transfers.filter((t) => t.playerId === player.id).length > 0 ? (
            <div className="space-y-0.5 text-xs text-slate-400">
              {world.transfers.filter((t) => t.playerId === player.id).slice(0, 5).map((t) => (
                <p key={t.id}>{t.date} — {t.fromClubName} → {t.toClubName} · {t.type === 'loan' ? 'empréstimo' : fmtMoney(t.fee)}</p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Sem transferências registradas neste save.</p>
          )}
        </div>

        {/* Ações */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-surface-700/60">
          {readOnly ? (
            <p className="text-xs text-slate-500 flex-1 py-1">👁 Perfil do jogador do seu elenco — use a Central de transferências para analisar propostas.</p>
          ) : (
            <button onClick={() => toggleShortlist(player.id)} className={`btn-ghost !px-4 !py-2 text-sm ${onWatch ? 'text-gold' : ''}`}>
              {onWatch ? '★ Observado' : '☆ Observar'}
            </button>
          )}
          {!readOnly && (neg ? (
            <button onClick={() => negotiationRoute(player.id)} className="btn-primary flex-1">
              Continuar negociação ({negotiationStatusLabel(neg.status)}) →
            </button>
          ) : (
            <>
              {!player.clubId && (
                <button onClick={() => startKind('free')} className="btn-primary flex-1">Iniciar contratação (livre)</button>
              )}
              {player.clubId && (
                <>
                  {canPre && <button onClick={() => startKind('pre-contract')} className="btn-primary !px-3">📝 Oferecer pré-contrato</button>}
                  {inWindow ? (
                    <>
                      <button onClick={() => startKind('transfer')} className="btn-primary flex-1">💰 Negociar com o clube</button>
                      <button onClick={() => startKind('loan')} className="btn-secondary !px-3">Empréstimo</button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { sendInquiry(world, career!, player.id); touch(); }}
                        className="btn-secondary !px-3"
                        title={inq ? `Sondagem: ${INQUIRY_LABEL[inq.status]}` : 'Perguntar ao clube se está disposto a negociar'}
                      >
                        {inq && inq.status === 'pendente' ? '⏳ Sondagem enviada' : '🔎 Fazer sondagem'}
                      </button>
                      <button onClick={() => startKind('transfer')} className="btn-primary flex-1" title="Registra o interesse e negocia o valor; a transferência só é concluída na próxima janela">
                        🤝 Negociar p/ próxima janela
                      </button>
                    </>
                  )}
                  <button onClick={() => openPlayerConversation(player.id)} className="btn-ghost !px-3" title="Conversar com o jogador sobre a transferência">
                    💬 Conversar
                  </button>
                </>
              )}
            </>
          ))}
        </div>
        {inq && (
          <p className="text-xs text-slate-400 px-1">
            {inquiryIcon(inq.status)} {INQUIRY_LABEL[inq.status]}{inq.note ? ` — ${inq.note}` : ''}
            {inq.suggestedFee > 0 && inq.status !== 'pendente' ? ` · Referência: €${fmtMoney(inq.suggestedFee)}` : ''}
          </p>
        )}
      </div>
    </Modal>
  );
}

function InfoBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
      <p className="mt-0.5 font-display font-bold text-slate-100 text-lg">{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-surface-800/70 px-2 py-1.5">
      <p className="font-mono font-bold text-slate-100 text-sm">{value}</p>
      <p className="text-[9px] uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  );
}

function CompareStat({ label, prev, cur }: { label: string; prev: number; cur: number }) {
  return (
    <div className="rounded-lg bg-surface-800/70 px-2 py-1.5">
      <p className="font-mono font-bold text-slate-100 text-sm">
        {prev > 0 || cur > 0 ? `${Math.round(cur * 10) / 10}` : '—'}
        <span className={`ml-1 text-xs ${cur > prev + 0.05 ? 'text-accent' : cur < prev - 0.05 ? 'text-red-400' : 'text-slate-500'}`}>{arrow(prev, cur)}</span>
      </p>
      <p className="text-[9px] uppercase tracking-wider text-slate-500">{label}: {Math.round(prev * 10) / 10} → {Math.round(cur * 10) / 10}</p>
    </div>
  );
}

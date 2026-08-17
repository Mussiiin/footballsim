import { useMemo, useState } from 'react';
import { useGame, NegotiationAction } from '../../state/store';
import { PlayerAvatar, OverallBadge, PositionBadge, Modal, Bar, Empty } from '../components';
import { fmtMoney } from '../../lib/format';
import { SquadRole } from '../../lib/types';
import {
  officerAdvice, marketAnalysis, negotiationStatusLabel, wageExpectation, ensureAgent,
  computeInterest, latestReport,
} from '../../game/negotiation';
import { daysBetween, formatDateBR } from '../../lib/date';
import { openPlayerConversation } from '../../game/messages';

const ROLE_OPTIONS: { id: SquadRole; label: string }[] = [
  { id: 'Titular absoluto', label: 'Titular absoluto' },
  { id: 'Titular', label: 'Titular' },
  { id: 'Rotação', label: 'Rotação' },
  { id: 'Reserva', label: 'Reserva' },
  { id: 'Promessa', label: 'Promessa' },
  { id: 'Base', label: 'Base' },
];

const PROMISE_OPTIONS: { id: string; label: string }[] = [
  { id: 'titularidade', label: 'Titularidade garantida' },
  { id: 'min-jogos', label: 'Mínimo de 15 partidas na temporada' },
  { id: 'posicao', label: 'Jogar na posição preferida' },
  { id: 'competicoes', label: 'Participar de todas as competições' },
  { id: 'desenvolvimento', label: 'Foco em desenvolvimento individual' },
  { id: 'aumento', label: 'Aumento salarial no fim da temporada' },
  { id: 'venda', label: 'Será vendido se chegar proposta boa' },
];

const moodColor: Record<string, string> = {
  '😄 Muito satisfeito': 'text-accent',
  '🙂 Satisfeito': 'text-sky-400',
  '😐 Neutro': 'text-slate-300',
  '😕 Insatisfeito': 'text-gold',
  '😡 Irritado': 'text-red-400',
};

export function NegotiationScreen({ playerId }: { playerId: string }) {
  const { career, sendNegotiationAction, signing, clearSigning, navigate } = useGame();
  const world = career!.world;
  const p = world.players[playerId];
  const neg = world.negotiations[playerId] ?? null;
  const club = world.clubs[career!.clubId];

  const advice = useMemo(() => p ? officerAdvice(world, career!, p.id) : null, [world, career, p]);
  const analysis = useMemo(() => p ? marketAnalysis(world, p) : null, [world, p]);
  const interest = useMemo(() => p ? computeInterest(world, p, career!.clubId) : null, [world, p, career]);
  const report = p ? latestReport(world, p.id) : null;
  const exp = p ? wageExpectation(world, p, interest?.score ?? 50, ensureAgent(world, p), career!.clubId) : null;

  const [fee, setFee] = useState(() => advice?.estLow ?? 0);
  const [bonus, setBonus] = useState(0);
  const [sellOn, setSellOn] = useState(0);
  const [installments, setInstallments] = useState(1);
  const [wage, setWage] = useState(() => exp?.min ?? 0);
  const [years, setYears] = useState(3);
  const [role, setRole] = useState<SquadRole>('Titular');
  const [promises, setPromises] = useState<string[]>([]);
  const [counterFee, setCounterFee] = useState(() => advice?.estLow ?? 0);
  const [counterWage, setCounterWage] = useState(() => exp?.min ?? 0);
  const [loanOption, setLoanOption] = useState(0);
  const [loanGames, setLoanGames] = useState(0);
  const [loanShare, setLoanShare] = useState(100);
  const [warRaise, setWarRaise] = useState(() => neg?.bidWar ? Math.round(neg.bidWar.rivalOffer * 1.1) : 0);

  if (!p) {
    return (
      <div className="space-y-4 animate-fadeUp">
        <Empty icon="🚫" title="Jogador não encontrado" subtitle="Esta negociação pode ter sido removida do mundo." />
        <button onClick={() => navigate('transfers')} className="btn-primary">← Voltar ao mercado</button>
      </div>
    );
  }

  if (signing) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <SigningCard result={signing} onClose={() => { clearSigning(); navigate('transfers'); }} />
      </div>
    );
  }

  if (!neg) {
    return (
      <div className="space-y-4 animate-fadeUp">
        <Empty icon="🤝" title="Sem negociação ativa" subtitle={`Não há negociação em andamento para ${p.firstName} ${p.lastName}.`} />
        <button onClick={() => navigate('transfers')} className="btn-primary">← Voltar ao mercado</button>
      </div>
    );
  }

  const send = (action: NegotiationAction) => sendNegotiationAction(neg.id, action);
  const budgetPct = (neg.fee || fee) / Math.max(1, club.budget);
  const lastAgentCounter = [...neg.offers].reverse().find((o) => o.side === 'agent' || o.side === 'player');
  const lastSellerCounter = [...neg.offers].reverse().find((o) => o.side === 'seller');
  const isTerminal = ['rejeitada', 'cancelada', 'expirada'].includes(neg.status);

  return (
    <div className="space-y-4 animate-fadeUp max-w-3xl mx-auto">
      <button onClick={() => navigate('transfers')} className="btn-ghost !px-3 !py-1.5 text-xs">← Voltar ao mercado</button>
      {/* Cabeçalho */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <PlayerAvatar player={p} size={52} />
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display font-bold text-lg text-slate-100">{p.firstName} {p.lastName}</h1>
              <PositionBadge pos={p.position} />
              <OverallBadge player={p} size="sm" />
            </div>
            <p className="text-xs text-slate-500">
              {p.clubId ? world.clubs[p.clubId]?.name : 'Sem clube'} · {p.age} anos · {p.nationality}
            </p>
          </div>
          <div className="text-right text-xs space-y-0.5">
            <span className={`badge border ${neg.status === 'concluida' ? 'border-accent/40 bg-accent/10 text-accent' : isTerminal ? 'border-red-500/40 bg-red-500/10 text-red-400' : 'border-gold/40 bg-gold/10 text-gold'}`}>
              {negotiationStatusLabel(neg.status)}
            </span>
            {neg.deadline && !isTerminal && neg.status !== 'concluida' && (
              <p className="text-slate-500">⏳ Prazo: {neg.deadline} ({daysBetween(world.date, neg.deadline)} dias)</p>
            )}
            <p className="text-slate-400">Clube: <span className={moodColor[neg.mood.seller]}>{neg.mood.seller}</span></p>
            <p className="text-slate-400">Jogador: <span className={moodColor[neg.mood.player]}>{neg.mood.player}</span></p>
          </div>
        </div>
        {interest && (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
            <span>Interesse do jogador:</span>
            <div className="w-40"><Bar value={interest.score} className="h-1.5" /></div>
            <span className="font-semibold text-slate-200">{interest.level} ({interest.score})</span>
            {neg.competingClubs.length > 0 && <span className="ml-auto text-gold">⚔️ {neg.competingClubs.length} concorrente(s)</span>}
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={() => openPlayerConversation(p.id)} className="btn-secondary !px-3 !py-1.5 text-xs">💬 Conversar com {p.firstName}</button>
          {neg.kind === 'free' && <span className="text-[10px] text-slate-500">Jogador livre — conversar ajuda a avaliar interesse e exigências.</span>}
        </div>
      </div>

      {/* Conversa */}
      <div className="card p-4 space-y-2.5 max-h-[46vh] overflow-y-auto">
        {neg.messages.map((m) => <ChatBubble key={m.id} m={m} />)}
      </div>

      {/* Painel de ações */}
      <div className="card p-4 space-y-4">
        {neg.bidWar && (
          <BidWarPanel
            rivalClub={world.clubs[neg.bidWar.rivalClubId]?.name ?? 'Outro clube'}
            rivalOffer={neg.bidWar.rivalOffer}
            officer={career!.recruitment.name.split(' ')[0]}
            lastOffer={[...neg.offers].reverse().find((o) => o.side === 'user')?.fee ?? 0}
            budgetPct={(neg.bidWar.rivalOffer / Math.max(1, club.budget))}
            warRaise={warRaise}
            setWarRaise={setWarRaise}
            onCover={() => send({ type: 'bidwar-response', action: 'cover' })}
            onRaise={() => send({ type: 'bidwar-response', action: 'raise', fee: warRaise })}
            onWithdraw={() => send({ type: 'bidwar-response', action: 'withdraw' })}
          />
        )}

        {isTerminal && (
          <div className="text-center space-y-3">
            <p className="text-red-400 font-medium">{neg.rejectedReason ?? 'Negociação encerrada.'}</p>
            <button onClick={() => navigate('transfers')} className="btn-primary">← Voltar ao mercado</button>
          </div>
        )}

        {!neg.bidWar && neg.status === 'interessado' && neg.kind !== 'free' && neg.kind !== 'pre-contract' && (
          <OfferBuilder
            negKind={neg.kind}
            fee={fee} setFee={setFee}
            bonus={bonus} setBonus={setBonus}
            sellOn={sellOn} setSellOn={setSellOn}
            installments={installments} setInstallments={setInstallments}
            loanOption={loanOption} setLoanOption={setLoanOption}
            loanGames={loanGames} setLoanGames={setLoanGames}
            loanShare={loanShare} setLoanShare={setLoanShare}
            advice={advice}
            budgetPct={budgetPct}
            onSend={() => {
              if (neg.kind === 'loan') {
                send({ type: 'club-offer', fee, bonus: 0, sellOnPct: 0, installments: 1, loanOptionFee: loanOption, loanObligationGames: loanGames, loanWageShare: loanShare });
              } else {
                send({ type: 'club-offer', fee, bonus, sellOnPct: sellOn, installments });
              }
            }}
            onCancel={() => send({ type: 'cancel', reason: 'Você não tinha interesse em prosseguir.' })}
          />
        )}

        {!neg.bidWar && neg.status === 'proposta-enviada' && (
          <div className="space-y-3 text-center">
            <p className="text-sm text-slate-400">⏳ Aguardando resposta do clube vendedor…</p>
            <button onClick={() => send({ type: 'seller-response', action: 'withdraw' })} className="btn-ghost">Retirar proposta</button>
          </div>
        )}

        {!neg.bidWar && neg.status === 'contraproposta' && lastSellerCounter && (
          <div className="space-y-3">
            <p className="text-sm text-gold font-semibold">Contraproposta do clube: €{fmtMoney(lastSellerCounter.fee)}{lastSellerCounter.sellOnPct > 0 ? ` + ${lastSellerCounter.sellOnPct}% futura venda` : lastSellerCounter.bonus > 0 ? ` + €${fmtMoney(lastSellerCounter.bonus)} em bônus` : ''}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => send({ type: 'seller-response', action: 'accept' })} className="btn-primary">Aceitar contraproposta</button>
              {lastSellerCounter.bonus === 0 && lastSellerCounter.sellOnPct === 0 && (
                <>
                  <button onClick={() => send({ type: 'seller-response', action: 'add-bonus' })} className="btn-secondary">Oferecer bônus</button>
                  <button onClick={() => send({ type: 'seller-response', action: 'add-sellon' })} className="btn-secondary">Oferecer futura venda</button>
                </>
              )}
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="label">Nova proposta (€)</label>
                <input type="number" className="input w-full" value={counterFee} onChange={(e) => setCounterFee(Number(e.target.value))} />
              </div>
              <button onClick={() => send({ type: 'seller-response', action: 'counter', fee: counterFee, bonus, sellOnPct: sellOn })} className="btn-secondary">Oferecer €{fmtMoney(counterFee)}</button>
              <button onClick={() => send({ type: 'seller-response', action: 'withdraw' })} className="btn-ghost">Retirar</button>
            </div>
          </div>
        )}

        {(neg.status === 'acordo-clube' || neg.status === 'negociacao-jogador') && (
          <WageBuilder
            wage={wage} setWage={setWage}
            bonus={bonus} setBonus={setBonus}
            years={years} setYears={setYears}
            role={role} setRole={setRole}
            promises={promises} setPromises={setPromises}
            currentWage={p.contract?.wage ?? 0}
            onSend={() => send({ type: 'wage-offer', wage, bonus, years, role, promises })}
          />
        )}

        {neg.status === 'negociacao-jogador' && lastAgentCounter && lastAgentCounter.wage !== undefined && (
          <div className="space-y-3 border-t border-surface-700/60 pt-3">
            <p className="text-sm text-gold font-semibold">Pedido: €{fmtMoney(lastAgentCounter.wage)}/semana{lastAgentCounter.bonus > 0 ? ` + €${fmtMoney(lastAgentCounter.bonus)} bônus` : ''}</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => send({ type: 'player-response', action: 'accept' })} className="btn-primary">Aceitar</button>
              <button onClick={() => send({ type: 'player-response', action: 'add-bonus', bonus: 250_000 })} className="btn-secondary">Adicionar bônus</button>
              <button onClick={() => send({ type: 'player-response', action: 'end' })} className="btn-ghost">Encerrar negociação</button>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="label">Contraoferta salarial (€/sem)</label>
                <input type="number" className="input w-full" value={counterWage} onChange={(e) => setCounterWage(Number(e.target.value))} />
              </div>
              <button onClick={() => send({ type: 'player-response', action: 'counter', wage: counterWage })} className="btn-secondary">Oferecer €{fmtMoney(counterWage)}</button>
            </div>
          </div>
        )}

        {neg.status === 'acordo-verbal' && (
          <div className="text-center space-y-3">
            <p className="text-sm text-accent font-semibold">Acordo verbal alcançado! 🎉</p>
            {neg.kind === 'loan' && (
              <p className="text-xs text-slate-400">
                Empréstimo · Taxa €{fmtMoney(neg.loanFee)}{neg.loanOptionFee > 0 ? ` · Opção de compra €${fmtMoney(neg.loanOptionFee)}` : ''}{neg.loanObligationGames > 0 ? ` · Obrigação após ${neg.loanObligationGames} jogos` : ''}
              </p>
            )}
            <button onClick={() => send({ type: 'medical' })} className="btn-primary">🩺 Exames médicos</button>
          </div>
        )}

        {neg.status === 'exames' && neg.medical && neg.medical.status === 'pending' && (
          <div className="text-center space-y-3">
            <p className="text-sm font-semibold text-gold">🏥 Exames médicos em andamento</p>
            <p className="text-xs text-slate-400">
              {neg.medicalDoneOn
                ? `O resultado sai em ${Math.max(1, daysBetween(world.date, neg.medicalDoneOn))} dia${Math.max(1, daysBetween(world.date, neg.medicalDoneOn)) > 1 ? 's' : ''} (${formatDateBR(neg.medicalDoneOn)}). Avance o tempo para concluir.`
                : 'Os médicos estão avaliando o jogador. Avance o tempo para concluir.'}
            </p>
            <p className="text-xs text-slate-500">🔒 A assinatura do contrato só é liberada após a aprovação nos exames.</p>
          </div>
        )}

        {neg.status === 'exames' && neg.medical && neg.medical.status !== 'pending' && (
          <div className="text-center space-y-3">
            <p className={`text-sm font-semibold ${neg.medical.status === 'approved' ? 'text-accent' : neg.medical.status === 'conditional' ? 'text-gold' : 'text-red-400'}`}>
              {neg.medical.status === 'approved' ? '✅ Aprovado nos exames' : neg.medical.status === 'conditional' ? '⚠️ Aprovado com ressalvas' : '❌ Reprovado nos exames'}
            </p>
            <p className="text-xs text-slate-400">{neg.medical.note}</p>
            {neg.medical.status !== 'failed' && (
              <button onClick={() => send({ type: 'sign' })} className="btn-primary text-lg !px-8 !py-3">✍️ Assinar contrato</button>
            )}
          </div>
        )}

        {neg.status === 'concluida' && (
          <div className="text-center space-y-3">
            <p className="text-sm text-accent font-semibold">✅ Contratação concluída!</p>
            <button onClick={() => navigate('transfers')} className="btn-primary">← Voltar ao mercado</button>
          </div>
        )}
      </div>

      {report && (
        <div className="card p-3 text-xs text-slate-400">
          <span className="text-gold font-semibold">🔎 Relatório de análise: </span>
          {report.recommendation} · Overall {report.overallLow}–{report.overallHigh} · Valor €{fmtMoney(report.valueLow)}–{fmtMoney(report.valueHigh)} · Risco {report.risk}
        </div>
      )}
      {analysis && (
        <div className="card p-3 text-xs text-slate-500">
          Valor de mercado: <b className="text-gold">{fmtMoney(analysis.value)}</b> · Demanda: {analysis.demand} clube(s) · Tendência: {analysis.trend === 'alta' ? '📈 alta' : analysis.trend === 'queda' ? '📉 queda' : 'estável'}
        </div>
      )}
    </div>
  );
}

function ChatBubble({ m }: { m: { side: string; text: string; actor?: string; mood?: string } }) {
  const isUser = m.side === 'user';
  const colors: Record<string, string> = {
    officer: 'bg-sky-500/10 border-sky-500/30 text-sky-200',
    seller: 'bg-surface-800 border-surface-600 text-slate-200',
    player: 'bg-accent/10 border-accent/30 text-accent',
    agent: 'bg-gold/10 border-gold/30 text-gold',
    medical: 'bg-red-500/10 border-red-500/30 text-red-300',
    system: 'bg-surface-800/60 border-surface-700 text-slate-400 italic',
  };
  const side = m.side as keyof typeof colors;
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm border ${isUser ? 'bg-accent text-surface-950 border-accent' : colors[side] ?? 'bg-surface-800 border-surface-600 text-slate-200'}`}>
        {!isUser && m.actor && <p className={`text-[10px] font-bold mb-0.5 ${m.side === 'officer' ? 'text-sky-400' : m.side === 'player' ? 'text-accent' : m.side === 'agent' ? 'text-gold' : 'text-slate-500'}`}>{m.actor}</p>}
        <p>{m.text}</p>
        {m.mood && <p className="text-[10px] mt-1 opacity-80">{m.mood}</p>}
      </div>
    </div>
  );
}

function BidWarPanel({ rivalClub, rivalOffer, officer, lastOffer, budgetPct, warRaise, setWarRaise, onCover, onRaise, onWithdraw }: {
  rivalClub: string; rivalOffer: number; officer: string; lastOffer: number;
  budgetPct: number; warRaise: number; setWarRaise: (n: number) => void;
  onCover: () => void; onRaise: () => void; onWithdraw: () => void;
}) {
  const pct = Math.round((rivalOffer / Math.max(1, lastOffer)) * 100);
  return (
    <div className="space-y-3 rounded-xl border border-gold/40 bg-gold/5 p-4">
      <p className="text-sm font-display font-bold text-gold">⚔️ Guerra de propostas!</p>
      <p className="text-xs text-slate-300">
        <b className="text-slate-100">{rivalClub}</b> apresentou uma oferta de <b className="text-gold">€{fmtMoney(rivalOffer)}</b>
        {lastOffer > 0 ? ` (${pct}% da nossa proposta de €${fmtMoney(lastOffer)})` : ''} pelo jogador.
      </p>
      <p className="text-xs text-sky-300 italic">"{officer}, precisamos decidir agora: cobrir, subir ou deixar para lá."</p>
      {budgetPct > 1 && <p className="text-xs text-red-400">⚠️ A proposta rival ultrapassa o orçamento de transferências ({Math.round(budgetPct * 100)}%).</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={onCover} className="btn-primary flex-1">
          Cobrir — €{fmtMoney(rivalOffer)}
        </button>
        <div className="flex items-end gap-2">
          <div className="w-36">
            <label className="label">Subir para (€)</label>
            <input type="number" className="input w-full" value={warRaise} onChange={(e) => setWarRaise(Number(e.target.value))} />
          </div>
          <button onClick={onRaise} className="btn-secondary">Subir oferta</button>
        </div>
      </div>
      <button onClick={onWithdraw} className="btn-ghost text-xs">Não quero cobrir — desistir</button>
    </div>
  );
}

function OfferBuilder({ negKind, fee, setFee, bonus, setBonus, sellOn, setSellOn, installments, setInstallments, loanOption, setLoanOption, loanGames, setLoanGames, loanShare, setLoanShare, advice, budgetPct, onSend, onCancel }: {
  negKind: string; fee: number; setFee: (n: number) => void; bonus: number; setBonus: (n: number) => void;
  sellOn: number; setSellOn: (n: number) => void; installments: number; setInstallments: (n: number) => void;
  loanOption: number; setLoanOption: (n: number) => void; loanGames: number; setLoanGames: (n: number) => void;
  loanShare: number; setLoanShare: (n: number) => void;
  advice: { estLow: number; estHigh: number; maxRec: number } | null; budgetPct: number; onSend: () => void; onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      {advice && (
        <div className="rounded-lg bg-sky-500/5 border border-sky-500/20 p-3 text-xs text-sky-200 space-y-0.5">
          <p>💬 Estimativa do responsável: <b>€{fmtMoney(advice.estLow)} – €{fmtMoney(advice.estHigh)}</b></p>
          <p>💬 "Eu não pagaria mais que <b>€{fmtMoney(advice.maxRec)}</b>"</p>
        </div>
      )}
      {negKind === 'loan' ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className="label">Taxa de empréstimo (€)</label><input type="number" className="input w-full" value={fee} onChange={(e) => setFee(Number(e.target.value))} /></div>
          <div><label className="label">Opção de compra (€)</label><input type="number" className="input w-full" value={loanOption} onChange={(e) => setLoanOption(Number(e.target.value))} /></div>
          <div><label className="label">Obrigação após jogos</label><input type="number" className="input w-full" value={loanGames} onChange={(e) => setLoanGames(Number(e.target.value))} /></div>
          <div>
            <label className="label">% do salário pago</label>
            <select className="input w-full" value={loanShare} onChange={(e) => setLoanShare(Number(e.target.value))}>
              {[100, 75, 50, 25].map((s) => <option key={s} value={s}>{s}%</option>)}
            </select>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Valor fixo (€)</label>
            <input type="number" className="input w-full" value={fee} onChange={(e) => setFee(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Bônus (€)</label>
            <input type="number" className="input w-full" value={bonus} onChange={(e) => setBonus(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">% futura venda</label>
            <input type="number" className="input w-full" value={sellOn} onChange={(e) => setSellOn(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Parcelas</label>
            <select className="input w-full" value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 1 ? 'À vista' : `${n} parcelas`}</option>)}
            </select>
          </div>
        </div>
      )}
      {budgetPct > 0 && (
        <p className={`text-xs ${budgetPct > 1 ? 'text-red-400' : 'text-slate-400'}`}>
          {budgetPct > 1 ? `⚠️ A proposta ultrapassa o orçamento de transferências (${Math.round(budgetPct * 100)}%).` : `Orçamento utilizado: ${Math.round(budgetPct * 100)}%.`}
        </p>
      )}
      <div className="flex gap-2">
        <button onClick={onSend} className="btn-primary flex-1">📨 Enviar proposta</button>
        <button onClick={onCancel} className="btn-ghost">Não tenho interesse</button>
      </div>
    </div>
  );
}

function WageBuilder({ wage, setWage, bonus, setBonus, years, setYears, role, setRole, promises, setPromises, currentWage, onSend }: {
  wage: number; setWage: (n: number) => void; bonus: number; setBonus: (n: number) => void;
  years: number; setYears: (n: number) => void; role: SquadRole; setRole: (r: SquadRole) => void;
  promises: string[]; setPromises: (p: string[]) => void; currentWage: number; onSend: () => void;
}) {
  const toggle = (id: string) => setPromises(promises.includes(id) ? promises.filter((x) => x !== id) : [...promises, id]);
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">Negociação salarial com o jogador e seu agente. Salário atual: <b className="text-slate-200">{fmtMoney(currentWage)}/sem</b></p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="label">Salário (€/sem)</label>
          <input type="number" className="input w-full" value={wage} onChange={(e) => setWage(Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Bônus de assinatura (€)</label>
          <input type="number" className="input w-full" value={bonus} onChange={(e) => setBonus(Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Duração (anos)</label>
          <select className="input w-full" value={years} onChange={(e) => setYears(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y} ano{y > 1 ? 's' : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Papel no elenco</label>
          <select className="input w-full" value={role} onChange={(e) => setRole(e.target.value as SquadRole)}>
            {ROLE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <p className="label">Promessas (registradas no contrato)</p>
        <div className="flex flex-wrap gap-1.5">
          {PROMISE_OPTIONS.map((o) => (
            <button key={o.id} onClick={() => toggle(o.id)} className={`badge border cursor-pointer transition ${promises.includes(o.id) ? 'border-accent/50 bg-accent/15 text-accent' : 'border-surface-600 bg-surface-800 text-slate-400 hover:text-slate-200'}`}>
              {promises.includes(o.id) ? '✓ ' : ''}{o.label}
            </button>
          ))}
        </div>
      </div>
      <button onClick={onSend} className="btn-primary w-full">📨 Apresentar proposta salarial</button>
    </div>
  );
}

function SigningCard({ result, onClose }: { result: {
  name: string; position: string; overall: number; potential: number; age: number; fee: number; wage: number; years: number;
  role: string; fromClubName: string; toClubName: string; grade: number; reasons: string[]; medicalNote: string | null; kind: string;
}; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="" wide>
      <div className="text-center animate-fadeUp">
        <div className="text-5xl mb-2 animate-pulse">✍️</div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-gold font-bold">Novo Reforço</p>
        <h2 className="font-display font-bold text-3xl text-slate-100 mt-1">{result.name}</h2>
        <p className="text-sm text-slate-400 mt-1">{result.position} · Overall {result.overall} · Potencial {result.potential} · {result.age} anos</p>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
          <SignStat label="Valor" value={result.fee > 0 ? fmtMoney(result.fee) : 'Livre'} />
          <SignStat label="Salário" value={`${fmtMoney(result.wage)}/sem`} />
          <SignStat label="Contrato" value={`${result.years} anos`} />
          <SignStat label="Papel" value={result.role} />
        </div>
        <p className="text-xs text-slate-500 mt-2">{result.fromClubName} → {result.toClubName}</p>
        {result.medicalNote && <p className="text-xs text-gold mt-1">⚠️ {result.medicalNote}</p>}
        <div className="mt-5 rounded-xl border border-surface-700 bg-surface-800/50 p-4 text-left">
          <p className="font-display font-semibold text-slate-200 text-sm mb-2">📊 Avaliação da contratação</p>
          <p className="text-3xl font-display font-bold text-gold">{result.grade.toFixed(1)}<span className="text-sm text-slate-500">/10</span></p>
          <ul className="mt-2 space-y-0.5 text-xs text-slate-400">
            {result.reasons.map((r, i) => <li key={i}>• {r}</li>)}
          </ul>
        </div>
        <button onClick={onClose} className="btn-primary mt-5 w-full">Continuar</button>
      </div>
    </Modal>
  );
}

function SignStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-800/70 p-3">
      <p className="font-display font-bold text-slate-100">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  );
}

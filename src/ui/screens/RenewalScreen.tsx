import { useMemo, useState } from 'react';
import { useGame, NegotiationAction } from '../../state/store';
import { PlayerAvatar, OverallBadge, PositionBadge, Bar, Empty } from '../components';
import { fmtMoney } from '../../lib/format';
import { SquadRole } from '../../lib/types';
import { renewalStatusLabel } from '../../game/negotiation';

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
];

const moodColor: Record<string, string> = {
  '😄 Muito satisfeito': 'text-accent',
  '🙂 Satisfeito': 'text-sky-400',
  '😐 Neutro': 'text-slate-300',
  '😕 Insatisfeito': 'text-gold',
  '😡 Irritado': 'text-red-400',
};

export function RenewalScreen({ playerId }: { playerId: string }) {
  const { career, sendNegotiationAction, navigate } = useGame();
  const world = career!.world;
  const p = world.players[playerId];
  const ren = world.renewals[playerId] ?? null;

  const [wage, setWage] = useState(() => p?.contract ? Math.round(p.contract.wage * 1.15) : 0);
  const [bonus, setBonus] = useState(0);
  const [years, setYears] = useState(3);
  const [role, setRole] = useState<SquadRole>('Titular');
  const [promises, setPromises] = useState<string[]>([]);
  const [counterWage, setCounterWage] = useState(() => p?.contract ? Math.round(p.contract.wage * 1.2) : 0);

  if (!p || !p.contract) {
    return (
      <div className="space-y-4 animate-fadeUp">
        <Empty icon="🚫" title="Jogador não encontrado" subtitle="Este jogador não faz parte do seu elenco." />
        <button onClick={() => navigate('squad')} className="btn-primary">← Voltar ao elenco</button>
      </div>
    );
  }

  if (!ren) {
    return (
      <div className="space-y-4 animate-fadeUp">
        <Empty icon="📄" title="Sem renovação ativa" subtitle={`Não há conversa de renovação em andamento para ${p.firstName} ${p.lastName}.`} />
        <button onClick={() => navigate('squad')} className="btn-primary">← Voltar ao elenco</button>
      </div>
    );
  }

  const send = (action: NegotiationAction) => sendNegotiationAction(ren.id, action);
  const isTerminal = ['assinada', 'rejeitada', 'cancelada'].includes(ren.status);
  const lastAgentCounter = [...ren.offers].reverse().find((o) => o.side === 'agent' || o.side === 'player');
  const monthlyImpact = Math.round((ren.wage || wage) * 4.33) - Math.round(p.contract.wage * 4.33);

  const toggle = (id: string) => setPromises(promises.includes(id) ? promises.filter((x) => x !== id) : [...promises, id]);

  return (
    <div className="space-y-4 animate-fadeUp max-w-3xl mx-auto">
      <button onClick={() => navigate('squad')} className="btn-ghost !px-3 !py-1.5 text-xs">← Voltar ao elenco</button>

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
              {p.nationality} · {p.age} anos · {p.personality} · Contrato até {p.contract.until}
            </p>
          </div>
          <div className="text-right text-xs space-y-0.5">
            <span className={`badge border ${ren.status === 'assinada' ? 'border-accent/40 bg-accent/10 text-accent' : isTerminal ? 'border-red-500/40 bg-red-500/10 text-red-400' : 'border-gold/40 bg-gold/10 text-gold'}`}>
              {renewalStatusLabel(ren.status)}
            </span>
            <p className="text-slate-400 mt-1">Humor: <span className={moodColor[ren.mood]}>{ren.mood}</span></p>
          </div>
        </div>
        {/* Vontade de permanecer */}
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          <span>Vontade de permanecer:</span>
          <div className="w-40"><Bar value={ren.loyalty} className="h-1.5" /></div>
          <span className={`font-semibold ${ren.loyalty >= 70 ? 'text-accent' : ren.loyalty >= 45 ? 'text-slate-200' : 'text-gold'}`}>
            {ren.loyalty >= 70 ? '🟢 Muito disposto' : ren.loyalty >= 45 ? '🟡 Em aberto' : '🟠 Relutante'}
          </span>
          <span className="ml-auto text-slate-500">
            Salário atual: <b className="text-slate-200">{fmtMoney(p.contract.wage)}/sem</b>
          </span>
        </div>
      </div>

      {/* Conversa */}
      <div className="card p-4 space-y-2.5 max-h-[40vh] overflow-y-auto">
        {ren.messages.map((m) => <ChatBubble key={m.id} m={m} />)}
      </div>

      {/* Painel de ações */}
      <div className="card p-4 space-y-4">
        {isTerminal && (
          <div className="text-center space-y-3">
            <p className={`font-medium ${ren.status === 'assinada' ? 'text-accent' : 'text-red-400'}`}>
              {ren.status === 'assinada' ? `✅ Contrato renovado até ${p.contract.until} por ${fmtMoney(p.contract.wage)}/sem.` : (ren.rejectedReason ?? 'Conversa de renovação encerrada.')}
            </p>
            <button onClick={() => navigate('squad')} className="btn-primary">← Voltar ao elenco</button>
          </div>
        )}

        {!isTerminal && (ren.status === 'iniciada' || ren.status === 'negociando') && (
          <div className="space-y-3">
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
            <p className={`text-xs ${monthlyImpact > 0 ? 'text-gold' : 'text-slate-400'}`}>
              Impacto na folha: <b>{monthlyImpact > 0 ? `+${fmtMoney(monthlyImpact)}` : fmtMoney(monthlyImpact)}/mês</b> ({fmtMoney(p.contract.wage)} → {fmtMoney(ren.wage || wage)}/sem)
            </p>
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
            <button onClick={() => send({ type: 'renewal-offer', wage, bonus, years, role, promises })} className="btn-primary w-full">
              📨 Apresentar proposta de renovação
            </button>
          </div>
        )}

        {ren.status === 'negociando' && lastAgentCounter && lastAgentCounter.wage !== undefined && (
          <div className="space-y-3 border-t border-surface-700/60 pt-3">
            <p className="text-sm text-gold font-semibold">
              Pedido: €{fmtMoney(lastAgentCounter.wage)}/semana{lastAgentCounter.bonus > 0 ? ` + €${fmtMoney(lastAgentCounter.bonus)} bônus` : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => send({ type: 'renewal-response', action: 'accept' })} className="btn-primary">Aceitar</button>
              <button onClick={() => send({ type: 'renewal-response', action: 'add-bonus', bonus: 200_000 })} className="btn-secondary">Adicionar bônus</button>
              <button onClick={() => send({ type: 'renewal-response', action: 'end' })} className="btn-ghost">Encerrar conversa</button>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="label">Contraproposta salarial (€/sem)</label>
                <input type="number" className="input w-full" value={counterWage} onChange={(e) => setCounterWage(Number(e.target.value))} />
              </div>
              <button onClick={() => send({ type: 'renewal-response', action: 'counter', wage: counterWage })} className="btn-secondary">
                Oferecer €{fmtMoney(counterWage)}
              </button>
            </div>
          </div>
        )}

        {ren.status === 'acordo' && (
          <div className="text-center space-y-3">
            <p className="text-sm text-accent font-semibold">🎉 Acordo verbal alcançado!</p>
            <p className="text-xs text-slate-400">
              {fmtMoney(ren.wage)}/sem por {ren.years} ano{ren.years > 1 ? 's' : ''} · Papel: {ren.role ?? '—'}{ren.bonus > 0 ? ` · Bônus ${fmtMoney(ren.bonus)}` : ''}
            </p>
            <button onClick={() => send({ type: 'renewal-sign' })} className="btn-primary text-lg !px-8 !py-3">✍️ Assinar renovação</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatBubble({ m }: { m: { side: string; text: string; actor?: string; mood?: string } }) {
  const isUser = m.side === 'user';
  const colors: Record<string, string> = {
    officer: 'bg-sky-500/10 border-sky-500/30 text-sky-200',
    player: 'bg-accent/10 border-accent/30 text-accent',
    agent: 'bg-gold/10 border-gold/30 text-gold',
    system: 'bg-surface-800/60 border-surface-700 text-slate-400 italic',
  };
  const side = m.side as keyof typeof colors;
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm border ${isUser ? 'bg-accent text-surface-950 border-accent' : colors[side] ?? 'bg-surface-800 border-surface-600 text-slate-200'}`}>
        {!isUser && m.actor && <p className={`text-[10px] font-bold mb-0.5 ${m.side === 'player' ? 'text-accent' : m.side === 'agent' ? 'text-gold' : 'text-slate-500'}`}>{m.actor}</p>}
        <p>{m.text}</p>
        {m.mood && <p className="text-[10px] mt-1 opacity-80">{m.mood}</p>}
      </div>
    </div>
  );
}

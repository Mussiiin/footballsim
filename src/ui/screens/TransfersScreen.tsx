import { useMemo, useState } from 'react';
import { useGame } from '../../state/store';
import { PlayerAvatar, OverallBadge, PositionBadge, Tabs, Empty, Modal } from '../components';
import { sellingPrice, squadOf } from '../../game/transfers';
import { overallOf } from '../../game/overall';
import { fmtMoney } from '../../lib/format';
import { ALL_POSITIONS, POSITION_LABELS, Position, Player, IncomingOffer } from '../../lib/types';
import { isInTransferWindow } from '../../game/sim';
import { daysBetween, formatDateBR } from '../../lib/date';
import { marketAnalysis, computeInterest, interestLevel, negotiationForPlayer, activeNegotiations, negotiationStatusLabel, isEligibleForPreContract, startNegotiation } from '../../game/negotiation';
import { PlayerMarketModal } from './PlayerMarketModal';
import { openPlayerConversation } from '../../game/messages';
import { squadComposition, SQUAD_TARGETS } from '../../game/squad';
import { INQUIRY_LABEL, inquiryIcon, inquiryForPlayer } from '../../game/sondagem';

type SortKey = 'overall' | 'potential' | 'valueAsc' | 'valueDesc' | 'ageAsc' | 'ageDesc' | 'costbenefit' | 'wage';

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'overall', label: 'Maior overall' },
  { id: 'potential', label: 'Maior potencial' },
  { id: 'valueDesc', label: 'Maior valor de mercado' },
  { id: 'valueAsc', label: 'Menor preço' },
  { id: 'ageAsc', label: 'Menor idade' },
  { id: 'ageDesc', label: 'Maior idade' },
  { id: 'wage', label: 'Menor salário' },
  { id: 'costbenefit', label: 'Melhor custo-benefício' },
];

function interestDot(score: number): { icon: string; cls: string } {
  if (score >= 62) return { icon: '🟢', cls: 'text-accent' };
  if (score >= 48) return { icon: '🟡', cls: 'text-gold' };
  if (score >= 40) return { icon: '⚪', cls: 'text-slate-400' };
  if (score >= 28) return { icon: '🟠', cls: 'text-orange-400' };
  return { icon: '🔴', cls: 'text-red-500' };
}

export function TransfersScreen({ initialTab }: { initialTab?: string }) {
  const { career, navigate } = useGame();
  const [tab, setTab] = useState(initialTab ?? 'market');
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState<Position | 'ALL'>('ALL');
  const [minOv, setMinOv] = useState(0);
  const [maxAge, setMaxAge] = useState(99);
  const [nationality, setNationality] = useState('ALL');
  const [foot, setFoot] = useState('ALL');
  const [maxValue, setMaxValue] = useState(0);
  const [sort, setSort] = useState<SortKey>('overall');
  const [scope, setScope] = useState('market'); // market | free | loan | expiring | all
  const [view, setView] = useState<Player | null>(null);

  const world = career!.world;
  const club = world.clubs[career!.clubId];
  const inWindow = isInTransferWindow(world, world.date);

  const players = useMemo(() => Object.values(world.players).filter((p) => p.status === 'active'), [world]);
  const nationalities = useMemo(() => {
    const set = new Set<string>();
    for (const p of players) set.add(p.nationality);
    return [...set].sort().slice(0, 60);
  }, [players]);

  const candidates = useMemo(() => {
    let list = players.filter((p) => p.clubId !== career!.clubId);
    if (scope === 'market') {
      list = list.filter((p) => !p.clubId || p.transferListed || p.loanListed || isEligibleForPreContract(p, world.date));
    } else if (scope === 'free') {
      list = list.filter((p) => !p.clubId);
    } else if (scope === 'loan') {
      list = list.filter((p) => p.loanListed || (p.clubId && p.isLoan === false));
    } else if (scope === 'expiring') {
      // pré-contrato: SÓ jogadores realmente no período final do contrato (≤ 6 meses)
      list = list.filter((p) => isEligibleForPreContract(p, world.date));
    }
    if (search) list = list.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()));
    if (pos !== 'ALL') list = list.filter((p) => p.position === pos || p.secondaryPositions.includes(pos));
    if (minOv > 0) list = list.filter((p) => overallOf(p) >= minOv);
    if (maxAge < 99) list = list.filter((p) => p.age <= maxAge);
    if (nationality !== 'ALL') list = list.filter((p) => p.nationality === nationality);
    if (foot !== 'ALL') list = list.filter((p) => p.foot === foot);
    if (maxValue > 0) list = list.filter((p) => p.value <= maxValue);
    const sorted = [...list].sort((a, b) => {
      switch (sort) {
        case 'potential': return b.potential - a.potential;
        case 'valueAsc': return a.value - b.value;
        case 'valueDesc': return b.value - a.value;
        case 'ageAsc': return a.age - b.age;
        case 'ageDesc': return b.age - a.age;
        case 'wage': return (a.contract?.wage ?? 0) - (b.contract?.wage ?? 0);
        case 'costbenefit': return (a.value / Math.max(40, overallOf(a))) - (b.value / Math.max(40, overallOf(b)));
        default: return overallOf(b) - overallOf(a);
      }
    });
    return sorted.slice(0, 60);
  }, [players, career, world, scope, search, pos, minOv, maxAge, nationality, foot, maxValue, sort]);

  const shortlist = useMemo(() => career!.shortlist.map((id) => world.players[id]).filter((p): p is Player => !!p && p.status === 'active'), [career, world]);
  const negs = activeNegotiations(world);
  const pendingOffers = world.incomingOffers.filter((o) => o.status === 'pending');
  const mySquad = useMemo(() => squadOf(world, career!.clubId), [world, career]);
  const inquiries = world.inquiries.filter((i) => i.sellerClubId !== career!.clubId);

  return (
    <div className="space-y-4 animate-fadeUp">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100">Central de transferências</h1>
          <p className={`text-sm ${inWindow ? 'text-accent' : 'text-slate-500'}`}>
            {inWindow ? '📢 Janela aberta — negociações permitidas' : 'Janela fechada — apenas livres e pré-contratos'}
          </p>
        </div>
        <div className="flex-1" />
        <div className="text-right text-xs text-slate-500">
          <p>Orçamento: <span className="text-gold font-semibold text-sm">{fmtMoney(club.budget)}</span></p>
          <p>Caixa: <span className="text-slate-300 font-semibold">{fmtMoney(club.balance)}</span></p>
          <p className="mt-0.5">Folha: <span className="text-slate-400">{fmtMoney(club.wageBill)}/mês</span></p>
        </div>
      </div>

      {/* contratações em trânsito: documentação, viagem, exames, registro */}
      {world.pendingArrivals.some((a) => a.clubId === career!.clubId) && (
        <div className="card p-4 border-gold/30">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">🛬 Chegadas previstas</p>
          <div className="space-y-2">
            {world.pendingArrivals.filter((a) => a.clubId === career!.clubId).map((a) => {
              const p = world.players[a.playerId];
              if (!p) return null;
              const daysLeft = Math.max(0, daysBetween(world.date, a.arrivesOn));
              return (
                <div key={a.id} className="flex items-center gap-3 rounded-lg border border-surface-700 bg-surface-800/40 p-2.5">
                  <button onClick={() => navigate(`player:${p.id}`)} title="Ver jogador">
                    <PlayerAvatar player={p} size={36} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{p.firstName} {p.lastName} <span className="text-slate-500 font-normal">← {a.fromName}</span></p>
                    <p className="text-[11px] text-accent">
                      {a.status}{daysLeft > 0 ? ` · chega em ${daysLeft} dia${daysLeft > 1 ? 's' : ''} (${formatDateBR(a.arrivesOn)})` : ' · contrato sendo registrado'}
                    </p>
                  </div>
                  <span className="text-xs font-mono text-gold">€{(a.fee / 1e6).toFixed(1)}M</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* status do elenco: ajuda o treinador a decidir se deve contratar/vender/emprestar */}
      {(() => {
        const comp = squadComposition(world, career!.clubId);
        const t = SQUAD_TARGETS;
        if (comp.total >= t.MAX) {
          return (
            <div className="card p-4 border-amber-500/30 bg-amber-500/5">
              <p className="text-sm text-amber-300">
                ⚠️ Nosso elenco já está cheio ({comp.total} jogadores). Talvez seja necessário <b>vender ou emprestar</b> alguns jogadores antes de contratar.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                🧤 {comp.GK} goleiros · 🛡️ {comp.DEF} defensores · ⚙️ {comp.MID} meio-campistas · ⚽ {comp.ATT} atacantes
              </p>
            </div>
          );
        }
        if (comp.total <= t.MIN - 2 || comp.GK < 3 || comp.DEF < 8 || comp.MID < 8 || comp.ATT < 9) {
          return (
            <div className="card p-4 border-sky-500/30 bg-sky-500/5">
              <p className="text-sm text-sky-300">
                💡 Estamos com poucas opções no elenco ({comp.total} jogadores). Recomendo buscar reforços no mercado.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                🧤 {comp.GK}/3 goleiros · 🛡️ {comp.DEF}/8 defensores · ⚙️ {comp.MID}/8 meio-campistas · ⚽ {comp.ATT}/9 atacantes
              </p>
            </div>
          );
        }
        return (
          <p className="text-[11px] text-slate-500 px-1">
            ✅ Elenco no padrão ({comp.total}/28) · 🧤 {comp.GK} · 🛡️ {comp.DEF} · ⚙️ {comp.MID} · ⚽ {comp.ATT}
          </p>
        );
      })()}

      <Tabs
        tabs={[
          { id: 'market', label: 'Mercado' },
          { id: 'highlights', label: '🔥 Destaques' },
          { id: 'watch', label: `Observados (${shortlist.length})` },
          { id: 'neg', label: `Negociações (${negs.length})` },
          { id: 'offers', label: `Propostas (${pendingOffers.length})` },
          { id: 'inquiries', label: `🔎 Sondagens (${inquiries.length})` },
          { id: 'sell', label: `Vender (${mySquad.length})` },
          { id: 'log', label: 'Registro' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'market' && (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <input className="input w-52" placeholder="Buscar jogador…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="market">Disponíveis p/ negociar</option>
              <option value="free">Jogadores livres</option>
              <option value="loan">Emprestáveis</option>
              <option value="expiring">Contrato acabando (pré-contrato)</option>
              <option value="all">Todos os jogadores</option>
            </select>
            <select className="input" value={pos} onChange={(e) => setPos(e.target.value as Position | 'ALL')}>
              <option value="ALL">Todas as posições</option>
              {ALL_POSITIONS.map((p) => <option key={p} value={p}>{POSITION_LABELS[p]}</option>)}
            </select>
            <select className="input" value={minOv} onChange={(e) => setMinOv(Number(e.target.value))}>
              <option value={0}>Qualquer overall</option>
              <option value={70}>70+</option>
              <option value={75}>75+</option>
              <option value={80}>80+</option>
              <option value={85}>85+</option>
            </select>
            <select className="input" value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))}>
              <option value={99}>Qualquer idade</option>
              <option value={21}>Até 21</option>
              <option value={25}>Até 25</option>
              <option value={30}>Até 30</option>
              <option value={35}>Até 35</option>
            </select>
            <select className="input" value={nationality} onChange={(e) => setNationality(e.target.value)}>
              <option value="ALL">Todas as nacionalidades</option>
              {nationalities.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <select className="input" value={foot} onChange={(e) => setFoot(e.target.value)}>
              <option value="ALL">Qualquer pé</option>
              <option value="D">Destro</option>
              <option value="E">Canhoto</option>
              <option value="Ambidestro">Ambidestro</option>
            </select>
            <select className="input" value={maxValue} onChange={(e) => setMaxValue(Number(e.target.value))}>
              <option value={0}>Qualquer valor</option>
              <option value={5_000_000}>Até 5M</option>
              <option value={15_000_000}>Até 15M</option>
              <option value={40_000_000}>Até 40M</option>
              <option value={80_000_000}>Até 80M</option>
            </select>
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr>
                  <th className="table-th">Jogador</th>
                  <th className="table-th">Clube</th>
                  <th className="table-th text-center">Idade</th>
                  <th className="table-th text-center">Ovr</th>
                  <th className="table-th text-center">Pot</th>
                  <th className="table-th text-right">Valor</th>
                  <th className="table-th text-right">Salário</th>
                  <th className="table-th text-center">Interesse</th>
                  <th className="table-th text-center">Status</th>
                  <th className="table-th"></th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((p) => {
                  const clubOf = p.clubId ? world.clubs[p.clubId] : null;
                  const interest = computeInterest(world, p, career!.clubId);
                  const dot = interestDot(interest.score);
                  const negRaw = negotiationForPlayer(world, p.id);
                  const neg = negRaw && !['rejeitada', 'cancelada', 'expirada', 'concluida'].includes(negRaw.status) ? negRaw : null;
                  // "Expira" (pré-contrato) só aparece quando o contrato realmente termina
                  // dentro do período permitido (≤ 6 meses) e o jogador é elegível
                  const expiring = isEligibleForPreContract(p, world.date);
                  const inqStatus = inquiryForPlayer(world, p.id);
                  const inqTag = inqStatus && inqStatus.status !== 'pendente'
                    ? `${inquiryIcon(inqStatus.status)} ${INQUIRY_LABEL[inqStatus.status]}`
                    : '';
                  const tag = !p.clubId ? 'Livre' : p.transferListed ? 'Listado' : p.loanListed ? 'Empréstimo' : expiring ? 'Expira' : inqTag ? inqTag : p.isLoan ? 'Emprestado' : '';
                  return (
                    <tr key={p.id} className="border-t border-surface-700/40 hover:bg-surface-800/50 cursor-pointer" onClick={() => setView(p)}>
                      <td className="table-td">
                        <div className="flex items-center gap-2.5">
                          <PlayerAvatar player={p} size={32} />
                          <div>
                            <p className="text-slate-200 font-medium">{p.firstName} {p.lastName}</p>
                            <p className="text-[10px] text-slate-500">{p.nationality} · {p.personality}</p>
                          </div>
                        </div>
                      </td>
                      <td className="table-td text-slate-400">{clubOf?.shortName ?? '—'}</td>
                      <td className="table-td text-center text-slate-300">{p.age}</td>
                      <td className="table-td text-center"><OverallBadge player={p} size="sm" /></td>
                      <td className="table-td text-center text-slate-500">{p.potential}</td>
                      <td className="table-td text-right text-gold font-semibold">{fmtMoney(p.value)}</td>
                      <td className="table-td text-right text-slate-400">{fmtMoney(p.contract?.wage ?? 0)}</td>
                      <td className="table-td text-center">
                        <span className={`text-xs ${dot.cls}`} title={interest.level}>{dot.icon} {interest.level}</span>
                      </td>
                      <td className="table-td text-center">
                        {tag ? <span className="badge border border-sky-500/30 bg-sky-500/10 text-sky-400 text-[10px]">{tag}</span> : <span className="text-slate-600 text-xs">—</span>}
                      </td>
                      <td className="table-td text-right">
                        {neg ? (
                          <button onClick={(e) => { e.stopPropagation(); navigate(`negotiation:${p.id}`); }} className="btn-secondary !px-3 !py-1.5 text-xs">
                            {negotiationStatusLabel(neg.status)} →
                          </button>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); setView(p); }} className="btn-secondary !px-3 !py-1.5 text-xs">Analisar</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {candidates.length === 0 && <Empty icon="🔍" title="Nenhum jogador encontrado" subtitle="Ajuste os filtros para ampliar a busca." />}
          </div>
        </>
      )}

      {tab === 'highlights' && (
        <MarketHighlightsPanel />
      )}

      {tab === 'watch' && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <th className="table-th">Jogador</th>
                <th className="table-th text-center">Idade</th>
                <th className="table-th text-center">Ovr</th>
                <th className="table-th text-center">Pot</th>
                <th className="table-th text-right">Valor</th>
                <th className="table-th text-center">Interesse</th>
                <th className="table-th"></th>
              </tr>
            </thead>
            <tbody>
              {shortlist.map((p) => {
                const interest = computeInterest(world, p, career!.clubId);
                const dot = interestDot(interest.score);
                return (
                  <tr key={p.id} className="border-t border-surface-700/40 hover:bg-surface-800/50 cursor-pointer" onClick={() => setView(p)}>
                    <td className="table-td">
                      <div className="flex items-center gap-2.5">
                        <PlayerAvatar player={p} size={32} />
                        <div>
                          <p className="text-slate-200 font-medium">{p.firstName} {p.lastName}</p>
                          <p className="text-[10px] text-slate-500">{p.nationality} · {p.position}</p>
                        </div>
                      </div>
                    </td>
                    <td className="table-td text-center text-slate-300">{p.age}</td>
                    <td className="table-td text-center"><OverallBadge player={p} size="sm" /></td>
                    <td className="table-td text-center text-slate-500">{p.potential}</td>
                    <td className="table-td text-right text-gold font-semibold">{fmtMoney(p.value)}</td>
                    <td className="table-td text-center"><span className={`text-xs ${dot.cls}`}>{dot.icon} {interest.level}</span></td>
                    <td className="table-td text-right"><button onClick={() => setView(p)} className="btn-secondary !px-3 !py-1.5 text-xs">Analisar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shortlist.length === 0 && <Empty icon="⭐" title="Nenhum jogador observado" subtitle="Adicione jogadores à lista de observação pelo perfil no mercado." />}
        </div>
      )}

      {tab === 'neg' && (
        <div className="space-y-3">
          {negs.length === 0 && <Empty icon="🤝" title="Nenhuma negociação em andamento" subtitle="Inicie uma negociação pelo perfil de um jogador no mercado." />}
          {negs.map((n) => {
            const p = world.players[n.playerId];
            if (!p) return null;
            return (
              <div key={n.id} className="card p-4 flex flex-wrap items-center gap-3">
                <PlayerAvatar player={p} size={40} />
                <div className="flex-1 min-w-[200px]">
                  <p className="font-semibold text-slate-100">{p.firstName} {p.lastName}</p>
                  <p className="text-xs text-slate-500">{n.kind === 'free' ? 'Jogador livre' : n.kind === 'pre-contract' ? 'Pré-contrato' : n.kind === 'loan' ? 'Empréstimo' : 'Transferência'}</p>
                </div>
                <div className="text-xs">
                  <span className={`badge border ${n.status === 'concluida' ? 'border-accent/40 bg-accent/10 text-accent' : n.status === 'rejeitada' || n.status === 'cancelada' || n.status === 'expirada' ? 'border-red-500/40 bg-red-500/10 text-red-400' : 'border-gold/40 bg-gold/10 text-gold'}`}>
                    {negotiationStatusLabel(n.status)}
                  </span>
                  {n.deadline && ['proposta-enviada', 'contraproposta', 'interessado', 'acordo-clube', 'negociacao-jogador'].includes(n.status) && (
                    <p className="text-slate-500 mt-1">Prazo: {n.deadline.slice(8, 10)}/{n.deadline.slice(5, 7)}</p>
                  )}
                </div>
                <button onClick={() => navigate(`negotiation:${p.id}`)} className="btn-primary !px-4 !py-2 text-sm">
                  {n.status === 'concluida' ? 'Ver' : 'Continuar negociação'} →
                </button>
              </div>
            );
          })}
          {world.negotiationHistory.length > 0 && (
            <div className="card p-4">
              <h3 className="font-display font-semibold text-slate-200 mb-2">Negociações recentes</h3>
              <div className="divide-y divide-surface-700/40">
                {world.negotiationHistory.slice(0, 12).map((n) => {
                  const p = world.players[n.playerId];
                  return (
                    <div key={n.id} className="py-2 flex items-center gap-2 text-sm">
                      <span className="text-slate-300 font-medium">{p ? `${p.firstName} ${p.lastName}` : '—'}</span>
                      <span className={`text-xs ${n.status === 'concluida' ? 'text-accent' : 'text-red-400'}`}>{negotiationStatusLabel(n.status)}</span>
                      {n.fee > 0 && <span className="text-xs text-gold">{fmtMoney(n.fee)}</span>}
                      <span className="ml-auto text-xs text-slate-500">{n.updatedAt}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'offers' && (
        <IncomingOffersPanel />
      )}

      {tab === 'inquiries' && (
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">🔎 Sondagens enviadas</p>
          {inquiries.length === 0 ? (
            <Empty icon="🔎" title="Nenhuma sondagem" subtitle="Com a janela fechada, você ainda pode sondar jogadores de outros clubes pelo perfil de mercado." />
          ) : (
            <div className="space-y-2">
              {inquiries.map((inq) => {
                const q = world.players[inq.playerId];
                if (!q) return null;
                const seller = world.clubs[inq.sellerClubId];
                const activeNeg = negotiationForPlayer(world, q.id);
                const canNeg = (inq.status === 'aberto' || inq.status === 'so-alta') && !activeNeg;
                return (
                  <div key={inq.id} className="flex items-center gap-3 rounded-lg border border-surface-700 bg-surface-800/40 p-2.5">
                    <button onClick={() => navigate(`player:${q.id}`)} title="Ver jogador">
                      <PlayerAvatar player={q} size={36} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate">{q.firstName} {q.lastName} <span className="text-slate-500 font-normal">· {seller?.shortName ?? '—'}</span></p>
                      <p className="text-[11px] text-slate-400">
                        {inquiryIcon(inq.status)} {INQUIRY_LABEL[inq.status]}
                        {inq.note ? ` — ${inq.note}` : ''}
                      </p>
                      {inq.status !== 'pendente' && inq.suggestedFee > 0 && (
                        <p className="text-[10px] text-gold">Referência: €{fmtMoney(inq.suggestedFee)}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500">{formatDateBR(inq.date)}</span>
                    {inq.status === 'pendente' ? (
                      <span className="text-[10px] text-slate-500">⏳ aguardando resposta</span>
                    ) : canNeg ? (
                      <button
                        onClick={() => { const n = startNegotiation(world, career!, q.id, 'transfer'); navigate(`negotiation:${q.id}`); void n; }}
                        className="btn-primary !px-3 !py-1.5 text-xs"
                      >
                        🤝 Negociar
                      </button>
                    ) : activeNeg ? (
                      <button onClick={() => navigate(`negotiation:${q.id}`)} className="btn-secondary !px-3 !py-1.5 text-xs">Continuar →</button>
                    ) : (
                      <button onClick={() => openPlayerConversation(q.id)} className="btn-ghost !px-3 !py-1.5 text-xs">💬 Conversar</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'sell' && (
        <SellTab />
      )}

      {tab === 'log' && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr>
                <th className="table-th">Data</th>
                <th className="table-th">Jogador</th>
                <th className="table-th">De</th>
                <th className="table-th">Para</th>
                <th className="table-th text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {world.transfers.slice(0, 40).map((t) => (
                <tr key={t.id} className="border-t border-surface-700/40">
                  <td className="table-td text-slate-500">{t.date.slice(8, 10)}/{t.date.slice(5, 7)}</td>
                  <td className="table-td text-slate-200">{t.playerName}</td>
                  <td className="table-td text-slate-400">{t.fromClubName}</td>
                  <td className="table-td text-slate-400">{t.toClubName}</td>
                  <td className="table-td text-right text-gold">{t.type === 'loan' ? 'empréstimo' : fmtMoney(t.fee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view && <PlayerMarketModal player={view} onClose={() => setView(null)} />}
    </div>
  );
}

function SellTab() {
  const { career, sellPlayer, freePlayer } = useGame();
  const world = career!.world;
  const mySquad = squadOf(world, career!.clubId);
  const [confirmSell, setConfirmSell] = useState<string | null>(null);
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[760px]">
        <thead>
          <tr>
            <th className="table-th">Jogador</th>
            <th className="table-th text-center">Idade</th>
            <th className="table-th text-center">Ovr</th>
            <th className="table-th text-center">Pot</th>
            <th className="table-th text-right">Valor</th>
            <th className="table-th text-right">Preço estimado</th>
            <th className="table-th text-center">Contrato</th>
            <th className="table-th"></th>
          </tr>
        </thead>
        <tbody>
          {mySquad.map((p) => {
            const price = sellingPrice(world, p, world.clubs[career!.clubId]);
            return (
              <tr key={p.id} className="border-t border-surface-700/40 hover:bg-surface-800/50">
                <td className="table-td">
                  <div className="flex items-center gap-2.5">
                    <PlayerAvatar player={p} size={32} />
                    <div>
                      <p className="text-slate-200 font-medium">{p.firstName} {p.lastName}</p>
                      <PositionBadge pos={p.position} />
                    </div>
                  </div>
                </td>
                <td className="table-td text-center text-slate-300">{p.age}</td>
                <td className="table-td text-center"><OverallBadge player={p} size="sm" /></td>
                <td className="table-td text-center text-slate-500">{p.potential}</td>
                <td className="table-td text-right text-slate-400">{fmtMoney(p.value)}</td>
                <td className="table-td text-right text-gold font-semibold">{fmtMoney(price)}</td>
                <td className="table-td text-center text-xs text-slate-500">{p.contract ? p.contract.until.slice(0, 4) : 'livre'}</td>
                <td className="table-td text-right">
                  <div className="flex gap-1.5 justify-end">
                    <button onClick={() => setConfirmSell(p.id)} className="btn-secondary !px-3 !py-1.5 text-xs">Vender</button>
                    {!p.isLoan && <button onClick={() => freePlayer(p.id)} className="btn-ghost !px-3 !py-1.5 text-xs">Liberar</button>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Modal open={!!confirmSell} onClose={() => setConfirmSell(null)} title="Confirmar venda">
        {confirmSell && (() => {
          const p = world.players[confirmSell];
          const price = sellingPrice(world, p, world.clubs[career!.clubId]);
          const buyers = Object.values(world.clubs).filter((c) => !c.isUserControlled && c.balance > price * 1.2).sort((a, b) => b.balance - a.balance);
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <PlayerAvatar player={p} size={44} />
                <div>
                  <p className="font-semibold text-slate-100">{p.firstName} {p.lastName}</p>
                  <p className="text-sm text-slate-400">Overall {overallOf(p)} · Valor {fmtMoney(p.value)}</p>
                </div>
              </div>
              {buyers.length === 0 ? (
                <p className="text-sm text-red-400">Nenhum clube interessado no momento com orçamento para essa venda.</p>
              ) : (
                <p className="text-sm text-slate-400">Venda estimada: <span className="text-gold font-semibold">{fmtMoney(price)}</span> para {buyers[0].name}.</p>
              )}
              <div className="flex gap-2">
                <button disabled={buyers.length === 0} onClick={() => { sellPlayer(p.id, Math.round(price * 0.95)); setConfirmSell(null); }} className="btn-primary flex-1 disabled:opacity-40">Confirmar venda</button>
                <button onClick={() => setConfirmSell(null)} className="btn-ghost">Cancelar</button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------
// Propostas recebidas: clubes da IA querem jogadores do nosso elenco
// ------------------------------------------------------------
function IncomingOffersPanel() {
  const { career, sendNegotiationAction } = useGame();
  const world = career!.world;
  const [sel, setSel] = useState<IncomingOffer | null>(null);
  const [profile, setProfile] = useState<Player | null>(null);
  const [counterFee, setCounterFee] = useState('');

  const offers = [...world.incomingOffers].sort((a, b) => {
    const pa = a.status === 'pending' ? 0 : 1;
    const pb = b.status === 'pending' ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return b.createdAt < a.createdAt ? -1 : 1;
  });

  const openOffer = (o: IncomingOffer) => {
    setSel(o);
    setCounterFee(String(Math.round(o.fee * 1.1)));
  };

  const badge = (o: IncomingOffer) => {
    if (o.status === 'pending') return <span className="badge border border-accent/40 bg-accent/10 text-accent">Pendente</span>;
    if (o.status === 'accepted') return <span className="badge border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">Aceita</span>;
    if (o.status === 'rejected') return <span className="badge border border-red-500/40 bg-red-500/10 text-red-400">Recusada</span>;
    return <span className="badge border border-slate-500/40 bg-slate-500/10 text-slate-400">Expirada</span>;
  };

  return (
    <div className="space-y-3">
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr>
              <th className="table-th">Jogador</th>
              <th className="table-th">Clube interessado</th>
              <th className="table-th text-right">Proposta</th>
              <th className="table-th text-right">Bônus</th>
              <th className="table-th text-center">Futura venda</th>
              <th className="table-th text-center">Prazo</th>
              <th className="table-th text-center">Status</th>
              <th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => {
              const p = world.players[o.playerId];
              if (!p) return null;
              const club = world.clubs[o.clubId];
              const daysLeft = Math.max(0, daysBetween(world.date, o.expiresAt));
              return (
                <tr key={o.id} className="border-t border-surface-700/40 hover:bg-surface-800/50">
                  <td className="table-td">
                    <button onClick={() => setProfile(p)} title="Ver perfil completo" className="flex items-center gap-2.5 text-left group w-full">
                      <PlayerAvatar player={p} size={32} />
                      <div>
                        <p className="text-slate-200 font-medium group-hover:text-accent">{p.firstName} {p.lastName} <span className="text-[10px] text-accent/70">👁</span></p>
                        <PositionBadge pos={p.position} />
                      </div>
                    </button>
                  </td>
                  <td className="table-td">
                    <div>
                      <p className="text-slate-200 font-medium">{club?.name ?? '—'}</p>
                      <p className="text-[10px] text-slate-500">{club?.tier ?? ''}</p>
                    </div>
                  </td>
                  <td className="table-td text-right text-gold font-semibold">{fmtMoney(o.fee)}</td>
                  <td className="table-td text-right text-slate-400">{o.bonus > 0 ? fmtMoney(o.bonus) : '—'}</td>
                  <td className="table-td text-center text-slate-400">{o.sellOnPct > 0 ? `${o.sellOnPct}%` : '—'}</td>
                  <td className="table-td text-center text-xs text-slate-400">{o.status === 'pending' ? `${daysLeft}d` : '—'}</td>
                  <td className="table-td text-center">{badge(o)}</td>
                  <td className="table-td text-right">
                    <div className="flex gap-1.5 justify-end">
                      <button onClick={() => openPlayerConversation(o.playerId)} title="Conversar com o jogador sobre a proposta" className="btn-ghost !px-2.5 !py-1.5 text-xs">💬 Conversar</button>
                      <button onClick={() => setProfile(p)} title="Ver overall, estatísticas e histórico" className="btn-ghost !px-2.5 !py-1.5 text-xs">👁 Perfil</button>
                      <button onClick={() => openOffer(o)} className="btn-secondary !px-3 !py-1.5 text-xs">Analisar</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {offers.length === 0 && <Empty icon="📩" title="Nenhuma proposta recebida" subtitle="Clubes da IA fazem ofertas por jogadores do seu elenco durante a janela de transferências." />}
      </div>

      <Modal open={!!sel} onClose={() => setSel(null)} title="Proposta recebida">
        {sel && (() => {
          const o = sel;
          const p = world.players[o.playerId];
          const club = world.clubs[o.clubId];
          if (!p || !club) return null;
          const daysLeft = Math.max(0, daysBetween(world.date, o.expiresAt));
          const pending = o.status === 'pending';
          const competing = world.incomingOffers.filter((x) => x.playerId === p.id && x.status === 'pending');
          const war = pending && competing.some((x) => x.sellerWar);
          const best = war ? [...competing].sort((a, b) => b.fee - a.fee)[0] : null;
          const report = o.saleReport;
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-surface-700 bg-surface-800/50 p-3">
                <PlayerAvatar player={p} size={44} />
                <div className="flex-1">
                  <p className="font-semibold text-slate-100">{p.firstName} {p.lastName}</p>
                  <p className="text-sm text-slate-400">
                    <PositionBadge pos={p.position} /> Overall {overallOf(p)} · {p.age} anos · Valor {fmtMoney(p.value)}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <button onClick={() => openPlayerConversation(p.id)} className="btn-ghost !px-2.5 !py-1 text-[11px]">💬 Conversar com o jogador</button>
                    <button onClick={() => setProfile(p)} className="btn-ghost !px-2.5 !py-1 text-[11px]">👁 Ver perfil completo (stats, histórico, forma)</button>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gold">{fmtMoney(o.fee)}</p>
                  <p className="text-[10px] text-slate-500">{club.name}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-2">
                  <p className="text-slate-500">Valor da proposta</p>
                  <p className="text-gold font-bold">{fmtMoney(o.fee)}</p>
                </div>
                <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-2">
                  <p className="text-slate-500">Bônus</p>
                  <p className="text-slate-200 font-semibold">{o.bonus > 0 ? fmtMoney(o.bonus) : '—'}</p>
                </div>
                <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-2">
                  <p className="text-slate-500">% futura venda (para nós)</p>
                  <p className="text-slate-200 font-semibold">{o.sellOnPct > 0 ? `${o.sellOnPct}%` : '—'}</p>
                </div>
                <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-2">
                  <p className="text-slate-500">Pagamento</p>
                  <p className="text-slate-200 font-semibold">{o.installments > 1 ? `${o.installments} parcelas` : 'À vista'}</p>
                </div>
              </div>

              {o.playerWantsOut && pending && (
                <p className="text-xs text-gold border border-gold/30 bg-gold/5 rounded-lg px-3 py-2">
                  ⚠️ {p.firstName} pediu para sair — recusar propostas pode deixá-lo insatisfeito.
                </p>
              )}
              {pending && (
                <p className="text-xs text-slate-500">
                  Prazo para resposta: <b className="text-slate-300">{daysLeft} dia{daysLeft === 1 ? '' : 's'}</b>
                </p>
              )}

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {o.messages.map((m) => {
                  const colors: Record<string, string> = {
                    club: 'bg-surface-800 border-surface-600 text-slate-200',
                    officer: 'bg-sky-500/10 border-sky-500/30 text-sky-200',
                    system: 'bg-surface-800/60 border-surface-700 text-slate-400 italic',
                  };
                  return (
                    <div key={m.id} className="flex justify-start">
                      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm border ${colors[m.from] ?? 'bg-surface-800 border-surface-600 text-slate-200'}`}>
                        {m.actor && <p className={`text-[10px] font-bold mb-0.5 ${m.from === 'officer' ? 'text-sky-400' : 'text-slate-500'}`}>{m.actor}</p>}
                        <p>{m.text}</p>
                        {m.mood && <p className="text-[10px] mt-1 opacity-80">{m.mood}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {pending ? (
                war && best ? (
                  <div className="space-y-3 border-t border-gold/40 pt-3">
                    <div className="rounded-xl border border-gold/40 bg-gold/5 p-3">
                      <p className="font-display font-bold text-gold text-sm">⚔️ Guerra de propostas ao vender</p>
                      <p className="text-xs text-slate-300 mt-1">{competing.length} clubes disputam {p.firstName} — a melhor oferta pode subir a cada dia.</p>
                      <div className="mt-2 space-y-1.5">
                        {[...competing].sort((a, b) => b.fee - a.fee).map((x, i) => (
                          <div key={x.id} className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${x.id === best.id ? 'bg-gold/10 border border-gold/30 text-gold font-semibold' : 'bg-surface-800/70 border border-surface-700 text-slate-300'}`}>
                            <span>{i === 0 ? '👑 ' : ''}{world.clubs[x.clubId]?.shortName ?? '—'}{x.sellOnPct > 0 ? ` (+${x.sellOnPct}% futura venda)` : ''}</span>
                            <span className="font-bold">{fmtMoney(x.fee)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => sendNegotiationAction(best.id, { type: 'incoming-offer', offerId: best.id, action: 'accept' })} className="btn-primary flex-1">✅ Aceitar melhor oferta ({fmtMoney(best.fee)})</button>
                      <button onClick={() => setSel(null)} className="btn-ghost">Esperar evoluir</button>
                    </div>
                    <div className="flex gap-2">
                      <input className="input flex-1" type="number" value={counterFee} onChange={(e) => setCounterFee(e.target.value)} placeholder="Pedir valor…" />
                      <button
                        disabled={!Number(counterFee) || Number(counterFee) <= 0}
                        onClick={() => sendNegotiationAction(o.id, { type: 'incoming-offer', offerId: o.id, action: 'counter', fee: Number(counterFee) })}
                        className="btn-secondary disabled:opacity-40"
                      >Contrapor</button>
                    </div>
                    <p className="text-[10px] text-slate-500">O responsável avisa sempre que outro clube melhorar a oferta.</p>
                  </div>
                ) : (
                  <div className="space-y-3 border-t border-surface-700/60 pt-3">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => sendNegotiationAction(o.id, { type: 'incoming-offer', offerId: o.id, action: 'accept' })} className="btn-primary flex-1">✅ Aceitar {fmtMoney(o.fee)}</button>
                      <button onClick={() => sendNegotiationAction(o.id, { type: 'incoming-offer', offerId: o.id, action: 'reject' })} className="btn-ghost">Recusar</button>
                    </div>
                    <div className="flex gap-2">
                      <input className="input flex-1" type="number" value={counterFee} onChange={(e) => setCounterFee(e.target.value)} placeholder="Pedir valor…" />
                      <button
                        disabled={!Number(counterFee) || Number(counterFee) <= 0}
                        onClick={() => sendNegotiationAction(o.id, { type: 'incoming-offer', offerId: o.id, action: 'counter', fee: Number(counterFee) })}
                        className="btn-secondary disabled:opacity-40"
                      >Contrapor</button>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <button onClick={() => setCounterFee(String(Math.round(o.fee * 1.05)))} className="badge border border-surface-600 bg-surface-800 text-slate-300 cursor-pointer hover:text-slate-100">+5% ({fmtMoney(Math.round(o.fee * 1.05))})</button>
                      <button onClick={() => setCounterFee(String(Math.round(o.fee * 1.15)))} className="badge border border-surface-600 bg-surface-800 text-slate-300 cursor-pointer hover:text-slate-100">+15% ({fmtMoney(Math.round(o.fee * 1.15))})</button>
                    </div>
                  </div>
                )
              ) : o.status === 'accepted' ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                    🎉 Venda concluída! {p.firstName} {p.lastName} agora joga no {club.name}.{o.sellOnPct > 0 ? ` Vocês mantêm ${o.sellOnPct}% da futura venda.` : ''}
                  </div>
                  {report && (
                    <div className="rounded-xl border border-surface-700 bg-surface-800/60 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="font-display font-bold text-slate-100">📋 Avaliação da venda</p>
                        <p className={`text-lg font-bold ${report.grade >= 8 ? 'text-emerald-400' : report.grade >= 6 ? 'text-gold' : 'text-red-400'}`}>{report.grade.toFixed(1)}/10</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg bg-surface-800/70 p-2">
                          <p className="text-slate-500">Valor recebido</p>
                          <p className="text-gold font-bold">{fmtMoney(report.fee)}</p>
                        </div>
                        <div className="rounded-lg bg-surface-800/70 p-2">
                          <p className="text-slate-500">Valor de mercado</p>
                          <p className="text-slate-200 font-semibold">{fmtMoney(report.marketValue)}</p>
                        </div>
                        <div className="rounded-lg bg-surface-800/70 p-2">
                          <p className="text-slate-500">Folha economizada</p>
                          <p className="text-slate-200 font-semibold">{fmtMoney(report.wageSaved)}/mês</p>
                        </div>
                        <div className="rounded-lg bg-surface-800/70 p-2">
                          <p className="text-slate-500">Quem assume a vaga</p>
                          <p className="text-slate-200 font-semibold">{report.nextUp[0] ?? 'Ninguém'}</p>
                        </div>
                      </div>
                      <div className="text-xs">
                        <p className="text-slate-300">{report.fans.icon} <b>Torcida:</b> {report.fans.text}</p>
                        <p className="text-slate-300 mt-1">{report.dressingRoom.icon} <b>Vestiário:</b> {report.dressingRoom.text}</p>
                      </div>
                      <ul className="space-y-0.5 text-xs text-slate-400">
                        {report.reasons.map((r, i) => <li key={i}>• {r}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
                  {o.rejectedReason ?? (o.status === 'expired' ? 'A proposta expirou.' : 'Proposta encerrada.')}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      {profile && <PlayerMarketModal player={profile} onClose={() => setProfile(null)} readOnly />}
    </div>
  );
}

// ------------------------------------------------------------
// Destaques do mercado: maiores negócios e guerras da janela
// ------------------------------------------------------------
function MarketHighlightsPanel() {
  const { career } = useGame();
  const world = career!.world;
  const myId = career!.clubId;
  const [saleMonth, setSaleMonth] = useState('ALL');

  const sales = world.incomingOffers.filter((o) => o.status === 'accepted' && o.saleReport && o.soldAt && isInTransferWindow(world, o.soldAt));
  const saleMonths = [...new Set(sales.map((o) => o.soldAt!.slice(0, 7)))].sort().reverse();
  const filteredSales = saleMonth === 'ALL' ? sales : sales.filter((o) => o.soldAt!.startsWith(saleMonth));
  const bestSales = [...filteredSales].sort((a, b) => (b.saleReport!.grade) - (a.saleReport!.grade)).slice(0, 3);
  const worstSales = [...filteredSales].sort((a, b) => (a.saleReport!.grade) - (b.saleReport!.grade)).slice(0, 3);

  const saleRow = (o: typeof sales[number]) => {
    const r = o.saleReport!;
    const p = world.players[o.playerId];
    const buyer = world.clubs[o.clubId];
    const diff = Math.round((r.fee / Math.max(1, r.marketValue) - 1) * 100);
    const comp = diff >= 10 ? { label: 'Acima do mercado', cls: 'text-emerald-400' } : diff <= -10 ? { label: 'Abaixo do mercado', cls: 'text-red-400' } : { label: 'Na faixa de mercado', cls: 'text-slate-300' };
    return (
      <div key={o.id} className="flex items-center gap-2.5 rounded-lg border border-surface-700/60 bg-surface-800/50 px-3 py-2 text-sm">
        {p ? <PlayerAvatar player={p} size={32} /> : <div className="w-8 h-8 rounded-full bg-surface-700" />}
        <div className="flex-1 min-w-0">
          <p className="text-slate-200 font-medium truncate">{p?.firstName} {p?.lastName} → {buyer?.shortName ?? '—'}</p>
          <p className={`text-[10px] ${comp.cls}`}>{comp.label} ({diff >= 0 ? '+' : ''}{diff}%) · {fmtMoney(r.fee)} vs {fmtMoney(r.marketValue)}</p>
        </div>
        <p className={`text-base font-bold ${r.grade >= 8 ? 'text-emerald-400' : r.grade >= 6 ? 'text-gold' : 'text-red-400'}`}>{r.grade.toFixed(1)}</p>
      </div>
    );
  };

  const allDeals = world.transfers.filter((t) => t.type === 'transfer' && isInTransferWindow(world, t.date));
  const windowDeals = [...allDeals].sort((a, b) => b.fee - a.fee).slice(0, 8);
  const myDeals = allDeals.filter((t) => t.fromClubId === myId || t.toClubId === myId);
  const biggestSale = myDeals.filter((t) => t.fromClubId === myId).sort((a, b) => b.fee - a.fee)[0];
  const biggestBuy = myDeals.filter((t) => t.toClubId === myId).sort((a, b) => b.fee - a.fee)[0];

  const rankBy = (side: 'buyer' | 'seller') => {
    const map = new Map<string, number>();
    for (const t of allDeals) {
      const id = side === 'buyer' ? t.toClubId : t.fromClubId;
      if (!id) continue;
      map.set(id, (map.get(id) ?? 0) + t.fee);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  };
  const topBuyers = rankBy('buyer');
  const topSellers = rankBy('seller');

  const wars = world.marketHighlights.filter((h) => h.kind === 'bid-war').slice(0, 8);
  const warWins = world.marketHighlights.filter((h) => h.kind === 'bid-war' && h.title.includes('venceu')).length;
  const myMoves = world.marketHighlights.filter((h) => h.kind === 'user-sale' || h.kind === 'user-buy').slice(0, 8);

  const stat = (icon: string, label: string, value: string, sub: string) => (
    <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{icon} {label}</p>
      <p className="text-lg font-display font-bold text-gold mt-0.5">{value}</p>
      <p className="text-xs text-slate-400 truncate">{sub}</p>
    </div>
  );

  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stat('💰', 'Maior negócio da janela', windowDeals[0] ? fmtMoney(windowDeals[0].fee) : '—', windowDeals[0] ? `${windowDeals[0].playerName} (${windowDeals[0].fromClubName} → ${windowDeals[0].toClubName})` : 'Nenhum ainda')}
        {stat('📤', 'Maior venda sua', biggestSale ? fmtMoney(biggestSale.fee) : '—', biggestSale ? `${biggestSale.playerName} → ${biggestSale.toClubName}` : 'Nenhuma ainda')}
        {stat('📥', 'Maior compra sua', biggestBuy ? fmtMoney(biggestBuy.fee) : '—', biggestBuy ? `${biggestBuy.playerName} de ${biggestBuy.fromClubName}` : 'Nenhuma ainda')}
        {stat('⚔️', 'Guerras de propostas', `${warWins}/${world.marketHighlights.filter((h) => h.kind === 'bid-war').length}`, `${warWins} vencidas na janela`)}
      </div>

      <div className="card overflow-x-auto">
        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          <p className="font-display font-bold text-slate-100">🔥 Maiores negócios da janela</p>
        </div>
        <table className="w-full min-w-[680px]">
          <thead>
            <tr>
              <th className="table-th"></th>
              <th className="table-th">Jogador</th>
              <th className="table-th">Origem → Destino</th>
              <th className="table-th text-right">Valor</th>
              <th className="table-th text-center">Data</th>
            </tr>
          </thead>
          <tbody>
            {windowDeals.map((t, i) => {
              const mine = t.fromClubId === myId || t.toClubId === myId;
              const p = world.players[t.playerId];
              return (
                <tr key={t.id} className="border-t border-surface-700/40 hover:bg-surface-800/50">
                  <td className="table-td w-10 text-center"><span className="text-base">{medal(i)}</span></td>
                  <td className="table-td">
                    <div className="flex items-center gap-2.5">
                      {p ? <PlayerAvatar player={p} size={30} /> : <div className="w-[30px] h-[30px] rounded-full bg-surface-700" />}
                      <div>
                        <p className="text-slate-200 font-medium">{t.playerName}</p>
                        {mine && <span className="badge border border-accent/40 bg-accent/10 text-accent text-[10px]">Seu clube</span>}
                      </div>
                    </div>
                  </td>
                  <td className="table-td text-slate-400">{t.fromClubName} → <b className="text-slate-200">{t.toClubName}</b></td>
                  <td className="table-td text-right text-gold font-bold">{fmtMoney(t.fee)}</td>
                  <td className="table-td text-center text-xs text-slate-500">{t.date.slice(8, 10)}/{t.date.slice(5, 7)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {windowDeals.length === 0 && <Empty icon="📊" title="Janela sem grandes negócios ainda" subtitle="Os maiores movimentos de clubes e do seu elenco aparecem aqui durante a janela." />}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card">
          <p className="font-display font-bold text-slate-100 px-4 pt-3 pb-1">⚔️ Guerras de propostas</p>
          {wars.length > 0 ? (
            <div className="space-y-2 p-3">
              {wars.map((h) => (
                <div key={h.id} className="rounded-lg border border-gold/30 bg-gold/5 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-100">{h.title}</p>
                    <p className="text-xs text-gold font-bold whitespace-nowrap">{fmtMoney(h.fee)}</p>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{h.detail}</p>
                  <p className="text-[10px] text-slate-600 mt-1">{h.date.slice(8, 10)}/{h.date.slice(5, 7)}/{h.date.slice(0, 4)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4"><Empty icon="⚔️" title="Nenhuma guerra ainda" subtitle="Quando outro clube cobrir sua oferta, o embate aparece aqui." /></div>
          )}
        </div>

        <div className="card">
          <p className="font-display font-bold text-slate-100 px-4 pt-3 pb-1">💼 Seus movimentos na janela</p>
          {myMoves.length > 0 ? (
            <div className="space-y-2 p-3">
              {myMoves.map((h) => (
                <div key={h.id} className="rounded-lg border border-surface-700 bg-surface-800/50 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-100">{h.title}</p>
                    <p className="text-xs text-gold font-bold whitespace-nowrap">{fmtMoney(h.fee)}</p>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{h.detail}</p>
                  <p className="text-[10px] text-slate-600 mt-1">{h.date.slice(8, 10)}/{h.date.slice(5, 7)}/{h.date.slice(0, 4)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4"><Empty icon="💼" title="Nenhum movimento grande seu ainda" subtitle="Vendas ou contratações de €8M+ aparecem aqui com detalhes." /></div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-3 px-4 pt-3 pb-1">
          <p className="font-display font-bold text-slate-100 flex-1">📊 Vendas avaliadas na janela</p>
          <select className="input !w-44 !py-1 text-xs" value={saleMonth} onChange={(e) => setSaleMonth(e.target.value)}>
            <option value="ALL">Todos os meses</option>
            {saleMonths.map((m) => <option key={m} value={m}>{m.slice(5, 7)}/{m.slice(0, 4)}</option>)}
          </select>
        </div>
        {filteredSales.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-4 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2">Melhores negócios</p>
              <div className="space-y-2">{bestSales.map(saleRow)}</div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-2">Piores negócios</p>
              <div className="space-y-2">{worstSales.map(saleRow)}</div>
            </div>
          </div>
        ) : (
          <div className="p-4"><Empty icon="📊" title="Nenhuma venda avaliada neste período" subtitle="Vendas concluídas com relatório (nota 0–10, valor vs. mercado) aparecem aqui." /></div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {[{ title: '🛒 Clubes que mais gastaram', rows: topBuyers, side: 'buyer' }, { title: '💰 Clubes que mais venderam', rows: topSellers, side: 'seller' }].map((sec) => (
          <div key={sec.title} className="card">
            <p className="font-display font-bold text-slate-100 px-4 pt-3 pb-1">{sec.title}</p>
            {sec.rows.length > 0 ? (
              <div className="space-y-1.5 p-3">
                {sec.rows.map(([cid, total], i) => {
                  const c = world.clubs[cid];
                  const mine = cid === myId;
                  return (
                    <div key={cid} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${mine ? 'border border-accent/40 bg-accent/10' : 'bg-surface-800/50 border border-surface-700/60'}`}>
                      <span className="w-6 text-center font-bold text-slate-500">{i + 1}º</span>
                      <span className="w-8 h-8 rounded-full bg-surface-700 flex items-center justify-center text-xs font-bold text-slate-300">{c?.shortName?.slice(0, 2) ?? '—'}</span>
                      <div className="flex-1">
                        <p className={`font-medium ${mine ? 'text-accent' : 'text-slate-200'}`}>{c?.name ?? '—'} {mine && <span className="badge border border-accent/40 bg-accent/15 text-accent text-[10px]">Você</span>}</p>
                        <p className="text-[10px] text-slate-500">{c?.tier ?? ''} · {c?.countryId ?? ''}</p>
                      </div>
                      <p className="font-bold text-gold">{fmtMoney(total)}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4"><Empty icon="📊" title="Sem movimentações ainda" subtitle="O ranking da janela aparece conforme os negócios acontecem." /></div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

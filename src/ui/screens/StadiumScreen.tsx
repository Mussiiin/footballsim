import { useState } from 'react';
import { useGame } from '../../state/store';
import { Tabs } from '../components';
import {
  SECTOR_IDS, SECTOR_LABELS, SECTOR_ICONS, fairPrice, weightedAvgPrice, comfortAvg,
  stadiumValueOf, effectiveCapacity, worksExtraCost, stadiumDemand, stadiumMatchDay,
  recommendedSectorPrices, applyPriceChange, startStadiumWork, bookStadiumEvent,
  acceptNaming, negotiateNaming, satisfactionLabel, reputationStars, nextHomeMatchPreview,
} from '../../game/stadium';
import { Club, StadiumSectorId } from '../../lib/types';
import { fmtMoney, fmtInt, fmtMoneyFull } from '../../lib/format';
import { addDays } from '../../lib/date';
import { RNG, hashString } from '../../lib/rng';

const TABS = [
  { id: 'overview', label: '🏟️ Visão geral' },
  { id: 'tickets', label: '🎟️ Ingressos' },
  { id: 'capacity', label: '💺 Capacidade' },
  { id: 'experience', label: '🍔 Experiência' },
  { id: 'structure', label: '🚗 Estrutura' },
  { id: 'finance', label: '💰 Finanças' },
  { id: 'events', label: '🎤 Eventos' },
  { id: 'contracts', label: '📜 Contratos' },
  { id: 'stats', label: '📊 Estatísticas' },
];

export function StadiumScreen() {
  const { career, mutate } = useGame();
  const [tab, setTab] = useState('overview');
  const [msg, setMsg] = useState<string | null>(null);
  if (!career) return null;
  const world = career.world;
  const club = world.clubs[career.clubId];
  const st = club.stadium;

  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 4000); };

  const changePrice = (sectorId: StadiumSectorId, newPrice: number) => {
    mutate((c) => {
      const cl = c.world.clubs[c.clubId];
      const oldAvg = weightedAvgPrice(cl.stadium);
      cl.stadium.sectors[sectorId].price = Math.max(2, Math.round(newPrice));
      applyPriceChange(c.world, cl, c.world.date, oldAvg, c);
    });
  };

  const applyRecommended = () => {
    mutate((c) => {
      const cl = c.world.clubs[c.clubId];
      const prev = nextHomeMatchPreview(c.world, cl);
      const demand = prev.md ? prev.md.demand : 0.7;
      const rec = recommendedSectorPrices(cl, demand);
      const oldAvg = weightedAvgPrice(cl.stadium);
      for (const id of SECTOR_IDS) cl.stadium.sectors[id].price = rec[id];
      applyPriceChange(c.world, cl, c.world.date, oldAvg, c);
    });
    say('Preços ajustados pela demanda da próxima partida.');
  };

  const toggleDynamic = () => {
    mutate((c) => { c.world.clubs[c.clubId].stadium.dynamicPricing = !c.world.clubs[c.clubId].stadium.dynamicPricing; });
  };

  const startWork = (work: Parameters<typeof startStadiumWork>[1]) => {
    mutate((c) => {
      const cl = c.world.clubs[c.clubId];
      const w = startStadiumWork(cl, work);
      if (!w) say('Saldo insuficiente para iniciar a obra.');
    });
  };

  const bookShow = () => {
    mutate((c) => {
      const cl = c.world.clubs[c.clubId];
      const w = c.world;
      // próxima data livre (sem partida em casa) a partir de 3 dias
      let d = addDays(w.date, 3);
      for (let i = 0; i < 60; i++) {
        const hasMatch = Object.values(w.leagueMatches).some((list) => list.some((m) => m.date === d && m.homeId === cl.id && !m.played));
        if (!hasMatch) break;
        d = addDays(d, 1);
      }
      const rng = new RNG(hashString(`ev-${d}`));
      const revenue = Math.round(cl.stadium.capacity * rng.float(38, 55));
      bookStadiumEvent(w, cl, { title: 'Show internacional', kind: 'show', date: d, revenue });
    });
    say('Evento agendado! A receita entra no dia do evento.');
  };

  const acceptName = () => {
    mutate((c) => acceptNaming(c.world, c.world.clubs[c.clubId]));
    say('Naming rights vendidos! Receita anual a partir da próxima temporada.');
  };
  const refuseName = () => {
    mutate((c) => { c.world.clubs[c.clubId].stadium.namingProposal = null; });
  };
  const negotiateName = () => {
    mutate((c) => negotiateNaming(c.world, c.world.clubs[c.clubId]));
  };

  return (
    <div className="space-y-4 animate-fadeUp">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display font-bold text-2xl text-slate-100">🏟️ Estádio</h1>
        <span className="badge border border-surface-600 bg-surface-800 text-slate-300">Temporada {world.season}</span>
        {msg && <span className="text-xs text-accent animate-fadeIn">{msg}</span>}
      </div>

      {/* cabeçalho */}
      <div className="card p-5 pitch-bg relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 text-[100px] leading-none flex items-center justify-center select-none">🏟️</div>
        <div className="relative grid grid-cols-2 md:grid-cols-4 gap-4">
          <HeaderStat label="Estádio" value={st.name} sub={`${club.city} · fundado ${club.founded}`} />
          <HeaderStat label="Capacidade" value={fmtInt(st.capacity)} sub={`efetiva ${fmtInt(effectiveCapacity(st))} durante obras`} />
          <HeaderStat label="Público médio" value={fmtInt(st.avgAttendance)} sub={`ocupação ${Math.round((st.avgAttendance / Math.max(1, effectiveCapacity(st))) * 100)}%`} />
          <HeaderStat label="Valor estimado" value={fmtMoneyFull(stadiumValueOf(st))} sub={`rep. ${reputationStars(st.reputation)} (${Math.round(st.reputation)}/100)`} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
      </div>

      {tab === 'overview' && <Overview club={club} />}
      {tab === 'tickets' && <Tickets club={club} changePrice={changePrice} applyRecommended={applyRecommended} toggleDynamic={toggleDynamic} />}
      {tab === 'capacity' && <Capacity club={club} startWork={startWork} />}
      {tab === 'experience' && <Experience club={club} startWork={startWork} />}
      {tab === 'structure' && <Structure club={club} startWork={startWork} />}
      {tab === 'finance' && <Finance club={club} />}
      {tab === 'events' && <Events club={club} bookShow={bookShow} />}
      {tab === 'contracts' && <Contracts club={club} acceptName={acceptName} refuseName={refuseName} negotiateName={negotiateName} />}
      {tab === 'stats' && <Stats club={club} />}
    </div>
  );
}

function HeaderStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="font-display font-bold text-lg text-slate-100 mt-0.5 truncate">{value}</p>
      {sub && <p className="text-[11px] text-slate-500 truncate">{sub}</p>}
    </div>
  );
}

function Bar({ value, color = 'bg-accent', label }: { value: number; color?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-surface-700/60 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${v}%` }} />
      </div>
      <span className="w-12 text-right text-xs font-mono text-slate-300">{Math.round(v)}%</span>
    </div>
  );
}

function Overview({ club }: { club: Club }) {
  const { career } = useGame();
  const world = career!.world;
  const st = club.stadium;
  const preview = nextHomeMatchPreview(world, club);
  const c = comfortAvg(st);
  const avgPrice = weightedAvgPrice(st);
  const works = st.works.length > 0;
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="card p-5 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Torcida</p>
        <div>
          <p className="text-xs text-slate-400 mb-1">❤️ Satisfação — {satisfactionLabel(st.satisfaction)}</p>
          <Bar value={st.satisfaction} color="bg-rose-400" />
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">🔥 Atmosfera</p>
          <Bar value={st.atmosphere} color="bg-orange-400" />
        </div>
        {st.protest > 20 && (
          <div>
            <p className="text-xs text-slate-400 mb-1">📢 Descontentamento com preços</p>
            <Bar value={st.protest} color="bg-red-500" />
            {st.protest >= 55 && <p className="text-[11px] text-red-400 mt-1">⚠️ Risco de protesto e boicote!</p>}
          </div>
        )}
        <div>
          <p className="text-xs text-slate-400 mb-1">🏗️ Conservação</p>
          <Bar value={st.condition} color={st.condition < 40 ? 'bg-red-500' : 'bg-sky-400'} />
          {st.condition < 40 && <p className="text-[11px] text-red-400 mt-1">Estádio mal conservado — faça uma reforma.</p>}
        </div>
        <div className="pt-2 border-t border-surface-700/60 space-y-1.5 text-sm">
          <p className="flex justify-between"><span className="text-slate-400">Ingresso médio</span><span className="font-mono">€{avgPrice} (justo: €{fairPrice(club)})</span></p>
          <p className="flex justify-between"><span className="text-slate-400">Manutenção mensal</span><span className="font-mono">{fmtMoneyFull(st.maintenanceCost + worksExtraCost(st))}</span></p>
          <p className="flex justify-between"><span className="text-slate-400">Conforto geral</span><span className="font-mono">{c}/100</span></p>
          <p className="flex justify-between"><span className="text-slate-400">Camarotes</span><span className="font-mono">{st.boxes.sold}/{st.boxes.total} vendidos</span></p>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Próxima partida em casa</p>
        {preview.md ? (
          <>
            <p className="text-sm text-slate-300">{world.clubs[preview.match!.awayId]?.name} · {world.competitions[preview.match!.competitionId]?.name}</p>
            <div>
              <p className="text-xs text-slate-400 mb-1">Demanda: {Math.round(preview.demand * 100)}%</p>
              <Bar value={preview.demand * 100} color={preview.demand >= 0.95 ? 'bg-gold' : 'bg-accent'} />
            </div>
            {preview.md.sellout && <p className="text-sm text-gold font-bold">🔥 CASA CHEIA! Ingressos esgotados.</p>}
            <div className="space-y-1.5 text-sm pt-1">
              <p className="flex justify-between"><span className="text-slate-400">Público estimado</span><span className="font-mono">{fmtInt(preview.md.attendance)}</span></p>
              <p className="flex justify-between"><span className="text-slate-400">Ingressos</span><span className="font-mono">{fmtMoneyFull(preview.md.ticketRevenue)}</span></p>
              <p className="flex justify-between"><span className="text-slate-400">Comercial (comida/loja/estacion.)</span><span className="font-mono">{fmtMoneyFull(preview.md.foodRevenue + preview.md.storeRevenue + preview.md.parkingRevenue + preview.md.vipRevenue)}</span></p>
              <p className="flex justify-between"><span className="text-slate-400">Custos do jogo</span><span className="font-mono">-{fmtMoneyFull(preview.md.matchCosts)}</span></p>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">Nenhuma partida em casa agendada.</p>
        )}
        <div className="pt-2 border-t border-surface-700/60">
          <p className="text-xs text-slate-400 mb-2">Setores</p>
          <div className="grid grid-cols-2 gap-1.5">
            {SECTOR_IDS.map((id) => (
              <div key={id} className="flex justify-between text-xs rounded-lg bg-surface-800/40 px-2 py-1.5">
                <span className="text-slate-400">{SECTOR_ICONS[id]} {SECTOR_LABELS[id]}</span>
                <span className="font-mono text-slate-300">{fmtInt(st.sectors[id].seats)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Obras</p>
        {st.works.length === 0 && <p className="text-sm text-slate-500">Nenhuma obra em andamento.</p>}
        {st.works.map((w) => {
          const pct = Math.round(((w.totalDays - w.daysLeft) / w.totalDays) * 100);
          return (
            <div key={w.id} className="rounded-xl border border-surface-700 bg-surface-800/40 p-3">
              <p className="text-sm font-semibold text-slate-200">{w.title}</p>
              <p className="text-[11px] text-slate-500">{w.detail} · custo {fmtMoney(w.cost)}</p>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-surface-700 overflow-hidden">
                  <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-mono text-slate-300">{pct}%</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">{w.daysLeft} dias restantes{w.capacityCut > 0 ? ` · capacidade -${Math.round(w.capacityCut * 100)}%` : ''}</p>
            </div>
          );
        })}
        {works && <p className="text-[11px] text-slate-500">⚠️ Durante obras: capacidade reduzida e custos extras.</p>}
        <div className="pt-2 border-t border-surface-700/60">
          <p className="text-xs text-slate-400 mb-2">Receitas da temporada atual</p>
          <p className="flex justify-between text-sm"><span className="text-slate-400">Ingressos</span><span className="font-mono">{fmtMoneyFull(st.seasonAccum.ticket)}</span></p>
          <p className="flex justify-between text-sm"><span className="text-slate-400">Comercial</span><span className="font-mono">{fmtMoneyFull(st.seasonAccum.commercial)}</span></p>
          <p className="flex justify-between text-sm"><span className="text-slate-400">Custos de jogo</span><span className="font-mono">-{fmtMoneyFull(st.seasonAccum.costs)}</span></p>
        </div>
      </div>
    </div>
  );
}

function Tickets({ club, changePrice, applyRecommended, toggleDynamic }: {
  club: Club; changePrice: (id: StadiumSectorId, price: number) => void;
  applyRecommended: () => void; toggleDynamic: () => void;
}) {
  const { career } = useGame();
  const world = career!.world;
  const st = club.stadium;
  const preview = nextHomeMatchPreview(world, club);
  const demand = preview.md ? preview.md.demand : 0.7;
  const rec = recommendedSectorPrices(club, demand);
  const avg = weightedAvgPrice(st);
  const fair = fairPrice(club);

  // curva: ocupação esperada em diferentes níveis de preço
  const curve = [0.6, 0.8, 1, 1.2, 1.5, 2].map((m) => ({
    mult: m,
    price: Math.round(fair * m),
    occ: Math.round(clampOcc(demand * Math.exp(-0.55 * (m - 1))) * 100),
  }));

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Preços por setor</p>
          <span className="text-[11px] text-slate-500">média €{avg} · justo €{fair}</span>
        </div>
        {SECTOR_IDS.map((id) => (
          <div key={id} className="flex items-center gap-3 rounded-xl border border-surface-700 bg-surface-800/40 p-3">
            <span className="text-xl">{SECTOR_ICONS[id]}</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-200">{SECTOR_LABELS[id]}</p>
              <p className="text-[11px] text-slate-500">{fmtInt(st.sectors[id].seats)} lugares · rec. €{rec[id]}</p>
            </div>
            <button onClick={() => changePrice(id, st.sectors[id].price - 2)} className="btn-secondary !px-2.5 !py-1">−</button>
            <span className="font-mono font-bold text-slate-100 w-14 text-center">€{st.sectors[id].price}</span>
            <button onClick={() => changePrice(id, st.sectors[id].price + 2)} className="btn-secondary !px-2.5 !py-1">+</button>
          </div>
        ))}
        {st.lastPriceChange && (
          <p className="text-[11px] text-slate-500">Última alteração: {st.lastPriceChange.pct > 0 ? '+' : ''}{st.lastPriceChange.pct}% em {st.lastPriceChange.date.split('-').reverse().join('/')}</p>
        )}
      </div>

      <div className="space-y-4">
        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Preço dinâmico</p>
            <button onClick={toggleDynamic} className={`badge border px-3 py-1.5 ${st.dynamicPricing ? 'bg-accent text-surface-950 border-accent' : 'bg-surface-800 text-slate-300 border-surface-600'}`}>
              {st.dynamicPricing ? 'Ligado' : 'Desligado'}
            </button>
          </div>
          <p className="text-sm text-slate-400">Recomendação para a próxima partida (demanda {Math.round(demand * 100)}%):</p>
          <div className="grid grid-cols-3 gap-1.5 text-xs">
            {SECTOR_IDS.map((id) => (
              <div key={id} className="rounded-lg bg-surface-800/40 px-2 py-1.5">
                <p className="text-slate-500">{SECTOR_LABELS[id]}</p>
                <p className="font-mono text-accent">€{rec[id]}</p>
              </div>
            ))}
          </div>
          <button onClick={applyRecommended} className="btn-primary w-full">✨ Aplicar preços recomendados</button>
          {st.dynamicPricing && <p className="text-[11px] text-slate-500">O sistema sugere automaticamente os preços acima conforme a demanda.</p>}
        </div>

        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Curva de demanda × preço (próx. jogo)</p>
          <div className="space-y-1.5">
            {curve.map((c) => (
              <div key={c.mult} className="flex items-center gap-3 text-sm">
                <span className="w-16 font-mono text-slate-400">€{c.price}</span>
                <div className="flex-1 h-3 rounded bg-surface-800/50 overflow-hidden">
                  <div className={`h-full ${c.mult <= 1 ? 'bg-accent' : c.mult <= 1.5 ? 'bg-gold' : 'bg-red-500/70'}`} style={{ width: `${c.occ}%` }} />
                </div>
                <span className="w-12 text-right font-mono text-slate-300">{c.occ}%</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-3">Preço mais alto nem sempre rende mais: o ponto ideal equilibra ocupação e valor do ingresso.</p>
        </div>
      </div>
    </div>
  );
}

function clampOcc(v: number) { return Math.max(0.05, Math.min(1, v)); }

function Capacity({ club, startWork }: { club: Club; startWork: (w: Parameters<typeof startStadiumWork>[1]) => void }) {
  const st = club.stadium;
  const perSeat = 950;
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Setores ({fmtInt(st.capacity)} lugares)</p>
        <div className="space-y-2">
          {SECTOR_IDS.map((id) => {
            const sec = st.sectors[id];
            const cost = 5000 * perSeat;
            return (
              <div key={id} className="flex items-center gap-3 rounded-xl border border-surface-700 bg-surface-800/40 p-3">
                <span className="text-xl">{SECTOR_ICONS[id]}</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-200">{SECTOR_LABELS[id]}</p>
                  <p className="text-[11px] text-slate-500">{fmtInt(sec.seats)} lugares · €{sec.price}/ingresso</p>
                </div>
                <button onClick={() => startWork({
                  title: `Expansão da ${SECTOR_LABELS[id].toLowerCase()}`,
                  detail: `+5.000 lugares no setor`,
                  kind: 'expansion', cost, totalDays: 75, capacityCut: 0.1, extraCost: Math.round(cost * 0.004), amount: 5000,
                })} className="btn-secondary !px-3 !py-1.5 text-xs">+5.000 ({fmtMoney(cost)})</button>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-500 mt-3">Expandir aumenta a capacidade mas reduz a ocupação média se a demanda não acompanhar.</p>
      </div>

      <div className="space-y-4">
        <div className="card p-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Reforma e manutenção</p>
          <button onClick={() => startWork({
            title: 'Reforma geral', detail: 'Recupera conservação (+30)',
            kind: 'renovation', cost: Math.round(club.stadium.capacity * 190), totalDays: 45, capacityCut: 0.04, extraCost: 0,
          })} className="btn-primary w-full">🏗️ Reforma ({fmtMoney(Math.round(club.stadium.capacity * 190))})</button>
          <p className="text-[11px] text-slate-500">Conservação atual: {Math.round(st.condition)}%. A cada temporada o estádio perde qualidade sem manutenção.</p>
        </div>

        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Novo estádio</p>
          <p className="text-sm text-slate-400 mb-3">Construir um estádio do zero. A construção leva de 1 a 2 temporadas e reduz a capacidade durante as obras.</p>
          <div className="grid grid-cols-3 gap-2">
            {[{ cap: 60000, cost: 350_000_000, days: 365 }, { cap: 80000, cost: 620_000_000, days: 500 }, { cap: 100000, cost: 900_000_000, days: 640 }].map((p) => (
              <button key={p.cap} onClick={() => startWork({
                title: 'Construção do novo estádio', detail: `Novo ${club.shortName} Arena (${p.cap.toLocaleString('pt-BR')} lugares)`,
                kind: 'new', cost: p.cost, totalDays: p.days, capacityCut: 0.25, extraCost: Math.round(p.cost * 0.003), amount: p.cap,
              })} className="rounded-xl border border-surface-700 bg-surface-800/40 p-3 hover:bg-surface-800 transition text-left">
                <p className="text-sm font-semibold text-slate-200">{fmtInt(p.cap)}</p>
                <p className="text-[11px] text-slate-500">{fmtMoney(p.cost)}</p>
                <p className="text-[11px] text-slate-500">{p.days} dias</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const COMFORT_LABELS: Record<string, string> = {
  assentos: 'Assentos', banheiros: 'Banheiros', alimentacao: 'Alimentação', climatizacao: 'Climatização',
  acessibilidade: 'Acessibilidade', limpeza: 'Limpeza', iluminacao: 'Iluminação', acustica: 'Acústica',
};
const COMFORT_ICONS: Record<string, string> = {
  assentos: '💺', banheiros: '🚻', alimentacao: '🍔', climatizacao: '🌬️', acessibilidade: '♿', limpeza: '🧹', iluminacao: '💡', acustica: '🔊',
};

function Experience({ club, startWork }: { club: Club; startWork: (w: Parameters<typeof startStadiumWork>[1]) => void }) {
  const st = club.stadium;
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Conforto ({comfortAvg(st)}/100)</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(st.comfort).map(([k, v]) => (
            <div key={k} className="rounded-xl border border-surface-700 bg-surface-800/40 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-slate-300">{COMFORT_ICONS[k]} {COMFORT_LABELS[k]}</p>
                <button onClick={() => startWork({
                  title: `Melhorar ${COMFORT_LABELS[k].toLowerCase()}`, detail: `+25 ${COMFORT_LABELS[k]}`,
                  kind: 'comfort', cost: 900_000, totalDays: 21, capacityCut: 0, extraCost: 0,
                })} className="text-[10px] text-accent hover:underline">Investir €900 mil</button>
              </div>
              <Bar value={v} color="bg-accent" />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="card p-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Alimentação e loja</p>
          {[['🍔 Alimentação', 'food', ['Lanchonetes', 'Restaurantes', 'Fast food', 'Premium']], ['🛍️ Loja oficial', 'store', ['Loja pequena', 'Loja média', 'Mega Store', 'Loja premium']]].map(([label, key, levels]) => (
            <div key={key as string} className="flex items-center gap-3 rounded-xl border border-surface-700 bg-surface-800/40 p-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-200">{label as string}</p>
                <p className="text-[11px] text-slate-500">Nível {(st as any)[key as string]}/3 · {(levels as string[])[(st as any)[key as string]]}</p>
              </div>
              {(st as any)[key as string] < 3 ? (
                <button onClick={() => startWork({
                  title: `Melhorar ${label as string}`, detail: `Nível ${(st as any)[key as string] + 1}`,
                  kind: key as 'food' | 'store', cost: 1_500_000, totalDays: 30, capacityCut: 0, extraCost: 0,
                })} className="btn-secondary !px-3 !py-1.5 text-xs">Melhorar (€1,5 mi)</button>
              ) : <span className="text-[11px] text-gold">Máximo</span>}
            </div>
          ))}
          <p className="text-[11px] text-slate-500">Nível maior = mais receita por torcedor em comida e produtos.</p>
        </div>

        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Área VIP e camarotes</p>
          <div className="flex items-center gap-3 rounded-xl border border-surface-700 bg-surface-800/40 p-3 mb-2">
            <span className="text-xl">🥂</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-200">Área VIP</p>
              <p className="text-[11px] text-slate-500">Nível {st.vipLevel}/3 · aumenta preço e receita dos setores premium</p>
            </div>
            {st.vipLevel < 3 ? (
              <button onClick={() => startWork({ title: 'Expandir área VIP', detail: `Nível ${st.vipLevel + 1}`, kind: 'comfort', cost: 2_200_000, totalDays: 40, capacityCut: 0, extraCost: 0 })} className="btn-secondary !px-3 !py-1.5 text-xs">€2,2 mi</button>
            ) : <span className="text-[11px] text-gold">Máximo</span>}
          </div>
          <p className="text-xs text-slate-400 mb-1">Camarotes corporativos</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-xl border border-surface-700 bg-surface-800/40 p-3 text-sm">
              <p className="text-slate-300">{st.boxes.sold} de {st.boxes.total} vendidos</p>
              <p className="text-[11px] text-slate-500">€{(st.boxes.price / 1e6).toFixed(1)} mi/ano por camarote</p>
            </div>
            <button onClick={() => startWork({ title: 'Construir camarotes', detail: '+10 camarotes', kind: 'comfort', cost: 8_000_000, totalDays: 60, capacityCut: 0, extraCost: 0 })} className="btn-secondary !px-3 !py-2 text-xs">+10 (€8 mi)</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Structure({ club, startWork }: { club: Club; startWork: (w: Parameters<typeof startStadiumWork>[1]) => void }) {
  const st = club.stadium;
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="card p-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">🚗 Estacionamento</p>
        <div className="flex items-center gap-3 rounded-xl border border-surface-700 bg-surface-800/40 p-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-200">{fmtInt(st.parking.spaces)} vagas</p>
            <p className="text-[11px] text-slate-500">€{st.parking.price}/carro · receita estimada por jogo {fmtMoneyFull(Math.min(st.parking.spaces, Math.round(st.avgAttendance * 0.16)) * st.parking.price)}</p>
          </div>
          <button onClick={() => startWork({ title: 'Expandir estacionamento', detail: '+1.500 vagas', kind: 'parking', cost: 2_500_000, totalDays: 40, capacityCut: 0, extraCost: 0 })} className="btn-secondary !px-3 !py-1.5 text-xs">+1.500 (€2,5 mi)</button>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 pt-2">🛡️ Segurança</p>
        <div className="rounded-xl border border-surface-700 bg-surface-800/40 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-sm text-slate-300">Nível de segurança</p>
            <button onClick={() => startWork({ title: 'Reforçar segurança', detail: '+22', kind: 'security', cost: 800_000, totalDays: 20, capacityCut: 0, extraCost: 0 })} className="text-xs text-accent hover:underline">Investir (€800 mil)</button>
          </div>
          <Bar value={st.security} color={st.security < 50 ? 'bg-red-500' : 'bg-accent'} />
          {st.security < 50 && <p className="text-[11px] text-red-400 mt-1">Segurança baixa: risco de multas e problemas com torcedores.</p>}
        </div>
      </div>

      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">🖥️ Tecnologia</p>
        <div className="space-y-2 text-sm">
          <TechRow label="Telão" value={st.tech.telao} max={3} onInvest={() => startWork({ title: 'Novo telão', detail: `Telão nível ${st.tech.telao + 1}`, kind: 'tech', cost: 1_800_000, totalDays: 35, capacityCut: 0, extraCost: 0 })} />
          <TechRow label="Sistema de som" value={st.tech.som} max={3} onInvest={() => startWork({ title: 'Melhorar som', detail: `Som nível ${st.tech.som + 1}`, kind: 'tech', cost: 600_000, totalDays: 21, capacityCut: 0, extraCost: 0 })} />
          <div className="flex items-center justify-between rounded-xl border border-surface-700 bg-surface-800/40 p-3">
            <span className="text-slate-300">📶 Wi-Fi para torcedores</span>
            {st.tech.wifi ? <span className="badge bg-accent/15 text-accent border border-accent/30">Ativo</span> : <button onClick={() => startWork({ title: 'Instalar Wi-Fi', detail: 'Conectividade no estádio', kind: 'tech', cost: 700_000, totalDays: 25, capacityCut: 0, extraCost: 0 })} className="btn-secondary !px-3 !py-1 text-xs">€700 mil</button>}
          </div>
          <div className="flex items-center justify-between rounded-xl border border-surface-700 bg-surface-800/40 p-3">
            <span className="text-slate-300">📱 Aplicativo do estádio</span>
            {st.tech.app ? <span className="badge bg-accent/15 text-accent border border-accent/30">Ativo</span> : <button onClick={() => startWork({ title: 'Criar app do estádio', detail: 'Ingressos e experiência digital', kind: 'tech', cost: 900_000, totalDays: 45, capacityCut: 0, extraCost: 0 })} className="btn-secondary !px-3 !py-1 text-xs">€900 mil</button>}
          </div>
        </div>
        <p className="text-[11px] text-slate-500 mt-3">Tecnologia melhora a experiência, a reputação e a eficiência do estádio.</p>
      </div>
    </div>
  );
}

function TechRow({ label, value, max, onInvest }: { label: string; value: number; max: number; onInvest: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-surface-700 bg-surface-800/40 p-3">
      <span className="text-slate-300">{label}</span>
      {value >= max ? <span className="text-[11px] text-gold">Nível {value}/{max}</span> : (
        <button onClick={onInvest} className="btn-secondary !px-3 !py-1 text-xs">Melhorar (nível {value + 1}/{max})</button>
      )}
    </div>
  );
}

function Finance({ club }: { club: Club }) {
  const st = club.stadium;
  const n = Math.max(1, st.seasonAccum.matches);
  const maintenance = st.maintenanceCost + worksExtraCost(st);
  const revenue = st.seasonAccum.ticket + st.seasonAccum.commercial;
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Receitas da temporada</p>
        <div className="space-y-1.5 text-sm">
          <p className="flex justify-between"><span className="text-slate-400">Ingressos</span><span className="font-mono">{fmtMoneyFull(st.seasonAccum.ticket)}</span></p>
          <p className="flex justify-between"><span className="text-slate-400">Alimentação/loja/VIP/parking</span><span className="font-mono">{fmtMoneyFull(st.seasonAccum.commercial)}</span></p>
          <p className="flex justify-between border-t border-surface-700/60 pt-1.5"><span className="text-slate-300">Total de jogos</span><span className="font-mono text-accent">{fmtMoneyFull(revenue)}</span></p>
          <p className="text-[11px] text-slate-500">média por jogo: {fmtMoneyFull(Math.round(revenue / n))}</p>
        </div>
      </div>
      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Despesas</p>
        <div className="space-y-1.5 text-sm">
          <p className="flex justify-between"><span className="text-slate-400">Custos de jogo (staff/energia/segurança)</span><span className="font-mono">-{fmtMoneyFull(st.seasonAccum.costs)}</span></p>
          <p className="flex justify-between"><span className="text-slate-400">Manutenção mensal</span><span className="font-mono">-{fmtMoneyFull(maintenance)}</span></p>
          <p className="text-[11px] text-slate-500">Obras em andamento adicionam {fmtMoneyFull(worksExtraCost(st))}/mês.</p>
        </div>
      </div>
      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Resumo</p>
        <p className="flex justify-between text-sm"><span className="text-slate-400">Lucro do estádio (jogos)</span><span className={`font-mono font-bold ${revenue - st.seasonAccum.costs >= 0 ? 'text-accent' : 'text-red-400'}`}>{fmtMoneyFull(revenue - st.seasonAccum.costs)}</span></p>
        <p className="flex justify-between text-sm mt-1"><span className="text-slate-400">Valor do estádio</span><span className="font-mono">{fmtMoneyFull(stadiumValueOf(st))}</span></p>
        <p className="flex justify-between text-sm mt-1"><span className="text-slate-400">Camarotes (ano)</span><span className="font-mono">{fmtMoneyFull(st.boxes.sold * st.boxes.price)}</span></p>
        {st.naming && <p className="flex justify-between text-sm mt-1"><span className="text-slate-400">Naming rights (ano)</span><span className="font-mono">{fmtMoneyFull(st.naming.annual)}</span></p>}
      </div>
    </div>
  );
}

function Events({ club, bookShow }: { club: Club; bookShow: () => void }) {
  const { career } = useGame();
  const st = club.stadium;
  const nextHome = nextHomeMatchPreview(career!.world, club);
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="card p-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Agendar evento</p>
        <p className="text-sm text-slate-400">Use o estádio para shows e convenções fora dos dias de jogo. Gera receita, mas desgasta o estádio e o gramado.</p>
        <button onClick={bookShow} className="btn-primary w-full">🎤 Agendar show internacional</button>
        <p className="text-[11px] text-slate-500">Receita estimada: {fmtMoneyFull(Math.round(st.capacity * 46))} (capacidade × ~€46).</p>
        {nextHome.md && (
          <p className="text-[11px] text-slate-500">⚠️ Evite agendar no dia da próxima partida em casa ({nextHome.match ? nextHome.match.date.split('-').reverse().join('/') : '—'}).</p>
        )}
      </div>
      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Agendados ({st.bookings.length})</p>
        {st.bookings.length === 0 && <p className="text-sm text-slate-500">Nenhum evento agendado.</p>}
        <div className="space-y-2">
          {st.bookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-xl border border-surface-700 bg-surface-800/40 p-3 text-sm">
              <span className="text-slate-300">{b.title}</span>
              <span className="text-[11px] text-slate-500">{b.date.split('-').reverse().join('/')} · {fmtMoney(b.revenue)}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-3">{st.eventsHosted} eventos já realizados no estádio.</p>
      </div>
    </div>
  );
}

function Contracts({ club, acceptName, refuseName, negotiateName }: {
  club: Club; acceptName: () => void; refuseName: () => void; negotiateName: () => void;
}) {
  const st = club.stadium;
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="card p-5 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">📛 Naming rights</p>
        {st.naming ? (
          <div className="rounded-xl border border-gold/40 bg-gold/5 p-4">
            <p className="text-sm font-semibold text-gold">{st.naming.company} {st.naming.yearsLeft > 0 ? 'Arena' : ''}</p>
            <p className="text-sm text-slate-300 mt-1">Contrato ativo: {st.naming.annual / 1e6 >= 1 ? `${(st.naming.annual / 1e6).toFixed(0)} mi/ano` : `${Math.round(st.naming.annual / 1e3)} mil/ano`}</p>
            <p className="text-[11px] text-slate-500">Faltam {st.naming.yearsLeft} de {st.naming.years} anos.</p>
          </div>
        ) : st.namingProposal ? (
          <div className="rounded-xl border border-accent/40 bg-accent/5 p-4 space-y-2">
            <p className="text-sm font-semibold text-slate-100">Proposta de {st.namingProposal.company}</p>
            <p className="text-sm text-slate-300">{fmtMoneyFull(st.namingProposal.annual)} por ano · {st.namingProposal.years} anos</p>
            <div className="flex gap-2 pt-1">
              <button onClick={acceptName} className="btn-primary !py-1.5 text-xs flex-1">Aceitar</button>
              <button onClick={negotiateName} className="btn-secondary !py-1.5 text-xs flex-1">Negociar valor</button>
              <button onClick={refuseName} className="btn-ghost !py-1.5 text-xs flex-1">Recusar</button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Sem proposta no momento. Empresas aparecem ao longo da temporada.</p>
        )}
        <p className="text-[11px] text-slate-500">O naming paga anualmente e aumenta a reputação do estádio. O valor depende do porte do estádio.</p>
      </div>

      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">🏙️ Camarotes corporativos</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl border border-surface-700 bg-surface-800/40 p-3">
            <p className="font-display font-bold text-xl text-slate-100">{st.boxes.sold}</p>
            <p className="text-[11px] text-slate-500">vendidos</p>
          </div>
          <div className="rounded-xl border border-surface-700 bg-surface-800/40 p-3">
            <p className="font-display font-bold text-xl text-slate-100">{st.boxes.total - st.boxes.sold}</p>
            <p className="text-[11px] text-slate-500">disponíveis</p>
          </div>
          <div className="rounded-xl border border-surface-700 bg-surface-800/40 p-3">
            <p className="font-display font-bold text-xl text-accent">{fmtMoneyFull(st.boxes.sold * st.boxes.price)}</p>
            <p className="text-[11px] text-slate-500">receita/ano</p>
          </div>
        </div>
        <p className="text-sm text-slate-400 mt-4">Preço anual por camarote:</p>
        <div className="flex items-center gap-3 mt-1">
          <SetBoxesPrice />
        </div>
        <p className="text-[11px] text-slate-500 mt-2">A renovação acontece no início de cada temporada conforme reputação e satisfação da torcida.</p>
      </div>
    </div>
  );
}

function SetBoxesPrice() {
  const { career, mutate } = useGame();
  const club = career!.world.clubs[career!.clubId];
  const [v, setV] = useState(String(club.stadium.boxes.price));
  return (
    <div className="flex items-center gap-2 flex-1">
      <input value={v} onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ''))} className="input flex-1" />
      <button
        onClick={() => mutate((c) => { c.world.clubs[c.clubId].stadium.boxes.price = Math.max(10_000, Number(v) || 100_000); })}
        className="btn-primary !py-1.5 text-xs"
      >Definir preço</button>
    </div>
  );
}

function Stats({ club }: { club: Club }) {
  const st = club.stadium;
  const h = st.history;
  const maxRev = Math.max(1, ...h.map((x) => x.ticketRevenue + x.commercial));
  const maxAtt = Math.max(1, ...h.map((x) => x.attendance));
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Histórico por temporada</p>
      {h.length === 0 && <p className="text-sm text-slate-500">O histórico começa a ser registrado a partir da próxima troca de temporada.</p>}
      <div className="space-y-3">
        {[...h].reverse().map((x) => (
          <div key={x.season} className="rounded-xl border border-surface-700 bg-surface-800/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-200">{x.season}</p>
              <span className="text-[11px] text-slate-500">ocupação {x.occupancy}% · satisfação {x.satisfaction}%</span>
            </div>
            <div className="space-y-1.5 text-xs">
              <p className="flex items-center gap-2"><span className="w-24 text-slate-500">Público médio</span><div className="flex-1 h-2 rounded bg-surface-700/60 overflow-hidden"><div className="h-full bg-accent" style={{ width: `${(x.attendance / maxAtt) * 100}%` }} /></div><span className="w-16 text-right font-mono text-slate-300">{fmtInt(x.attendance)}</span></p>
              <p className="flex items-center gap-2"><span className="w-24 text-slate-500">Receita ingressos</span><div className="flex-1 h-2 rounded bg-surface-700/60 overflow-hidden"><div className="h-full bg-gold" style={{ width: `${(x.ticketRevenue / maxRev) * 100}%` }} /></div><span className="w-16 text-right font-mono text-slate-300">{fmtMoney(x.ticketRevenue)}</span></p>
              <p className="flex items-center gap-2"><span className="w-24 text-slate-500">Comercial</span><div className="flex-1 h-2 rounded bg-surface-700/60 overflow-hidden"><div className="h-full bg-sky-400" style={{ width: `${(x.commercial / maxRev) * 100}%` }} /></div><span className="w-16 text-right font-mono text-slate-300">{fmtMoney(x.commercial)}</span></p>
              <p className="text-slate-500 pt-0.5">Capacidade {fmtInt(x.capacity)} · preço médio €{x.avgPrice} · valor {fmtMoney(x.value)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

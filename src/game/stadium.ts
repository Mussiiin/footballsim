import {
  World, Club, Match, Stadium, StadiumSectorId, StadiumWork, StadiumBooking, Career,
} from '../lib/types';
import { RNG, hashString } from '../lib/rng';
import { clamp } from '../lib/format';
import { positionOf, nextMatchForClub } from './competitions';
import { addNews, notify } from './news';

// ------------------------------------------------------------
// Preços justos, setores e demanda
// ------------------------------------------------------------
export const SECTOR_IDS: StadiumSectorId[] = ['arquibancada', 'cadeira', 'premium', 'vip', 'camarote'];
export const SECTOR_LABELS: Record<StadiumSectorId, string> = {
  arquibancada: 'Arquibancada', cadeira: 'Cadeira', premium: 'Premium', vip: 'VIP', camarote: 'Camarote',
};
export const SECTOR_MULT: Record<StadiumSectorId, number> = {
  arquibancada: 0.5, cadeira: 1, premium: 1.8, vip: 2.6, camarote: 3.4,
};

const SECTOR_SHARES: Record<StadiumSectorId, number> = {
  arquibancada: 0.5, cadeira: 0.3, premium: 0.11, vip: 0.06, camarote: 0.03,
};

/** Distribui a capacidade entre os setores (a soma é exatamente = capacity). */
export function allocateSectorSeats(capacity: number): Record<StadiumSectorId, number> {
  const out = {} as Record<StadiumSectorId, number>;
  let remaining = capacity;
  SECTOR_IDS.forEach((id, i) => {
    if (i === SECTOR_IDS.length - 1) {
      out[id] = Math.max(0, remaining);
      return;
    }
    const seats = Math.round(capacity * SECTOR_SHARES[id]);
    out[id] = Math.min(seats, remaining);
    remaining -= out[id];
  });
  return out;
}
export const SECTOR_ICONS: Record<StadiumSectorId, string> = {
  arquibancada: '🪑', cadeira: '💺', premium: '✨', vip: '🥂', camarote: '🏙️',
};

/** Preço médio "justo" de um ingresso para o clube (base de referência). */
export function fairPrice(club: Club): number {
  return Math.max(6, Math.round(6 + club.reputation * 0.55));
}

export function comfortAvg(st: Stadium): number {
  const c = st.comfort;
  return Math.round(
    (c.assentos + c.banheiros + c.alimentacao + c.climatizacao + c.acessibilidade + c.limpeza + c.iluminacao + c.acustica) / 8,
  );
}

export function weightedAvgPrice(st: Stadium): number {
  let seats = 0, total = 0;
  for (const id of SECTOR_IDS) {
    seats += st.sectors[id].seats;
    total += st.sectors[id].seats * st.sectors[id].price;
  }
  return seats > 0 ? Math.round(total / seats) : 0;
}

export function stadiumValueOf(st: Stadium): number {
  const c = comfortAvg(st);
  const extras =
    (st.foodLevel + st.storeLevel + st.vipLevel) * 2_200_000 +
    st.parking.spaces * 900 +
    st.security * 80_000 +
    st.boxes.total * 150_000 +
    c * 5_000;
  return Math.round(st.capacity * 2_100 + st.capacity * st.reputation * 22 + extras);
}

export function effectiveCapacity(st: Stadium): number {
  const cut = st.works.reduce((a, w) => a + w.capacityCut, 0);
  return Math.round(st.capacity * (1 - Math.min(0.6, cut)));
}

/** Soma do custo extra mensal das obras em andamento. */
export function worksExtraCost(st: Stadium): number {
  return st.works.reduce((a, w) => a + w.extraCost, 0);
}

function formBonus(results: ('W' | 'D' | 'L')[]): number {
  if (results.length === 0) return 0;
  let s = 0;
  for (const r of results.slice(-5)) s += r === 'W' ? 1 : r === 'D' ? 0 : -1;
  return clamp((s / 5) * 0.08, -0.08, 0.08);
}

/** Fator de posição na tabela (-0.08 a +0.1). */
function positionFactor(world: World, club: Club, match: Match): number {
  const comp = world.competitions[club.leagueId];
  if (!comp || comp.standings.length === 0) return 0;
  const pos = positionOf(comp, club.id);
  const total = comp.standings.length;
  const rel = 1 - pos / total; // 1 = líder
  return clamp((rel - 0.5) * 0.2, -0.08, 0.1);
}

export function isRivalry(home: Club, away: Club): boolean {
  return home.rivals.includes(away.id) || away.rivals.includes(home.id);
}

/**
 * Demanda por ingressos de uma partida em casa (0-1), considerando adversário,
 * importância, posição, forma, preço, reputação, satisfação e protestos.
 */
export function stadiumDemand(world: World, home: Club, away: Club, match: Match): number {
  const st = home.stadium;
  let d = 0.42;
  d += (match.importance / 100) * 0.28;
  d += clamp((away.reputation - 50) / 100, -0.12, 0.22);
  if (isRivalry(home, away)) d += 0.24;
  d += (home.reputation - 50) / 250;
  d += (st.reputation - 50) / 300;
  d += formBonus(home.lastResults);
  d += (st.satisfaction - 50) / 400;
  d += (st.atmosphere - 50) / 500;
  d -= (st.protest / 100) * 0.28;
  d += positionFactor(world, home, match);
  return clamp(d, 0.08, 1);
}

/** Fator de preço: quanto mais acima do preço justo, menor a ocupação. */
export function priceFactor(avgPrice: number, fair: number): number {
  if (fair <= 0) return 1;
  return clamp(Math.exp(-0.55 * (avgPrice / fair - 1)), 0.22, 1.3);
}

export interface StadiumMatchDay {
  demand: number;
  occupancy: number;        // 0-1 média ponderada
  attendance: number;
  ticketRevenue: number;
  foodRevenue: number;
  storeRevenue: number;
  parkingRevenue: number;
  vipRevenue: number;
  matchCosts: number;
  sellout: boolean;
  avgPrice: number;
}

const SECTOR_OCC_ADJ: Record<StadiumSectorId, number> = {
  arquibancada: 0.03, cadeira: 0.01, premium: -0.02, vip: -0.04, camarote: -0.05,
};

/** Calcula público e receitas do dia de jogo a partir da demanda. Não altera finanças. */
export function stadiumMatchDay(world: World, home: Club, away: Club, match: Match, rng: RNG): StadiumMatchDay {
  const st = home.stadium;
  const demand = stadiumDemand(world, home, away, match);
  const avgPrice = weightedAvgPrice(st);
  const fair = fairPrice(home);
  const pf = priceFactor(avgPrice, fair);
  const baseOcc = clamp(demand * pf, 0.05, 1);
  const cut = st.works.reduce((a, w) => a + w.capacityCut, 0);
  const availFactor = 1 - Math.min(0.6, cut);

  let attendance = 0;
  let ticketRevenue = 0;
  let vipSeats = 0;
  let vipRev = 0;
  for (const id of SECTOR_IDS) {
    const sec = st.sectors[id];
    const occ = clamp(baseOcc + SECTOR_OCC_ADJ[id], 0.03, 1);
    const sold = Math.min(sec.seats, Math.round(sec.seats * availFactor * occ * (0.97 + rng.next() * 0.06)));
    attendance += sold;
    ticketRevenue += sold * sec.price;
    if (id === 'vip' || id === 'camarote') {
      vipSeats += sold;
      vipRev += sold * sec.price * (0.3 + st.vipLevel * 0.16);
    }
  }
  attendance = Math.min(attendance, effectiveCapacity(st));

  const foodRevenue = Math.round(attendance * (1.8 + st.foodLevel * 1.1));
  const storeRevenue = Math.round(attendance * (1.2 + st.storeLevel * 0.9) * (1 + home.reputation / 400));
  const parkingRevenue = Math.round(Math.min(st.parking.spaces, Math.round(attendance * 0.16)) * st.parking.price);

  const staff = attendance * 1.1;
  const cleaning = attendance * 0.55;
  const energy = st.capacity * 0.09;
  const security = attendance * (0.6 + ((100 - st.security) / 100) * 0.9);
  const matchCosts = Math.round(staff + cleaning + energy + security);

  const occupancy = attendance > 0 ? clamp(attendance / Math.max(1, effectiveCapacity(st)), 0, 1) : 0;

  return {
    demand,
    occupancy,
    attendance,
    ticketRevenue: Math.round(ticketRevenue),
    foodRevenue,
    storeRevenue,
    parkingRevenue,
    vipRevenue: Math.round(vipRev),
    matchCosts,
    sellout: baseOcc >= 0.985 && attendance >= effectiveCapacity(st) * 0.97,
    avgPrice,
  };
}

/** Preço recomendado por setor para a próxima partida (preço dinâmico). */
export function recommendedSectorPrices(club: Club, demand: number): Record<StadiumSectorId, number> {
  const fair = fairPrice(club);
  const factor = clamp(0.55 + demand * 0.7, 0.55, 1.3);
  const out = {} as Record<StadiumSectorId, number>;
  for (const id of SECTOR_IDS) {
    out[id] = Math.max(4, Math.round(fair * SECTOR_MULT[id] * factor));
  }
  return out;
}

// ------------------------------------------------------------
// Mudanças de preço → reação da torcida
// ------------------------------------------------------------
const NAMING_COMPANIES = ['Emirates', 'Etihad', 'Qatar Airways', 'Red Bull', 'Amazon Arena', 'BankCorp', 'Volt Energy', 'MegaCola', 'AirEU', 'CryptoPay', 'SwiftBank', 'Orion Tech'];

export interface PriceReaction {
  pct: number;
  satisfactionDelta: number;
  protestDelta: number;
  news: { title: string; subtitle: string; icon: string } | null;
}

/** Aplica mudança de preço e calcula a reação da torcida (oldAvg = média ANTES da mudança). */
export function applyPriceChange(world: World, club: Club, date: string, oldAvg: number, career: Career | null): PriceReaction {
  const st = club.stadium;
  const newAvg = weightedAvgPrice(st);
  const pct = oldAvg > 0 ? ((newAvg - oldAvg) / oldAvg) * 100 : 0;
  st.lastPriceChange = { date, pct: Math.round(pct) };

  const out: PriceReaction = { pct, satisfactionDelta: 0, protestDelta: 0, news: null };

  if (pct <= -20) {
    out.satisfactionDelta = 9;
    out.protestDelta = -15;
    st.protest = clamp(st.protest - 15, 0, 100);
    out.news = {
      title: 'Torcida comemora os preços populares anunciados pelo clube',
      subtitle: `Ingressos a partir de €${newAvg} — a procura já ultrapassa a capacidade do estádio.`,
      icon: '🎟️',
    };
  } else if (pct < -4) {
    out.satisfactionDelta = 4;
    out.protestDelta = -6;
    st.protest = clamp(st.protest - 6, 0, 100);
  } else if (pct <= 4) {
    out.satisfactionDelta = 0;
    out.protestDelta = 0;
  } else if (pct <= 25) {
    out.satisfactionDelta = -4;
    out.protestDelta = 12;
    st.protest = clamp(st.protest + 12, 0, 100);
    out.news = {
      title: 'Torcida critica aumento no preço dos ingressos',
      subtitle: 'Os torcedores consideram os novos preços abusivos.',
      icon: '😡',
    };
  } else if (pct <= 50) {
    out.satisfactionDelta = -9;
    out.protestDelta = 26;
    st.protest = clamp(st.protest + 26, 0, 100);
    out.news = {
      title: 'Revolta da torcida',
      subtitle: `O aumento de ${Math.round(pct)}% no preço dos ingressos provocou protestos entre os torcedores.`,
      icon: '📢',
    };
  } else {
    out.satisfactionDelta = -14;
    out.protestDelta = 40;
    st.protest = clamp(st.protest + 40, 0, 100);
    out.news = {
      title: 'Torcida organizada anuncia protesto contra preços abusivos',
      subtitle: `#IngressosMaisBaratos está entre os assuntos mais comentados após o aumento de ${Math.round(pct)}%.`,
      icon: '🚨',
    };
  }

  st.satisfaction = clamp(st.satisfaction + out.satisfactionDelta, 1, 100);
  if (out.news) {
    addNews(world, { date, title: out.news.title, subtitle: out.news.subtitle, category: 'Estádio', clubId: club.id, importance: 60 });
  }
  if (out.pct >= 25 && career) {
    notify(career, out.news?.title ?? 'Torcida insatisfeita com os preços.', 'warning', '📢', 'stadium');
  }
  return out;
}

// ------------------------------------------------------------
// Obras / expansão / reformas
// ------------------------------------------------------------
let workCounter = 0;

export function canAfford(club: Club, cost: number): boolean {
  return club.balance >= cost;
}

/** Inicia uma obra (desconta o custo na hora). */
export function startStadiumWork(club: Club, work: Omit<StadiumWork, 'id' | 'daysLeft'>): StadiumWork | null {
  if (!canAfford(club, work.cost)) return null;
  club.balance -= work.cost;
  const w: StadiumWork = { ...work, id: `wk${workCounter++}`, daysLeft: work.totalDays };
  club.stadium.works.push(w);
  return w;
}

function applyWork(world: World, club: Club, w: StadiumWork, career: Career | null): void {
  const st = club.stadium;
  const note = `${club.shortName}: ${w.title} concluída.`;
  switch (w.kind) {
    case 'expansion': {
      const added = w.amount ?? 0;
      st.capacity += added;
      // redistribui setores mantendo proporções
      const seats = allocateSectorSeats(st.capacity);
      for (const id of SECTOR_IDS) st.sectors[id].seats = seats[id];
      st.avgAttendance = Math.round(st.avgAttendance * 0.9 + st.capacity * 0.1);
      if (club.isUserControlled) {
        addNews(world, { date: world.date, title: `Estádio maior: ${st.name} agora tem ${st.capacity.toLocaleString('pt-BR')} lugares`, subtitle: `A expansão de ${added.toLocaleString('pt-BR')} lugares foi concluída.`, category: 'Estádio', clubId: club.id, importance: 65 });
      }
      break;
    }
    case 'renovation':
      st.condition = clamp(st.condition + 30, 0, 100);
      st.reputation = clamp(st.reputation + 3, 0, 100);
      st.satisfaction = clamp(st.satisfaction + 3, 0, 100);
      break;
    case 'comfort': {
      const c = st.comfort;
      const target = Object.keys(c)[0] as keyof typeof c;
      c[target] = clamp(c[target] + 25, 0, 100);
      break;
    }
    case 'parking':
      st.parking.level += 1;
      st.parking.spaces += 1500;
      break;
    case 'food':
      st.foodLevel = Math.min(3, st.foodLevel + 1);
      break;
    case 'store':
      st.storeLevel = Math.min(3, st.storeLevel + 1);
      break;
    case 'security':
      st.security = clamp(st.security + 22, 0, 100);
      break;
    case 'tech':
      st.tech.telao = Math.min(3, st.tech.telao + 1);
      st.tech.som = Math.min(3, st.tech.som + 1);
      st.tech.wifi = true;
      st.reputation = clamp(st.reputation + 2, 0, 100);
      break;
    case 'new': {
      const newCap = w.amount ?? st.capacity;
      st.capacity = newCap;
      st.condition = 100;
      st.reputation = clamp(st.reputation + 10, 0, 100);
      st.name = w.detail || st.name;
      const seats = allocateSectorSeats(newCap);
      for (const id of SECTOR_IDS) st.sectors[id].seats = seats[id];
      st.avgAttendance = Math.round(newCap * 0.8);
      break;
    }
  }
  st.works = st.works.filter((x) => x.id !== w.id);
  if (club.isUserControlled && career) notify(career, note, 'success', '🏟️', 'stadium');
}

// ------------------------------------------------------------
// Naming rights
// ------------------------------------------------------------
export function generateNamingProposal(world: World, club: Club): void {
  if (club.stadium.namingProposal || club.stadium.naming) return;
  const rng = new RNG((Math.random() * 1e9) | 0);
  const value = stadiumValueOf(club.stadium);
  const annual = Math.max(250_000, Math.round((value * 0.028 * rng.float(0.75, 1.25)) / 250_000) * 250_000);
  club.stadium.namingProposal = {
    company: NAMING_COMPANIES[rng.int(0, NAMING_COMPANIES.length - 1)],
    years: rng.int(5, 15),
    yearsLeft: 0,
    annual,
  };
}

export function acceptNaming(world: World, club: Club): void {
  const p = club.stadium.namingProposal;
  if (!p) return;
  club.stadium.naming = { ...p, yearsLeft: p.years };
  club.stadium.namingProposal = null;
  club.stadium.reputation = clamp(club.stadium.reputation + 4, 0, 100);
  if (club.isUserControlled) {
    addNews(world, { date: world.date, title: `${club.shortName} vende o naming rights do estádio para ${p.company}`, subtitle: `Contrato de ${p.years} anos a €${(p.annual / 1e6).toLocaleString('pt-BR')}M por temporada.`, category: 'Estádio', clubId: club.id, importance: 70 });
  }
}

export function negotiateNaming(world: World, club: Club, career: Career | null): void {
  const p = club.stadium.namingProposal;
  if (!p) return;
  const rng = new RNG((Math.random() * 1e9) | 0);
  const bump = rng.float(0.06, 0.22);
  p.annual = Math.round(p.annual * (1 + bump) / 250_000) * 250_000;
  if (club.isUserControlled && career) notify(career, `${p.company} aceitou aumentar para €${(p.annual / 1e6).toLocaleString('pt-BR')}M por ano.`, 'success', '🤝');
}

// ------------------------------------------------------------
// Eventos no estádio (shows, convenções)
// ------------------------------------------------------------
export function bookStadiumEvent(world: World, club: Club, booking: Omit<StadiumBooking, 'id'>): StadiumBooking | null {
  if (club.balance < 0) return null;
  const b: StadiumBooking = { ...booking, id: `ev${Math.floor(Math.random() * 1e9)}` };
  club.stadium.bookings.push(b);
  if (club.isUserControlled) {
    addNews(world, { date: world.date, title: `${b.title} será sediado no ${club.stadium.name}`, subtitle: `Evento marcado para ${booking.date.split('-').reverse().join('/')}.`, category: 'Estádio', clubId: club.id, importance: 55 });
  }
  return b;
}

// ------------------------------------------------------------
// Dia de jogo: aplicar resultado à torcida + finanças
// ------------------------------------------------------------
export function applyStadiumMatchResult(world: World, home: Club, match: Match, homeWon: boolean, awayWon: boolean, md: StadiumMatchDay): void {
  const st = home.stadium;
  st.avgAttendance = Math.round(st.avgAttendance * 0.72 + md.attendance * 0.28);

  let satDelta = homeWon ? 2.5 : awayWon ? -3 : 0;
  if (md.sellout) satDelta += 2;
  else if (md.occupancy < 0.5) satDelta -= 1.5;
  if (st.protest > 60) satDelta -= 2;
  st.satisfaction = clamp(st.satisfaction + satDelta, 1, 100);

  st.atmosphere = clamp(Math.round(st.atmosphere * 0.75 + (md.occupancy * 60 + st.satisfaction * 0.4) * 0.25), 5, 100);

  // reputação do estádio evolui devagar
  st.reputation = clamp(st.reputation + (md.sellout ? 0.03 : 0) + (st.satisfaction - 50) * 0.004, 5, 100);
  st.reputation = Math.min(st.reputation, 100);

  // acumuladores da temporada
  st.seasonAccum.attendance += md.attendance;
  st.seasonAccum.matches += 1;
  st.seasonAccum.ticket += md.ticketRevenue;
  st.seasonAccum.commercial += md.foodRevenue + md.storeRevenue + md.parkingRevenue + md.vipRevenue;
  st.seasonAccum.costs += md.matchCosts;

  if (md.sellout && home.isUserControlled) {
    addNews(world, { date: match.date, title: `Casa cheia no ${st.name}!`, subtitle: `Todos os ${md.attendance.toLocaleString('pt-BR')} ingressos foram vendidos — atmosfera fantástica.`, category: 'Estádio', clubId: home.id, importance: 55 });
  }
}

// ------------------------------------------------------------
// Tick diário
// ------------------------------------------------------------
export function tickStadium(world: World, career: Career | null, rng: RNG): void {
  for (const club of Object.values(world.clubs)) {
    const st = club.stadium;
    const date = world.date;

    // obras em andamento
    if (st.works.length > 0) {
      const done = st.works.filter((w) => {
        w.daysLeft -= 1;
        return w.daysLeft <= 0;
      });
      for (const w of done) applyWork(world, club, w, career);
    }

    // conservação: desgaste diário (reforma previne)
    const renovating = st.works.some((w) => w.kind === 'renovation');
    if (!renovating) {
      st.condition = clamp(st.condition - 0.014, 5, 100);
    }
    if (st.condition < 35) {
      st.satisfaction = clamp(st.satisfaction - 0.05, 1, 100);
      st.reputation = clamp(st.reputation - 0.008, 5, 100);
    }

    // protesto esfria com o tempo
    st.protest = clamp(st.protest - 0.12, 0, 100);

    // atmosfera reverte devagar para o nível da satisfação
    st.atmosphere = clamp(st.atmosphere + (st.satisfaction - st.atmosphere) * 0.03, 5, 100);

  // proposta de naming rights (só o clube do usuário)
  if (club.isUserControlled && !st.naming && !st.namingProposal && rng.chance(0.008)) {
    generateNamingProposal(world, club);
  }

  // protestos/torcida: eventos de preço
  if (club.isUserControlled && st.protest >= 55 && rng.chance((st.protest - 45) / 260)) {
    fireProtest(world, club, date, career);
  }

    // eventos agendados (shows)
    for (const b of st.bookings) {
      if (b.date === date) {
        const gross = b.revenue;
        const costs = Math.round(gross * 0.35);
        club.balance += gross - costs;
        club.financeAccum.revenue += gross;
        club.financeAccum.expenses += costs;
        st.eventsHosted += 1;
        st.condition = clamp(st.condition - 2, 5, 100);
        st.bookings = st.bookings.filter((x) => x.id !== b.id);
        if (club.isUserControlled) {
          addNews(world, { date, title: `${b.title} movimenta o ${st.name}`, subtitle: `Receita de €${(gross / 1e6).toLocaleString('pt-BR')}M no evento.`, category: 'Estádio', clubId: club.id, importance: 55 });
        }
      }
    }
  }
}

const PROTEST_TEXTS: { title: string; subtitle: string }[] = [
  { title: 'Torcedores organizaram um protesto contra os preços dos ingressos', subtitle: 'A manifestação ocorreu na frente do estádio antes do treino.' },
  { title: 'Torcida começa a vaiar a diretoria', subtitle: 'As vaias foram ouvidas durante toda a partida em casa.' },
  { title: 'Faixas de protesto aparecem no estádio', subtitle: '"Futebol é do povo" foi estendida na arquibancada.' },
  { title: '#IngressosMaisBaratos entre os assuntos mais comentados', subtitle: 'A hashtag viralizou nas redes sociais após a política de preços.' },
  { title: 'Principal torcida organizada anuncia protesto', subtitle: 'O grupo promete manifestação antes da próxima partida em casa.' },
  { title: 'Parte da torcida decidiu não comparecer ao próximo jogo', subtitle: 'O boicote pode derrubar a ocupação do estádio.' },
];

function fireProtest(world: World, club: Club, date: string, career: Career | null): void {
  const st = club.stadium;
  const t = PROTEST_TEXTS[Math.floor(Math.random() * PROTEST_TEXTS.length)];
  st.protestsFired += 1;
  st.satisfaction = clamp(st.satisfaction - 4, 1, 100);
  addNews(world, { date, title: t.title, subtitle: t.subtitle, category: 'Estádio', clubId: club.id, importance: 70 });
  if (career) notify(career, `${t.title}.`, 'warning', '📢', 'stadium');
}

// ------------------------------------------------------------
// Fechamento de temporada
// ------------------------------------------------------------
export function stadiumSeasonReset(world: World, club: Club, season: string): void {
  const st = club.stadium;
  const n = Math.max(1, st.seasonAccum.matches);
  st.history.push({
    season,
    attendance: Math.round(st.seasonAccum.attendance / n),
    occupancy: Math.round((st.seasonAccum.attendance / n / Math.max(1, effectiveCapacity(st))) * 100),
    ticketRevenue: st.seasonAccum.ticket,
    commercial: st.seasonAccum.commercial,
    matchCosts: st.seasonAccum.costs,
    maintenance: st.maintenanceCost * 10,
    avgPrice: weightedAvgPrice(st),
    capacity: st.capacity,
    value: stadiumValueOf(st),
    satisfaction: Math.round(st.satisfaction),
  });
  if (st.history.length > 12) st.history.shift();
  st.seasonAccum = { attendance: 0, matches: 0, ticket: 0, commercial: 0, costs: 0 };

  // camarotes corporativos: renova por temporada conforme reputação e satisfação
  const renewal = clamp(Math.round(0.55 + club.reputation / 200 + st.satisfaction / 300), 0, 1);
  st.boxes.sold = Math.min(st.boxes.total, Math.max(0, Math.round(st.boxes.total * renewal)));
  const boxesRevenue = st.boxes.sold * st.boxes.price;
  club.balance += boxesRevenue;
  club.financeAccum.revenue += boxesRevenue;

  // naming rights: receita anual + fim do contrato
  if (st.naming) {
    club.balance += st.naming.annual;
    club.financeAccum.revenue += st.naming.annual;
    st.naming.yearsLeft -= 1;
    if (st.naming.yearsLeft <= 0) {
      st.naming = null;
      st.reputation = clamp(st.reputation - 2, 5, 100);
      if (club.isUserControlled) addNews(world, { date: world.date, title: `Contrato de naming do ${st.name} chegou ao fim`, subtitle: 'O estádio volta a ter o nome original.', category: 'Estádio', clubId: club.id, importance: 45 });
    }
  }

  // a torcida esquece parte do descontentamento; preço alto constante segue penalizando
  st.protest = clamp(st.protest - 25, 0, 100);
  st.satisfaction = clamp(st.satisfaction * 0.6 + 38, 1, 100);
  st.value = stadiumValueOf(st);
}

/** Previsão da próxima partida em casa (para a tela). */
export function nextHomeMatchPreview(world: World, club: Club): { match: Match | null; demand: number; md: StadiumMatchDay | null } {
  const match = nextMatchForClub(world, club.id, world.date);
  if (!match || match.homeId !== club.id) return { match, demand: 0, md: null };
  const away = world.clubs[match.awayId];
  if (!away) return { match, demand: 0, md: null };
  const demand = stadiumDemand(world, club, away, match);
  const rng = new RNG(hashString(`stadium-preview-${match.id}`));
  const md = stadiumMatchDay(world, club, away, match, rng);
  return { match, demand, md };
}

export function satisfactionLabel(v: number): string {
  if (v >= 85) return 'Muito satisfeita';
  if (v >= 70) return 'Satisfeita';
  if (v >= 55) return 'Neutra';
  if (v >= 40) return 'Insatisfeita';
  return 'Revoltada';
}

export function reputationStars(v: number): string {
  const s = Math.round((clamp(v, 0, 100) / 100) * 5);
  return '★'.repeat(s) + '☆'.repeat(Math.max(0, 5 - s));
}

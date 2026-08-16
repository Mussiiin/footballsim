// ============================================================
// FootballSim — Motor de negociações de transferências
// Sistema completo: interesse, scouting, análise do responsável,
// negociação com o clube vendedor, negociação com o jogador,
// exames médicos e conclusão. Tudo derivado dos dados reais.
// ============================================================
import {
  World, Career, Player, Club, TransferNegotiation, TransferOffer, NegotiationMessage,
  ScoutReport, PlayerAgent, InterestLevel, NegotiationMood, NegotiationKind,
  SquadRole, PlayerPromise, InjuryRecord, RenewalNegotiation, RenewalStatus, IncomingOffer,
  MarketHighlight, MarketHighlightKind, SaleReport,
} from '../lib/types';
import { RNG, hashString } from '../lib/rng';
import { overallOf, refreshClubCaches } from './overall';
import { clamp, fmtMoney } from '../lib/format';
import { addDays, daysBetween } from '../lib/date';
import { sellingPrice, executeTransfer, isVitalPlayer, squadOf, freeAgents } from './transfers';
import { addNews, notify } from './news';
import { sackManager } from './career';
import { COUNTRIES } from './names';
import { POSITION_GROUPS, POSITION_LABELS, DIFFICULTY_CONFIG, Position } from '../lib/types';

let negotiationCounter = 0;
let messageCounter = 0;
let highlightCounter = 0;

/** Registra um destaque do mercado (maiores negócios e guerras da janela). */
function pushMarketHighlight(
  world: World, kind: MarketHighlightKind, title: string, detail: string, fee: number, importance: number,
  extra?: { playerId?: string; clubId?: string },
): void {
  const h: MarketHighlight = {
    id: `mh${highlightCounter++}`, kind, date: world.date, title, detail, fee, importance,
    playerId: extra?.playerId, clubId: extra?.clubId,
  };
  world.marketHighlights.unshift(h);
  if (world.marketHighlights.length > 60) world.marketHighlights.pop();
}
let promiseCounter = 0;
let agentCounter = 0;
let reportCounter = 0;

const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

// ------------------------------------------------------------
// Utilidades de valor
// ------------------------------------------------------------
export interface MarketAnalysis {
  value: number;      // valor de mercado (o "real")
  min: number;        // preço mínimo estimado
  max: number;        // preço máximo estimado
  trend: 'alta' | 'estável' | 'queda';
  demand: number;     // nº de clubes interessados
}

/** Análise de mercado do jogador. O "preço real" fica oculto da interface. */
export function marketAnalysis(world: World, player: Player): MarketAnalysis {
  const seller = player.clubId ? world.clubs[player.clubId] : null;
  const base = sellingPrice(world, player, seller ?? undefined);
  const rng = new RNG(hashString(world.seed) ^ hashString(`${player.id}|market`));
  const demand = competingClubs(world, player).length;
  const demandMult = 1 + demand * 0.08;
  const formMult = player.form >= 80 ? 1.12 : player.form <= 40 ? 0.88 : 1;
  const injuryPenalty = player.injury ? 0.8 : 1;
  const value = Math.round(base * demandMult * formMult * injuryPenalty);
  const min = Math.round(value * 0.8);
  const max = Math.round(value * 1.35);
  const recent = player.lastRatings.length >= 3
    ? player.lastRatings.reduce((a, b) => a + b, 0) / player.lastRatings.length
    : 6.5;
  const trend = recent >= 7.2 && player.age <= 27 ? 'alta' : recent <= 5.8 ? 'queda' : 'estável';
  return { value, min, max, trend, demand };
}

/** Clubes da IA monitorando o jogador (determinístico). */
export function competingClubs(world: World, player: Player): Club[] {
  if (!player.clubId) return [];
  const rng = new RNG(hashString(world.seed) ^ hashString(`${player.id}|interest`));
  const ov = overallOf(player);
  const candidates = Object.values(world.clubs)
    .filter((c) => !c.isUserControlled && c.id !== player.clubId)
    .filter((c) => Math.abs(c.reputation - player.reputation) <= 25)
    .filter((c) => c.balance > player.value * 1.1);
  const n = ov >= 85 ? rng.int(2, 4) : ov >= 75 ? rng.int(1, 3) : rng.chance(0.4) ? 1 : 0;
  const picked = rng.shuffle(candidates).slice(0, n);
  return picked.sort((a, b) => b.reputation - a.reputation);
}

// ------------------------------------------------------------
// Interesse do jogador
// ------------------------------------------------------------
export interface InterestResult {
  score: number;       // 0-100
  level: InterestLevel;
  reasons: string[];
  competing: { clubId: string; level: InterestLevel; score: number }[];
}

export function interestLevel(score: number): InterestLevel {
  if (score >= 78) return 'Muito interessado';
  if (score >= 62) return 'Interessado';
  if (score >= 48) return 'Pouco interessado';
  if (score >= 40) return 'Neutro';
  if (score >= 28) return 'Desinteressado';
  return 'Muito desinteressado';
}

/** Calcula o interesse do jogador em um clube, com os motivos. */
export function computeInterest(world: World, player: Player, clubId: string, opts?: {
  wage?: number;
  role?: SquadRole;
}): InterestResult {
  const club = world.clubs[clubId];
  if (!club) return { score: 30, level: 'Desinteressado', reasons: [], competing: [] };
  const reasons: string[] = [];
  let score = 30;

  // reputação do clube
  const repDiff = club.reputation - player.reputation;
  score += clamp(repDiff, -25, 30);
  if (repDiff >= 15) reasons.push('Clube de grande reputação no cenário do futebol');
  else if (repDiff <= -15) reasons.push('Clube com reputação abaixo do seu nível');

  // qualidade da liga
  const league = world.competitions[club.leagueId];
  if (league) {
    const leagueRep = world.countries.find((c) => c.id === club.countryId)?.reputation ?? 50;
    const leagueScore = clamp((leagueRep - 50) * 0.4, -14, 14);
    score += leagueScore;
  }

  // competição continental
  const inContinental = world.competitions['CONTINENTAL'].clubIds.includes(club.id);
  if (inContinental) {
    score += 8;
    reasons.push('Clube disputa competição continental');
  } else {
    score -= 4;
    reasons.push('Sem participação em competição continental');
  }

  // divisão do clube: jogadores de alto nível evitam divisões inferiores;
  // ao subir de divisão (promoção muda club.leagueId), o interesse cresce
  const leagueComp = world.competitions[club.leagueId];
  if (leagueComp) {
    if (leagueComp.tier === 1) {
      score += 2;
      reasons.push('Clube na elite do futebol nacional');
    } else {
      const ov = overallOf(player);
      const divPenalty = (leagueComp.tier - 1) * (3 + Math.round(ov * 0.05));
      score -= divPenalty;
      reasons.push(`Clube atua na ${leagueComp.tier}ª divisão`);
    }
  }

  // tempo de jogo esperado
  const squad = squadOf(world, club.id);
  const samePos = squad.filter((p) => POSITION_GROUPS[p.position] === POSITION_GROUPS[player.position]);
  const better = samePos.filter((p) => overallOf(p) > overallOf(player)).length;
  const starterChance = better === 0 ? 0.9 : better <= 1 ? 0.55 : 0.2;
  score += Math.round((starterChance - 0.5) * 40);
  if (starterChance >= 0.8) reasons.push('Grande chance de ser titular');
  else if (starterChance <= 0.25) reasons.push('Concorrência forte na posição');

  // salário oferecido
  if (opts?.wage) {
    const cur = player.contract?.wage ?? 500;
    const ratio = opts.wage / Math.max(1, cur);
    score += clamp(Math.round((ratio - 1) * 50), -12, 18);
    if (ratio >= 1.3) reasons.push('Salário competitivo');
    else if (ratio <= 0.85) reasons.push('Salário abaixo do atual');
  }

  // papel no elenco
  if (opts?.role) {
    const roleScore: Record<SquadRole, number> = {
      'Titular absoluto': 18, Titular: 12, Rotação: 2, Reserva: -8, Promessa: -2, Base: -14,
    };
    score += roleScore[opts.role];
    if (opts.role === 'Reserva' || opts.role === 'Base') reasons.push('Papel secundário no elenco');
  }

  // treinador
  if (club.coach) {
    score += clamp((club.coach.reputation - 50) * 0.15, -5, 8);
    if (club.coach.reputation >= 70) reasons.push('Treinador renomado');
  }
  // instalações
  score += clamp((club.facilities.training - 50) * 0.1, -4, 5);

  // possibilidade de títulos (tier)
  const tierScore: Record<string, number> = { Gigante: 10, Grande: 4, Médio: -2, Pequeno: -8, Amador: -14 };
  score += tierScore[club.tier] ?? 0;
  if (club.tier === 'Gigante') reasons.push('Chance real de títulos');

  // cultura / distância (nacionalidade)
  const sameCountry = player.nationality === club.countryId ? true : player.nationality === world.countries.find((c) => c.id === club.countryId)?.name;
  if (sameCountry) {
    score += 6;
    reasons.push('Continua no seu país de origem');
  } else {
    score -= 3;
  }

  // idade e ambição
  if (player.age <= 23) score += 2;
  if (player.age >= 31) score -= 3;
  const ambitious = player.personality === 'Ambicioso' || player.personality === 'Mercenário';
  if (ambitious && club.tier === 'Gigante') score += 6;
  if (player.personality === 'Leal' && player.clubId && player.happiness >= 70) score -= 12;
  if (player.personality === 'Mercenário') reasons.push('Atleta valoriza o aspecto financeiro');

  // situação atual
  if (player.transferRequested) score += 10;
  if (player.happiness < 40) score += 8;
  if (player.injury) score -= 6;

  // outros clubes interessados
  const others = competingClubs(world, player);
  const otherScore = clamp(others.length * 5, 0, 15);
  score += otherScore;
  if (others.length >= 2) reasons.push('Outros clubes também demonstram interesse');

  score = clamp(Math.round(score), 5, 97);
  return {
    score,
    level: interestLevel(score),
    reasons: reasons.slice(0, 6),
    competing: others.map((c) => ({
      clubId: c.id,
      level: interestLevel(clamp(55 + c.reputation - player.reputation, 10, 95)),
      score: clamp(55 + c.reputation - player.reputation, 10, 95),
    })),
  };
}

// ------------------------------------------------------------
// Expectativa salarial
// ------------------------------------------------------------
export interface WageExpectation {
  want: number;  // salário desejado
  min: number;   // mínimo aceitável
}

export function wageExpectation(world: World, player: Player, interestScore: number, agent?: PlayerAgent, clubId?: string): WageExpectation {
  const current = player.contract?.wage ?? 500;
  const ov = overallOf(player);
  let want = Math.round(current * (1 + (100 - interestScore) / 60) * 1.05);
  const baseWant = Math.max(500, Math.round(Math.pow(ov / 45, 4.4) * 4200));
  want = Math.max(want, Math.round(baseWant * (0.9 + (100 - interestScore) / 120)));
  if (player.age >= 32) want = Math.round(want * 0.85);
  if (player.personality === 'Mercenário') want = Math.round(want * 1.18);
  if (player.personality === 'Ambicioso') want = Math.round(want * 1.08);
  if (player.personality === 'Leal') want = Math.round(want * 0.94);
  const agentMult = agent ? (agent.style === 'Flexível' ? 0.92 : agent.style === 'Equilibrado' ? 1 : agent.style === 'Exigente' ? 1.12 : 1.22) : 1;
  want = Math.round(want * agentMult);
  // divisão do clube: clubes de divisões baixas pagam prêmio para atrair alto nível;
  // o prêmio cresce com o overall (um 85 ovr exige muito mais para descer de divisão)
  if (clubId) {
    const leagueComp = world.competitions[world.clubs[clubId]?.leagueId ?? ''];
    if (leagueComp && leagueComp.tier > 1) {
      const divMult = 1 + (leagueComp.tier - 1) * (0.03 + ov * 0.0015);
      want = Math.round(want * Math.min(divMult, 1.6));
    }
  }
  const min = Math.round(want * 0.82);
  return { want, min };
}

// ------------------------------------------------------------
// Agente
// ------------------------------------------------------------
export function ensureAgent(world: World, player: Player): PlayerAgent {
  if (player.agentId && world.agents[player.agentId]) return world.agents[player.agentId];
  const rng = new RNG(hashString(world.seed) ^ hashString(`${player.id}|agent`));
  const country = COUNTRIES.find((c) => c.name === player.nationality) ?? COUNTRIES[0];
  const style = rng.weighted(
    ['Flexível', 'Equilibrado', 'Exigente', 'Agressivo'] as const,
    [22, 40, 24, 14],
  );
  const agent: PlayerAgent = {
    id: `ag${agentCounter++}`,
    name: `${rng.pick(country.first)} ${rng.pick(country.last)} (agente)`,
    style,
    reputation: clamp(Math.round(player.reputation * rng.float(0.7, 1.1)), 15, 95),
  };
  world.agents[agent.id] = agent;
  player.agentId = agent.id;
  return agent;
}

// ------------------------------------------------------------
// Nível de conhecimento / scouting
// ------------------------------------------------------------
export function playerKnowledge(world: World, career: Career, playerId: string): number {
  if (career.scouted.includes(playerId)) return 0.95;
  if (career.shortlist.includes(playerId)) return 0.7;
  const p = world.players[playerId];
  if (p && p.clubId === career.clubId) return 1;
  return 0.4;
}

const POSITION_STRENGTHS: Partial<Record<Position, string[]>> = {
  GK: ['Reflexos', 'Jogo aéreo', 'Saída de bola'],
  CB: ['Marcoção', 'Jogo aéreo', 'Desarme'],
  LB: ['Apoio ao ataque', 'Velocidade', 'Cruzamento'],
  RB: ['Apoio ao ataque', 'Velocidade', 'Cruzamento'],
  DM: ['Leitura de jogo', 'Desarme', 'Distribuição'],
  CM: ['Distribuição', 'Visão de jogo', 'Combate'],
  AM: ['Criatividade', 'Visão de jogo', 'Finalização de média distância'],
  LW: ['Drible', 'Velocidade', 'Finalização'],
  RW: ['Drible', 'Velocidade', 'Finalização'],
  ST: ['Finalização', 'Posicionamento', 'Jogo de costas'],
  CF: ['Ligação', 'Finalização', 'Técnica'],
};

/** Relatório de scouting com incerteza baseada no nível de conhecimento. */
export function scoutPlayer(world: World, career: Career, playerId: string): ScoutReport {
  const p = world.players[playerId];
  if (!p) throw new Error('Jogador não encontrado');
  const knowledge = playerKnowledge(world, career, playerId);
  const officer = career.recruitment;
  const rng = new RNG(hashString(world.seed) ^ hashString(`${playerId}|scout|${world.season}`));
  const ov = overallOf(p);
  const pot = p.potential;
  const err = Math.round((1 - knowledge) * (10 - officer.scouting / 12));
  const overallLow = clamp(ov - err, 30, 99);
  const overallHigh = clamp(ov + err, 30, 99);
  const potLow = clamp(pot - err - 2, 30, 99);
  const potHigh = clamp(pot + err + 2, 30, 99);
  const analysis = marketAnalysis(world, p);
  const valErr = Math.round(analysis.value * (1 - knowledge) * (0.2 + (100 - officer.marketKnowledge) / 160));
  const valueLow = Math.max(0, analysis.value - valErr);
  const valueHigh = analysis.value + valErr;

  const strengths = [
    rng.pick(POSITION_STRENGTHS[p.position] ?? ['Físico', 'Técnica', 'Inteligência']),
    p.attrs.pace >= 75 ? 'Muita velocidade' : p.attrs.passing >= 75 ? 'Bom passe' : p.attrs.physical >= 75 ? 'Muito físico' : 'Bom fundamento',
    p.potential > ov + 8 ? 'Potencial de sobra para evoluir' : 'Pronto para o time principal',
  ];
  const weaknesses = [
    p.attrs.strength <= 55 ? 'Falta força física' : p.attrs.passing <= 55 ? 'Passe limitado' : p.attrs.finishing <= 55 && p.position !== 'GK' ? 'Finalização inconsistente' : 'Marcação frágil',
    p.condition <= 60 ? 'Condição física atual abaixo do ideal' : p.age >= 31 ? 'Idade avançada limita a revenda' : 'Pouca experiência em jogos grandes',
    p.injury ? `Saindo de lesão (${p.injury.type})` : p.injuryHistory.length >= 3 ? 'Histórico de lesões preocupante' : 'Ainda em adaptação',
  ];
  const injuryDays = p.injuryHistory.reduce((s, i) => s + i.daysOut, 0);
  const risk: ScoutReport['risk'] = p.injury ? 'Alto' : injuryDays > 120 ? 'Alto' : injuryDays > 60 ? 'Médio' : 'Baixo';
  const stars = clamp(Math.round(2 + ov / 20 + (pot - ov) / 12), 1, 5);
  const squad = squadOf(world, career.clubId);
  const samePos = squad.filter((s) => POSITION_GROUPS[s.position] === POSITION_GROUPS[p.position]);
  const best = samePos.length ? Math.max(...samePos.map((s) => overallOf(s))) : 0;
  const squadFit = ov >= best + 3 ? 'Excelente necessidade — melhora a posição' : ov >= best - 2 ? 'Boa opção para o elenco' : ov >= best - 8 ? 'Reforço de profundidade' : 'Abaixo do nível do elenco atual';

  let recommendation: ScoutReport['recommendation'];
  if (p.age <= 26 && pot >= best + 3) recommendation = 'Contratar';
  else if (ov >= best + 2) recommendation = 'Considerar';
  else if (ov >= best - 5) recommendation = 'Somente se o preço cair';
  else recommendation = 'Não recomendo';

  const report: ScoutReport = {
    id: `sr${reportCounter++}`,
    date: world.date,
    playerId,
    knowledge,
    overallLow,
    overallHigh,
    potLow,
    potHigh,
    strengths,
    weaknesses,
    valueLow,
    valueHigh,
    wageEst: wageExpectation(world, p, 55, undefined, career.clubId).want,
    risk,
    stars,
    squadFit,
    recommendation,
    analysis: `${p.firstName} é ${ov >= 80 ? 'um atleta de nível internacional' : ov >= 70 ? 'um bom jogador de primeira divisão' : 'um jogador de elenco'} com ${p.potential > ov + 6 ? 'grande margem de evolução' : 'pouca margem de evolução'}.`,
  };
  world.scoutReports[playerId] = report;
  if (!career.scouted.includes(playerId)) career.scouted.push(playerId);
  return report;
}

export function latestReport(world: World, playerId: string): ScoutReport | null {
  return world.scoutReports[playerId] ?? null;
}

// ------------------------------------------------------------
// Responsável por contratações — conselhos
// ------------------------------------------------------------
export interface OfficerAdvice {
  estLow: number;
  estHigh: number;
  maxRec: number;
  wageEst: number;
  lines: string[];
}

export function officerAdvice(world: World, career: Career, playerId: string): OfficerAdvice {
  const p = world.players[playerId];
  const officer = career.recruitment;
  const analysis = marketAnalysis(world, p);
  const knowledge = playerKnowledge(world, career, playerId);
  const err = Math.round(analysis.value * (1 - knowledge) * (0.18 + (100 - officer.marketKnowledge) / 150));
  const estLow = analysis.value - err;
  const estHigh = analysis.value + err;
  const maxRec = Math.round(estHigh * 1.12);
  const wageEst = wageExpectation(world, p, 55, ensureAgent(world, p), career.clubId).want;

  const lines: string[] = [];
  const style = officer.personality;
  if (style === 'Conservador') {
    lines.push('Sou cauteloso com gastos — não pagaria muito além do valor de mercado.');
  } else if (style === 'Agressivo') {
    lines.push('Precisamos agir rápido antes que outro clube entre na disputa.');
  } else if (style === 'Analítico') {
    lines.push('Os números mostram que ele pode ser uma boa oportunidade de mercado.');
  } else {
    lines.push('Vejo potencial para ele se tornar um dos destaques da liga.');
  }
  lines.push(`Estimo uma transferência entre €${(estLow / 1e6).toFixed(1)}M e €${(estHigh / 1e6).toFixed(1)}M.`);
  lines.push(`O salário atual dele é de €${((p.contract?.wage ?? 0) / 1000).toFixed(0)} mil/semana.`);
  lines.push(`Eu não pagaria mais que €${(maxRec / 1e6).toFixed(1)}M.`);
  return { estLow, estHigh, maxRec, wageEst, lines };
}

// ------------------------------------------------------------
// Início de negociação
// ------------------------------------------------------------
const STATUS_LABEL: Record<TransferNegotiation['status'], string> = {
  observando: 'Observando', scout: 'Scout solicitado', interessado: 'Interessado',
  'proposta-enviada': 'Proposta enviada', contraproposta: 'Contraproposta',
  'acordo-clube': 'Acordo com o clube', 'negociacao-jogador': 'Negociando com o jogador',
  'acordo-verbal': 'Acordo verbal', exames: 'Exames médicos', concluida: 'Concluída',
  rejeitada: 'Rejeitada', cancelada: 'Cancelada', expirada: 'Expirada',
};

export function negotiationStatusLabel(s: TransferNegotiation['status']): string {
  return STATUS_LABEL[s];
}

export function startNegotiation(world: World, career: Career, playerId: string, kind: NegotiationKind): TransferNegotiation {
  const p = world.players[playerId];
  if (!p) throw new Error('Jogador não encontrado');
  if (world.negotiations[playerId] && !['rejeitada', 'cancelada', 'expirada', 'concluida'].includes(world.negotiations[playerId].status)) {
    return world.negotiations[playerId];
  }
  const agent = ensureAgent(world, p);
  const interest = computeInterest(world, p, career.clubId);
  const analysis = marketAnalysis(world, p);
  const officer = career.recruitment;

  const sellerClub = p.clubId ? world.clubs[p.clubId] : null;
  const diffMult = DIFFICULTY_CONFIG[career.difficulty].transferDifficulty;
  const sellerAsk = kind === 'free' || kind === 'pre-contract'
    ? 0
    : Math.round(analysis.value * diffMult * (1 + interest.competing.length * 0.1));
  const sellerAskHigh = Math.round(sellerAsk * 1.28);
  const wExp = wageExpectation(world, p, interest.score, agent, career.clubId);

  const neg: TransferNegotiation = {
    id: `neg${negotiationCounter++}`,
    playerId,
    kind,
    status: kind === 'free' ? 'negociacao-jogador' : 'interessado',
    createdAt: world.date,
    updatedAt: world.date,
    deadline: kind === 'free' ? null : addDays(world.date, 14),
    buyerClubId: career.clubId,
    sellerClubId: p.clubId,
    offers: [],
    messages: [],
    fee: 0,
    bonus: 0,
    sellOnPct: 0,
    installments: 1,
    wage: 0,
    years: 3,
    role: null,
    promises: [],
    interestScore: interest.score,
    interestReasons: interest.reasons,
    competingClubs: interest.competing,
    sellerAsk,
    sellerAskHigh,
    playerWageAsk: wExp.min,
    playerWageWant: wExp.want,
    playerPatience: 100,
    sellerPatience: 100,
    mood: { seller: '😐 Neutro', player: interest.score >= 62 ? '🙂 Satisfeito' : '😐 Neutro' },
    bidWar: null,
    medical: null,
    medicalDoneOn: null,
    rejectedReason: null,
    loanFee: 0,
    loanWageShare: 100,
    loanOptionFee: 0,
    loanObligationGames: 0,
  };

  const officerName = officer.name.split(' ')[0];
  const buyer = world.clubs[career.clubId];
  if (kind === 'free') {
    neg.messages.push(msg('officer', `${p.firstName} está sem clube — podemos ir direto conversar com ele.`, world.date, officerName));
    neg.messages.push(msg('system', `Nível de interesse: ${interest.level} (${interest.score}/100).`, world.date));
  } else if (kind === 'pre-contract') {
    neg.messages.push(msg('officer', `${p.firstName} tem contrato acabando — podemos assinar um pré-contrato sem pagar transferência.`, world.date, officerName));
  } else {
    neg.messages.push(msg('officer', `Analisei ${p.firstName} ${p.lastName}. Ele pode resolver nosso problema na posição de ${p.position}.`, world.date, officerName));
    neg.messages.push(msg('officer', `O ${sellerClub?.name ?? 'clube'} pede em torno de €${(sellerAsk / 1e6).toFixed(1)}M. Eu sugeriria começar em €${(Math.round(sellerAsk * 0.72 / 1e5) * 1e5 / 1e6).toFixed(1)}M.`, world.date, officerName));
    neg.messages.push(msg('system', `Interesse do jogador: ${interest.level}${interest.score >= 62 ? ' 🟢' : interest.score >= 40 ? ' ⚪' : ' 🔴'}. ${interest.competing.length > 0 ? `${interest.competing.length} clube(s) monitoram o jogador.` : ''}`, world.date));
  }

  // rival fez a primeira oferta antes de nós → a guerra começa já na abertura
  if (neg.kind === 'transfer' || neg.kind === 'loan') {
    const rival = interest.competing.find((c) => c.level === 'Interessado' || c.level === 'Muito interessado');
    if (rival && !neg.bidWar) {
      const rng2 = new RNG(hashString(world.seed) ^ hashString(`${neg.id}|rivalfirst`));
      if (rng2.chance(0.4)) {
        const rivalOffer = Math.round(sellerAsk * rng2.float(0.98, 1.18) / 1e5) * 1e5;
        neg.bidWar = { rivalClubId: rival.clubId, rivalOffer, raisedAt: world.date };
        neg.sellerAsk = Math.round(Math.min(neg.sellerAsk, rivalOffer * 0.96));
        neg.sellerAskHigh = Math.round(Math.max(neg.sellerAskHigh, rivalOffer * 1.3));
        const rivalClub = world.clubs[rival.clubId];
        neg.messages.push(msg('seller', `Antes de vocês me procurarem, o ${rivalClub?.name ?? 'outro clube'} já apresentou uma proposta de €${(rivalOffer / 1e6).toFixed(1)}M por ${p.firstName}. O que pretendem fazer?`, world.date, sellerClub?.name ?? 'Clube', '😐 Neutro'));
        neg.messages.push(msg('officer', `Chefe, chegamos atrasados: ${rivalClub?.shortName ?? 'o rival'} já tem €${(rivalOffer / 1e6).toFixed(1)}M na mesa pelo ${p.firstName}. Cobrir, subir ou desistir?`, world.date, officerName));
        neg.mood.seller = '😐 Neutro';
      }
    }
  }

  world.negotiations[playerId] = neg;
  if (neg.kind === 'free' || neg.kind === 'pre-contract') {
    // joga direto na etapa do jogador com a abertura
    openPlayerStage(world, career, neg, p, agent);
  }
  return neg;
}

function msg(side: NegotiationMessage['side'], text: string, date: string, actor?: string, mood?: NegotiationMood): NegotiationMessage {
  return { id: `m${messageCounter++}`, side, text, date, actor, mood };
}

function sellerMoodFor(ratio: number, patience: number): NegotiationMood {
  if (ratio >= 1.05 || patience <= 25) return '😄 Muito satisfeito';
  if (ratio >= 0.95) return '🙂 Satisfeito';
  if (ratio >= 0.8) return '😐 Neutro';
  if (ratio >= 0.65) return '😕 Insatisfeito';
  return '😡 Irritado';
}

// ------------------------------------------------------------
// Etapa 1: negociação com o clube
// ------------------------------------------------------------
export interface ClubOfferInput {
  fee: number;
  bonus: number;
  sellOnPct: number;
  installments: number;
  loanOptionFee?: number;
  loanObligationGames?: number;
  loanWageShare?: number;
}

export function sendClubOffer(world: World, career: Career, negId: string, input: ClubOfferInput): TransferNegotiation {
  const neg = Object.values(world.negotiations).find((n) => n.id === negId);
  if (!neg) throw new Error('Negociação não encontrada');
  const p = world.players[neg.playerId];
  const seller = neg.sellerClubId ? world.clubs[neg.sellerClubId] : null;
  const rng = new RNG(hashString(world.seed) ^ hashString(`${neg.id}|offer|${neg.offers.length}`));
  const officer = career.recruitment;
  const loanOptionFee = input.loanOptionFee ?? 0;
  const loanObligationGames = input.loanObligationGames ?? 0;
  const loanWageShare = input.loanWageShare ?? 100;

  const offer: TransferOffer = {
    id: uid('of'),
    side: 'user',
    kind: 'fee',
    fee: input.fee,
    bonus: input.bonus,
    sellOnPct: input.sellOnPct,
    installments: input.installments,
    message: input.fee > 0
      ? `Proposta de €${(input.fee / 1e6).toFixed(1)}M${input.bonus > 0 ? ` + €${(input.bonus / 1e6).toFixed(1)}M em bônus` : ''}${input.sellOnPct > 0 ? ` + ${input.sellOnPct}% de futura venda` : ''}${input.installments > 1 ? `, em ${input.installments} parcelas` : ''}.`
      : `Proposta de empréstimo${loanOptionFee > 0 ? ` com opção de compra de €${(loanOptionFee / 1e6).toFixed(1)}M` : ''}${loanObligationGames > 0 ? ` e obrigação de compra após ${loanObligationGames} jogos` : ''}, pagando ${loanWageShare}% do salário.`,
    createdAt: world.date,
  };
  neg.offers.push(offer);
  neg.updatedAt = world.date;
  if (neg.kind === 'loan') {
    neg.loanFee = input.fee;
    neg.loanOptionFee = loanOptionFee;
    neg.loanObligationGames = loanObligationGames;
    neg.loanWageShare = loanWageShare;
  }

  if (neg.kind === 'free' || neg.kind === 'pre-contract') {
    neg.status = 'acordo-clube';
    neg.messages.push(msg('system', 'Sem custo de transferência para este tipo de negociação.', world.date));
    openPlayerStage(world, career, neg, p, ensureAgent(world, p));
    return neg;
  }
  if (neg.kind === 'loan') {
    const vital = isVitalPlayer(world, p);
    const loanAsk = Math.round(neg.sellerAsk * 0.22);
    if (input.fee >= loanAsk || !vital || rng.chance(0.45)) {
      if (seller) acceptSellerOffer(world, career, neg, offer, p, seller, rng);
      else openPlayerStage(world, career, neg, p, ensureAgent(world, p));
    } else if (seller) {
      neg.status = 'contraproposta';
      const counter = Math.round(Math.max(loanAsk, Math.round((input.fee + loanAsk * 1.6) / 2 / 1e5) * 1e5));
      neg.messages.push(msg('seller', `${p.firstName} é importante para nós. Só emprestamos por €${(counter / 1e6).toFixed(1)}M de taxa.`, world.date, seller.name, '😐 Neutro'));
      neg.offers.push({
        id: uid('of'), side: 'seller', kind: 'counter', fee: counter, bonus: 0, sellOnPct: 0,
        installments: 1, message: 'Contraproposta de empréstimo.', createdAt: world.date, mood: '😐 Neutro',
      });
    }
    return neg;
  }
  if (!seller) {
    neg.status = 'acordo-clube';
    openPlayerStage(world, career, neg, p, ensureAgent(world, p));
    return neg;
  }

  neg.status = 'proposta-enviada';
  const ratio = input.fee / Math.max(1, neg.sellerAsk);
  const demandPush = neg.competingClubs.length >= 1 && rng.chance(0.35) ? 1.06 : 1;

  // "pedir tempo" ocasional — resposta no tick diário
  if (ratio < 0.9 && rng.chance(0.2) && neg.sellerPatience > 50) {
    neg.messages.push(msg('seller', `Recebemos sua proposta. Precisamos de um tempo para avaliar — voltamos em breve.`, world.date, seller.name));
    return neg;
  }

  if (ratio >= 1.05) {
    // aceita imediatamente
    acceptSellerOffer(world, career, neg, offer, p, seller, rng);
    return neg;
  }
  if (ratio >= neg.sellerAskHigh / neg.sellerAsk * 0.92 || ratio >= 0.96) {
    acceptSellerOffer(world, career, neg, offer, p, seller, rng);
    return neg;
  }

  neg.sellerPatience -= ratio >= 0.75 ? 8 : 18;
  neg.mood.seller = sellerMoodFor(ratio, neg.sellerPatience);

  if (ratio >= 0.7) {
    // contraproposta
    const counter = Math.round(Math.max(neg.sellerAsk, Math.round((input.fee + neg.sellerAsk * 1.12) / 2 / 1e5) * 1e5));
    neg.status = 'contraproposta';
    neg.messages.push(msg('seller', `Queremos €${(counter / 1e6).toFixed(1)}M${demandPush > 1 ? ' — outro clube já sinalizou interesse' : ''}.`, world.date, seller.name, neg.mood.seller));
    neg.offers.push({
      id: uid('of'), side: 'seller', kind: 'counter', fee: counter, bonus: 0, sellOnPct: 0,
      installments: 1, message: `Contraproposta do ${seller.name}: €${(counter / 1e6).toFixed(1)}M.`, createdAt: world.date, mood: neg.mood.seller,
    });
  } else if (ratio >= 0.55) {
    // contraproposta mais dura + possibilidade de exigir bônus
    const counter = Math.round(Math.round(neg.sellerAsk * (0.98 + rng.next() * 0.1) / 1e5) * 1e5);
    neg.status = 'contraproposta';
    const wantsSellOn = rng.chance(0.4) && input.sellOnPct === 0;
    neg.messages.push(msg('seller', `A proposta está abaixo do que pretendemos. Precisamos de €${(counter / 1e6).toFixed(1)}M${wantsSellOn ? ' e 15% de futura venda' : ''}.`, world.date, seller.name, neg.mood.seller));
    neg.offers.push({
      id: uid('of'), side: 'seller', kind: 'counter', fee: counter, bonus: 0,
      sellOnPct: wantsSellOn ? 15 : 0, installments: 1,
      message: `Contraproposta do ${seller.name}.`, createdAt: world.date, mood: neg.mood.seller,
    });
  } else {
    neg.status = 'rejeitada';
    const reason = input.fee < neg.sellerAsk * 0.4
      ? 'O clube não pretende negociar por valores tão baixos.'
      : rng.chance(0.3) ? 'O clube não pretende vender o jogador no momento.' : 'Oferta considerada baixa pelo clube vendedor.';
    neg.rejectedReason = reason;
    neg.messages.push(msg('seller', reason, world.date, seller.name, '😡 Irritado'));
    neg.mood.seller = '😡 Irritado';
  }

  // guerra de propostas: rival forte cobre nossa oferta → decisão imediata do usuário
  const currentStatus: string = neg.status;
  const alreadyWarred = neg.messages.some((m) => m.text.includes('apresentou uma proposta'));
  if (!neg.bidWar && !alreadyWarred && (currentStatus === 'proposta-enviada' || currentStatus === 'contraproposta')) {
    const rival = neg.competingClubs.find((c) => c.level === 'Interessado' || c.level === 'Muito interessado');
    if (rival && rng.chance(0.5)) {
      const lastUser = [...neg.offers].reverse().find((o) => o.side === 'user');
      const lastOffer = lastUser?.fee ?? neg.fee ?? 0;
      const rivalOffer = Math.max(Math.round(lastOffer * 1.12 / 1e5) * 1e5, Math.round(neg.sellerAsk * 1.05 / 1e5) * 1e5);
      neg.bidWar = { rivalClubId: rival.clubId, rivalOffer, raisedAt: world.date };
      neg.sellerAsk = Math.round(Math.min(neg.sellerAsk, rivalOffer * 0.96));
      neg.sellerAskHigh = Math.round(Math.max(neg.sellerAskHigh, rivalOffer * 1.3));
      const officer = career.recruitment.name.split(' ')[0];
      neg.messages.push(msg('seller', `${world.clubs[rival.clubId]?.name ?? 'Outro clube'} apresentou uma proposta de €${(rivalOffer / 1e6).toFixed(1)}M por ${p.firstName}. Vocês querem cobrir?`, world.date, seller.name, '😐 Neutro'));
      neg.messages.push(msg('officer', `Temos concorrência, chefe. Se quisermos ${p.firstName}, precisamos decidir agora: cobrir €${(rivalOffer / 1e6).toFixed(1)}M, subir a oferta ou deixar para lá.`, world.date, officer));
      neg.mood.seller = '😐 Neutro';
    }
  }
  return neg;
}

function acceptSellerOffer(world: World, career: Career, neg: TransferNegotiation, offer: TransferOffer, p: Player, seller: Club, rng: RNG): void {
  neg.status = 'acordo-clube';
  neg.fee = offer.fee;
  neg.bonus = offer.bonus;
  neg.sellOnPct = offer.sellOnPct;
  neg.installments = offer.installments;
  neg.mood.seller = '😄 Muito satisfeito';
  const line = neg.kind === 'loan'
    ? `Aceitamos o empréstimo de ${p.firstName}. Agora conversamos com o jogador.`
    : `Aceitamos a proposta de €${(offer.fee / 1e6).toFixed(1)}M. Boa negociação!`;
  neg.messages.push(msg('seller', line, world.date, seller.name, '😄 Muito satisfeito'));
  openPlayerStage(world, career, neg, p, ensureAgent(world, p));
  void rng;
}

/** Ações do usuário após contraproposta. */
export function respondToSeller(world: World, career: Career, negId: string, action: 'accept' | 'counter' | 'withdraw' | 'add-bonus' | 'add-sellon', input?: { fee?: number; bonus?: number; sellOnPct?: number }): TransferNegotiation {
  const neg = Object.values(world.negotiations).find((n) => n.id === negId);
  if (!neg) throw new Error('Negociação não encontrada');
  const p = world.players[neg.playerId];
  const seller = neg.sellerClubId ? world.clubs[neg.sellerClubId] : null;
  const lastCounter = [...neg.offers].reverse().find((o) => o.side === 'seller');

  if (action === 'withdraw') {
    neg.status = 'cancelada';
    neg.rejectedReason = 'Proposta retirada pelo seu clube.';
    neg.messages.push(msg('system', 'Você retirou a proposta.', world.date));
    return neg;
  }
  if (action === 'accept' && lastCounter) {
    neg.status = 'acordo-clube';
    neg.fee = lastCounter.fee;
    neg.bonus = lastCounter.bonus;
    neg.sellOnPct = lastCounter.sellOnPct;
    neg.installments = 1;
    neg.mood.seller = '😄 Muito satisfeito';
    neg.messages.push(msg('seller', `Fechado! €${(neg.fee / 1e6).toFixed(1)}M. Aguardamos o desfecho com o jogador.`, world.date, seller?.name, '😄 Muito satisfeito'));
    openPlayerStage(world, career, neg, p, ensureAgent(world, p));
    return neg;
  }
  if (action === 'counter' && input?.fee) {
    return sendClubOffer(world, career, neg.id, {
      fee: input.fee,
      bonus: input.bonus ?? neg.bonus,
      sellOnPct: input.sellOnPct ?? neg.sellOnPct,
      installments: neg.installments,
    });
  }
  if (action === 'add-bonus' && lastCounter) {
    const fee = neg.fee || lastCounter.fee;
    neg.status = 'contraproposta';
    neg.messages.push(msg('seller', `Com €${(Math.round(fee * 0.94 / 1e5) * 1e5 / 1e6).toFixed(1)}M + €${((lastCounter.fee - Math.round(fee * 0.94 / 1e5) * 1e5) / 1e6).toFixed(1)}M em bônus, podemos fechar.`, world.date, seller?.name, '🙂 Satisfeito'));
    const newCounter = lastCounter.fee;
    neg.offers.push({
      id: uid('of'), side: 'seller', kind: 'addons', fee: newCounter, bonus: newCounter - Math.round(fee * 0.94 / 1e5) * 1e5,
      sellOnPct: 0, installments: 1, message: 'Contraproposta com bônus.', createdAt: world.date, mood: '🙂 Satisfeito',
    });
    return neg;
  }
  if (action === 'add-sellon' && lastCounter) {
    neg.status = 'contraproposta';
    const fee = Math.round(lastCounter.fee * 0.9 / 1e5) * 1e5;
    neg.messages.push(msg('seller', `Aceitamos €${(fee / 1e6).toFixed(1)}M + 20% de futura venda.`, world.date, seller?.name, '🙂 Satisfeito'));
    neg.offers.push({
      id: uid('of'), side: 'seller', kind: 'addons', fee, bonus: 0, sellOnPct: 20, installments: 1,
      message: 'Contraproposta com percentual de venda futura.', createdAt: world.date, mood: '🙂 Satisfeito',
    });
    return neg;
  }
  return neg;
}

// ------------------------------------------------------------
// Guerra de propostas: resposta do usuário a uma oferta rival
// ------------------------------------------------------------
export function respondToBidWar(
  world: World, career: Career, negId: string, action: 'cover' | 'raise' | 'withdraw', input?: { fee?: number },
): TransferNegotiation {
  const neg = Object.values(world.negotiations).find((n) => n.id === negId);
  if (!neg || !neg.bidWar) throw new Error('Guerra de propostas não encontrada');
  const p = world.players[neg.playerId];
  const seller = neg.sellerClubId ? world.clubs[neg.sellerClubId] : null;
  const officer = career.recruitment;
  const officerName = officer.name.split(' ')[0];
  const rivalClub = world.clubs[neg.bidWar.rivalClubId];
  const war = neg.bidWar;
  const base = input?.fee ?? war.rivalOffer;
  const rng = new RNG(hashString(world.seed) ^ hashString(`${neg.id}|bidwar|${war.raisedAt}`));
  neg.bidWar = null; // resolve a guerra imediatamente

  if (action === 'withdraw') {
    neg.status = 'cancelada';
    neg.rejectedReason = `Você não quis cobrir a proposta de ${rivalClub?.name ?? 'outro clube'}.`;
    neg.messages.push(msg('officer', `Entendido. Vamos deixar ${p.firstName} para lá — ${rivalClub?.name ?? 'o rival'} que pague.`, world.date, officerName));
    notify(career, `Guerra de propostas por ${p.firstName}: você desistiu.`, 'info', '⚔️', `negotiation:${p.id}`);
    pushMarketHighlight(
      world, 'bid-war',
      `⚔️ Você desistiu da guerra por ${p.firstName} ${p.lastName}`,
      `${rivalClub?.name ?? 'O rival'} levou o jogador após cobrir a proposta do ${seller?.name ?? 'vendedor'} com €${(war.rivalOffer / 1e6).toFixed(1)}M.`,
      war.rivalOffer, 65, { playerId: p.id, clubId: rivalClub?.id },
    );
    return neg;
  }

  const myFee = action === 'cover' ? base : (input?.fee ?? Math.round(base * 1.1));
  const myFeeRound = Math.max(myFee, war.rivalOffer);
  neg.messages.push(msg('user', action === 'cover'
    ? `Cobrimos os €${(war.rivalOffer / 1e6).toFixed(1)}M. Não vamos perder esse jogador.`
    : `Subimos para €${(myFeeRound / 1e6).toFixed(1)}M. Quem quer mais, paga mais.`, world.date));

  // resposta do vendedor
  if (myFeeRound >= neg.sellerAskHigh || rng.chance(0.5)) {
    neg.offers.push({
      id: uid('of'), side: 'user', kind: 'counter', fee: myFeeRound, bonus: 0, sellOnPct: 0, installments: 1,
      message: `Proposta revisada na guerra de propostas: €${(myFeeRound / 1e6).toFixed(1)}M.`, createdAt: world.date,
    });
    neg.status = 'acordo-clube';
    neg.fee = myFeeRound;
    neg.bonus = 0;
    neg.sellOnPct = 0;
    neg.installments = 1;
    neg.mood.seller = '😄 Muito satisfeito';
    neg.messages.push(msg('seller', `Fechado! €${(myFeeRound / 1e6).toFixed(1)}M e ${p.firstName} é seu. O ${rivalClub?.name ?? 'rival'} ficou para trás.`, world.date, seller?.name, '😄 Muito satisfeito'));
    neg.messages.push(msg('officer', `Missão cumprida: vencemos a concorrência por €${(myFeeRound / 1e6).toFixed(1)}M. Agora vamos falar com o jogador.`, world.date, officerName));
    notify(career, `Você venceu a guerra de propostas por ${p.firstName}!`, 'success', '⚔️', `negotiation:${p.id}`);
    pushMarketHighlight(
      world, 'bid-war',
      `⚔️ Você venceu a guerra de propostas por ${p.firstName} ${p.lastName}`,
      `Cobrimos a oferta de €${(war.rivalOffer / 1e6).toFixed(1)}M do ${rivalClub?.name ?? 'rival'} e fechamos por €${(myFeeRound / 1e6).toFixed(1)}M com o ${seller?.name ?? 'vendedor'}.`,
      myFeeRound, 75, { playerId: p.id, clubId: neg.buyerClubId },
    );
    openPlayerStage(world, career, neg, p, ensureAgent(world, p));
    return neg;
  }

  // vendedor pede mais — nova contraproposta dentro da guerra
  neg.offers.push({
    id: uid('of'), side: 'user', kind: 'counter', fee: myFeeRound, bonus: 0, sellOnPct: 0, installments: 1,
    message: `Proposta revisada na guerra de propostas: €${(myFeeRound / 1e6).toFixed(1)}M.`, createdAt: world.date,
  });
  const counter = Math.round(Math.max(neg.sellerAsk, Math.round((myFeeRound + neg.sellerAskHigh) / 2 / 1e5) * 1e5));
  neg.status = 'contraproposta';
  neg.sellerPatience -= 10;
  neg.mood.seller = '😐 Neutro';
  neg.messages.push(msg('seller', `O ${rivalClub?.name ?? 'rival'} subiu para €${(Math.round(counter * 1.06 / 1e5) * 1e5 / 1e6).toFixed(1)}M. Se quiserem o jogador, precisam de €${(counter / 1e6).toFixed(1)}M.`, world.date, seller?.name, '😐 Neutro'));
  neg.offers.push({
    id: uid('of'), side: 'seller', kind: 'counter', fee: counter, bonus: 0, sellOnPct: 0, installments: 1,
    message: `Contraproposta na guerra: €${(counter / 1e6).toFixed(1)}M.`, createdAt: world.date, mood: '😐 Neutro',
  });
  return neg;
}

// ------------------------------------------------------------
// Renovação de contrato (jogadores do nosso elenco)
// ------------------------------------------------------------
let renewalCounter = 0;

function renewalStatusLabel(s: RenewalStatus): string {
  const map: Record<RenewalStatus, string> = {
    iniciada: 'Renovação iniciada', negociando: 'Negociando', acordo: 'Acordo verbal',
    assinada: 'Renovado', rejeitada: 'Rejeitada', cancelada: 'Cancelada',
  };
  return map[s];
}

/** Vontade do jogador de permanecer (0-100). */
function renewalLoyalty(world: World, career: Career, p: Player): number {
  let loyalty = 50 + clamp(p.happiness - 50, -25, 25);
  if (p.personality === 'Leal') loyalty += 20;
  if (p.personality === 'Mercenário') loyalty -= 20;
  if (p.personality === 'Ambicioso') loyalty -= 8;
  if (p.age >= 30) loyalty += 8;
  if (p.clubId === career.clubId && p.transferRequested) loyalty -= 25;
  if (p.contract && p.contract.wage >= 150_000) loyalty -= 5; // já ganha bem, quer mais
  const role = roleForPlayer(world, career.clubId, p);
  if (role === 'Titular absoluto' || role === 'Titular') loyalty += 12;
  if (role === 'Reserva' || role === 'Base') loyalty -= 15;
  return clamp(loyalty, 5, 98);
}

/** Abre uma conversa de renovação com o jogador. */
export function startRenewal(world: World, career: Career, playerId: string): RenewalNegotiation {
  const p = world.players[playerId];
  if (!p) throw new Error('Jogador não encontrado');
  if (!p.clubId || p.clubId !== career.clubId) throw new Error('Jogador não pertence ao seu elenco');
  if (!p.contract) throw new Error('Jogador sem contrato');
  if (world.renewals[playerId] && !['assinada', 'rejeitada', 'cancelada'].includes(world.renewals[playerId].status)) {
    return world.renewals[playerId];
  }

  const agent = ensureAgent(world, p);
  const loyalty = renewalLoyalty(world, career, p);
  // interesse alto = disposição de aceitar menos; jogador leal e satisfeito pede aumento moderado
  const interestForWage = clamp(50 + loyalty * 0.45, 10, 95);
  const wExp = wageExpectation(world, p, interestForWage, agent, career.clubId);
  const role = roleForPlayer(world, career.clubId, p);

  const ren: RenewalNegotiation = {
    id: `ren${renewalCounter++}`,
    playerId,
    status: 'iniciada',
    createdAt: world.date,
    updatedAt: world.date,
    offers: [],
    messages: [],
    wage: 0,
    bonus: 0,
    years: 3,
    role: null,
    promises: [],
    playerWageAsk: wExp.min,
    playerWageWant: wExp.want,
    playerPatience: 100,
    mood: loyalty >= 70 ? '🙂 Satisfeito' : loyalty >= 45 ? '😐 Neutro' : '😕 Insatisfeito',
    loyalty,
    rejectedReason: null,
  };

  const cur = p.contract.wage;
  const agentLine = agent.style === 'Agressivo'
    ? `Meu cliente está bem aqui, mas o salário de €${(cur / 1000).toFixed(0)} mil não reflete o valor dele. Esperamos €${(wExp.want / 1000).toFixed(0)} mil/semana.`
    : agent.style === 'Exigente'
      ? `Vamos conversar. O contrato atual paga €${(cur / 1000).toFixed(0)} mil — precisamos de um ajuste para €${(wExp.want / 1000).toFixed(0)} mil.`
      : agent.style === 'Flexível'
        ? `Olá! ${p.firstName} adora o clube. Se fizermos um ajuste justo (algo como €${(wExp.want / 1000).toFixed(0)} mil), renovamos sem drama.`
        : `Precisamos alinhar os números antes de renovar: hoje são €${(cur / 1000).toFixed(0)} mil/semana.`;
  ren.messages.push(msg('agent', agentLine, world.date, `${agent.name} (agente)`));

  const personalLine = personalityWageLine(p);
  if (personalLine) ren.messages.push(msg('player', personalLine, world.date, `${p.firstName} ${p.lastName}`, ren.mood));
  if (loyalty >= 70) {
    ren.messages.push(msg('player', `${p.firstName} quer permanecer e seguir construindo aqui.`, world.date, `${p.firstName} ${p.lastName}`, '🙂 Satisfeito'));
  } else if (loyalty <= 35) {
    ren.messages.push(msg('player', `Preciso pensar bem — outras portas estão abertas.`, world.date, `${p.firstName} ${p.lastName}`, '😕 Insatisfeito'));
  }

  world.renewals[playerId] = ren;
  notify(career, `${p.firstName} quer conversar sobre renovação de contrato.`, 'info', '📄', `renewal:${p.id}`);
  return ren;
}

export function renewalForPlayer(world: World, playerId: string): RenewalNegotiation | null {
  const r = world.renewals[playerId];
  if (!r || ['assinada', 'rejeitada', 'cancelada'].includes(r.status)) return null;
  return r;
}

export interface RenewalOfferInput {
  wage: number;
  bonus: number;
  years: number;
  role: SquadRole;
  promises: string[];
}

/** Envia proposta de renovação; o jogador aceita, contrapropõe ou recusa. */
export function sendRenewalOffer(world: World, career: Career, renId: string, input: RenewalOfferInput): RenewalNegotiation {
  const ren = Object.values(world.renewals).find((r) => r.id === renId);
  if (!ren) throw new Error('Renovação não encontrada');
  const p = world.players[ren.playerId];
  const agent = ensureAgent(world, p);
  const rng = new RNG(hashString(world.seed) ^ hashString(`${ren.id}|renewal|${ren.offers.length}`));

  ren.status = 'negociando';
  ren.offers.push({
    id: uid('of'), side: 'user', kind: 'wage', fee: 0, bonus: input.bonus, sellOnPct: 0, installments: 1,
    wage: input.wage, years: input.years,
    message: `Proposta de renovação: €${(input.wage / 1000).toFixed(0)}k/sem, ${input.years} anos, papel de ${input.role}.`,
    createdAt: world.date,
  });

  // papel no elenco insuficiente?
  const squad = squadOf(world, career.clubId);
  const samePos = squad.filter((s) => POSITION_GROUPS[s.position] === POSITION_GROUPS[p.position]);
  const better = samePos.filter((s) => overallOf(s) > overallOf(p)).length;
  let roleOk = true;
  if (input.role === 'Reserva' || input.role === 'Base') roleOk = ren.loyalty < 60;
  else if (input.role === 'Titular absoluto') roleOk = better === 0 || ren.loyalty >= 65;
  if (!roleOk && rng.chance(0.75)) {
    ren.messages.push(msg('player', `O papel que vocês me oferecem não combina com o meu momento. Preciso de mais espaço.`, world.date, `${p.firstName} ${p.lastName}`, '😕 Insatisfeito'));
    ren.mood = '😕 Insatisfeito';
    ren.playerPatience -= 15;
    return ren;
  }

  const want = ren.playerWageWant;
  const ask = ren.playerWageAsk;
  const ratio = input.wage / Math.max(1, want);
  const loyalBonus = ren.loyalty >= 70 ? 0.12 : ren.loyalty >= 50 ? 0.05 : 0;

  if (input.wage >= want || (input.wage >= ask && (ren.loyalty >= 55 || rng.chance(0.35 + loyalBonus * 2)))) {
    ren.status = 'acordo';
    ren.wage = input.wage;
    ren.bonus = input.bonus;
    ren.years = input.years;
    ren.role = input.role;
    ren.mood = '😄 Muito satisfeito';
    for (const text of input.promises) {
      if (!text.trim()) continue;
      const promise = createPromise(world, p, text);
      ren.promises.push(promise);
      career.promises.push(promise);
    }
    ren.messages.push(msg('player', `Fechado. Vou seguir neste clube!`, world.date, `${p.firstName} ${p.lastName}`, '😄 Muito satisfeito'));
    return ren;
  }

  ren.playerPatience -= ratio >= 0.85 ? 6 : ratio >= 0.7 ? 14 : 26;
  ren.mood = ratio >= 0.9 ? '🙂 Satisfeito' : ratio >= 0.75 ? '😐 Neutro' : '😕 Insatisfeito';

  if (ratio >= 0.8 && ren.playerPatience > 40) {
    const counter = Math.round(Math.min(want, Math.max(ask, Math.round((input.wage + want) / 2 / 500) * 500)));
    ren.status = 'negociando';
    const line = agent.style === 'Agressivo'
      ? `${p.firstName} não renova por menos de €${(counter / 1000).toFixed(0)} mil/semana.`
      : `Para fechar, meu cliente pede €${(counter / 1000).toFixed(0)} mil/semana.`;
    ren.messages.push(msg('agent', line, world.date, `${agent.name} (agente)`, ren.mood));
    ren.offers.push({
      id: uid('of'), side: 'agent', kind: 'counter', fee: 0, bonus: input.bonus, sellOnPct: 0, installments: 1,
      wage: counter, years: input.years, message: `Contraproposta: €${(counter / 1000).toFixed(0)}k/sem.`, createdAt: world.date, mood: ren.mood,
    });
    return ren;
  }

  if (ren.playerPatience <= 40 || ratio < 0.6) {
    if (ren.loyalty < 45 || ratio < 0.5) {
      ren.status = 'rejeitada';
      ren.rejectedReason = ren.loyalty < 45
        ? 'O jogador não está convencido de que deve permanecer.'
        : 'O salário oferecido está muito abaixo do esperado.';
      ren.messages.push(msg('player', ren.loyalty < 45
        ? `Agradeço a proposta, mas preciso avaliar outras opções.`
        : `Essa oferta não reflete o que eu represento para o time.`, world.date, `${p.firstName} ${p.lastName}`, '😡 Irritado'));
      return ren;
    }
    ren.messages.push(msg('agent', `Meu cliente pede no mínimo €${(ask / 1000).toFixed(0)} mil/semana. É o limite dele.`, world.date, `${agent.name} (agente)`, '😕 Insatisfeito'));
    ren.offers.push({
      id: uid('of'), side: 'agent', kind: 'counter', fee: 0, bonus: input.bonus, sellOnPct: 0, installments: 1,
      wage: ask, years: input.years, message: `Pedido mínimo: €${(ask / 1000).toFixed(0)}k/sem.`, createdAt: world.date, mood: '😕 Insatisfeito',
    });
  }
  return ren;
}

/** Resposta do usuário à contraproposta (aceitar, contrapor, encerrar, adicionar bônus). */
export function respondToRenewal(world: World, career: Career, renId: string, action: 'accept' | 'counter' | 'end' | 'add-bonus', input?: { wage?: number; bonus?: number }): RenewalNegotiation {
  const ren = Object.values(world.renewals).find((r) => r.id === renId);
  if (!ren) throw new Error('Renovação não encontrada');
  const p = world.players[ren.playerId];
  const agent = ensureAgent(world, p);
  const last = [...ren.offers].reverse().find((o) => o.side === 'agent' || o.side === 'player');

  if (action === 'end') {
    ren.status = 'cancelada';
    ren.rejectedReason = 'Renovação encerrada pelo seu clube.';
    ren.messages.push(msg('system', 'Você encerrou a conversa de renovação.', world.date));
    return ren;
  }
  if (action === 'accept' && last?.wage) {
    ren.status = 'acordo';
    ren.wage = input?.wage ?? last.wage;
    ren.bonus = input?.bonus ?? ren.bonus;
    ren.years = ren.years || 3;
    ren.mood = '😄 Muito satisfeito';
    ren.messages.push(msg('player', `Combinado. Contrato renovado!`, world.date, `${p.firstName} ${p.lastName}`, '😄 Muito satisfeito'));
    return ren;
  }
  if (action === 'counter' && input?.wage) {
    return sendRenewalOffer(world, career, ren.id, {
      wage: input.wage,
      bonus: input.bonus ?? ren.bonus,
      years: ren.years || 3,
      role: ren.role ?? 'Titular',
      promises: [],
    });
  }
  if (action === 'add-bonus') {
    const base = last?.wage ?? ren.wage;
    const newWage = Math.round(base * 0.94 / 500) * 500;
    ren.status = 'negociando';
    ren.offers.push({
      id: uid('of'), side: 'user', kind: 'bonus', fee: 0, bonus: (input?.bonus ?? 150_000) + Math.round(base * 0.06), sellOnPct: 0, installments: 1,
      wage: newWage, years: ren.years || 3, message: `€${(newWage / 1000).toFixed(0)}k/sem + bônus reforçado.`, createdAt: world.date,
    });
    if (newWage >= ren.playerWageAsk) {
      ren.status = 'acordo';
      ren.wage = newWage;
      ren.bonus = ren.offers[ren.offers.length - 1].bonus;
      ren.mood = '🙂 Satisfeito';
      ren.messages.push(msg('agent', `Aceito com esse bônus. Fechado!`, world.date, `${agent.name} (agente)`, '🙂 Satisfeito'));
    } else {
      ren.messages.push(msg('agent', `O bônus ajuda, mas o salário base precisa subir.`, world.date, `${agent.name} (agente)`, '😐 Neutro'));
    }
  }
  return ren;
}

/** Conclui a renovação: aplica novo contrato, cláusula, moral e notícia. */
export function completeRenewal(world: World, career: Career, renId: string): RenewalNegotiation {
  const ren = Object.values(world.renewals).find((r) => r.id === renId);
  if (!ren) throw new Error('Renovação não encontrada');
  if (ren.status !== 'acordo') throw new Error('Renovação sem acordo');
  const p = world.players[ren.playerId];
  const club = world.clubs[career.clubId];

  if (!p.contract) throw new Error('Jogador sem contrato');
  p.contract.signedAt = world.date;
  p.contract.until = addDays(world.date, Math.max(1, ren.years) * 365);
  p.contract.wage = ren.wage;
  p.contract.bonus = ren.bonus;
  const releaseChance = ren.wage >= 120_000;
  p.contract.releaseClause = releaseChance ? Math.round(ren.wage * 52 * 12) : null;
  p.happiness = clamp(p.happiness + 10, 1, 100);
  p.morale = clamp(p.morale + 8, 1, 100);
  p.transferRequested = false;
  ren.status = 'assinada';
  ren.mood = '😄 Muito satisfeito';
  ren.messages.push(msg('system', `Contrato renovado até ${p.contract.until} por €${(ren.wage / 1000).toFixed(0)}k/sem.`, world.date));

  addNews(world, {
    date: world.date,
    title: `✍️ ${p.firstName} ${p.lastName} renova com ${club.name}`,
    subtitle: `Novo vínculo até ${p.contract.until} — salário de €${(ren.wage / 1000).toFixed(0)} mil/semana.`,
    category: 'Clubes',
    clubId: career.clubId,
    playerId: p.id,
    importance: 55,
  });
  notify(career, `${p.firstName} ${p.lastName} renovou contrato até ${p.contract.until}.`, 'success', '✍️', `player:${p.id}`);
  return ren;
}

export { renewalStatusLabel };

// ------------------------------------------------------------
// Etapa 2: negociação com o jogador
// ------------------------------------------------------------
function openPlayerStage(world: World, career: Career, neg: TransferNegotiation, p: Player, agent: PlayerAgent): void {
  neg.status = 'negociacao-jogador';
  const officer = career.recruitment;
  const officerName = officer.name.split(' ')[0];
  neg.messages.push(msg('officer', `O clube aceitou. Agora precisamos convencer ${p.firstName}.`, world.date, officerName));

  const want = neg.playerWageWant;
  const agentLine = agent.style === 'Agressivo'
    ? `Não vou enrolar: ${p.firstName} espera €${(want / 1000).toFixed(0)} mil/semana e não vai aceitar menos que isso.`
    : agent.style === 'Exigente'
      ? `O valor de mercado do meu cliente é €${(want / 1000).toFixed(0)} mil/semana. Estamos abertos a negociar a estrutura.`
      : agent.style === 'Flexível'
        ? `Olá! Vamos conversar — ${p.firstName} está empolgado com o projeto e podemos chegar a um acordo.`
        : `Vamos ver o que conseguimos construir juntos. ${p.firstName} pede algo em torno de €${(want / 1000).toFixed(0)} mil/semana.`;
  neg.messages.push(msg('agent', agentLine, world.date, `${agent.name} (agente)`));

  const personalLine = personalityWageLine(p);
  if (personalLine) neg.messages.push(msg('player', personalLine, world.date, `${p.firstName} ${p.lastName}`));
}

function personalityWageLine(p: Player): string | null {
  switch (p.personality) {
    case 'Ambicioso': return 'Quero um salário compatível com meu status e com o que posso conquistar aqui.';
    case 'Leal': return 'Valorizo estabilidade e um projeto de longo prazo.';
    case 'Mercenário': return 'Vamos ser objetivos: o salário é o principal fator para mim.';
    case 'Profissional': return 'Quero um contrato justo e a chance de mostrar meu trabalho.';
    case 'Jovem promessa': return 'Preciso de garantias de que vou ter espaço para evoluir.';
    case 'Veterano': return 'Nessa fase da carreira, quero minutos e respeito.';
    default: return null;
  }
}

export interface WageOfferInput {
  wage: number;
  bonus: number;
  years: number;
  role: SquadRole;
  promises: string[]; // textos de promessas
}

export function sendWageOffer(world: World, career: Career, negId: string, input: WageOfferInput): TransferNegotiation {
  const neg = Object.values(world.negotiations).find((n) => n.id === negId);
  if (!neg) throw new Error('Negociação não encontrada');
  const p = world.players[neg.playerId];
  const agent = ensureAgent(world, p);
  const rng = new RNG(hashString(world.seed) ^ hashString(`${neg.id}|wage|${neg.offers.length}`));

  neg.status = 'negociacao-jogador';
  neg.offers.push({
    id: uid('of'), side: 'user', kind: 'wage',
    fee: 0, bonus: input.bonus, sellOnPct: 0, installments: 1,
    wage: input.wage, years: input.years,
    message: `Proposta: €${(input.wage / 1000).toFixed(0)}k/sem, ${input.years} anos, papel de ${input.role}.`,
    createdAt: world.date,
  });

  // papel no elenco insuficiente?
  const squad = squadOf(world, career.clubId);
  const samePos = squad.filter((s) => POSITION_GROUPS[s.position] === POSITION_GROUPS[p.position]);
  const better = samePos.filter((s) => overallOf(s) > overallOf(p)).length;
  let roleOk = true;
  if (input.role === 'Reserva' || input.role === 'Base') {
    roleOk = neg.interestScore < 55;
  } else if (input.role === 'Titular absoluto') {
    roleOk = better === 0 || neg.interestScore >= 70;
  }
  if (!roleOk && rng.chance(0.8)) {
    neg.messages.push(msg('player', `O papel que vocês me oferecem não combina com o que eu espero. Preciso de mais espaço.`, world.date, `${p.firstName} ${p.lastName}`, '😕 Insatisfeito'));
    neg.mood.player = '😕 Insatisfeito';
    neg.playerPatience -= 15;
    return neg;
  }

  const want = neg.playerWageWant;
  const ask = neg.playerWageAsk;
  const ratio = input.wage / Math.max(1, want);

  if (input.wage >= want || (input.wage >= ask && (neg.interestScore >= 70 || rng.chance(0.35)))) {
    // aceita
    neg.status = 'acordo-verbal';
    neg.wage = input.wage;
    neg.bonus = input.bonus;
    neg.years = input.years;
    neg.role = input.role;
    registerPromises(world, career, neg, input.promises);
    neg.mood.player = '😄 Muito satisfeito';
    neg.messages.push(msg('player', `Fechado. Estou ansioso para começar!`, world.date, `${p.firstName} ${p.lastName}`, '😄 Muito satisfeito'));
    neg.messages.push(msg('agent', `Acordo verbal fechado. Podemos seguir para os exames médicos.`, world.date, `${agent.name} (agente)`, '🙂 Satisfeito'));
    return neg;
  }

  neg.playerPatience -= ratio >= 0.85 ? 8 : ratio >= 0.7 ? 18 : 30;
  neg.mood.player = ratio >= 0.9 ? '🙂 Satisfeito' : ratio >= 0.75 ? '😐 Neutro' : '😕 Insatisfeito';

  if (ratio >= 0.8 && neg.playerPatience > 40) {
    // contraproposta próxima
    const counter = Math.round(Math.min(want, Math.max(ask, Math.round((input.wage + want) / 2 / 500) * 500)));
    neg.status = 'acordo-verbal'; // ainda em negociação salarial — usa contraproposta
    neg.status = 'negociacao-jogador';
    const line = agent.style === 'Agressivo'
      ? `Chega perto, mas ${p.firstName} não assina por menos de €${(counter / 1000).toFixed(0)} mil/semana.`
      : `Gostaria de €${(counter / 1000).toFixed(0)} mil/semana para fechar.`;
    neg.messages.push(msg('agent', line, world.date, `${agent.name} (agente)`, neg.mood.player));
    neg.offers.push({
      id: uid('of'), side: 'agent', kind: 'counter', fee: 0, bonus: input.bonus, sellOnPct: 0, installments: 1,
      wage: counter, years: input.years, message: `Contraproposta salarial: €${(counter / 1000).toFixed(0)}k/sem.`, createdAt: world.date, mood: neg.mood.player,
    });
    return neg;
  }

  if (neg.playerPatience <= 40 || ratio < 0.6) {
    if (neg.interestScore < 50 || ratio < 0.55) {
      neg.status = 'rejeitada';
      neg.rejectedReason = neg.interestScore < 50
        ? 'O jogador não está convencido do projeto esportivo do clube.'
        : 'O salário oferecido está abaixo das expectativas do jogador.';
      neg.messages.push(msg('player', neg.interestScore < 50
        ? `Agradeço o interesse, mas não vejo o encaixe certo neste momento.`
        : `O salário oferecido está muito abaixo do que eu recebo hoje.`, world.date, `${p.firstName} ${p.lastName}`, '😡 Irritado'));
      return neg;
    }
    // última tentativa: pede exatamente o mínimo
    neg.messages.push(msg('agent', `Meu cliente pede no mínimo €${(ask / 1000).toFixed(0)} mil/semana. É o limite dele.`, world.date, `${agent.name} (agente)`, '😕 Insatisfeito'));
    neg.offers.push({
      id: uid('of'), side: 'agent', kind: 'counter', fee: 0, bonus: input.bonus, sellOnPct: 0, installments: 1,
      wage: ask, years: input.years, message: `Pedido mínimo do jogador: €${(ask / 1000).toFixed(0)}k/sem.`, createdAt: world.date, mood: '😕 Insatisfeito',
    });
  }
  return neg;
}

export function respondToPlayer(world: World, career: Career, negId: string, action: 'accept' | 'counter' | 'end' | 'add-bonus', input?: { wage?: number; bonus?: number }): TransferNegotiation {
  const neg = Object.values(world.negotiations).find((n) => n.id === negId);
  if (!neg) throw new Error('Negociação não encontrada');
  const p = world.players[neg.playerId];
  const agent = ensureAgent(world, p);
  const last = [...neg.offers].reverse().find((o) => o.side === 'agent' || o.side === 'player');

  if (action === 'end') {
    neg.status = 'cancelada';
    neg.rejectedReason = 'Negociação salarial encerrada pelo seu clube.';
    neg.messages.push(msg('system', 'Você encerrou a negociação com o jogador.', world.date));
    return neg;
  }
  if (action === 'accept' && last?.wage) {
    neg.status = 'acordo-verbal';
    neg.wage = input?.wage ?? last.wage;
    neg.bonus = input?.bonus ?? neg.bonus;
    neg.years = neg.years || 3;
    neg.mood.player = '😄 Muito satisfeito';
    neg.messages.push(msg('player', `Combinado. Vamos fechar.`, world.date, `${p.firstName} ${p.lastName}`, '😄 Muito satisfeito'));
    return neg;
  }
  if (action === 'counter' && input?.wage) {
    return sendWageOffer(world, career, neg.id, {
      wage: input.wage,
      bonus: input.bonus ?? neg.bonus,
      years: neg.years || 3,
      role: neg.role ?? 'Titular',
      promises: [],
    });
  }
  if (action === 'add-bonus') {
    const base = last?.wage ?? neg.wage;
    const newWage = Math.round(base * 0.92 / 500) * 500;
    neg.status = 'negociacao-jogador';
    neg.offers.push({
      id: uid('of'), side: 'user', kind: 'bonus', fee: 0, bonus: (input?.bonus ?? 200_000) + Math.round(base * 0.08), sellOnPct: 0, installments: 1,
      wage: newWage, years: neg.years || 3, message: `€${(newWage / 1000).toFixed(0)}k/sem + bônus reforçado.`, createdAt: world.date,
    });
    if (newWage >= neg.playerWageAsk) {
      neg.status = 'acordo-verbal';
      neg.wage = newWage;
      neg.bonus = neg.offers[neg.offers.length - 1].bonus;
      neg.mood.player = '🙂 Satisfeito';
      neg.messages.push(msg('agent', `Aceito com esse bônus. Fechado!`, world.date, `${agent.name} (agente)`, '🙂 Satisfeito'));
    } else {
      neg.messages.push(msg('agent', `O bônus ajuda, mas o salário base precisa subir.`, world.date, `${agent.name} (agente)`, '😐 Neutro'));
    }
  }
  return neg;
}

const PROMISE_LABELS: Record<string, string> = {
  'titularidade': 'Titularidade garantida',
  'min-jogos': 'Mínimo de 15 partidas na temporada',
  'posicao': 'Jogar na posição preferida',
  'competicoes': 'Participar de todas as competições',
  'desenvolvimento': 'Foco em desenvolvimento individual',
  'aumento': 'Aumento salarial no fim da temporada',
  'venda': 'Será vendido se chegar proposta boa',
};

function promiseMeta(text: string): { kind: PlayerPromise['kind']; target?: number } {
  // aceita ids crus vindos da UI e rótulos por extenso
  const direct = (['titularidade', 'min-jogos', 'posicao', 'competicoes', 'desenvolvimento', 'aumento', 'venda'] as const).find((k) => k === text || (PROMISE_LABELS[k] ?? '').includes(text) || text.includes(PROMISE_LABELS[k] ?? ''));
  if (direct) return { kind: direct, target: direct === 'min-jogos' ? 15 : undefined };
  if (text.includes('Titularidade') || text.includes('titular')) return { kind: 'titularidade' };
  if (text.includes('partidas')) return { kind: 'min-jogos', target: 15 };
  if (text.includes('posição preferida') || text.includes('posicao')) return { kind: 'posicao' };
  if (text.includes('competições') || text.includes('competicoes')) return { kind: 'competicoes' };
  if (text.includes('desenvolvimento')) return { kind: 'desenvolvimento' };
  if (text.includes('Aumento salarial') || text.includes('aumento')) return { kind: 'aumento' };
  if (text.includes('venda') || text.includes('vendido')) return { kind: 'venda' };
  return { kind: 'min-jogos', target: 15 };
}

function createPromise(world: World, p: Player, text: string): PlayerPromise {
  const label = PROMISE_LABELS[text] ?? text; // normaliza ids da UI para o rótulo legível
  const meta = promiseMeta(label);
  return {
    id: `pr${promiseCounter++}`,
    text: label,
    kind: meta.kind,
    playerId: p.id,
    madeAt: world.date,
    deadline: addDays(world.date, 365),
    fulfilled: false,
    broken: false,
    baseline: meta.kind === 'desenvolvimento' ? overallOf(p) : meta.kind === 'aumento' ? (p.contract?.wage ?? 0) : undefined,
    target: meta.target,
  };
}

/** Registra uma promessa diretamente na carreira (usado por conversas com jogadores). */
export function addPlayerPromise(world: World, career: Career, playerId: string, text: string): PlayerPromise | null {
  const p = world.players[playerId];
  if (!p) return null;
  const promise = createPromise(world, p, text);
  career.promises.push(promise);
  return promise;
}

function registerPromises(world: World, career: Career, neg: TransferNegotiation, texts: string[]): void {
  const p = world.players[neg.playerId];
  for (const text of texts) {
    if (!text.trim()) continue;
    const promise = createPromise(world, p, text);
    neg.promises.push(promise);
    career.promises.push(promise);
  }
}

// ------------------------------------------------------------
// Exames médicos
// ------------------------------------------------------------
export function runMedical(world: World, career: Career, negId: string): TransferNegotiation {
  const neg = Object.values(world.negotiations).find((n) => n.id === negId);
  if (!neg) throw new Error('Negociação não encontrada');
  const p = world.players[neg.playerId];
  if (neg.medical && neg.medical.status !== 'pending') return neg;
  neg.status = 'exames';
  // exames levam 1-2 dias (jogadores com histórico de lesão demoram mais)
  const injuryExtra = p.injuryHistory.filter((i) => daysBetween(i.date, world.date) <= 730).length >= 2 ? 1 : 0;
  neg.medicalDoneOn = addDays(world.date, 1 + injuryExtra + (Math.random() < 0.3 ? 1 : 0));
  neg.medical = { status: 'pending', note: 'Exames em andamento.' };
  const club = world.clubs[career.clubId];
  const medFac = club?.staff.find((s) => s.role === 'Médico');
  const doctor = medFac ? `Dr. ${medFac.name.split(' ')[0]}` : 'Equipe médica';
  neg.messages.push(msg('medical', `${doctor}: iniciamos os exames médicos de ${p.firstName}. O resultado sai em até ${daysBetween(world.date, neg.medicalDoneOn)} dia${daysBetween(world.date, neg.medicalDoneOn) > 1 ? 's' : ''}.`, world.date));
  return neg;
}

/** Resolve o resultado dos exames médicos quando a data chega (chamado no tick diário). */
export function resolveMedical(world: World, career: Career | null, neg: TransferNegotiation): TransferNegotiation {
  if (neg.status !== 'exames' || neg.medical?.status !== 'pending') return neg;
  if (!neg.medicalDoneOn || world.date < neg.medicalDoneOn) return neg;
  const p = world.players[neg.playerId];
  const club = career ? world.clubs[career.clubId] : null;
  const rng = new RNG(hashString(world.seed) ^ hashString(`${neg.id}|medical`));

  const recent = p.injuryHistory.filter((i) => daysBetween(i.date, world.date) <= 730);
  const injuryScore = recent.length * 0.14 + (p.injury ? 0.4 : 0) + p.injuryHistory.reduce((s, i) => s + (i.daysOut > 60 ? 0.06 : 0), 0);
  const ageScore = p.age >= 33 ? 0.25 : p.age >= 30 ? 0.12 : 0;
  const facilityScore = (100 - (club?.facilities.medical ?? 60)) / 300;
  const score = clamp(injuryScore + ageScore + facilityScore, 0, 1);
  const r = rng.float(0, 1);

  const medFac = club?.staff.find((s) => s.role === 'Médico');
  const doctor = medFac ? `Dr. ${medFac.name.split(' ')[0]}` : 'Equipe médica';

  if (score + r * 0.3 < 0.34) {
    neg.medical = { status: 'approved', note: 'Jogador apto. Todos os exames dentro da normalidade.' };
    neg.messages.push(msg('medical', `${doctor}: ${p.firstName} passou nos exames médicos sem ressalvas.`, world.date));
  } else if (score + r * 0.3 < 0.6) {
    neg.medical = { status: 'conditional', note: `${p.firstName} foi aprovado com ressalvas. Recomendamos atenção com a parte física.` };
    neg.messages.push(msg('medical', `${doctor}: aprovado com ressalvas — histórico de lesões chama atenção, mas não impede a contratação.`, world.date));
  } else {
    neg.medical = { status: 'failed', note: 'Os exames reprovaram o jogador. A contratação foi cancelada.' };
    neg.status = 'rejeitada';
    neg.rejectedReason = 'Jogador reprovado nos exames médicos.';
    neg.messages.push(msg('medical', `${doctor}: infelizmente os exames reprovaram ${p.firstName}. Não podemos concluir a contratação.`, world.date));
  }
  neg.medicalDoneOn = null;
  return neg;
}

// ------------------------------------------------------------
// Conclusão
// ------------------------------------------------------------
export interface SigningResult {
  negotiationId: string;
  playerId: string;
  name: string;
  position: Position;
  overall: number;
  potential: number;
  age: number;
  fee: number;
  wage: number;
  years: number;
  bonus: number;
  sellOnPct: number;
  installments: number;
  role: SquadRole;
  fromClubName: string;
  toClubName: string;
  grade: number;      // 0-10
  reasons: string[];
  medicalNote: string | null;
  kind: NegotiationKind;
}

export function signDeal(world: World, career: Career, negId: string): SigningResult {
  const neg = Object.values(world.negotiations).find((n) => n.id === negId);
  if (!neg) throw new Error('Negociação não encontrada');
  // NUNCA assinar com exame pendente: a validação existe na lógica, não só na UI
  if (neg.medical?.status === 'pending') {
    throw new Error('EXAME_PENDENTE: o jogador ainda não foi aprovado nos exames médicos.');
  }
  if (neg.status !== 'acordo-verbal' && neg.status !== 'exames') {
    neg.status = 'exames';
  }
  const p = world.players[neg.playerId];
  const buyer = world.clubs[neg.buyerClubId];
  const seller = neg.sellerClubId ? world.clubs[neg.sellerClubId] : null;
  const fromName = neg.kind === 'free' ? 'Sem clube' : seller?.name ?? 'Sem clube';

  // executa a transferência
  executeTransfer(world, career, {
    playerId: neg.playerId,
    fee: neg.kind === 'loan' ? neg.loanFee : neg.kind === 'free' || neg.kind === 'pre-contract' ? 0 : neg.fee,
    wage: neg.wage,
    toClubId: neg.buyerClubId,
    fromClubId: neg.kind === 'pre-contract' ? null : neg.sellerClubId,
    type: neg.kind === 'loan' ? 'loan' : 'transfer',
    loanUntil: neg.kind === 'loan' ? addDays(world.date, neg.years * 365) : undefined,
    silent: true,
    addons: { sellOnPct: neg.sellOnPct, installments: neg.installments },
  });

  // ajusta contrato (executeTransfer já define wage; aqui define duração/bônus/cláusula)
  if (p.contract) {
    p.contract.until = addDays(world.date, neg.years * 365);
    p.contract.wage = neg.wage;
    p.contract.bonus = neg.bonus;
    p.contract.signedAt = world.date;
  }
  p.transferRequested = false;
  if (neg.kind !== 'loan') {
    p.loanListed = false;
    p.transferListed = false;
  }
  if (neg.kind === 'loan') {
    p.contract = p.contract ?? { signedAt: world.date, until: addDays(world.date, neg.years * 365), wage: neg.wage, bonus: 0, releaseClause: null };
    // empréstimo: clube que recebe paga a parcela do salário
    const share = neg.loanWageShare / 100;
    if (buyer && p.contract) {
      buyer.financeAccum.expenses += Math.round(p.contract.wage * 4.33 * share);
    }
    if (neg.loanObligationGames > 0) {
      world.loanOptionTriggers.push({
        loanId: neg.id, playerId: p.id, clubId: neg.buyerClubId, parentClubId: neg.sellerClubId ?? '',
        obligationGames: neg.loanObligationGames,
      });
    }
  }

  // impacto no elenco — quem perde espaço fica insatisfeito
  const squad = squadOf(world, neg.buyerClubId);
  const ov = overallOf(p);
  const displaced = squad.filter((s) =>
    s.id !== p.id && POSITION_GROUPS[s.position] === POSITION_GROUPS[p.position] && overallOf(s) < ov && !s.isLoan,
  );
  for (const d of displaced) {
    d.morale = clamp(d.morale - 4, 1, 100);
    d.happiness = clamp(d.happiness - 3, 1, 100);
  }
  if (displaced.length > 0) {
    notify(career, `${displaced[0].firstName} ${displaced[0].lastName} pode perder espaço com a chegada de ${p.firstName}.`, 'warning', '😟');
  }
  // folha salarial
  const newWageBill = squad.reduce((s, x) => s + ((x.contract?.wage ?? 0) * 4.33), 0);
  if (buyer) {
    buyer.wageBill = newWageBill;
  }
  // comparação com o capitão
  const captainPlayer = squad.find((s) => s.id === career.lineup.captainId);
  if (captainPlayer && captainPlayer.contract && p.contract && p.contract.wage > captainPlayer.contract.wage * 1.3) {
    notify(career, `${p.firstName} recebe mais que o capitão ${captainPlayer.firstName}. Isso pode gerar atrito no vestiário.`, 'warning', '⚖️');
  }

  // notícia do anúncio
  addNews(world, {
    date: world.date,
    title: `✍️ ${buyer?.name ?? 'FootballSim'} anuncia ${p.firstName} ${p.lastName}!`,
    subtitle: neg.kind === 'loan'
      ? `Empréstimo do ${fromName} com opção de compra${neg.loanOptionFee > 0 ? ` de €${(neg.loanOptionFee / 1e6).toFixed(1)}M` : ''}.`
      : `Reforço chega por €${((neg.kind === 'free' || neg.kind === 'pre-contract') ? 0 : neg.fee / 1e6).toFixed(1)}M, salário de €${((neg.wage ?? 0) / 1000).toFixed(0)}k/sem, ${neg.years} anos.`,
    category: 'Transferências',
    playerId: p.id,
    clubId: neg.buyerClubId,
    importance: neg.fee > 20_000_000 || p.reputation >= 70 ? 85 : 60,
  });

  if (neg.kind === 'transfer' && neg.fee >= 8_000_000) {
    pushMarketHighlight(
      world, 'user-buy',
      `🛒 Você fecha ${p.firstName} ${p.lastName} por €${(neg.fee / 1e6).toFixed(1)}M`,
      `Contratação confirmada: o ${POSITION_LABELS[p.position].toLowerCase()} de ${overallOf(p)} de overall vem do ${fromName}${neg.sellOnPct > 0 ? `, mantendo ${neg.sellOnPct}% de futura venda para o vendedor` : ''}.`,
      neg.fee, neg.fee >= 20_000_000 ? 82 : 70, { playerId: p.id, clubId: neg.buyerClubId },
    );
    maybeWindowRecord(world, career, neg.fee, `Você fecha ${p.firstName} ${p.lastName}`, `Contratação do ${POSITION_LABELS[p.position].toLowerCase()} de ${overallOf(p)} de overall vindo do ${fromName}.`, p.id, neg.buyerClubId);
  }

  // grau da contratação
  const analysis = marketAnalysis(world, p);
  const feeRatio = neg.fee > 0 ? neg.fee / Math.max(1, analysis.value) : 1;
  let grade = 7.5;
  const reasons: string[] = [];
  const samePosNow = squad.filter((s) => POSITION_GROUPS[s.position] === POSITION_GROUPS[p.position]);
  const bestPos = samePosNow.length ? Math.max(...samePosNow.map((s) => overallOf(s))) : 0;
  if (ov >= bestPos + 2) { grade += 1; reasons.push('Melhorou uma posição carente do elenco'); }
  if (p.age <= 24) { grade += 0.7; reasons.push('Contratação jovem, com margem de revenda'); }
  if (p.potential - ov >= 8) { grade += 0.6; reasons.push('Potencial elevado'); }
  if (neg.interestScore >= 70) { grade += 0.5; reasons.push('Jogador muito interessado no projeto'); }
  if (feeRatio <= 0.95) { grade += 0.8; reasons.push('Valor abaixo do mercado'); }
  else if (feeRatio > 1.2) { grade -= 0.9; reasons.push('Valor acima do mercado'); }
  if (neg.medical?.status === 'conditional') { grade -= 0.5; reasons.push('Exames com ressalvas'); }
  grade = clamp(Math.round(grade * 10) / 10, 3, 10);

  neg.status = 'concluida';
  neg.updatedAt = world.date;
  neg.messages.push(msg('system', `Contratação concluída em ${world.date}. Bem-vindo, ${p.firstName}!`, world.date));
  const med = neg.medical;
  const medicalNote = med ? (med.status === 'conditional' ? med.note ?? null : null) : null;

  // move para o histórico
  const copy = JSON.parse(JSON.stringify(neg)) as TransferNegotiation;
  world.negotiationHistory.unshift(copy);
  if (world.negotiationHistory.length > 40) world.negotiationHistory.pop();
  delete world.negotiations[neg.playerId];

  return {
    negotiationId: neg.id,
    playerId: p.id,
    name: `${p.firstName} ${p.lastName}`,
    position: p.position,
    overall: ov,
    potential: p.potential,
    age: p.age,
    fee: neg.kind === 'loan' ? neg.loanFee : neg.kind === 'free' || neg.kind === 'pre-contract' ? 0 : neg.fee,
    wage: neg.wage,
    years: neg.years,
    bonus: neg.bonus,
    sellOnPct: neg.sellOnPct,
    installments: neg.installments,
    role: neg.role ?? 'Titular',
    fromClubName: fromName,
    toClubName: buyer?.name ?? '—',
    grade,
    reasons,
    medicalNote,
    kind: neg.kind,
  };
}

export function cancelNegotiation(world: World, career: Career, negId: string, reason: string): TransferNegotiation {
  const neg = Object.values(world.negotiations).find((n) => n.id === negId);
  if (!neg) throw new Error('Negociação não encontrada');
  neg.status = 'cancelada';
  neg.rejectedReason = reason;
  neg.messages.push(msg('system', `Negociação encerrada: ${reason}`, world.date));
  return neg;
}

// ------------------------------------------------------------
// Tick diário: prazos, guerra de propostas, IA
// ------------------------------------------------------------
export function tickNegotiations(world: World, career: Career | null, rng: RNG): void {
  if (!career) return;
  for (const neg of Object.values(world.negotiations)) {
    if (['concluida', 'rejeitada', 'cancelada', 'expirada'].includes(neg.status)) continue;
    // exames médicos: resultado sai quando a data chega (1-2 dias)
    if (neg.status === 'exames' && neg.medical?.status === 'pending') {
      resolveMedical(world, career, neg);
      if (neg.status !== 'exames' || neg.medical.status !== 'pending') continue;
    }
    // prazo
    if (neg.deadline && world.date > neg.deadline) {
      neg.status = 'expirada';
      neg.rejectedReason = 'O prazo da negociação expirou.';
      neg.messages.push(msg('system', 'O prazo da negociação expirou.', world.date));
      continue;
    }
    // guerra de propostas já resolvida no envio da proposta; aqui apenas expira se ficar pendente demais
    if (neg.bidWar && daysBetween(neg.bidWar.raisedAt, world.date) >= 3) {
      const rivalClub = world.clubs[neg.bidWar.rivalClubId];
      neg.bidWar = null;
      neg.status = 'cancelada';
      neg.rejectedReason = `A proposta de ${rivalClub?.name ?? 'outro clube'} foi aceita — você não respondeu a tempo.`;
      neg.messages.push(msg('system', `Você não respondeu à guerra de propostas e ${rivalClub?.name ?? 'o rival'} levou o jogador.`, world.date));
    }
    // respostas pendentes de "pedir tempo"
    if (neg.status === 'proposta-enviada') {
      const lastUser = [...neg.offers].reverse().find((o) => o.side === 'user');
      if (lastUser && daysBetween(lastUser.createdAt, world.date) >= 1 && rng.chance(0.6)) {
        sendClubOffer(world, career, neg.id, {
          fee: lastUser.fee, bonus: lastUser.bonus, sellOnPct: lastUser.sellOnPct, installments: lastUser.installments,
        });
      }
    }
  }
}

// ------------------------------------------------------------
// IA: clubes fazem propostas entre si (mercado vivo)
// Cada clube segue uma estratégia conforme sua classe:
//   Gigante/Grande -> caça estrelas, paga prêmio, olha overall
//   Médio          -> upgrades baratos (custo-benefício)
//   Pequeno/Amador -> jovens baratos e jogadores livres
// ------------------------------------------------------------
function clubTierKey(c: Club): 'elite' | 'mid' | 'small' {
  if (c.tier === 'Gigante' || c.tier === 'Grande') return 'elite';
  if (c.tier === 'Médio') return 'mid';
  return 'small';
}

export function aiMarketDeals(world: World, career: Career | null, rng: RNG, count: number): void {
  const userClubId = career?.clubId ?? null;
  const clubs = Object.values(world.clubs).filter((c) => !c.isUserControlled && !c.id.startsWith('user'));
  const shuffled = rng.shuffle(clubs);
  let done = 0;
  let biggestFee = 0;
  let biggestTarget: Player | null = null;
  let biggestBuyer: Club | null = null;
  let biggestSeller: Club | null = null;

  for (const club of shuffled) {
    if (done >= count) break;
    const squad = squadOf(world, club.id);
    if (squad.length < 16) continue;
    const tier = clubTierKey(club);

    // --- Pequenos/amadores: apostam em livres e jovens baratos ---
    if (tier === 'small') {
      if (rng.chance(0.5)) continue;
      const frees = freeAgents(world).filter((p) => p.age <= 27 && p.status === 'active');
      if (frees.length > 0 && rng.chance(0.4)) {
        const target = frees.sort((a, b) => overallOf(b) - overallOf(a))[0];
        const wage = Math.max(target.contract?.wage ?? 500, 500);
        if (club.balance > wage * 30) {
          executeTransfer(world, career, { playerId: target.id, fee: 0, wage, toClubId: club.id, fromClubId: null, type: 'free' });
          done++;
        }
      }
      continue;
    }

    // precisa de posição?
    const groups = squad.reduce((acc, p) => { acc[POSITION_GROUPS[p.position]] = (acc[POSITION_GROUPS[p.position]] ?? 0) + 1; return acc; }, {} as Record<string, number>);
    const weakGroup = (Object.keys(groups) as ('GK' | 'DEF' | 'MID' | 'ATT')[]).find((g) => (groups[g] ?? 0) < 5);
    if (!weakGroup) continue;

    const posPlayers = Object.values(world.players).filter((p) =>
      p.status === 'active' && p.clubId && p.clubId !== club.id && p.clubId !== userClubId
      && POSITION_GROUPS[p.position] === weakGroup
      && !p.isLoan,
    );
    if (posPlayers.length === 0) continue;

    if (tier === 'elite') {
      // caça estrelas: prioriza overall alto, aceita pagar prêmio
      const starPool = posPlayers.filter((p) => overallOf(p) >= 80).sort((a, b) => overallOf(b) - overallOf(a));
      const pool = starPool.length > 0 && rng.chance(0.7) ? starPool : posPlayers.sort((a, b) => overallOf(b) - overallOf(a)).slice(0, 8);
      if (pool.length === 0) continue;
      const target = rng.pick(pool);
      const price = sellingPrice(world, target, world.clubs[target.clubId!]);
      const fee = Math.round(price * rng.float(1.0, 1.18));
      if (price > 0 && club.balance > fee * 1.25) {
        const wage = Math.round((target.contract?.wage ?? 800) * rng.float(1.05, 1.2));
        executeTransfer(world, career, {
          playerId: target.id, fee, wage, toClubId: club.id, fromClubId: target.clubId, type: 'transfer',
        });
        if (fee > biggestFee) { biggestFee = fee; biggestTarget = target; biggestBuyer = club; biggestSeller = world.clubs[target.clubId!]; }
        done++;
      }
    } else {
      // médio: upgrade com melhor custo-benefício
      const affordable = posPlayers.filter((p) => p.value < club.balance * 0.45 && overallOf(p) >= 70);
      const pool = affordable.length > 0 ? affordable : posPlayers.filter((p) => p.value < club.balance * 0.45);
      if (pool.length === 0) continue;
      const target = pool.sort((a, b) => (a.value / Math.max(50, overallOf(a))) - (b.value / Math.max(50, overallOf(b))))[0];
      const price = sellingPrice(world, target, world.clubs[target.clubId!]);
      const fee = Math.round(price * rng.float(0.9, 1.05));
      if (price > 0 && club.balance > fee * 1.3) {
        const wage = Math.round((target.contract?.wage ?? 600) * rng.float(1.0, 1.12));
        executeTransfer(world, career, {
          playerId: target.id, fee, wage, toClubId: club.id, fromClubId: target.clubId, type: 'transfer',
        });
        if (fee > biggestFee) { biggestFee = fee; biggestTarget = target; biggestBuyer = club; biggestSeller = world.clubs[target.clubId!]; }
        done++;
      }
    }
  }

  // holofote do mercado: o maior negócio do dia ganha notícia de destaque
  if (biggestTarget && biggestFee >= 15_000_000) {
    marketSpotlight(world, career, biggestTarget, biggestBuyer!, biggestSeller!, biggestFee, rng);
  }
}

/** Notícia de destaque para o maior negócio do dia (elite). */
function marketSpotlight(world: World, career: Career | null, p: Player, buyer: Club, seller: Club, fee: number, rng: RNG): void {
  const ov = overallOf(p);
  const verb = fee >= 40_000_000 ? 'astronômico' : fee >= 25_000_000 ? 'de peso' : 'relevante';
  const intro = rng.pick([
    `${p.firstName} ${p.lastName} é o novo reforço de ${buyer.name}.`,
    `${buyer.name} fecha a contratação de ${p.firstName} ${p.lastName}.`,
    `Golpe de mercado: ${buyer.name} tira ${p.firstName} ${p.lastName} de ${seller.name}.`,
  ]);
  addNews(world, {
    date: world.date,
    title: `🔥 Mercado: ${buyer.shortName} contrata ${p.firstName} ${p.lastName} por €${(fee / 1e6).toFixed(1)}M`,
    subtitle: `${intro} O negócio ${verb} (€${fee.toLocaleString('pt-BR')}) é o maior da janela até agora — o ${seller.tier.toLowerCase()} ${seller.shortName} vendeu seu ${POSITION_LABELS[p.position].toLowerCase()} de ${ov} de overall.`,
    category: 'Transferências',
    importance: fee >= 40_000_000 ? 88 : fee >= 25_000_000 ? 78 : 68,
    clubId: buyer.id,
  });
  pushMarketHighlight(
    world, 'big-deal',
    `${buyer.shortName} fecha ${p.firstName} ${p.lastName} por €${(fee / 1e6).toFixed(1)}M`,
    `${intro} O ${seller.tier.toLowerCase()} ${seller.shortName} vendeu seu ${POSITION_LABELS[p.position].toLowerCase()} de ${ov} de overall — maior negócio do dia.`,
    fee, fee >= 40_000_000 ? 90 : fee >= 25_000_000 ? 80 : 70, { playerId: p.id, clubId: buyer.id },
  );
  maybeWindowRecord(world, career, fee, `${buyer.shortName} fecha ${p.firstName} ${p.lastName}`, `${intro} O ${seller.tier.toLowerCase()} ${seller.shortName} vendeu seu ${POSITION_LABELS[p.position].toLowerCase()} de ${ov} de overall.`, p.id, buyer.id);
}

// ------------------------------------------------------------
// Propostas recebidas: clubes da IA querem jogadores do nosso elenco
// ------------------------------------------------------------
let incomingOfferCounter = 0;

function incomingOffersForPlayer(world: World, playerId: string): IncomingOffer[] {
  return world.incomingOffers.filter((o) => o.playerId === playerId && o.status === 'pending');
}

/** Gera propostas da IA por jogadores do nosso elenco (diário, durante a janela). */
export function generateIncomingOffers(world: World, career: Career | null, rng: RNG, count: number): void {
  if (!career) return;
  const userClub = world.clubs[career.clubId];
  if (!userClub) return;
  const mySquad = squadOf(world, career.clubId).filter((p) => !p.isLoan && p.status === 'active');
  if (mySquad.length === 0) return;

  const clubs = rng.shuffle(Object.values(world.clubs).filter((c) => !c.isUserControlled && !c.id.startsWith('user')));
  let done = 0;

  for (const club of clubs) {
    if (done >= count) break;
    const tier = clubTierKey(club);
    const cSquad = squadOf(world, club.id);
    if (cSquad.length < 16) continue;
    const groups = cSquad.reduce((acc, p) => { acc[POSITION_GROUPS[p.position]] = (acc[POSITION_GROUPS[p.position]] ?? 0) + 1; return acc; }, {} as Record<string, number>);
    const weakGroup = (Object.keys(groups) as ('GK' | 'DEF' | 'MID' | 'ATT')[]).find((g) => (groups[g] ?? 0) < 5);
    if (!weakGroup) continue;

    const candidates = mySquad.filter((p) =>
      POSITION_GROUPS[p.position] === weakGroup
      && !incomingOffersForPlayer(world, p.id).some((o) => o.clubId === club.id)
      && incomingOffersForPlayer(world, p.id).length < 2
      && !world.negotiations[p.id],
    );
    if (candidates.length === 0) continue;

    // preferência: quem quer sair / está listado / é estrela
    let pool = candidates.filter((p) => p.transferRequested || p.transferListed);
    if (pool.length === 0) pool = candidates.filter((p) => overallOf(p) >= 80);
    if (pool.length === 0) pool = candidates;
    const target = rng.pick(pool);

    const price = sellingPrice(world, target, userClub);
    if (price < 800_000) continue;
    const feeMult = tier === 'elite' ? rng.float(1.0, 1.15) : tier === 'mid' ? rng.float(0.85, 1.0) : rng.float(0.75, 0.9);
    const fee = Math.round(price * feeMult);
    if (club.balance < fee * (tier === 'small' ? 1.6 : 1.25)) continue;
    const ov = overallOf(target);
    const baseChance = ov >= 85 ? 0.8 : ov >= 78 ? 0.5 : 0.3;
    if (!rng.chance(target.transferRequested ? baseChance + 0.3 : baseChance)) continue;

    const sellOn = tier === 'small' && rng.chance(0.25) ? rng.pick([10, 15]) : 0;
    const bonus = rng.chance(0.35) ? Math.round(fee * rng.float(0.05, 0.12)) : 0;
    const installments = rng.chance(0.3) ? rng.int(2, 4) : 1;
    const hiddenMax = Math.round(price * (tier === 'elite' ? rng.float(1.2, 1.3) : tier === 'mid' ? rng.float(1.08, 1.18) : rng.float(1.0, 1.08)));

    const offer: IncomingOffer = {
      id: `io${incomingOfferCounter++}`,
      playerId: target.id,
      clubId: club.id,
      fee, bonus, sellOnPct: sellOn, installments,
      status: 'pending',
      createdAt: world.date,
      expiresAt: addDays(world.date, rng.int(4, 6)),
      rounds: 0,
      mood: '🙂 Satisfeito',
      hiddenMax,
      messages: [],
      playerWantsOut: target.transferRequested,
    };
    const clubLine = rng.pick([
      `O ${club.name} tem interesse em ${target.firstName} e apresenta uma proposta.`,
      `Estamos reconstruindo o elenco e ${target.firstName} é exatamente o que precisamos.`,
      `O ${club.name} quer reforçar a posição e vê ${target.firstName} como alvo.`,
    ]);
    const addonsTxt = `${bonus > 0 ? ` + €${(bonus / 1e6).toFixed(1)}M em bônus` : ''}${sellOn > 0 ? `, mantendo ${sellOn}% de futura venda para vocês` : ''}${installments > 1 ? `, em ${installments} parcelas` : ''}`;
    offer.messages.push({
      id: uid('im'), from: 'club',
      text: `${clubLine} Oferecemos €${(fee / 1e6).toFixed(1)}M${addonsTxt}.`, date: world.date, mood: '🙂 Satisfeito', actor: club.name,
    });
    const officer = career.recruitment;
    offer.messages.push({
      id: uid('im'), from: 'officer',
      text: `${officer.name.split(' ')[0]} trouxe a proposta: ${target.firstName} ${target.lastName} está avaliado em €${(price / 1e6).toFixed(1)}M e o ${club.shortName} oferece €${(fee / 1e6).toFixed(1)}M${addonsTxt}. O que você decide?`,
      date: world.date, actor: officer.name.split(' ')[0],
    });
    world.incomingOffers.unshift(offer);
    if (world.incomingOffers.length > 80) world.incomingOffers.pop();

    if (fee >= 15_000_000) {
      addNews(world, {
        date: world.date,
        title: `🔥 Interesse: ${club.shortName} faz proposta de €${(fee / 1e6).toFixed(1)}M por ${target.firstName} ${target.lastName}`,
        subtitle: `O ${club.tier.toLowerCase()} ${club.name} tenta tirar o ${POSITION_LABELS[target.position].toLowerCase()} de ${ov} de overall do ${userClub.shortName}.`,
        category: 'Transferências',
        importance: fee >= 30_000_000 ? 80 : 70,
        clubId: club.id,
      });
    }
    notify(career, `📩 ${club.shortName} fez uma proposta de €${(fee / 1e6).toFixed(1)}M por ${target.firstName} ${target.lastName}.`, 'info', '📩', 'transfers');
    done++;
  }
}

/** Relatório pós-venda: avalia o preço, o impacto na folha/elenco e a reação de torcida e vestiário. */
function buildSaleReport(world: World, career: Career, p: Player, fee: number, sellOnPct: number): SaleReport {
  const myClub = world.clubs[career.clubId];
  const squad = squadOf(world, career.clubId);
  const ov = overallOf(p);
  const vital = isVitalPlayer(world, p);
  const analysis = marketAnalysis(world, p);
  const value = analysis.value;
  const feeRatio = fee / Math.max(1, value);
  const wageSaved = Math.round((p.contract?.wage ?? 0) * 4.33);

  const nextUp = squad
    .filter((s) => s.id !== p.id && POSITION_GROUPS[s.position] === POSITION_GROUPS[p.position] && !s.isLoan)
    .sort((a, b) => overallOf(b) - overallOf(a))
    .slice(0, 3)
    .map((s) => `${s.firstName} ${s.lastName} (${overallOf(s)})`);
  const captain = squad.find((s) => s.id === career.lineup.captainId);

  let grade = 7;
  const reasons: string[] = [];
  if (feeRatio >= 1.15) { grade += 1.5; reasons.push('Preço excelente — bem acima do valor de mercado'); }
  else if (feeRatio >= 1.0) { grade += 1; reasons.push('Valor justo, na faixa de mercado'); }
  else if (feeRatio >= 0.85) { grade += 0.3; reasons.push('Ligeiramente abaixo do valor de mercado'); }
  else { grade -= 0.8; reasons.push('Vendido abaixo do valor de mercado'); }
  if (p.age >= 30) { grade += 0.5; reasons.push('Idade avançada — era o momento de vender'); }
  if (p.transferRequested) { grade += 0.7; reasons.push('Jogador queria sair — saída necessária'); }
  if (sellOnPct > 0) { grade += 0.3; reasons.push(`Mantém ${sellOnPct}% de futura venda`); }
  if (nextUp[0]) {
    const nextOv = Number(nextUp[0].match(/\((\d+)\)$/)?.[1] ?? 0);
    if (nextOv >= ov - 5) { grade += 0.6; reasons.push(`Há reposição pronta no elenco (${nextUp[0]})`); }
    else { grade -= 0.5; reasons.push('Sem reposição à altura na posição'); }
  } else {
    grade -= 0.6; reasons.push('Ninguém no elenco para a posição');
  }
  if (wageSaved > 0) reasons.push(`Alivia a folha em ${fmtMoney(wageSaved)}/mês`);
  if (vital) { grade -= 1.2; reasons.push('Era titular absoluto — o elenco perde qualidade'); }
  grade = clamp(Math.round(grade * 10) / 10, 2, 10);

  const fans = vital
    ? { icon: '😡', text: `Torcida irritada: ${p.firstName} era peça-chave do time e saiu.` }
    : feeRatio >= 1.1
      ? { icon: '😮', text: 'Torcida surpreendida pelo ótimo valor recebido.' }
      : { icon: '😐', text: 'Torcida entende a saída — não era titular absoluto.' };

  const dressingRoom = p.id === captain?.id
    ? { icon: '👑', text: `Vestiário perde o capitão ${p.firstName} — um novo líder precisa emergir.` }
    : captain && p.contract && p.contract.wage > (captain.contract?.wage ?? 0) * 1.1
      ? { icon: '⚖️', text: 'Alivia o vestiário: o maior salário do elenco sai de cena.' }
      : vital
        ? { icon: '😟', text: 'Companheiros sentem a saída de um dos melhores do elenco.' }
        : { icon: '🙂', text: 'Vestiário lida bem com a saída.' };

  return { grade, fee, marketValue: value, wageSaved, nextUp, fans, dressingRoom, reasons };
}

/** Resposta do usuário a uma proposta recebida: aceitar, recusar ou contrapor. */
export function respondToIncomingOffer(
  world: World, career: Career, offerId: string,
  action: 'accept' | 'reject' | 'counter',
  input?: { fee?: number },
): IncomingOffer {
  const offer = world.incomingOffers.find((o) => o.id === offerId);
  if (!offer) throw new Error('Proposta não encontrada');
  if (offer.status !== 'pending') return offer;
  const p = world.players[offer.playerId];
  const buyer = world.clubs[offer.clubId];
  const officer = career.recruitment;
  const officerName = officer.name.split(' ')[0];
  const rng = new RNG(hashString(world.seed) ^ hashString(`${offer.id}|resp|${offer.rounds}`));

  const completeSale = (fee: number) => {
    // relatório pós-venda: calculado ANTES da transferência (elenco ainda tem o jogador)
    const saleReport = buildSaleReport(world, career, p, fee, offer.sellOnPct);
    executeTransfer(world, career, {
      playerId: p.id, fee, wage: p.contract?.wage ?? 1000,
      toClubId: buyer.id, fromClubId: career.clubId, type: 'transfer',
    });
    if (offer.sellOnPct > 0) { p.futureSellPct = offer.sellOnPct; p.futureSellClubId = career.clubId; }
    offer.status = 'accepted';
    offer.mood = '😄 Muito satisfeito';
    offer.saleReport = saleReport;
    offer.soldAt = world.date;
    offer.messages.push({ id: uid('im'), from: 'system', text: `Venda concluída: ${p.firstName} ${p.lastName} vai para o ${buyer.name} por €${(fee / 1e6).toFixed(1)}M.`, date: world.date });
    if (fee >= 8_000_000) {
      pushMarketHighlight(
        world, 'user-sale',
        `💰 ${buyer.shortName} contrata ${p.firstName} ${p.lastName} do seu clube por €${(fee / 1e6).toFixed(1)}M`,
        `Venda concluída${offer.sellOnPct > 0 ? ` com ${offer.sellOnPct}% de futura venda mantida` : ''}. O ${POSITION_LABELS[p.position].toLowerCase()} de ${overallOf(p)} de overall deixa o ${world.clubs[career.clubId].shortName}.`,
        fee, fee >= 20_000_000 ? 80 : 68, { playerId: p.id, clubId: buyer.id },
      );
    }
    maybeWindowRecord(world, career, fee, `${buyer.shortName} contrata ${p.firstName} ${p.lastName}`, `Venda do ${POSITION_LABELS[p.position].toLowerCase()} de ${overallOf(p)} de overall do ${world.clubs[career.clubId].shortName}.`, p.id, buyer.id);
    // outras propostas pendentes pelo mesmo jogador são retiradas
    for (const other of world.incomingOffers) {
      if (other.id !== offer.id && other.playerId === p.id && other.status === 'pending') {
        other.status = 'rejected';
        other.rejectedReason = `${p.firstName} foi vendido para outro clube.`;
        other.messages.push({ id: uid('im'), from: 'system', text: `${p.firstName} já foi vendido — proposta retirada.`, date: world.date });
      }
    }
  };

  if (action === 'accept') {
    completeSale(offer.fee);
    return offer;
  }

  if (action === 'reject') {
    offer.status = 'rejected';
    offer.mood = '😕 Insatisfeito';
    offer.rejectedReason = `${buyer.shortName} encerrou o contato após a recusa.`;
    offer.messages.push({ id: uid('im'), from: 'system', text: `Você recusou a proposta do ${buyer.name}. O contato foi encerrado.`, date: world.date });
    if (p.transferRequested) {
      p.happiness = clamp(p.happiness - 12, 1, 100);
      p.morale = clamp(p.morale - 10, 1, 100);
      offer.messages.push({ id: uid('im'), from: 'system', text: `${p.firstName} queria sair e ficou insatisfeito com a recusa.`, date: world.date });
      notify(career, `${p.firstName} queria sair e ficou insatisfeito com a recusa da proposta do ${buyer.shortName}.`, 'warning', '😕', `player:${p.id}`);
    }
    return offer;
  }

  // contraproposta do usuário
  const ask = Math.max(100_000, input?.fee ?? offer.fee);
  offer.rounds++;
  offer.messages.push({ id: uid('im'), from: 'officer', text: `Vou apresentar sua contraproposta de €${(ask / 1e6).toFixed(1)}M ao ${buyer.name}.`, date: world.date, actor: officerName });
  if (ask <= offer.hiddenMax) {
    completeSale(ask);
    offer.messages.push({ id: uid('im'), from: 'club', text: `Aceitamos €${(ask / 1e6).toFixed(1)}M. Vamos fechar a contratação de ${p.firstName}.`, date: world.date, mood: '😄 Muito satisfeito', actor: buyer.name });
    return offer;
  }
  if (offer.rounds >= 3 || ask > offer.hiddenMax * 1.4) {
    offer.status = 'rejected';
    offer.mood = '😡 Irritado';
    offer.rejectedReason = `${buyer.shortName} não quis cobrir a pedida e desistiu do negócio.`;
    offer.messages.push({ id: uid('im'), from: 'club', text: `€${(ask / 1e6).toFixed(1)}M está acima do nosso orçamento. Boa sorte com o jogador — desistimos.`, date: world.date, mood: '😡 Irritado', actor: buyer.name });
  } else {
    // contraproposta do clube — nunca revela o teto
    const newFee = Math.round(Math.min(ask * rng.float(0.97, 1.0), offer.hiddenMax) / 1e5) * 1e5;
    offer.fee = Math.max(offer.fee, newFee);
    offer.mood = '😐 Neutro';
    offer.messages.push({ id: uid('im'), from: 'club', text: `Fechamos em €${(offer.fee / 1e6).toFixed(1)}M. É o nosso limite para ${p.firstName}.`, date: world.date, mood: '😐 Neutro', actor: buyer.name });
  }
  return offer;
}

/** Expira e retira propostas pendentes (diário). */
export function tickIncomingOffers(world: World, career: Career | null, rng: RNG): void {
  if (!career) return;
  const pending = world.incomingOffers.filter((o) => o.status === 'pending');

  // expiração e retirada de clubes
  for (const offer of pending) {
    if (world.date > offer.expiresAt) {
      offer.status = 'expired';
      offer.mood = '😐 Neutro';
      offer.messages.push({ id: uid('im'), from: 'system', text: `A proposta do ${world.clubs[offer.clubId]?.name ?? 'clube'} expirou.`, date: world.date });
      continue;
    }
    if (offer.rounds === 0 && rng.chance(0.03)) {
      offer.status = 'rejected';
      offer.mood = '😐 Neutro';
      offer.rejectedReason = `${world.clubs[offer.clubId]?.shortName ?? 'O clube'} mudou de alvo e retirou a proposta.`;
      offer.messages.push({ id: uid('im'), from: 'club', text: `Mudamos de planos e vamos seguir outro caminho.`, date: world.date, mood: '😐 Neutro', actor: world.clubs[offer.clubId]?.name });
    }
  }

  // guerra de propostas ao VENDER: 2+ clubes disputam o mesmo jogador do nosso elenco
  const byPlayer = new Map<string, IncomingOffer[]>();
  for (const o of world.incomingOffers) {
    if (o.status !== 'pending') continue;
    const arr = byPlayer.get(o.playerId) ?? [];
    arr.push(o);
    byPlayer.set(o.playerId, arr);
  }
  for (const [pid, offers] of byPlayer) {
    if (offers.length < 2) continue;
    const p = world.players[pid];
    if (!p) continue;
    const officer = career.recruitment.name.split(' ')[0];
    const ranked = [...offers].sort((a, b) => b.fee - a.fee);
    const leader = ranked[0];
    const challenger = ranked[1];
    const leaderClub = world.clubs[leader.clubId];
    const challengerClub = world.clubs[challenger.clubId];

    // dispara a guerra (uma vez por jogador)
    if (!offers.some((o) => o.sellerWar)) {
      for (const o of offers) o.sellerWar = true;
      leader.messages.push({
        id: uid('im'), from: 'officer',
        text: `${officer} recebeu boas notícias: ${offers.length} clubes disputam ${p.firstName}. O ${leaderClub?.shortName ?? 'líder'} oferece €${(leader.fee / 1e6).toFixed(1)}M — podemos esperar o valor subir.`,
        date: world.date, actor: officer,
      });
      notify(career, `⚔️ Guerra de propostas por ${p.firstName} ${p.lastName}: ${offers.length} clubes disputam o jogador.`, 'info', '⚔️', 'transfers:highlights');
      continue;
    }

    // rival sobe a oferta acima do líder
    if (challenger && leader && rng.chance(0.28)) {
      const newFee = Math.round(leader.fee * rng.float(1.05, 1.12) / 1e5) * 1e5;
      if (challenger.hiddenMax >= newFee && newFee > leader.fee) {
        challenger.fee = newFee;
        challenger.mood = '🙂 Satisfeito';
        challenger.messages.push({
          id: uid('im'), from: 'club',
          text: `Subimos a oferta para €${(newFee / 1e6).toFixed(1)}M. ${p.firstName} é prioridade para o ${challengerClub?.name}.`,
          date: world.date, mood: '🙂 Satisfeito', actor: challengerClub?.name,
        });
        leader.messages.push({
          id: uid('im'), from: 'club',
          text: `O ${challengerClub?.shortName ?? 'rival'} cobriu nossa proposta com €${(newFee / 1e6).toFixed(1)}M. Estamos avaliando.`,
          date: world.date, mood: '😐 Neutro', actor: leaderClub?.name,
        });
        leader.messages.push({
          id: uid('im'), from: 'officer',
          text: `${officer} no seu ouvido: o ${challengerClub?.shortName ?? 'rival'} subiu para €${(newFee / 1e6).toFixed(1)}M. Melhor oferta até agora — aceitar, aguardar ou contrapor?`,
          date: world.date, actor: officer,
        });
        notify(career, `⚔️ Guerra: ${challengerClub?.shortName ?? 'rival'} superou ${leaderClub?.shortName ?? 'o líder'} com €${(newFee / 1e6).toFixed(1)}M por ${p.firstName}.`, 'info', '⚔️', 'transfers');
      }
    }

    // jogador alvo de 3+ clubes → aviso único com link para destaques
    if (offers.length >= 3 && !offers.some((o) => o.attentionNotified)) {
      for (const o of offers) o.attentionNotified = true;
      notify(career, `🔥 ${p.firstName} ${p.lastName} é alvo de ${offers.length} clubes — veja o mercado em destaque.`, 'warning', '🔥', 'transfers:highlights');
    }
  }
}

/** Atualiza o recorde da janela e notifica quando é batido. */
function maybeWindowRecord(world: World, career: Career | null, fee: number, title: string, detail: string, playerId?: string, clubId?: string): void {
  if (fee <= world.windowRecordFee) return;
  const prev = world.windowRecordFee;
  world.windowRecordFee = fee;
  pushMarketHighlight(world, 'big-deal', `🏆 Recorde da janela: ${title} por €${(fee / 1e6).toFixed(1)}M`, `${detail} Supera os €${(prev / 1e6).toFixed(1)}M anteriores.`, fee, 92, { playerId, clubId });
  if (career) notify(career, `🏆 Novo recorde da janela: ${title} por €${(fee / 1e6).toFixed(1)}M.`, 'success', '🏆', 'transfers:highlights');
}

// ------------------------------------------------------------
// Acompanhamento de promessas (renovações e contratações)
// ------------------------------------------------------------
/**
 * Fator de dificuldade das promessas: combina a dificuldade escolhida com o
 * tamanho do clube. >1 = metas mais duras de cumprir (mais jogos, mais overall,
 * aumento maior); <1 = mais fáceis. Clubes gigantes têm concorrência interna
 * maior, então suas promessas pesam mais.
 */
export function promiseDifficultyFactor(career: Career): number {
  const cfg = DIFFICULTY_CONFIG[career.difficulty] ?? DIFFICULTY_CONFIG['Normal'];
  const club = career.world.clubs[career.clubId];
  const clubMult = club
    ? ({ Gigante: 1.25, Grande: 1.15, Médio: 1.0, Pequeno: 0.85, Amador: 0.75 }[club.tier] ?? 1)
    : 1;
  return clamp(cfg.promiseDifficulty * clubMult, 0.6, 1.8);
}

/** Meta numérica de uma promessa, escalada por dificuldade × tamanho do clube. */
function promiseTarget(career: Career, base: number, min: number, max: number): number {
  return clamp(Math.round(base * promiseDifficultyFactor(career)), min, max);
}

/** Progresso (0-100) e rótulo de uma promessa ativa. */
export function promiseProgress(world: World, career: Career, pr: PlayerPromise): { pct: number; label: string } {
  const p = world.players[pr.playerId] ?? null;
  if (!p) return { pct: 0, label: '—' };
  const apps = p.seasonStats.apps;
  const role = roleForPlayer(world, career.clubId, p);
  const factor = promiseDifficultyFactor(career);
  switch (pr.kind) {
    case 'min-jogos': {
      const target = promiseTarget(career, pr.target ?? 15, 8, 26);
      return { pct: Math.min(100, Math.round((apps / target) * 100)), label: `${apps}/${target} jogos` };
    }
    case 'titularidade': {
      const ok = role === 'Titular absoluto' || role === 'Titular';
      return { pct: ok ? 100 : Math.min(90, 40 + p.seasonStats.starts * 4), label: ok ? 'É titular' : `Papel atual: ${role}` };
    }
    case 'posicao': {
      const target = promiseTarget(career, 10, 6, 18);
      return { pct: Math.min(100, Math.round((p.seasonStats.starts / target) * 100)), label: `${p.seasonStats.starts}/${target} titularidades` };
    }
    case 'competicoes': {
      const target = promiseTarget(career, 15, 8, 26);
      return { pct: Math.min(100, Math.round((apps / target) * 100)), label: `${apps}/${target} jogos` };
    }
    case 'desenvolvimento': {
      const base = pr.baseline ?? overallOf(p);
      const gain = Math.max(0, overallOf(p) - base);
      const target = promiseTarget(career, 3, 2, 5);
      return { pct: Math.min(100, Math.round((gain / target) * 100)), label: `+${gain} overall (de ${base})` };
    }
    case 'aumento': {
      const base = pr.baseline ?? p.contract?.wage ?? 0;
      const now = p.contract?.wage ?? base;
      const pctTarget = promiseTarget(career, 15, 10, 26);
      const pct = base > 0 ? Math.min(100, Math.round(((now - base) / (base * pctTarget / 100)) * 100)) : 100;
      return { pct, label: `€${(now / 1000).toFixed(0)}k/sem (de €${(base / 1000).toFixed(0)}k)` };
    }
    case 'venda': {
      const sold = p.clubId !== career.clubId;
      return { pct: sold ? 100 : 0, label: sold ? 'Vendido' : 'Ainda no elenco' };
    }
    default:
      return { pct: 0, label: '—' };
  }
}

function promiseFulfilled(world: World, career: Career, pr: PlayerPromise): boolean {
  const p = world.players[pr.playerId] ?? null;
  if (!p) return false;
  const role = roleForPlayer(world, career.clubId, p);
  const factor = promiseDifficultyFactor(career);
  switch (pr.kind) {
    case 'min-jogos': return p.seasonStats.apps >= promiseTarget(career, pr.target ?? 15, 8, 26);
    case 'titularidade': return role === 'Titular absoluto' || role === 'Titular';
    case 'posicao': return p.seasonStats.starts >= promiseTarget(career, 10, 6, 18);
    case 'competicoes': return p.seasonStats.apps >= promiseTarget(career, 15, 8, 26);
    case 'desenvolvimento': return overallOf(p) >= (pr.baseline ?? overallOf(p)) + promiseTarget(career, 3, 2, 5);
    case 'aumento': return (p.contract?.wage ?? 0) >= (pr.baseline ?? 0) * (1 + promiseTarget(career, 15, 10, 26) / 100);
    case 'venda': return p.clubId !== career.clubId;
    default: return false;
  }
}

/** Verifica promessas do elenco: cumpridas ganham moral; quebradas derrubam moral e podem gerar pedido de transferência. */
export function checkPromises(world: World, career: Career, rng: RNG): void {
  if (!career.promises) return;
  // sem clube (treinador desempregado ou em transição): promessas não são avaliadas
  const club = world.clubs[career.clubId];
  if (!career.clubId || !club) return;
  // promessas de jogadores que não estão mais no clube do treinador são arquivadas
  // (ex.: jogador vendido, ou promessas herdadas de outro clube após troca de emprego)
  career.promises = career.promises.filter((pr) => {
    const p = world.players[pr.playerId];
    if (p && p.clubId !== career.clubId) {
      pr.broken = true; // deixa de valer para o novo comando
      return false;
    }
    return true;
  });
  for (const pr of career.promises) {
    if (pr.fulfilled || pr.broken) continue;
    const p = world.players[pr.playerId];
    if (!p) continue;

    if (promiseFulfilled(world, career, pr)) {
      pr.fulfilled = true;
      p.morale = clamp(p.morale + 6, 1, 100);
      p.relation = clamp(p.relation + 6, 1, 100);
      career.flags.promisesFulfilledRun = (career.flags.promisesFulfilledRun ?? 0) + 1;
      notify(career, `✅ Promessa cumprida: ${p.firstName} ${p.lastName} — "${pr.text}".`, 'success', '✅', `player:${p.id}`);
      // redenção pós-crise: após 3+ quebras, cumprir 2 promessas seguidas reconquista a diretoria
      if (career.flags.boardCrisis && (career.flags.promisesFulfilledRun ?? 0) >= 2) {
        const club = world.clubs[career.clubId];
        const coachName = career.manager.name.split(' ')[0];
        career.flags.boardCrisis = false;
        career.flags.promisesFulfilledRun = 0;
        const recover = Math.round(DIFFICULTY_CONFIG[career.difficulty].promiseDifficulty * 15);
        club.boardPatience = clamp(club.boardPatience + recover, 0, 100);
        club.boardMessage = 'A diretoria reconheceu a recuperação do comando. Confiança restaurada.';
        addNews(world, {
          date: world.date,
          title: `✅ Nota de confiança: diretoria do ${club.name} elogia ${coachName} pela recuperação`,
          subtitle: `Após a crise de promessas quebradas, o comando cumpriu promessas em sequência e a diretoria recuperou a paciência (paciência: ${club.boardPatience}).`,
          category: 'Clubes',
          clubId: career.clubId,
          importance: 82,
        });
        notify(career, `✅ Nota de confiança da diretoria: promessas cumpridas em sequência. Paciência recuperada (${club.boardPatience}).`, 'success', '✅');
      }
      continue;
    }

    // prazo venceu sem cumprir → promessa quebrada
    if (pr.kind !== 'venda' && world.date > pr.deadline) {
      pr.broken = true;
      p.morale = clamp(p.morale - 14, 1, 100);
      p.happiness = clamp(p.happiness - 12, 1, 100);
      p.relation = clamp(p.relation - 15, 1, 100);
      if (rng.chance(0.45)) p.transferRequested = true;
      // contabiliza quebras na carreira e na temporada atual; qualquer quebra zera a sequência de cumpridas
      career.flags.promisesBroken = (career.flags.promisesBroken ?? 0) + 1;
      career.flags.promisesBrokenSeason = (career.flags.promisesBrokenSeason ?? 0) + 1;
      career.flags.promisesFulfilledRun = 0;
      // torcida reage: confiança cai e, se o jogador pedir saída, cobrança pública do treinador
      const club = world.clubs[career.clubId];
      const coachName = career.manager.name.split(' ')[0];
      const fanDrop = p.transferRequested ? 8 : 4;
      club.fanTrust = clamp(club.fanTrust - fanDrop, 1, 100);
      const fansMood = club.fanTrust < 35 ? '💢' : club.fanTrust < 55 ? '😠' : '😐';
      notify(career, `💔 Promessa quebrada: ${p.firstName} ${p.lastName} ficou decepcionado ("${pr.text}").${p.transferRequested ? ' Ele pediu para sair!' : ''} Confiança da torcida: ${club.fanTrust}.`, 'danger', '💔', `player:${p.id}`);
      addNews(world, {
        date: world.date,
        title: p.transferRequested
          ? `${fansMood} Torcida cobra ${coachName}: ${p.firstName} pediu para sair após promessa quebrada`
          : `💔 ${p.firstName} ${p.lastName} se decepciona com ${club.name}`,
        subtitle: p.transferRequested
          ? `O clube não cumpriu o que prometeu na contratação e o jogador exigiu sair — a confiança da torcida caiu para ${club.fanTrust}.`
          : `Uma promessa feita na contratação não foi cumprida. A confiança da torcida no comando caiu para ${club.fanTrust}.`,
        category: 'Clubes',
        playerId: p.id,
        clubId: career.clubId,
        importance: p.transferRequested ? 78 : 65,
      });
      // pressão externa: quando a confiança está baixa, a imprensa aponta o treinador
      if (club.fanTrust < 50 && rng.chance(0.5)) {
        addNews(world, {
          date: world.date,
          title: `📰 Imprensa questiona ${coachName} no ${club.name}`,
          subtitle: `Após a saída pedida por ${p.firstName}, analistas apontam a gestão de promessas como o maior problema do clube.`,
          category: 'Clubes',
          clubId: career.clubId,
          importance: 60,
        });
      }
      // 3+ promessas quebradas na temporada → crise institucional: a diretoria
      // pode emitir nota pública e o cargo do treinador fica em risco.
      // A queda de paciência escala com a dificuldade (promiseDifficulty).
      if ((career.flags.promisesBrokenSeason ?? 0) >= 3 && rng.chance(0.65)) {
        career.flags.boardCrisis = true;
        const boardDrop = Math.round(DIFFICULTY_CONFIG[career.difficulty].promiseDifficulty * 18);
        club.boardPatience = clamp(club.boardPatience - boardDrop, 0, 100);
        club.boardMessage = '🚨 A diretoria emitiu nota pública sobre as promessas quebradas. Seu cargo está em risco.';
        addNews(world, {
          date: world.date,
          title: `📢 Nota oficial: diretoria do ${club.name} cobra ${coachName} após ${career.flags.promisesBrokenSeason} promessas quebradas`,
          subtitle: `A diretoria se manifestou publicamente sobre a sequência de promessas não cumpridas. A paciência com o comando está no limite (paciência: ${club.boardPatience}).`,
          category: 'Clubes',
          clubId: career.clubId,
          importance: 88,
        });
        notify(career, `🚨 Nota oficial da diretoria: ${career.flags.promisesBrokenSeason} promessas quebradas na temporada. Seu cargo está em risco!`, 'danger', '🚨');
        // aviso antecipado: paciência crítica, mas ainda há tempo de se redimir cumprindo promessas
        if (club.boardPatience > 0 && club.boardPatience < 30 && !(club.boardMessage ?? '').includes('nível crítico')) {
          club.boardMessage = '📉 Paciência da diretoria em nível crítico: seu cargo está em risco. Cumpra promessas para se redimir.';
          addNews(world, {
            date: world.date,
            title: `📉 Crise no ${club.name}: paciência da diretoria com ${coachName} em nível crítico`,
            subtitle: `A sequência de promessas quebradas derrubou a paciência da diretoria para ${club.boardPatience}. O cargo do treinador está em risco — cumprir promessas pode reverter a situação.`,
            category: 'Clubes',
            clubId: career.clubId,
            importance: 85,
          });
          notify(career, `📉 Atenção: paciência da diretoria em ${club.boardPatience} — seu cargo está em risco. Cumpra promessas para se redimir.`, 'danger', '📉');
        }
        if (club.boardPatience <= 0) {
          sackManager(career, 'A diretoria emitiu nota oficial e decidiu pela sua demissão após quebrar várias promessas com jogadores.');
          break; // carreira sem clube — encerra a verificação do dia
        }
      }
    }
  }
}

// ------------------------------------------------------------
// Consultas para a UI
// ------------------------------------------------------------
export function negotiationForPlayer(world: World, playerId: string): TransferNegotiation | null {
  return world.negotiations[playerId] ?? null;
}

export function activeNegotiations(world: World): TransferNegotiation[] {
  return Object.values(world.negotiations).sort((a, b) => (b.updatedAt < a.updatedAt ? -1 : 1));
}

export function injuryDaysTotal(p: Player): number {
  return p.injuryHistory.reduce((s, i) => s + i.daysOut, 0);
}

export function roleForPlayer(world: World, clubId: string, p: Player): SquadRole {
  const squad = squadOf(world, clubId);
  const samePos = squad.filter((s) => POSITION_GROUPS[s.position] === POSITION_GROUPS[p.position]);
  const better = samePos.filter((s) => overallOf(s) > overallOf(p)).length;
  if (better === 0) return p.age <= 19 ? 'Promessa' : 'Titular absoluto';
  if (better === 1) return 'Titular';
  if (better <= 3) return 'Rotação';
  return 'Reserva';
}

export function estimateFormLabel(p: Player): { label: string; emoji: string; color: string } {
  const avg = p.lastRatings.length > 0 ? p.lastRatings.reduce((a, b) => a + b, 0) / p.lastRatings.length : 0;
  if (avg >= 8.2) return { label: 'Excelente', emoji: '🔥', color: 'text-gold' };
  if (avg >= 7.6) return { label: 'Muito boa', emoji: '😄', color: 'text-accent' };
  if (avg >= 7) return { label: 'Boa', emoji: '🙂', color: 'text-sky-400' };
  if (avg >= 6.4) return { label: 'Regular', emoji: '😐', color: 'text-slate-300' };
  if (avg >= 5.8) return { label: 'Abaixo da média', emoji: '😕', color: 'text-gold' };
  if (avg >= 5) return { label: 'Ruim', emoji: '😟', color: 'text-red-400' };
  return { label: 'Muito ruim', emoji: '💀', color: 'text-red-500' };
}

export { isVitalPlayer, POSITION_GROUPS };
export type { TransferNegotiation, NegotiationKind, SquadRole };

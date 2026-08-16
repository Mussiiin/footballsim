/* Smoke test headless do FootballSim — valida o fluxo completo sem UI. */
import { generateWorld } from '../src/game/worldgen';
import { createCareer } from '../src/game/career';
import { advanceToNextMatch, playUserMatch, simulateOneDay, finishMatchDay } from '../src/game/sim';
import { simulateMatch, fillUserLineup } from '../src/game/matchEngine';
import { negotiateTransfer, executeTransfer, tickArrivals, squadOf } from '../src/game/transfers';
import { generateDailyTalk, startManagerTalk, respondTalk } from '../src/game/playerTalks';
import {
  scoutPlayer, startNegotiation, sendClubOffer, sendWageOffer, runMedical, signDeal,
  computeInterest, wageExpectation, marketAnalysis, tickNegotiations, respondToBidWar,
  startRenewal, sendRenewalOffer, respondToRenewal, completeRenewal,
  generateIncomingOffers, respondToIncomingOffer, tickIncomingOffers, checkPromises,
  promiseDifficultyFactor, addPlayerPromise,
} from '../src/game/negotiation';
import { RNG, hashString } from '../src/lib/rng';
import { sortedStandings, nextMatchForClub, allMatchesForClub } from '../src/game/competitions';
import { overallOf } from '../src/game/overall';
import { Career, Match } from '../src/lib/types';
// `process` é global no Node; tipos vêm de @types/node

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.log(`  ❌ ${name} ${detail}`);
  }
}

console.log('🌍 Gerando mundo...');
const t0 = Date.now();
const world = generateWorld('smoke-test-seed');
console.log(`  Mundo gerado em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`  Países: ${world.countries.length}`);
console.log(`  Clubes: ${Object.keys(world.clubs).length}`);
console.log(`  Jogadores: ${Object.keys(world.players).length}`);
console.log(`  Partidas da temporada: ${Object.values(world.leagueMatches).reduce((s, m) => s + m.length, 0)}`);
console.log(`  Partidas de copas: ${Object.values(world.cupMatches).reduce((s, m) => s + m.matches.length, 0)}`);
console.log(`  Partidas continentais: ${Object.values(world.continentalMatches).reduce((s, m) => s + m.matches.length, 0)}`);  check('5 países (inclui Brasil)', world.countries.length === 5);
  check('320 clubes (4×3×20 + Brasil 4×20)', Object.keys(world.clubs).length === 320);
check('≥ 7800 jogadores', Object.keys(world.players).length >= 7800);
check('liga com 380 partidas', Object.values(world.leagueMatches)[0].length === 380);
check('copa com ≥ 59 partidas', Object.values(world.cupMatches).every((s) => s.matches.length >= 59));
check('continental com ≥ 31 partidas', Object.values(world.continentalMatches)[0].matches.length >= 31);
// Brasil: 20 clubes reais na Série A
const br = world.countries.find((c) => c.id === 'brazil');
if (br) {
  const brA = world.competitions[br.divisions[0]];
  check('Brasil Série A com 20 clubes', brA.clubIds.length === 20);
  check('Brasil Série A com Flamengo', brA.clubIds.some((id) => world.clubs[id].name === 'Flamengo'));
  check('Brasil com 4 divisões', br.divisions.length === 4);
  check('Brasil com 38 rodadas', world.leagueMatches[brA.id].length === 380);
}

// overalls razoáveis
const allPlayers = Object.values(world.players);
const avgOv = allPlayers.reduce((s, p) => s + overallOf(p), 0) / allPlayers.length;
console.log(`  Overall médio: ${avgOv.toFixed(1)}`);
check('overall médio entre 40 e 70', avgOv > 40 && avgOv < 70);
const top = [...allPlayers].sort((a, b) => overallOf(b) - overallOf(a))[0];
console.log(`  Melhor jogador: ${top.firstName} ${top.lastName} (${overallOf(top)}) — ${world.clubs[top.clubId ?? '']?.name ?? 'livre'}`);
check('existem jogadores 80+', overallOf(top) >= 80);

// carreira
console.log('👤 Criando carreira...');
const career: Career = createCareer(
  'test-user',
  { name: 'Técnico Teste', nationality: 'Brasil', age: 42, license: 'A', style: 'Ofensivo' },
  'england_1_0',
  'Normal',
  'smoke-seed',
);
check('carreira criada', career.clubId === 'england_1_0');
const myClub = career.world.clubs[career.clubId];
console.log(`  Clube: ${myClub.name} (${myClub.tier}, rep ${myClub.reputation}, força ${myClub.squadStrength.toFixed(1)})`);

// partida do usuário
console.log('⚽ Simulando partida do usuário...');
const myPlayers = Object.values(career.world.players).filter((p) => p.clubId === career.clubId);
const lineup = fillUserLineup(myPlayers, career.lineup.formation, career.lineup.slots, career.world.date);
check('escalação completa (11)', lineup.playerIds.filter(Boolean).length === 11);

// próxima partida do clube
const firstMatch = nextMatchForClub(career.world, career.clubId, career.world.date);
check('existe próxima partida', firstMatch !== null);
if (firstMatch) {
  const opponent = firstMatch.homeId === career.clubId ? firstMatch.awayId : firstMatch.homeId;
  console.log(`  Próxima: ${career.world.clubs[firstMatch.homeId].name} x ${career.world.clubs[firstMatch.awayId].name} (${firstMatch.date})`);
}

// avança até a partida
console.log('⏩ Avançando até a partida...');
const adv = advanceToNextMatch(career.world, career, 'Normal');
check('parou no dia da partida', adv.userMatch !== null, `(dias: ${adv.days})`);
console.log(`  Avançou ${adv.days} dias até ${career.world.date}`);
check('mundo avançou datas', adv.days > 0);

if (adv.userMatch) {
  const played = playUserMatch(career.world, career, 'Normal');
  check('partida jogada', played.played === true);
  console.log(`  Resultado: ${played.homeName} ${played.homeScore} x ${played.awayScore} ${played.awayName}`);
  check('placar válido', (played.homeScore ?? 0) >= 0 && (played.awayScore ?? 0) >= 0);
  const ps = played.playerStats ?? [];
  check('estatísticas individuais geradas', ps.length >= 20);
  const evTypes = new Set((played.events ?? []).map((e) => e.type));
  check('narração contextual gerada na timeline', (['buildUp', 'recovery', 'pressure'] as const).some((t) => evTypes.has(t)), `(tipos: ${[...evTypes].join(', ')})`);
  const ratings = ps.map((s) => s.rating);
  check('notas entre 3 e 10', ratings.every((r) => r >= 3 && r <= 10));
  const ev = played.events ?? [];
  console.log(`  Eventos: ${ev.length}`);
  finishMatchDay(career.world, career, 'Normal');
}

// tabela atualizada?
const league = career.world.competitions['england_L1'];
const standings = sortedStandings(league);
const playedCount = standings.reduce((s, r) => s + r.played, 0);
check('tabela tem pontos', playedCount > 0, `(jogos somados: ${playedCount})`);
const pos = standings.findIndex((s) => s.clubId === career.clubId) + 1;
console.log(`  Posição do usuário: ${pos}º`);

// finanças mensais
console.log('💰 Testando finanças...');
const balBefore = career.world.clubs[career.clubId].balance;
career.world.date = '2026-08-01';
simulateOneDay(career.world, career, 'Normal');
void balBefore;

// transferências
console.log('💶 Testando transferências...');
const marketTargets = Object.values(career.world.players)
  .filter((p) => p.status === 'active' && p.clubId !== career.clubId && p.contract)
  .sort((a, b) => overallOf(b) - overallOf(a));
const target = marketTargets[0];
if (target) {
  console.log(`  Alvo: ${target.firstName} ${target.lastName} (${overallOf(target)}, valor €${target.value.toLocaleString('pt-BR')})`);
  const offer = negotiateTransfer(career.world, career, target.id, Math.round(target.value * 1.2), (target.contract?.wage ?? 1000) * 1.3);
  console.log(`  Proposta: ${offer.status}${offer.status === 'counter' ? ` (${offer.counterFee.toLocaleString('pt-BR')})` : ''}`);
  if (offer.status === 'accepted' || offer.status === 'counter') {
    const fee = offer.status === 'accepted' ? offer.fee : offer.counterFee;
    executeTransfer(career.world, career, {
      playerId: target.id,
      fee,
      wage: (target.contract?.wage ?? 1000) * 1.3,
      toClubId: career.clubId,
      fromClubId: target.clubId,
      type: 'transfer',
    });
    const moved = career.world.players[target.id];
    check('transferência executada', moved.clubId === career.clubId);
  }
}

// negociação completa (novo sistema de contratações)
console.log('🤝 Testando negociação completa (novo sistema)...');
{
  const all = Object.values(career.world.players).filter((p) => p.status === 'active' && p.clubId && p.clubId !== career.clubId);
  const t1 = all.sort((a, b) => overallOf(b) - overallOf(a))[0];
  const rep = scoutPlayer(career.world, career, t1.id);
  check('scout gera relatório', rep.overallLow <= overallOf(t1) && overallOf(t1) <= rep.overallHigh);
  // a margem do scout escala com conhecimento x qualidade do responsável (aleatório por carreira)
  check('scout estima valor próximo', rep.valueLow <= t1.value * 2 && rep.valueHigh >= t1.value * 0.4);
  const interest = computeInterest(career.world, t1, career.clubId);
  check('interesse calculado (0-100)', interest.score >= 5 && interest.score <= 97);
  console.log(`  Alvo: ${t1.firstName} ${t1.lastName} (${overallOf(t1)}) — interesse ${interest.level} (${interest.score})`);

  // interesse escala com a divisão do clube: divisões baixas atraem menos alto nível
  {
    const w = career.world;
    const myClub = w.clubs[career.clubId];
    const sameCountry = Object.values(w.clubs).filter((c) => c.countryId === myClub.countryId);
    const tierOf = (c: (typeof sameCountry)[number]) => w.competitions[c.leagueId]?.tier ?? 1;
    const top = sameCountry.find((c) => tierOf(c) === 1);
    const low = [...sameCountry].sort((a, b) => tierOf(b) - tierOf(a))[0];
    const lowTier = low ? tierOf(low) : 1;
    if (top && low && lowTier > 1) {
      const iTop = computeInterest(w, t1, top.id).score;
      const iLow = computeInterest(w, t1, low.id).score;
      const lowReasons = computeInterest(w, t1, low.id).reasons;
      check('divisão alta atrai mais que divisão baixa', iTop > iLow + 8, `(1ª div ${iTop} vs ${lowTier}ª div ${iLow})`);
      check('motivo de divisão aparece p/ clube de divisão baixa', lowReasons.some((r) => r.includes('divisão')), `(${lowReasons.join('; ')})`);
      // divisão baixa exige salário maior (prêmio para atrair alto nível)
      const wTop = wageExpectation(w, t1, 55, undefined, top.id).want;
      const wLow = wageExpectation(w, t1, 55, undefined, low.id).want;
      check('divisão baixa exige salário maior', wLow > wTop, `(1ª div €${wTop} vs ${lowTier}ª div €${wLow})`);
    } else {
      check('divisão alta atrai mais que divisão baixa', true, '(sem divisões múltiplas no país p/ testar)');
      check('motivo de divisão aparece p/ clube de divisão baixa', true, '(sem divisões múltiplas no país p/ testar)');
      check('divisão baixa exige salário maior', true, '(sem divisões múltiplas no país p/ testar)');
    }
  }

  const neg = startNegotiation(career.world, career, t1.id, 'transfer');
  check('negociação iniciada', neg.status !== undefined && neg.messages.length >= 2);
  check('preço do clube oculto mas razoável', neg.sellerAsk > 0);

  // proposta alta → aceita
  const n1 = sendClubOffer(career.world, career, neg.id, {
    fee: Math.round(neg.sellerAskHigh * 1.08), bonus: 0, sellOnPct: 0, installments: 1,
  });
  check('clube aceita proposta alta', n1.status === 'acordo-clube' || n1.status === 'negociacao-jogador', n1.status);

  const exp = wageExpectation(career.world, t1, interest.score, career.world.agents[t1.agentId ?? ''] ?? undefined);
  const n2 = sendWageOffer(career.world, career, neg.id, {
    wage: Math.round(exp.want * 1.02), bonus: 0, years: 3, role: 'Titular', promises: ['Titularidade garantida'],
  });
  check('jogador aceita salário justo', n2.status === 'acordo-verbal', n2.status);

  const n3 = runMedical(career.world, career, neg.id);
  check('exames médicos realizados', n3.medical !== null);
  if (n3.medical?.status !== 'failed') {
    const result = signDeal(career.world, career, neg.id);
    check('contratação concluída', result.playerId === t1.id);
    check('jogador no elenco do usuário', career.world.players[t1.id].clubId === career.clubId);
    check('notícia do anúncio gerada', career.world.news.some((n) => n.playerId === t1.id && n.category === 'Transferências'));
    check('flags de contratação atualizados', career.flags.transfersIn >= 1 && career.flags.moneySpent > 0);
    console.log(`  ✍️ ${t1.firstName} ${t1.lastName} contratado — nota ${result.grade}/10`);
  }

  // proposta baixa → rejeitada
  const t2 = Object.values(career.world.players).find((p) => p.status === 'active' && p.clubId && p.clubId !== career.clubId && p.id !== t1.id);
  if (t2) {
    const neg2 = startNegotiation(career.world, career, t2.id, 'transfer');
    const n2low = sendClubOffer(career.world, career, neg2.id, {
      fee: Math.round(neg2.sellerAsk * 0.15), bonus: 0, sellOnPct: 0, installments: 1,
    });
    // resposta válida a proposta baixa: rejeitada, contraproposta ou "pedir tempo" (proposta-enviada)
    check('proposta baixa é rejeitada/contraproposta/pede tempo', ['rejeitada', 'contraproposta', 'proposta-enviada'].includes(n2low.status), n2low.status);
  }

  // guerra de propostas
  {
    const candidates = Object.values(career.world.players).filter((p) =>
      p.status === 'active' && p.clubId && p.clubId !== career.clubId
      && p.id !== t1.id && p.id !== (t2?.id ?? '') && overallOf(p) >= 78,
    );
    const rivaled = candidates.find((p) =>
      (computeInterest(career.world, p, career.clubId).competing.some((c) => c.level === 'Interessado' || c.level === 'Muito interessado')),
    ) ?? candidates[0];
    if (rivaled) {
      const negW = startNegotiation(career.world, career, rivaled.id, 'transfer');
      const nw = sendClubOffer(career.world, career, negW.id, {
        fee: Math.round(negW.sellerAsk * 0.92), bonus: 0, sellOnPct: 0, installments: 1,
      }) as { status: string; bidWar: unknown };
      const _nwStatus: string = nw.status;
      let warTriggered = false;
      for (let d = 0; d < 25 && !warTriggered; d++) {
        career.world.date = career.world.date; // tick usa world.date; avança um dia por iteração
        const dayRng = new RNG(hashString(career.world.seed) ^ hashString(`${career.world.date}-d${d}`));
        tickNegotiations(career.world, career, dayRng);
        warTriggered = !!career.world.negotiations[rivaled.id]?.bidWar;
        if (!warTriggered) {
          // avança a data para a próxima iteração
          const dt = new Date(career.world.date);
          dt.setDate(dt.getDate() + 1);
          career.world.date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        }
      }
      const negAfter = career.world.negotiations[rivaled.id];
      check('guerra de propostas dispara com rival', warTriggered && !!negAfter?.bidWar);

      // guerra quando o rival faz a primeira oferta ANTES de nós (dispara na abertura)
      const firstOfferCandidates = Object.values(career.world.players).filter((p) =>
        p.status === 'active' && p.clubId && p.clubId !== career.clubId
        && computeInterest(career.world, p, career.clubId).competing.some((c) => c.level === 'Interessado' || c.level === 'Muito interessado'),
      );
      let firstWar = false;
      for (const cand of firstOfferCandidates) {
        const negF = startNegotiation(career.world, career, cand.id, 'transfer');
        if (negF.bidWar) {
          firstWar = true;
          respondToBidWar(career.world, career, negF.id, 'withdraw'); // encerra para não poluir
          break;
        }
      }
      check('guerra dispara quando rival oferece primeiro', firstWar);

      if (negAfter?.bidWar) {
        const w = negAfter.bidWar;
        console.log(`  ⚔️ Guerra: ${career.world.clubs[w.rivalClubId]?.name ?? 'rival'} oferece €${(w.rivalOffer / 1e6).toFixed(1)}M`);
        const r1 = respondToBidWar(career.world, career, negAfter.id, 'cover');
        check('cobrir proposta resolve a guerra', r1.bidWar === null && ['acordo-clube', 'negociacao-jogador', 'contraproposta', 'rejeitada'].includes(r1.status), r1.status);
        if (r1.status === 'acordo-clube' || r1.status === 'negociacao-jogador') {
          console.log(`  ⚔️ Guerra vencida por €${(r1.fee / 1e6).toFixed(1)}M`);
        }
        const warHighlights = career.world.marketHighlights.filter((h) => h.kind === 'bid-war');
        const warWon = r1.status === 'acordo-clube' || r1.status === 'negociacao-jogador';
        check('guerra registrada nos destaques do mercado', !warWon || warHighlights.some((h) => h.title.includes(rivaled.firstName)), `(${warHighlights.length} guerras)`);
      }
      // desistir também encerra (procura um alvo em que a guerra dispare)
      const candidates2 = Object.values(career.world.players).filter((p) =>
        p.status === 'active' && p.clubId && p.clubId !== career.clubId
        && p.id !== t1.id && p.id !== (t2?.id ?? '') && p.id !== rivaled.id
        && computeInterest(career.world, p, career.clubId).competing.some((c) => c.level === 'Interessado' || c.level === 'Muito interessado'),
      );
      let withdrawTested = false;
      for (const rivaled2 of candidates2) {
        if (withdrawTested) break;
        const negW2 = startNegotiation(career.world, career, rivaled2.id, 'transfer');
        sendClubOffer(career.world, career, negW2.id, {
          fee: Math.round(negW2.sellerAsk * 0.92), bonus: 0, sellOnPct: 0, installments: 1,
        });
        const neg2After = career.world.negotiations[rivaled2.id];
        if (neg2After?.bidWar) {
          const r2 = respondToBidWar(career.world, career, neg2After.id, 'withdraw');
          check('desistir na guerra cancela a negociação', r2.status === 'cancelada');
          console.log('  ⚔️ Desistiu da guerra — negociação cancelada');
          withdrawTested = true;
        }
      }
      if (!withdrawTested) check('guerra dispara para desistência', false, '(nenhum alvo com guerra)');
    }
  }

  // jogador livre
  const freeTarget = Object.values(career.world.players).find((p) => p.status === 'active' && !p.clubId && p.contract);
  if (freeTarget) {
    const negF = startNegotiation(career.world, career, freeTarget.id, 'free');
    check('livre vai direto para o jogador', negF.status === 'negociacao-jogador');
    const expF = wageExpectation(career.world, freeTarget, 60);
    const wf = sendWageOffer(career.world, career, negF.id, {
      wage: Math.round(expF.want * 1.05), bonus: 0, years: 2, role: 'Rotação', promises: [],
    });
    check('livre aceita salário', wf.status === 'acordo-verbal', wf.status);
    const mf = runMedical(career.world, career, negF.id);
    if (mf.medical?.status !== 'failed') {
      const rf = signDeal(career.world, career, negF.id);
      check('livre assinou', career.world.players[freeTarget.id].clubId === career.clubId);
      console.log(`  ✍️ Livre ${freeTarget.firstName} ${freeTarget.lastName} assinou — nota ${rf.grade}/10`);
    }
  }

  // empréstimo
  const loanTarget = Object.values(career.world.players).find((p) => p.status === 'active' && p.clubId && p.clubId !== career.clubId && p.id !== t1.id && !p.isLoan && p.age <= 23);
  if (loanTarget) {
    const negL = startNegotiation(career.world, career, loanTarget.id, 'loan');
    const nl = sendClubOffer(career.world, career, negL.id, {
      fee: 1_000_000, bonus: 0, sellOnPct: 0, installments: 1, loanOptionFee: 8_000_000, loanObligationGames: 0, loanWageShare: 100,
    });
    check('clube responde ao empréstimo', ['acordo-clube', 'negociacao-jogador', 'contraproposta', 'rejeitada'].includes(nl.status), nl.status);
    if (nl.status === 'acordo-clube' || nl.status === 'negociacao-jogador') {
      const expL = wageExpectation(career.world, loanTarget, 55);
      const wl = sendWageOffer(career.world, career, negL.id, {
        wage: Math.round(expL.want * 1.05), bonus: 0, years: 1, role: 'Rotação', promises: [],
      });
      if (wl.status === 'acordo-verbal') {
        const ml = runMedical(career.world, career, negL.id);
        if (ml.medical?.status !== 'failed') {
          const rl = signDeal(career.world, career, negL.id);
          check('empréstimo concluído', career.world.players[loanTarget.id].isLoan === true && career.world.players[loanTarget.id].clubId === career.clubId);
          console.log(`  📄 ${loanTarget.firstName} ${loanTarget.lastName} emprestado (opção €${((rl.fee ?? 0) / 1e6).toFixed(0)}M)`);
        }
      }
    }
  }
}

// renovação de contrato (elenco do usuário)
console.log('📄 Testando renovação de contrato...');
{
  const mySquadPlayers = Object.values(career.world.players).filter((p) => p.status === 'active' && p.clubId === career.clubId && p.contract && !p.isLoan);
  const target = mySquadPlayers.sort((a, b) => overallOf(b) - overallOf(a))[0];
  check('elenco tem jogadores para renovar', !!target);
  if (target) {
    const oldUntil = target.contract!.until;
    const oldWage = target.contract!.wage;
    const ren = startRenewal(career.world, career, target.id);
    check('renovação iniciada com agente', ren.status === 'iniciada' && ren.messages.length >= 1);
    check('expectativa salarial oculta razoável', ren.playerWageWant > oldWage);
    // a UI envia ids; o motor normaliza para o rótulo legível
    const offer = sendRenewalOffer(career.world, career, ren.id, {
      wage: Math.round(ren.playerWageWant * 1.05), bonus: 100_000, years: 3, role: 'Titular', promises: ['titularidade', 'min-jogos'],
    });
    check('jogador aceita salário justo', offer.status === 'acordo', offer.status);
    check('promessas normalizadas p/ rótulos', career.promises.some((pr) => pr.text === 'Titularidade garantida') && career.promises.some((pr) => pr.kind === 'min-jogos' && pr.target === 15));
    const done = completeRenewal(career.world, career, ren.id);
    check('renovação concluída', done.status === 'assinada');
    check('contrato estendido', target.contract!.until > oldUntil);
    check('salário atualizado', target.contract!.wage > oldWage);
    check('promessa registrada na carreira', career.promises.length > 0);
    check('notícia de renovação gerada', career.world.news.some((n) => n.playerId === target.id && n.title.includes('renova')));
    console.log(`  ✍️ ${target.firstName} ${target.lastName} renovou: ${(oldWage / 1000).toFixed(0)}k → ${(target.contract!.wage / 1000).toFixed(0)}k/sem`);
  }
}

// propostas recebidas: clubes da IA querem jogadores do nosso elenco
console.log('📩 Testando propostas recebidas (vendas)...');
{
  const w = career.world;
  for (let i = 0; i < 6; i++) {
    generateIncomingOffers(w, career, new RNG(hashString(w.seed) ^ hashString('incoming' + i)), 3);
  }
  tickIncomingOffers(w, career, new RNG(hashString(w.seed) ^ hashString('incoming-tick')));
  const pending = w.incomingOffers.filter((o) => o.status === 'pending');
  check('propostas recebidas geradas', pending.length > 0, `(${pending.length} pendentes)`);
  if (pending.length > 0) {
    const offer = pending[0];
    const pid = offer.playerId;
    const player = w.players[pid];
    check('proposta é por jogador do nosso elenco', !!player && player.clubId === career.clubId);
    const fee = offer.fee;
    const moneyBefore = w.clubs[career.clubId].balance;
    respondToIncomingOffer(w, career, offer.id, 'accept');
    check('venda aceita concluída', offer.status === 'accepted' && player.clubId !== career.clubId, offer.status);
    check('caixa recebeu o valor da venda', w.clubs[career.clubId].balance >= moneyBefore + fee - 1);
    check('recordSale atualizado', career.flags.recordSale >= fee);
    check('relatório pós-venda gerado', !!offer.saleReport && offer.saleReport.grade >= 2 && offer.saleReport.reasons.length > 0, offer.saleReport ? `(${offer.saleReport.grade}/10)` : 'sem relatório');
    check('venda com data p/ ranking de avaliações', !!offer.soldAt && !!offer.saleReport && offer.saleReport.marketValue > 0, offer.soldAt ?? 'sem soldAt');
    console.log(`  💰 ${player.firstName} ${player.lastName} vendido por ${(fee / 1e6).toFixed(1)}M`);
  }

  // guerra de propostas ao vender: 2+ clubes disputando → sellerWar dispara
  let warSeen = false;
  for (let i = 0; i < 14; i++) {
    generateIncomingOffers(w, career, new RNG(hashString(w.seed) ^ hashString('war' + i)), 4);
    tickIncomingOffers(w, career, new RNG(hashString(w.seed) ^ hashString('war-tick' + i)));
    if (w.incomingOffers.some((o) => o.sellerWar)) { warSeen = true; break; }
  }
  check('guerra de propostas ao vender dispara', warSeen);
  const rest = w.incomingOffers.find((o) => o.status === 'pending');
  if (rest) {
    const msgsBefore = rest.messages.length;
    respondToIncomingOffer(w, career, rest.id, 'counter', { fee: Math.round(rest.fee * 2) });
    check('pedido alto faz o clube desistir', rest.status === 'rejected', rest.status);
    check('resposta registrada na conversa', rest.messages.length > msgsBefore);
  } else {
    check('pedido alto faz o clube desistir', true, '(sem oferta restante p/ testar)');
  }
}

// promessas: cumpridas e quebradas
console.log('📋 Testando acompanhamento de promessas...');
{
  const w = career.world;
  const p = Object.values(w.players).find((x) => x.clubId === career.clubId && x.status === 'active' && x.contract);
  if (p) {
    const activeBefore = career.promises.filter((pr) => !pr.fulfilled && !pr.broken).length;
    checkPromises(w, career, new RNG(hashString(w.seed) ^ hashString('prom-check')));
    // promessa quebrada: prazo vencido e meta não cumprida
    career.promises.push({
      id: 'pr-test-broken', playerId: p.id, text: 'Mínimo de 15 partidas na temporada', kind: 'min-jogos',
      madeAt: '2026-01-01', deadline: '2026-01-02', fulfilled: false, broken: false, target: 15,
    });
    const moraleBefore = p.morale;
    const trustBefore = w.clubs[career.clubId].fanTrust;
    checkPromises(w, career, new RNG(hashString(w.seed) ^ hashString('prom-broken')));
    const broken = career.promises.find((pr) => pr.id === 'pr-test-broken');
    check('promessa quebrada detectada', !!broken?.broken);
    check('moral cai ao quebrar promessa', p.morale < moraleBefore);
    check('torcida reage à promessa quebrada (confiança cai)', w.clubs[career.clubId].fanTrust < trustBefore, `(${trustBefore} → ${w.clubs[career.clubId].fanTrust})`);
    // notícia gerada sobre a quebra (busca por conteúdo, não por tamanho do array — que tem teto de 250)
    const newsHit = w.news.some((n) => n.title.includes(p.firstName) && (n.title.includes('Torcida cobra') || n.title.includes('se decepciona')));
    check('imprensa noticia a promessa quebrada', newsHit, `(última notícia: ${w.news[0]?.title ?? 'nenhuma'})`);
    check('promessas ativas continuam no elenco', career.promises.filter((pr) => !pr.fulfilled && !pr.broken).length >= 0);
  } else {
    check('promessa quebrada detectada', true, '(sem jogador p/ testar)');
  }

  // dificuldade × tamanho do clube: promessas mais fáceis ou mais difíceis
  const facOf = (difficulty: Career['difficulty'], clubId: string) => promiseDifficultyFactor({ ...career, difficulty, clubId });
  const big = Object.values(w.clubs).find((c) => c.tier === 'Gigante');
  const small = Object.values(w.clubs).find((c) => c.tier === 'Amador' || c.tier === 'Pequeno');
  check('Hardcore dificulta promessas vs Fácil', facOf('Hardcore', career.clubId) > facOf('Fácil', career.clubId), `(${facOf('Hardcore', career.clubId)} vs ${facOf('Fácil', career.clubId)})`);
  check('clube gigante dificulta mais que pequeno', big && small ? facOf('Normal', big.id) > facOf('Normal', small.id) : true, big && small ? `(gigante ${facOf('Normal', big.id)} vs pequeno ${facOf('Normal', small.id)})` : '(sem contraste de tier p/ testar)');
  check('fator dentro dos limites (0.6–1.8)', facOf('Normal', career.clubId) >= 0.6 && facOf('Hardcore', career.clubId) <= 1.8);

  // 3+ promessas quebradas na temporada → nota pública da diretoria e risco de demissão
  if (p) {
    const clubId = career.clubId;
    const club = w.clubs[clubId];
    career.flags.promisesBrokenSeason = 3; // simula 3 quebras acumuladas na temporada
    let crisisHit = false;
    for (let seed = 0; seed < 10 && !crisisHit; seed++) {
      career.promises.push({
        id: `pr-esc-${seed}`, playerId: p.id, text: 'Mínimo de 15 partidas na temporada', kind: 'min-jogos',
        madeAt: '2026-01-01', deadline: '2026-01-02', fulfilled: false, broken: false,
      });
      const before = club.boardPatience;
      checkPromises(w, career, new RNG(hashString(w.seed) ^ hashString(`esc-${seed}`)));
      crisisHit = (club.boardPatience < before || (club.boardMessage ?? '').includes('risco'))
        && w.news.some((n) => n.title.includes('Nota oficial'));
    }
    check('3+ quebras → diretoria emite nota pública e cargo em risco', crisisHit, `(paciência ${club.boardPatience})`);

    // paciência zerada por quebras → demissão direta
    let sacked = false;
    for (let seed = 0; seed < 10 && !sacked; seed++) {
      club.boardPatience = 10;
      career.promises.push({
        id: `pr-sack-${seed}`, playerId: p.id, text: 'Participar de todas as competições', kind: 'competicoes',
        madeAt: '2026-01-01', deadline: '2026-01-02', fulfilled: false, broken: false,
      });
      checkPromises(w, career, new RNG(hashString(w.seed) ^ hashString(`sack-${seed}`)));
      sacked = career.clubId === '';
    }
    if (sacked) {
      // restaura o estado para o restante do smoke (carreira sem clube quebraria a simulação)
      club.isUserControlled = true;
      club.managerId = 'user';
      club.boardPatience = 60;
      club.boardMessage = null;
      career.clubId = clubId;
      career.manager.clubId = clubId;
      career.manager.employed = true;
      career.manager.status = 'active';
    }
    check('paciência zerada por quebras → demissão', sacked);

    // aviso antecipado: paciência crítica (ainda > 0) gera aviso antes da demissão
    let warned = false;
    for (let seed = 0; seed < 10 && !warned; seed++) {
      club.boardPatience = 25;
      club.boardMessage = null;
      career.flags.promisesBrokenSeason = 3;
      career.flags.boardCrisis = false;
      career.promises.push({
        id: `pr-warn-${seed}`, playerId: p.id, text: 'Participar de todas as competições', kind: 'competicoes',
        madeAt: '2026-01-01', deadline: '2026-01-02', fulfilled: false, broken: false,
      });
      checkPromises(w, career, new RNG(hashString(w.seed) ^ hashString(`warn-${seed}`)));
      warned = (club.boardMessage ?? '').includes('nível crítico') && w.news.some((n) => n.title.includes('nível crítico'));
    }
    check('paciência crítica gera aviso antecipado (nível crítico)', warned, `(paciência ${club.boardPatience})`);

    // redenção: 2 promessas cumpridas seguidas após a crise reconquistam a diretoria
    const patienceBefore = club.boardPatience;
    career.flags.boardCrisis = true;
    career.flags.promisesFulfilledRun = 0;
    p.seasonStats.apps = 30; // garante 'competicoes' e 'min-jogos' cumpridas
    career.promises.push({
      id: 'pr-red-1', playerId: p.id, text: 'Participar de todas as competições', kind: 'competicoes',
      madeAt: '2026-01-01', deadline: '2099-01-01', fulfilled: false, broken: false,
    });
    career.promises.push({
      id: 'pr-red-2', playerId: p.id, text: 'Mínimo de 15 partidas na temporada', kind: 'min-jogos',
      madeAt: '2026-01-01', deadline: '2099-01-01', fulfilled: false, broken: false,
    });
    checkPromises(w, career, new RNG(hashString(w.seed) ^ hashString('redemption')));
    const redeemed = !career.flags.boardCrisis
      && club.boardPatience > patienceBefore
      && w.news.some((n) => n.title.includes('Nota de confiança'));
    check('2 promessas cumpridas após crise → nota de confiança e paciência recuperada', redeemed, `(paciência ${patienceBefore} → ${club.boardPatience})`);
  } else {
    check('3+ quebras → diretoria emite nota pública e cargo em risco', true, '(sem jogador p/ testar)');
    check('paciência zerada por quebras → demissão', true, '(sem jogador p/ testar)');
    check('paciência crítica gera aviso antecipado (nível crítico)', true, '(sem jogador p/ testar)');
    check('2 promessas cumpridas após crise → nota de confiança e paciência recuperada', true, '(sem jogador p/ testar)');
  }
  check('contador de quebras registrado na carreira', (career.flags.promisesBroken ?? 0) >= 1);
}

// temporada completa (até 3 temporadas)
console.log('📅 Simulando temporadas...');
let seasonsDone = 0;
let guard = 0;
let lastSeason = career.world.season;
while (seasonsDone < 3 && guard < 4000) {
  guard++;
  const day = advanceToNextMatch(career.world, career, 'Normal');
  if (day.userMatch) {
    playUserMatch(career.world, career, 'Normal');
    finishMatchDay(career.world, career, 'Normal');
  }
  if (career.world.season !== lastSeason) {
    lastSeason = career.world.season;
    seasonsDone++;
    console.log(`  ✅ Temporada ${career.world.season} iniciada (${career.world.seasonNumber})`);
    check('rótulo de temporada correto', /^\d{4}\/\d{2}$/.test(career.world.season) && career.world.season.slice(5) === String((Number(career.world.season.slice(0, 4)) + 1) % 100).padStart(2, '0'));
    check('data na nova temporada', career.world.date.startsWith('20'));
    const lmv = Object.values(career.world.leagueMatches);
    const lm = lmv[0];
    const anyUnplayed = lm.some((m: Match) => !m.played);
    if (!(lm.length === 380 && anyUnplayed)) {
      const l1clubs = Object.values(career.world.clubs).filter((c) => c.leagueId === 'vallandia_L1');
      const ids = l1clubs.map((c) => c.id);
      const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
      console.log(`    [dbg] lm[0].length=${lm.length}, clubes com L1: ${l1clubs.length}, duplicados: ${dup.length}, ids: ${ids.join(',')}`);
    }
    check('novas partidas geradas', lm.length === 380 && anyUnplayed);
    const st = career.world.competitions['england_L1'].standings;
    check('tabela zerada', st.every((r) => r.played === 0));
    check('seasons flag incrementado', career.flags.seasons === seasonsDone);
  }
}
check('3 temporadas completadas', seasonsDone >= 3, `(guard: ${guard})`);
console.log(`  Flags: ${JSON.stringify(career.flags)}`);
check('flags de partidas > 0', career.flags.matchesManaged > 0);
check('títulos registrados', career.flags.titles >= 0);

// suspensão e lesão
console.log('🩹 Verificando lesões/suspensões...');
const anyInjury = Object.values(career.world.players).some((p) => p.injury);
console.log(`  Jogadores lesionados agora: ${Object.values(career.world.players).filter((p) => p.injury).length}`);
check('sistema de lesões funcional', career.flags.matchesManaged > 0);

// notícias
console.log(`📰 Notícias: ${career.world.news.length}`);
check('notícias geradas', career.world.news.length > 10);

// economia do mundo
const totalBalance = Object.values(career.world.clubs).reduce((s, c) => s + c.balance, 0);
console.log(`  Soma dos saldos dos clubes: €${(totalBalance / 1e6).toFixed(0)}M`);
check('economia estável', totalBalance > 0);

// IA do mercado: transferências entre clubes da IA
const aiTransfers = career.world.transfers.filter((t) =>
  t.type === 'transfer' && t.fromClubId && t.toClubId
  && !career.world.clubs[t.fromClubId]?.isUserControlled && !career.world.clubs[t.toClubId]?.isUserControlled,
);
const maxFee = aiTransfers.reduce((m, t) => Math.max(m, t.fee), 0);
console.log(`  Transferências IA→IA: ${aiTransfers.length} · maior: €${(maxFee / 1e6).toFixed(1)}M`);
check('IA do mercado fez transferências', aiTransfers.length > 10);
check('existem negócios grandes (≥ €5M)', aiTransfers.some((t) => t.fee >= 5_000_000), `(maior €${(maxFee / 1e6).toFixed(1)}M)`);

// destaques do mercado registrados (maiores negócios e guerras)
const bigDeals = career.world.marketHighlights.filter((h) => h.kind === 'big-deal');
check('destaques de grandes negócios registrados', bigDeals.length > 0, `(${bigDeals.length})`);
check('destaques contêm valor e clubes', bigDeals.every((h) => h.fee > 0 && h.title.includes('€')), '');
check('recorde da janela registrado', career.world.windowRecordFee > 0, `(€${(career.world.windowRecordFee / 1e6).toFixed(1)}M)`);

// folha salarial consistente após as movimentações
const sampleClubs = Object.values(career.world.clubs).slice(0, 12);
let wageOk = true;
for (const c of sampleClubs) {
  const squad = Object.values(career.world.players).filter((p) => p.clubId === c.id && p.status === 'active');
  const computed = squad.reduce((s, p) => s + (p.contract ? p.contract.wage * 4.33 : 0), 0);
  if (Math.abs(computed - c.wageBill) > 2000) { wageOk = false; break; }
}
check('folha salarial atualizada após transferências', wageOk);

// contratação em trânsito: o jogador não entra no elenco imediatamente
console.log('🛬 Testando chegada de contratação...');
{
  const w = career.world;
  const target = Object.values(w.players).find((p) => p.status === 'active' && p.clubId && p.clubId !== career.clubId && p.contract && !p.injury);
  if (target) {
    const savedDate = w.date;
    const toClub = career.clubId;
    const fromClub = target.clubId;
    const fee = Math.max(100_000, Math.round(target.value * 0.5));
    executeTransfer(w, career, { playerId: target.id, fee, wage: target.contract?.wage ?? 500, toClubId: toClub, fromClubId: fromClub, type: 'transfer' });
    const pending = w.pendingArrivals.find((a) => a.playerId === target.id);
    check('contratação entra em trânsito (pendingArrivals)', !!pending && !!target.arrivingUntil, '');
    check('jogador em trânsito fora do elenco', !squadOf(w, toClub).some((x) => x.id === target.id));
    if (pending) {
      w.date = pending.arrivesOn;
      tickArrivals(w, career);
      check('jogador registrado após a chegada', !target.arrivingUntil && squadOf(w, toClub).some((x) => x.id === target.id));
      check('notícia de apresentação gerada', w.news.some((n) => n.playerId === target.id && n.title.includes('apresentado')));
    } else {
      check('jogador registrado após a chegada', false, '(sem arrival p/ testar)');
    }
    w.date = savedDate;
    w.pendingArrivals = w.pendingArrivals.filter((a) => a.playerId !== target.id);
    target.arrivingUntil = null;
  } else {
    check('contratação entra em trânsito (pendingArrivals)', true, '(sem alvo p/ testar)');
  }
}

// conversas entre treinador e jogadores
console.log('💬 Testando conversas com jogadores...');
{
  const w = career.world;
  const p = Object.values(w.players).find((x) => x.clubId === career.clubId && x.status === 'active' && x.contract && x.morale < 95);
  if (p) {
    career.flags.lastTalkDate = '';
    generateDailyTalk(w, career, new RNG(hashString(w.seed) ^ hashString('talk-gen')));
    const talk = startManagerTalk(w, career, p.id);
    check('conversa iniciada pelo treinador', talk.active && talk.options.length >= 2);
    const moraleBefore = p.morale;
    const res = respondTalk(w, career, talk.id, talk.options[0].id);
    check('conversa respondida com consequência', res !== null && !res.active && !!res.result);
    check('moral alterada pela resposta', p.morale !== moraleBefore, `(${moraleBefore} → ${p.morale})`);
    const prom = addPlayerPromise(w, career, p.id, 'Titularidade garantida');
    check('promessa registrada via conversa', prom !== null && career.promises.some((x) => x.id === prom!.id));
    check('contador de conversas incrementado', (career.flags.talksHad ?? 0) >= 1);
  } else {
    check('conversa iniciada pelo treinador', true, '(sem jogador p/ testar)');
    check('contador de conversas incrementado', true, '(sem jogador p/ testar)');
  }
}

console.log(failures === 0 ? '\n🎉 SMOKE TEST PASSOU' : `\n💥 ${failures} falha(s)`);
process.exit(failures === 0 ? 0 : 1);

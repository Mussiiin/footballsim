import { World, Club, Manager } from '../lib/types';
import { RNG, hashString } from '../lib/rng';
import { estimateWage, refreshClubCaches } from './overall';
import { clamp } from '../lib/format';
import { COUNTRIES } from './names';
import { newsFromSacking } from './news';
import { positionOf } from './competitions';
import { DIFFICULTY_CONFIG } from '../lib/types';
import { Difficulty } from '../lib/types';
import { isVitalPlayer, squadOf } from './transfers';
import { cancelPreContractFor } from './negotiation';

let coachCounter = 0;

export function generateAICoach(world: World, club: Club, rng: RNG): Club['coach'] {
  const country = world.countries.find((c) => c.id === club.countryId);
  const cd = COUNTRIES.find((c) => c.id === club.countryId) ?? COUNTRIES[0];
  const rep = clamp(Math.round(club.reputation * rng.float(0.6, 0.95)), 10, 95);
  const mk = () => clamp(Math.round(rng.gaussian(rep, 9)), 10, 99);
  return {
    name: `${rng.pick(cd.first)} ${rng.pick(cd.last)}`,
    nationality: country?.name ?? cd.name,
    reputation: rep,
    tactical: mk(),
    development: mk(),
    motivation: mk(),
    management: mk(),
    scouting: mk(),
    negotiation: mk(),
    salary: Math.round(estimateWage(rep, 50, rep) * 1.4),
  };
}

/** Avalia a diretoria dos clubes da IA mensalmente. */
export function aiBoardEvaluation(world: World, difficulty: Difficulty): void {
  const rng = new RNG(hashString(world.seed) ^ hashString(world.date + 'board'));
  const tolerance = DIFFICULTY_CONFIG[difficulty].boardTolerance;

  for (const club of Object.values(world.clubs)) {
    if (club.isUserControlled) continue;
    const comp = world.competitions[club.leagueId];
    if (!comp || comp.type !== 'league') continue;
    const pos = positionOf(comp, club.id);
    const expected = club.tier === 'Gigante' ? 2 : club.tier === 'Grande' ? 6 : club.tier === 'Médio' ? 10 : club.tier === 'Pequeno' ? 14 : 17;
    const lastResults = club.lastResults;
    const recent = lastResults.slice(-5);
    const points = recent.reduce((s, r) => s + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);

    let delta = 0;
    delta += (expected - pos) * 1.2; // abaixo do esperado → perde paciência
    if (points <= 2) delta -= 6;
    else if (points >= 10) delta += 4;
    if (club.balance < club.wageBill * 2) delta -= 3;

    club.boardPatience = clamp(club.boardPatience + delta, 0, 100);

    if (club.boardPatience <= 15 && rng.chance(0.25)) {
      // aviso
      club.boardMessage = 'A diretoria está insatisfeita com os resultados. Reaja!';
      club.boardMessageUntil = addDaysStr(club, world.date);
    }
    if (club.boardPatience <= 0) {
      newsFromSacking(world, club.name, club.coach.name, world.date);
      club.coach = generateAICoach(world, club, rng);
      club.boardPatience = rng.int(45, 70);
      club.boardMessage = null;
    }
  }
}

function addDaysStr(club: Club, date: string): string {
  void club;
  const d = new Date(date);
  d.setDate(d.getDate() + 30);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Renovação de contratos pela IA. */
export function aiContractRenewals(world: World): void {
  const rng = new RNG(hashString(world.seed) ^ hashString(world.date + 'renew'));
  for (const p of Object.values(world.players)) {
    if (p.status !== 'active' || !p.clubId || !p.contract) continue;
    const monthsLeft = (Number(p.contract.until.slice(0, 4)) - Number(world.date.slice(0, 4))) * 12 +
      (Number(p.contract.until.slice(5, 7)) - Number(world.date.slice(5, 7)));
    if (monthsLeft <= 4 && monthsLeft >= -1 && rng.chance(0.55)) {
      const club = world.clubs[p.clubId];
      if (!club) continue;
      const vital = club.isUserControlled ? false : isVitalPlayer(world, p);
      if (vital || rng.chance(0.3)) {
        p.contract.until = `${Number(world.date.slice(0, 4)) + rng.int(2, 4)}-06-30`;
        p.contract.wage = Math.round(p.contract.wage * rng.float(1.02, 1.15));
        p.happiness = clamp(p.happiness + 5, 1, 100);
        // renovou → qualquer pré-contrato em andamento perde validade
        cancelPreContractFor(world, null, p.id);
        refreshClubCaches(club, squadOf(world, club.id));
      }
    }
  }
}

// ------------------------------------------------------------
// Ofertas de emprego para o treinador do usuário
// ------------------------------------------------------------
export interface JobOffer {
  clubId: string;
  salary: number;
  season: string;
  generatedDate: string;
}

export function generateJobOffers(world: World, manager: Manager, rng: RNG): JobOffer[] {
  const offers: JobOffer[] = [];
  const candidateClubs = Object.values(world.clubs).filter((c) => !c.isUserControlled);
  const sorted = [...candidateClubs].sort((a, b) => b.reputation - a.reputation);
  const maxRep = sorted[0]?.reputation ?? 80;
  // clubes com treinador fraco ou sem treinador (cabeça de chave)
  const needy = sorted.filter((c) => c.coach.reputation < maxRep * 0.75 || rng.chance(0.4));
  const n = Math.min(3, needy.length);
  const picked = rng.shuffle(needy).slice(0, n);
  for (const club of picked) {
    const repDiff = club.reputation - manager.reputation;
    if (repDiff > 25 && rng.chance(0.4)) continue; // muito grande para o treinador
    const salary = Math.round(estimateWage(club.reputation, 48, club.reputation) * (1.1 + rng.next() * 0.5));
    offers.push({ clubId: club.id, salary, season: world.season, generatedDate: world.date });
  }
  return offers;
}

export { coachCounter };

import { World, Career, Notification, NewsItem, Match } from '../lib/types';
import { MatchResult } from './matchEngine';
import { playerName } from './matchEngine';

let newsCounter = 0;

export function addNews(world: World, item: Omit<NewsItem, 'id' | 'read'>): NewsItem {
  const n: NewsItem = { ...item, id: `news${newsCounter++}_${Date.now()}`, read: false };
  world.news.unshift(n);
  if (world.news.length > 250) world.news.pop();
  return n;
}

export function notify(career: Career, text: string, kind: Notification['kind'] = 'info', icon = 'ℹ️', link?: string): void {
  career.notifications.unshift({
    id: `ntf${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date: career.world.date,
    icon,
    text,
    kind,
    read: false,
    link,
  });
  if (career.notifications.length > 60) career.notifications.pop();
}

export function newsFromMatch(world: World, match: Match, result: MatchResult): void {
  const home = world.clubs[match.homeId];
  const away = world.clubs[match.awayId];
  if (!home || !away) return;
  const homeWon = result.homeScore > result.awayScore;
  const awayWon = result.awayScore > result.homeScore;
  const repDiff = home.reputation - away.reputation;

  const compName = world.competitions[match.competitionId]?.name ?? '';
  const score = `${result.homeScore} x ${result.awayScore}`;
  const resultWord = homeWon ? 'venceu' : awayWon ? 'perdeu' : 'empatou';

  // virada surpreendente
  if (homeWon && repDiff <= -8) {
    addNews(world, {
      date: match.date,
      title: `Surpresa! ${home.name} derruba ${away.name} por ${score}`,
      subtitle: `O ${home.tier.toLowerCase()} ${home.shortName} venceu o favorito na ${compName}.`,
      category: 'Partidas',
      clubId: match.homeId,
      importance: 75,
    });
  } else if (awayWon && repDiff >= 8) {
    addNews(world, {
      date: match.date,
      title: `Zebra! ${away.name} vence ${home.name} por ${score}`,
      subtitle: `O ${away.tier.toLowerCase()} surpreendeu o gigante na ${compName}.`,
      category: 'Partidas',
      clubId: match.awayId,
      importance: 75,
    });
  } else if (result.homeScore >= 5 || result.awayScore >= 5 || Math.abs(result.homeScore - result.awayScore) >= 4) {
    addNews(world, {
      date: match.date,
      title: `Goleada: ${home.shortName} ${score} ${away.shortName}`,
      subtitle: 'Uma noite para esquecer para os visitantes.',
      category: 'Partidas',
      clubId: homeWon ? match.homeId : match.awayId,
      importance: 70,
    });
  } else if (result.manOfMatch && result.manOfMatch) {
    const p = world.players[result.manOfMatch];
    if (p && result.homeScore + result.awayScore >= 3) {
      addNews(world, {
        date: match.date,
        title: `${playerName(p)} é o melhor em campo na ${compName}`,
        subtitle: `Destaque na vitória de ${homeWon ? home.name : away.name} por ${score}.`,
        category: 'Partidas',
        playerId: p.id,
        clubId: p.clubId ?? undefined,
        importance: 45,
      });
    }
  }

  if (match.competitionId === 'CONTINENTAL') {
    addNews(world, {
      date: match.date,
      title: `${homeWon ? home.name : away.name} avança na Liga dos Campeões Continentais`,
      subtitle: `${score} na ${compName}.`,
      category: 'Seleções',
      clubId: homeWon ? match.homeId : match.awayId,
      importance: 60,
    });
  }
}

export function newsFromTransfer(world: World, playerNameStr: string, fromClub: string, toClub: string, fee: number, date: string, type: string): void {
  const isRecord = fee > (world.records.find((r) => r.key === 'biggest_transfer')?.value as number || 0) && type === 'transfer';
  const feeTxt = fee >= 1_000_000 ? ` por €${(fee / 1e6).toFixed(1)}M` : fee > 0 ? ` por €${fee.toLocaleString('pt-BR')}` : '';
  const verb = type === 'loan' ? 'é emprestado' : type === 'free' ? 'assina' : 'é vendido';
  let title: string;
  let subtitle: string;
  let importance = 50;
  if (isRecord) {
    title = `🏆 RECORDE! ${playerNameStr} troca ${fromClub} por ${toClub}${feeTxt}`;
    subtitle = `A maior transferência da história do FootballSim: o negócio de €${fee.toLocaleString('pt-BR')} sacode o mercado.`;
    importance = 95;
  } else if (fee >= 30_000_000 && type === 'transfer') {
    title = `🔥 ${toClub} fecha bombástico: ${playerNameStr} chega${feeTxt}`;
    subtitle = `Negócio de peso entre ${fromClub} e ${toClub} — um dos maiores da janela (€${fee.toLocaleString('pt-BR')}).`;
    importance = 80;
  } else if (fee >= 10_000_000 && type === 'transfer') {
    title = `${playerNameStr} ${verb} para ${toClub}${feeTxt}`;
    subtitle = `Transferência relevante de ${fromClub} por €${fee.toLocaleString('pt-BR')}.`;
    importance = 65;
  } else {
    title = `${playerNameStr} ${verb} para ${toClub}${feeTxt}`;
    subtitle = fromClub === 'Sem clube'
      ? 'Jogador livre no mercado.'
      : `${type === 'loan' ? 'Empréstimo' : 'Transferência'} de ${fromClub}${feeTxt}.`;
    importance = type === 'loan' ? 40 : 50;
  }
  addNews(world, {
    date,
    title,
    subtitle,
    category: 'Transferências',
    importance,
  });
}

export function newsFromTitle(world: World, clubName: string, competitionName: string, date: string): void {
  addNews(world, {
    date,
    title: `🏆 ${clubName} é campeão da ${competitionName}!`,
    subtitle: 'Um marco histórico para o clube e seus torcedores.',
    category: 'Títulos',
    importance: 95,
  });
}

export function newsFromSacking(world: World, clubName: string, coachName: string, date: string): void {
  addNews(world, {
    date,
    title: `${clubName} demite o técnico ${coachName}`,
    subtitle: 'A diretoria optou por uma mudança de comando após maus resultados.',
    category: 'Clubes',
    importance: 55,
  });
}

export function newsFromInjury(world: World, playerNameStr: string, clubName: string, injuryText: string, date: string): void {
  addNews(world, {
    date,
    title: `${playerNameStr} (${clubName}) sofre ${injuryText}`,
    subtitle: 'Desfalque importante para os próximos jogos.',
    category: 'Lesões',
    importance: 45,
  });
}

export function newsFromRetirement(world: World, playerNameStr: string, age: number, date: string): void {
  addNews(world, {
    date,
    title: `${playerNameStr} anuncia aposentadoria aos ${age} anos`,
    subtitle: 'Uma carreira de destaque chega ao fim.',
    category: 'Clubes',
    importance: 50,
  });
}

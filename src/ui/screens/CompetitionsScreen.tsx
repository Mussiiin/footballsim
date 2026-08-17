import { useMemo, useState } from 'react';
import { useGame } from '../../state/store';
import { ClubCrest, FormRow, Modal, ResultPill } from '../components';
import { sortedStandings, topScorersOf, topAssistsOf, currentCupRoundName, winnerOf, competitionMatches, matchForClubOnDate, compareStandings } from '../../game/competitions';
import { Competition, CupMatchStore, Match } from '../../lib/types';
import { formatDateBR } from '../../lib/date';
import { fmtMoney } from '../../lib/format';
import { clubPrizeInfo } from '../../game/cupPrizes';
import { Search, Trophy, ChevronDown, Eye, Gamepad2, CalendarDays } from 'lucide-react';

const SEL_KEY_PREFIX = 'fs_comp_selected_';

export function CompetitionsScreen() {
  const { career, navigate } = useGame();
  const world = career!.world;
  const clubId = career!.clubId;
  const club = clubId ? world.clubs[clubId] : null;

  // Competição principal da carreira = liga do clube
  const primaryId = club ? club.leagueId : world.countries[0].divisions[0];
  const primaryComp = world.competitions[primaryId];

  // Minhas competições: liga + copa do país + continental (se participa)
  const myCompIds = useMemo(() => {
    const ids: string[] = [];
    if (!club) return ids;
    ids.push(club.leagueId);
    const country = world.countries.find((c) => c.id === club.countryId);
    if (country) {
      const cup = world.competitions[country.cupId];
      if (cup && cup.clubIds.includes(clubId)) ids.push(cup.id);
    }
    const cont = world.competitions['CONTINENTAL'];
    if (cont && cont.clubIds.includes(clubId)) ids.push(cont.id);
    return ids;
  }, [world, club, clubId]);

  // Seleção memorizada por carreira (sessão) — nova carreira volta à principal
  const [selectedId, setSelectedId] = useState<string>(() => {
    const saved = sessionStorage.getItem(SEL_KEY_PREFIX + career!.id);
    if (saved && world.competitions[saved]) return saved;
    return primaryId;
  });
  const comp = world.competitions[selectedId] ?? world.competitions[primaryId];
  const [pickerOpen, setPickerOpen] = useState(false);

  const selectComp = (id: string) => {
    setSelectedId(id);
    sessionStorage.setItem(SEL_KEY_PREFIX + career!.id, id);
    setPickerOpen(false);
  };

  const isPrimary = comp.id === primaryId;
  const isMine = myCompIds.includes(comp.id);

  // Partida de hoje (dia de jogo) — prioridade máxima
  const todayMatch = clubId ? matchForClubOnDate(world, clubId, world.date) : null;

  // Próxima partida do clube na competição selecionada
  const nextInComp = useMemo(() => {
    if (!clubId) return null;
    const ms = competitionMatches(world, comp.id)
      .filter((m) => !m.played && (m.homeId === clubId || m.awayId === clubId) && m.homeId !== '__TBD__' && m.awayId !== '__TBD__')
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    return ms[0] ?? null;
  }, [world, comp.id, clubId]);

  // Próxima partida da competição em geral (para acompanhar outras)
  const nextCompMatch = useMemo(() => {
    if (nextInComp) return null;
    const ms = competitionMatches(world, comp.id)
      .filter((m) => !m.played && m.homeId !== '__TBD__' && m.awayId !== '__TBD__' && m.date >= world.date)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    return ms[0] ?? null;
  }, [world, comp.id, nextInComp, world.date]);

  // outras competições (para o seletor)
  const otherComps = useMemo(() => {
    return Object.values(world.competitions)
      .filter((c) => !myCompIds.includes(c.id) && !c.isAccessPlayoff)
      .sort((a, b) => (a.countryId ?? '').localeCompare(b.countryId ?? '') || a.name.localeCompare(b.name));
  }, [world, myCompIds]);

  const myComps = useMemo(
    () => myCompIds.map((id) => world.competitions[id]).filter(Boolean) as Competition[],
    [myCompIds, world],
  );

  return (
    <div className="space-y-4 animate-fadeUp">
      {/* header + seletor */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display font-bold text-2xl text-slate-100">Competições</h1>
        <div className="flex-1" />
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-2 badge border border-accent/40 bg-accent/10 text-accent px-4 py-2 hover:bg-accent/20 transition"
        >
          <Trophy size={15} />
          <span className="font-semibold">{comp.name}</span>
          <ChevronDown size={14} />
        </button>
      </div>

      {/* badge principal / disputada / acompanhando */}
      <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg ${isPrimary ? 'bg-accent/15 text-accent border border-accent/30' : isMine ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-sky-500/10 text-sky-400 border border-sky-500/30'}`}>
        {isPrimary ? <><Gamepad2 size={14} /> COMPETIÇÃO PRINCIPAL — Você está disputando esta competição.</> : isMine ? <><Gamepad2 size={14} /> VOCÊ DISPUTA — Competição secundária do seu clube.</> : <><Eye size={14} /> ACOMPANHANDO — Você não está disputando esta competição.</>}
      </div>

      {/* dia de jogo — prioridade */}
      {todayMatch && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 flex flex-wrap items-center gap-3 animate-fadeIn">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <div className="flex-1 min-w-[200px]">
            <p className="text-sm font-semibold text-red-300">🔴 DIA DE JOGO · {world.competitions[todayMatch.competitionId]?.name}</p>
            <p className="text-sm text-slate-300 mt-0.5">
              {world.clubs[todayMatch.homeId]?.shortName} x {world.clubs[todayMatch.awayId]?.shortName} · {formatDateBR(todayMatch.date)}
            </p>
          </div>
          <button onClick={() => navigate('matchday')} className="btn-primary">▶ CONTINUAR PARTIDA</button>
        </div>
      )}

      {/* próxima partida do clube na competição selecionada */}
      {(nextInComp || nextCompMatch) && !todayMatch && (
        <NextMatchCard
          match={nextInComp ?? nextCompMatch!}
          isUserMatch={!!nextInComp}
          isMine={isMine}
          isPlayable={nextInComp !== null && nextInComp.date === world.date}
          onPlay={() => navigate('matchday')}
          world={world}
          clubId={clubId}
        />
      )}
      {!nextInComp && !nextCompMatch && isMine && !todayMatch && (
        <div className="card p-5 text-center text-sm text-slate-500">
          ⚽ Seu próximo jogo nesta competição será definido após a fase atual do chaveamento.
        </div>
      )}

      {/* conteúdo específico da competição */}
      {comp.type === 'league' && (comp.groups ? <SerieDView comp={comp} world={world} onClub={(id) => navigate(`club:${id}`)} isMine={isMine} userClubId={clubId ?? ''} /> : <LeagueView comp={comp} world={world} onClub={(id) => navigate(`club:${id}`)} isMine={isMine} userClubId={clubId ?? ''} />)}
      {comp.type === 'cup' && !comp.isAccessPlayoff && <CupView comp={comp} world={world} onClub={(id) => navigate(`club:${id}`)} />}
      {comp.type === 'continental' && <CupView comp={comp} world={world} onClub={(id) => navigate(`club:${id}`)} continental />}

      {/* seletor */}
      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="Selecionar competição" wide>
        <CompetitionPicker
          myComps={myComps}
          otherComps={otherComps}
          selectedId={comp.id}
          primaryId={primaryId}
          world={world}
          onSelect={selectComp}
        />
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------
// Card de próxima partida
// ------------------------------------------------------------
function NextMatchCard({ match, isUserMatch, isMine, isPlayable, onPlay, world, clubId }: {
  match: Match;
  isUserMatch: boolean;
  isMine: boolean;
  isPlayable: boolean;
  onPlay: () => void;
  world: any;
  clubId: string | null;
}) {
  const home = world.clubs[match.homeId];
  const away = world.clubs[match.awayId];
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
        <CalendarDays size={13} /> Próxima partida · {world.competitions[match.competitionId]?.name} · {formatDateBR(match.date)}
      </p>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <ClubCrest club={home} size={44} />
          <div>
            <p className="font-semibold text-slate-100">{home?.name}</p>
            <p className="text-xs text-slate-500">🏠 Casa</p>
          </div>
        </div>
        <div className="text-center text-2xl font-display font-extrabold text-slate-200">VS</div>
        <div className="flex items-center gap-3 flex-1 justify-end">
          <div className="text-right">
            <p className="font-semibold text-slate-100">{away?.name}</p>
            <p className="text-xs text-slate-500">✈️ Fora</p>
          </div>
          <ClubCrest club={away} size={44} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
        {isUserMatch && isPlayable && (
          <button onClick={onPlay} className="btn-primary px-8">▶ JOGAR PARTIDA</button>
        )}
        {isUserMatch && !isPlayable && (
          <span className="badge bg-surface-700 text-slate-300 px-3 py-2">⚽ Avance o tempo até o dia do jogo</span>
        )}
        {!isUserMatch && isMine && (
          <span className="badge bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-2">⚽ Você disputa esta competição — próximo confronto do chaveamento</span>
        )}
        {!isUserMatch && !isMine && (
          <span className="badge bg-sky-500/10 text-sky-400 border border-sky-500/30 px-3 py-2"><Eye size={12} /> Você está acompanhando esta competição</span>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Seletor de competições
// ------------------------------------------------------------
function CompetitionPicker({ myComps, otherComps, selectedId, primaryId, world, onSelect }: {
  myComps: Competition[];
  otherComps: Competition[];
  selectedId: string;
  primaryId: string;
  world: any;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const filter = (c: Competition) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || (world.countries.find((x: any) => x.id === c.countryId)?.name ?? '').toLowerCase().includes(q.toLowerCase());
  const mine = myComps.filter(filter);
  const others = otherComps.filter(filter);

  const Item = ({ c }: { c: Competition }) => {
    const country = world.countries.find((x: any) => x.id === c.countryId);
    const isSel = c.id === selectedId;
    return (
      <button
        onClick={() => onSelect(c.id)}
        className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition ${isSel ? 'bg-accent/15 text-accent border border-accent/30' : 'border border-transparent text-slate-300 hover:bg-surface-800'}`}
      >
        <span className="w-6 text-center">{c.type === 'cup' ? '🏆' : c.type === 'continental' ? '🌍' : country?.flag ?? '🏆'}</span>
        <span className="flex-1 min-w-0 truncate font-medium">{c.name}</span>
        {c.id === primaryId && <span className="badge bg-accent/20 text-accent text-[9px]">PRINCIPAL</span>}
        {isSel && <span className="text-accent">●</span>}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar competição…"
          className="w-full rounded-lg bg-surface-800 border border-surface-600 pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-accent outline-none"
        />
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5"><Gamepad2 size={12} /> Minhas competições</p>
        {mine.length === 0 && <p className="text-xs text-slate-600 pl-1">Nenhuma competição encontrada.</p>}
        <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
          {mine.map((c) => <Item key={c.id} c={c} />)}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5"><Eye size={12} /> Outras competições</p>
        {others.length === 0 && <p className="text-xs text-slate-600 pl-1">Nenhuma competição encontrada.</p>}
        <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
          {others.map((c) => <Item key={c.id} c={c} />)}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Série D (96 clubes → 16 grupos de 6 → mata-mata + playoff de acesso)
// ------------------------------------------------------------
function SerieDView({ comp, world, onClub, isMine, userClubId }: { comp: Competition; world: any; onClub: (id: string) => void; isMine: boolean; userClubId: string }) {
  const { navigate } = useGame();
  const store: CupMatchStore | undefined = world.cupMatches[comp.id];
  const groups = comp.groups ?? [];
  const accComp: Competition | undefined = comp.accessPlayoffId ? world.competitions[comp.accessPlayoffId] : undefined;
  const accStore: CupMatchStore | undefined = comp.accessPlayoffId ? world.cupMatches[comp.accessPlayoffId] : undefined;
  const userGroup = userClubId ? comp.clubGroup?.[userClubId] : null;

  const groupTable = (g: NonNullable<Competition['groups']>[number]) => {
    const rows = comp.standings
      .filter((s) => comp.clubGroup?.[s.clubId] === g.id)
      .sort(compareStandings);
    return rows;
  };

  // vencedores conhecidos do chaveamento
  const roundMatches = (round: (typeof comp.rounds)[number]) =>
    (round.matchIds ?? [])
      .map((id) => store?.matches.find((m) => m.id === id))
      .filter((m): m is Match => !!m && m.homeId !== '__TBD__' && m.awayId !== '__TBD__');

  return (
    <div className="space-y-5">
      {/* cabeçalho com o formato */}
      <div className="card p-4 text-sm text-slate-400">
        <p className="font-semibold text-slate-200 mb-1">🇧🇷 Formato Série D 2026</p>
        <p>96 clubes → 16 grupos de 6 (ida+volta) → 64 classificados → mata-mata em ida e volta → 4 vencedores das quartas garantem acesso + 2 do playoff de acesso = <span className="text-accent font-bold">6 acessos à Série C</span>. Campeão definido na final em dois jogos.</p>
      </div>

      {/* fase de grupos */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Fase de grupos · 16 grupos</p>
          {userGroup && <span className="badge bg-accent/15 text-accent border border-accent/30">Seu grupo: {groups.find((g) => g.id === userGroup)?.name}</span>}
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          {groups.map((g) => {
            const rows = groupTable(g);
            const qualified = rows.slice(0, 4).map((r) => r.clubId);
            return (
              <div key={g.id} className="rounded-lg border border-surface-700 bg-surface-800/40 overflow-hidden">
                <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 bg-surface-800">{g.name}</p>
                <table className="w-full text-xs">
                  <tbody>
                    {rows.map((s, i) => {
                      const club = world.clubs[s.clubId];
                      const isUser = club?.isUserControlled;
                      const pos = i + 1;
                      return (
                        <tr key={s.clubId} onClick={() => onClub(s.clubId)} className={`border-t border-surface-700/40 cursor-pointer hover:bg-surface-800/60 ${isUser ? 'bg-accent/10' : ''} ${pos <= 4 ? 'border-l-2 border-l-emerald-500' : 'border-l-2 border-l-red-500/60'}`}>
                          <td className="px-2 py-1.5 font-mono text-slate-500">{pos}º</td>
                          <td className={`px-1 py-1.5 truncate ${isUser ? 'font-bold text-accent' : 'text-slate-300'}`}>{club?.shortName}</td>
                          <td className="px-1 py-1.5 text-center font-display font-bold text-slate-100">{s.points}</td>
                          <td className="px-2 py-1.5 text-center text-slate-500">{s.played}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length > 0 && qualified.length === 4 && (
                  <p className="px-3 py-1.5 text-[10px] text-slate-600 border-t border-surface-700/40">🟢 top-4 classificados · 🔴 eliminados</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* mata-mata */}
      {comp.rounds.length > 0 && (
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Mata-mata · ida e volta</p>
          <div className="space-y-4">
            {comp.rounds.map((round, ri) => {
              const ms = roundMatches(round);
              if (ms.length === 0) return null;
              return (
                <div key={ri}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-slate-400">{round.name} {round.legs === 'two' && <span className="text-slate-600 font-normal">(ida/volta)</span>}</p>
                    {round.complete && <span className="badge bg-accent/10 text-accent border border-accent/30">✓ concluída</span>}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {ms.map((m) => {
                      const home = world.clubs[m.homeId];
                      const away = world.clubs[m.awayId];
                      const isUserMatch = userClubId && (m.homeId === userClubId || m.awayId === userClubId);
                      return (
                        <div key={m.id} className={`rounded-lg border p-2.5 text-sm ${isUserMatch ? 'border-accent/50 bg-accent/5' : 'border-surface-700 bg-surface-800/40'}`}>
                          <div className="flex items-center gap-2 justify-between">
                            <button onClick={() => onClub(m.homeId)} className="flex items-center gap-1.5 text-slate-300 hover:text-white min-w-0">
                              <ClubCrest club={home} size={18} />
                              <span className="truncate">{home?.shortName}</span>
                            </button>
                            <span className="font-mono font-bold text-slate-200 shrink-0">
                              {m.played ? `${m.homeScore}-${m.awayScore}${m.penaltyShootout ? ` (${m.penaltyShootout.home}-${m.penaltyShootout.away} pen)` : ''}` : '—'}
                            </span>
                            <button onClick={() => onClub(m.awayId)} className="flex items-center gap-1.5 text-slate-300 hover:text-white min-w-0">
                              <span className="truncate">{away?.shortName}</span>
                              <ClubCrest club={away} size={18} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* vencedores das quartas ganham acesso */}
                  {round.name === 'Quartas de final' && round.complete && (
                    <p className="mt-1.5 text-[11px] text-emerald-400">🟢 Os 4 vencedores garantem acesso à Série C · perdedores vão ao playoff de acesso</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* playoff de acesso */}
      {accComp && accStore && (
        <div className="card p-5 border-gold/30">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold mb-1">⬆️ Playoffs de acesso à Série C</p>
          <p className="text-[11px] text-slate-500 mb-3">Os 4 perdedores das quartas de final disputam 2 vagas restantes de acesso.</p>
          <div className="space-y-2">
            {accComp.rounds[0].matchIds
              .map((id) => accStore.matches.find((m) => m.id === id))
              .filter((m): m is Match => !!m && m.homeId !== '__TBD__' && m.awayId !== '__TBD__')
              .map((m) => {
                const home = world.clubs[m.homeId];
                const away = world.clubs[m.awayId];
                return (
                  <div key={m.id} className="flex items-center gap-2 justify-between rounded-lg border border-surface-700 bg-surface-800/40 px-3 py-2 text-sm">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <ClubCrest club={home} size={18} />
                      <span className="truncate text-slate-300">{home?.shortName}</span>
                    </span>
                    <span className="font-mono font-bold text-slate-200">{m.played ? `${m.homeScore}-${m.awayScore}${m.penaltyShootout ? ` (${m.penaltyShootout.home}-${m.penaltyShootout.away} pen)` : ''}` : '—'}</span>
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate text-slate-300">{away?.shortName}</span>
                      <ClubCrest club={away} size={18} />
                    </span>
                  </div>
                );
              })}
          </div>
          {comp.knockoutPromoted && comp.knockoutPromoted.length > 0 && (
            <div className="mt-3 pt-3 border-t border-surface-700/60">
              <p className="text-xs font-semibold text-emerald-400 mb-1">⬆️ PROMOVIDOS À SÉRIE C:</p>
              <div className="flex flex-wrap gap-2">
                {comp.knockoutPromoted.map((id) => {
                  const c = world.clubs[id];
                  return c ? (
                    <span key={id} className="badge bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">⬆️ {c.shortName}</span>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* campeão */}
      {comp.status === 'finished' && comp.champions.length > 0 && (
        <div className="card p-4 border-gold/40">
          <p className="text-sm font-semibold text-gold">🏆 CAMPEÃO SÉRIE D {comp.season}: <span className="text-slate-100">{comp.champions[comp.champions.length - 1].champion}</span></p>
          <p className="text-xs text-slate-500 mt-0.5">Vice: {comp.champions[comp.champions.length - 1].runnerUp}</p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Liga
// ------------------------------------------------------------
function LeagueView({ comp, world, onClub, isMine, userClubId }: { comp: Competition; world: any; onClub: (id: string) => void; isMine: boolean; userClubId: string }) {
  const { navigate } = useGame();
  const [filter, setFilter] = useState<'all' | 'home' | 'away' | 'upcoming' | 'results'>('all');
  const standings = sortedStandings(comp);
  const scorers = topScorersOf(world, comp.id, 8);
  const assists = topAssistsOf(world, comp.id, 5);

  const matches = useMemo(() => {
    let ms = competitionMatches(world, comp.id).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (isMine && (filter === 'home' || filter === 'away')) {
      ms = ms.filter((m) => (filter === 'home' ? m.homeId === userClubId : m.awayId === userClubId));
    } else if (filter === 'upcoming') {
      ms = ms.filter((m) => !m.played);
    } else if (filter === 'results') {
      ms = ms.filter((m) => m.played);
    }
    return ms;
  }, [world, comp.id, filter, isMine, userClubId]);

  const userRow = userClubId ? standings.find((s) => s.clubId === userClubId) : null;

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        {/* situação do clube */}
        {isMine && userRow && (
          <div className="card p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <ClubCrest club={world.clubs[userClubId]} size={44} />
              <div>
                <p className="font-display font-bold text-slate-100">{world.clubs[userClubId]?.name}</p>
                <p className="text-xs text-slate-500">Sua situação na competição</p>
              </div>
            </div>
            <div className="flex gap-3 ml-auto text-center">
              <div className="px-3">
                <p className="text-xl font-display font-bold text-accent">{standings.findIndex((s) => s.clubId === userClubId) + 1}º</p>
                <p className="text-[10px] text-slate-500 uppercase">Posição</p>
              </div>
              <div className="px-3">
                <p className="text-xl font-display font-bold text-slate-100">{userRow.points}</p>
                <p className="text-[10px] text-slate-500 uppercase">Pontos</p>
              </div>
              <div className="px-3">
                <p className="text-xl font-display font-bold text-slate-100">{userRow.gd > 0 ? '+' : ''}{userRow.gd}</p>
                <p className="text-[10px] text-slate-500 uppercase">Saldo</p>
              </div>
              <div className="px-3">
                <p className="text-xl font-display font-bold text-slate-100">{userRow.played}</p>
                <p className="text-[10px] text-slate-500 uppercase">Jogos</p>
              </div>
            </div>
          </div>
        )}

        {/* classificação */}
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">{comp.name} · {comp.status === 'finished' ? 'finalizada' : 'em andamento'}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr>
                  <th className="table-th">#</th>
                  <th className="table-th">Clube</th>
                  <th className="table-th text-center">Pts</th>
                  <th className="table-th text-center">J</th>
                  <th className="table-th text-center">V</th>
                  <th className="table-th text-center">E</th>
                  <th className="table-th text-center">D</th>
                  <th className="table-th text-center">GP</th>
                  <th className="table-th text-center">GC</th>
                  <th className="table-th text-center">SG</th>
                  <th className="table-th text-center">Aprov.</th>
                  <th className="table-th">Forma</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((s, i) => {
                  const club = world.clubs[s.clubId];
                  const isUser = club?.isUserControlled;
                  const lib = comp.rules.continentalSpots > 0 && i < comp.rules.continentalSpots;
                  const sud = comp.rules.sudamericanaSpots && i >= (comp.rules.continentalSpots ?? 0) && i < (comp.rules.continentalSpots ?? 0) + comp.rules.sudamericanaSpots;
                  const rel = comp.rules.relegationSpots > 0 && i >= standings.length - comp.rules.relegationSpots;
                  const zone = lib ? 'border-l-2 border-l-emerald-500' : sud ? 'border-l-2 border-l-yellow-500' : rel ? 'border-l-2 border-l-red-500' : '';
                  const aproveitamento = s.played > 0 ? Math.round((s.points / (s.played * 3)) * 100) : 0;
                  return (
                    <tr key={s.clubId} className={`${zone} border-t border-surface-700/40 hover:bg-surface-800/60 cursor-pointer ${isUser ? 'bg-accent/10' : ''}`} onClick={() => onClub(s.clubId)}>
                      <td className="table-td font-mono text-slate-500">{i + 1}</td>
                      <td className="table-td">
                        <div className="flex items-center gap-2">
                          <ClubCrest club={club} size={24} />
                          <span className={isUser ? 'font-bold text-accent' : 'text-slate-300'}>{club?.shortName}</span>
                        </div>
                      </td>
                      <td className="table-td text-center font-display font-bold text-slate-100">{s.points}</td>
                      <td className="table-td text-center text-slate-400">{s.played}</td>
                      <td className="table-td text-center text-slate-400">{s.won}</td>
                      <td className="table-td text-center text-slate-400">{s.drawn}</td>
                      <td className="table-td text-center text-slate-400">{s.lost}</td>
                      <td className="table-td text-center text-slate-400">{s.gf}</td>
                      <td className="table-td text-center text-slate-400">{s.ga}</td>
                      <td className={`table-td text-center ${s.gd > 0 ? 'text-accent' : s.gd < 0 ? 'text-red-400' : 'text-slate-400'}`}>{s.gd > 0 ? '+' : ''}{s.gd}</td>
                      <td className="table-td text-center text-slate-400">{aproveitamento}%</td>
                      {/* Forma geral (todas as competições) — consistente com o painel "Forma recente" do Painel */}
                      <td className="table-td"><FormRow results={club?.lastResults ?? s.form} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-slate-600">
            {comp.rules.continentalSpots > 0 && <span><span className="inline-block w-2 h-2 bg-emerald-500 rounded-sm mr-1" />Libertadores</span>}
            {comp.rules.sudamericanaSpots ? <span><span className="inline-block w-2 h-2 bg-yellow-500 rounded-sm mr-1" />Sul-Americana</span> : null}
            {comp.rules.promotionSpots > 0 && <span><span className="inline-block w-2 h-2 bg-accent rounded-sm mr-1" />Promoção</span>}
            {comp.rules.relegationSpots > 0 && <span><span className="inline-block w-2 h-2 bg-red-500 rounded-sm mr-1" />Rebaixamento</span>}
          </div>
        </div>

        {/* jogos da competição */}
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Jogos da competição</p>
            <div className="flex gap-1">
              {(['all', 'home', 'away', 'upcoming', 'results'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`badge border px-2.5 py-1 text-[11px] ${filter === f ? 'bg-accent text-surface-950 border-accent' : 'bg-surface-800 text-slate-400 border-surface-600 hover:text-slate-200'}`}
                >
                  {f === 'all' ? 'Todas' : f === 'home' ? 'Casa' : f === 'away' ? 'Fora' : f === 'upcoming' ? 'Próximas' : 'Resultados'}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
            {matches.length === 0 && <p className="text-sm text-slate-600 py-4 text-center">Nenhuma partida para este filtro.</p>}
            {matches.map((m) => {
              const home = world.clubs[m.homeId];
              const away = world.clubs[m.awayId];
              if (!home || !away) return null;
              const isUserMatch = userClubId && (m.homeId === userClubId || m.awayId === userClubId);
              return (
                <div key={m.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${isUserMatch ? 'border-accent/40 bg-accent/5' : 'border-surface-700 bg-surface-800/40'}`}>
                  <span className="text-[10px] text-slate-600 w-20 shrink-0">{formatDateBR(m.date)}</span>
                  <button onClick={() => onClub(m.homeId)} className="flex items-center gap-1.5 text-slate-300 hover:text-white min-w-0 flex-1 justify-end">
                    <span className="truncate">{home.shortName}</span>
                    <ClubCrest club={home} size={18} />
                  </button>
                  {/* cor pela perspectiva do clube do usuário quando ele joga nesta partida */}
                  <span className="w-14 text-center shrink-0"><ResultPill m={m} colorFor={userClubId} /></span>
                  <button onClick={() => onClub(m.awayId)} className="flex items-center gap-1.5 text-slate-300 hover:text-white min-w-0 flex-1">
                    <ClubCrest club={away} size={18} />
                    <span className="truncate">{away.shortName}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* artilharia + assistências + campeões */}
      <div className="space-y-5">
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">⚽ Artilharia</p>
          <div className="space-y-2">
            {scorers.map((s, i) => (
              <div key={s.playerId} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-slate-500 font-mono">{i + 1}º</span>
                <button onClick={() => navigate(`player:${s.playerId}`)} className="flex-1 text-left hover:text-accent transition-colors">
                  <span className="text-slate-300 truncate block">{s.name}</span>
                  <span className="text-[10px] text-slate-600 truncate block">{s.clubName}</span>
                </button>
                <span className="font-display font-bold text-gold">{s.goals}</span>
              </div>
            ))}
            {scorers.length === 0 && <p className="text-xs text-slate-600">Sem dados ainda.</p>}
          </div>
        </div>

        {assists.length > 0 && (
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">🅰️ Assistências</p>
            <div className="space-y-2">
              {assists.map((s, i) => (
                <div key={s.playerId} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-slate-500 font-mono">{i + 1}º</span>
                  <button onClick={() => navigate(`player:${s.playerId}`)} className="flex-1 text-left hover:text-accent transition-colors">
                    <span className="text-slate-300 truncate block">{s.name}</span>
                    <span className="text-[10px] text-slate-600 truncate block">{s.clubName}</span>
                  </button>
                  <span className="font-display font-bold text-sky-400">{s.assists}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">🏆 Campeões</p>
          {[...comp.champions].reverse().slice(0, 6).map((c, i) => (
            <p key={i} className="text-xs text-slate-400 py-0.5">🏆 {c.season}: <span className="text-slate-200">{c.champion}</span>{c.runnerUp ? <span className="text-slate-600"> (vice: {c.runnerUp})</span> : ''}</p>
          ))}
          {comp.champions.length === 0 && <p className="text-xs text-slate-600">Primeira temporada em disputa.</p>}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Copa / Continental
// ------------------------------------------------------------
function CupView({ comp, world, onClub, continental = false }: { comp: Competition; world: any; onClub: (id: string) => void; continental?: boolean }) {
  const { career } = useGame();
  const store: CupMatchStore | undefined = continental ? world.continentalMatches[comp.id] : world.cupMatches[comp.id];

  if (!store) return <div className="card p-8 text-slate-500">Sem dados.</div>;

  const currentRound = currentCupRoundName(comp);
  const isUserIn = career && comp.clubIds.includes(career.clubId);
  const prize = isUserIn && career ? clubPrizeInfo(world, career.clubId, comp.id) : null;

  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 card p-5">
        <div className="flex items-center gap-3 mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Chaveamento · <span className="text-accent">{currentRound}</span></p>
          {isUserIn && <span className="badge bg-accent/15 text-accent border border-accent/30">Seu clube participa</span>}
          {comp.status === 'finished' && comp.champions.length > 0 && (
            <span className="badge bg-gold/15 text-gold border border-gold/30">🏆 {comp.champions[comp.champions.length - 1].champion}</span>
          )}
        </div>

        <div className="space-y-4">
          {comp.rounds.map((round, ri) => {
            const matches = round.matchIds
              .map((id) => store.matches.find((m) => m.id === id))
              .filter((m): m is NonNullable<typeof m> => !!m && m.homeId !== '__TBD__' && m.awayId !== '__TBD__');
            if (matches.length === 0) return null;
            const winner = ri === 0 ? null : (() => {
              const w = store.roundWinners[round.matchIds[0]];
              return w ? world.clubs[w] : null;
            })();
            return (
              <div key={ri}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-400">{round.name}</p>
                  {round.complete && <span className="badge bg-accent/10 text-accent border border-accent/30">✓ concluída</span>}
                  {winner && <span className="text-xs text-slate-400">vencedor: {winner.shortName}</span>}
                </div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {matches.map((m) => {
                    const home = world.clubs[m.homeId];
                    const away = world.clubs[m.awayId];
                    const isUserMatch = career && (m.homeId === career.clubId || m.awayId === career.clubId);
                    return (
                      <div key={m.id} className={`rounded-lg border p-2.5 text-sm ${isUserMatch ? 'border-accent/50 bg-accent/5' : 'border-surface-700 bg-surface-800/40'}`}>
                        <div className="flex items-center gap-2 justify-between">
                          <button onClick={() => onClub(m.homeId)} className="flex items-center gap-1.5 text-slate-300 hover:text-white min-w-0">
                            <ClubCrest club={home} size={20} />
                            <span className="truncate">{home?.shortName}</span>
                          </button>
                          <span className="font-mono font-bold text-slate-200 shrink-0">
                            {m.played ? `${m.homeScore}-${m.awayScore}${m.penaltyShootout ? ` (${m.penaltyShootout.home}-${m.penaltyShootout.away} pen)` : ''}` : '—'}
                          </span>
                          <button onClick={() => onClub(m.awayId)} className="flex items-center gap-1.5 text-slate-300 hover:text-white min-w-0">
                            <span className="truncate">{away?.shortName}</span>
                            <ClubCrest club={away} size={20} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {prize && (
        <div className="card p-5 border-gold/30">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold mb-3">💰 Premiação da competição</p>
          <div className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Fase atual</span>
              <span className="font-semibold text-slate-100">{prize.currentStage}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Premiação recebida</span>
              <span className="font-mono font-bold text-accent">{fmtMoney(prize.received)}</span>
            </div>
            {!prize.finished && (
              <div className="flex justify-between">
                <span className="text-slate-400">Prêmio desta fase</span>
                <span className="font-mono text-slate-200">{prize.eliminated ? '—' : `+ ${fmtMoney(prize.nextPrize)}`}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-400">Ainda pode ganhar</span>
              <span className="font-mono text-slate-200">{prize.eliminated ? '—' : `+ ${fmtMoney(prize.remaining)}`}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Total se campeão</span>
              <span className="font-mono text-gold">{fmtMoney(prize.championIf)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Total se vice</span>
              <span className="font-mono text-slate-300">{fmtMoney(prize.runnerUpIf)}</span>
            </div>
          </div>
          {prize.eliminated && (
            <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400">
              ❌ Eliminado — não recebe mais premiação nesta competição.
            </p>
          )}
          {prize.prizesByStage.length > 0 && (
            <div className="mt-3 pt-3 border-t border-surface-700/60 space-y-1">
              {prize.prizesByStage.slice(0, 8).map((p, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-slate-400">✓ {p.stage}</span>
                  <span className="font-mono text-accent">+ {fmtMoney(p.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Histórico</p>
        {[...comp.champions].reverse().slice(0, 8).map((c, i) => (
          <p key={i} className="text-xs text-slate-400 py-1 border-b border-surface-700/40 last:border-0">
            🏆 {c.season}: <span className="text-slate-200">{c.champion}</span> {c.runnerUp && <span className="text-slate-600">(vice: {c.runnerUp})</span>}
          </p>
        ))}
        {continental && (
          <div className="mt-4 pt-3 border-t border-surface-700/60">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Participantes</p>
            {comp.clubIds.map((id) => {
              const c = world.clubs[id];
              return c ? (
                <button key={id} onClick={() => onClub(id)} className="flex items-center gap-2 text-xs text-slate-400 py-1 hover:text-slate-200 w-full text-left">
                  <ClubCrest club={c} size={18} />
                  {c.shortName}
                </button>
              ) : null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

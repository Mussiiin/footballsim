import { useMemo } from 'react';
import { useGame } from '../../state/store';
import { ClubCrest, TierBadge, StatCard, FormRow, PositionBadge, PlayerAvatar } from '../components';
import { allMatchesForClub, positionOf } from '../../game/competitions';
import { formatDateBR } from '../../lib/date';
import { fmtMoney, fmtInt } from '../../lib/format';
import { overallOf } from '../../game/overall';
import { ArrowLeft } from 'lucide-react';

export function ClubScreen({ clubId }: { clubId?: string }) {
  const { career, navigate, goBack } = useGame();
  const world = career!.world;
  const id = clubId ?? career!.clubId;
  const club = world.clubs[id];

  const squad = useMemo(() => Object.values(world.players).filter((p) => p.clubId === id && p.status === 'active'), [world, id]);
  const matches = useMemo(() => allMatchesForClub(world, id), [world, id]);
  const comp = club ? world.competitions[club.leagueId] : null;
  const pos = club && comp ? positionOf(comp, club.id) : 0;
  const bestPlayers = [...squad].sort((a, b) => overallOf(b) - overallOf(a)).slice(0, 8);
  const recent = matches.filter((m) => m.played).slice(-6);

  if (!club) return <div className="card p-8 text-slate-500">Clube não encontrado.</div>;
  const isUser = club.isUserControlled;

  return (
    <div className="space-y-5 animate-fadeUp">
      <button onClick={() => goBack()} className="btn-ghost !px-2 !py-1 text-xs"><ArrowLeft size={14} /> Voltar</button>

      <div className="card p-6 flex flex-wrap items-center gap-5">
        <ClubCrest club={club} size={80} />
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-display font-bold text-2xl text-slate-100">{club.name}</h1>
            <TierBadge tier={club.tier} />
            {isUser && <span className="badge bg-accent/15 text-accent border border-accent/30">Seu clube</span>}
          </div>
          <p className="text-sm text-slate-400 mt-1">{club.city} · {club.countryId} · Fundado em {club.founded}</p>
          <p className="text-xs text-slate-500">🏟️ {club.stadium.name} ({fmtInt(club.stadium.capacity)} lugares) · Técnico: {isUser ? career!.manager.name : club.coach.name}</p>
        </div>
        <div className="text-center">
          <p className="font-display font-extrabold text-3xl text-slate-100">{pos > 0 ? `${pos}º` : '—'}</p>
          <p className="text-[10px] text-slate-500 uppercase">Na liga</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Reputação" value={club.reputation} sub={club.tier} accent="bg-gold/10 text-gold" />
        <StatCard label="Caixa" value={fmtMoney(club.balance)} sub={isUser ? 'Seu clube' : 'IA'} />
        <StatCard label="Valor" value={fmtMoney(club.clubValue)} />
        <StatCard label="Torcida" value={fmtInt(club.fans)} sub="milhares de torcedores" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Elenco principal</p>
          <div className="space-y-1.5">
            {bestPlayers.map((p) => (
              <button key={p.id} onClick={() => navigate(`player:${p.id}`)} className="w-full flex items-center gap-2.5 rounded-lg bg-surface-800/40 p-2 hover:bg-surface-800 transition text-left">
                <PlayerAvatar player={p} size={32} showPos={false} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{p.firstName} {p.lastName}</p>
                  <p className="text-[10px] text-slate-500">{p.age} anos · {p.nationality}</p>
                </div>
                <PositionBadge pos={p.position} />
                <span className="w-8 text-center font-display font-bold text-slate-100">{overallOf(p)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Últimas partidas</p>
            <div className="space-y-1.5">
              {[...recent].reverse().map((m) => (
                <div key={m.id} className="flex items-center gap-2 text-sm">
                  <span className="text-[10px] text-slate-600 w-16">{formatDateBR(m.date)}</span>
                  <span className="flex-1 text-right text-slate-300 truncate">{world.clubs[m.homeId].shortName}</span>
                  <span className="font-mono font-bold text-slate-100">{m.played ? `${m.homeScore}-${m.awayScore}` : '—'}</span>
                  <span className="flex-1 text-slate-300 truncate">{world.clubs[m.awayId].shortName}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-2 text-xs text-slate-500">
                Forma: <FormRow results={club.lastResults} />
              </div>
            </div>
          </div>

          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Títulos</p>
            {club.titles.length === 0 ? (
              <p className="text-sm text-slate-500">Ainda sem títulos.</p>
            ) : (
              <div className="space-y-1">
                {[...club.titles].reverse().slice(0, 10).map((t, i) => (
                  <p key={i} className="text-sm text-slate-300">🏆 {t.season} — {t.competitionName}</p>
                ))}
              </div>
            )}
            {!isUser && (
              <div className="mt-3 pt-3 border-t border-surface-700/60 text-xs text-slate-500">
                <p>💰 Caixa: {fmtMoney(club.balance)} · Folha: {fmtMoney(club.wageBill)}/mês</p>
                <p>📊 Força: {club.squadStrength.toFixed(1)} · Idade média: {club.averageAge.toFixed(1)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

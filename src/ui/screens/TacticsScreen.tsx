import { useMemo, useState } from 'react';
import { useGame } from '../../state/store';
import { FORMATIONS, FORMATION_LIST, Position, Player, INDIVIDUAL_INSTRUCTIONS, IndividualInstruction, TeamStyle, FormationSlot } from '../../lib/types';
import { PlayerAvatar, OverallBadge, Modal, EnergyBadge } from '../components';
import { overallAt, overallOf } from '../../game/overall';
import { playerName, positionFit, pickBestLineup, playerEnergy } from '../../game/matchEngine';
import { RNG, hashString } from '../../lib/rng';
import { POSITION_LABELS } from '../../lib/types';

const STYLE_ITEMS: { key: keyof TeamStyle; label: string; low: string; high: string }[] = [
  { key: 'possession', label: 'Posse de bola', low: 'Direto', high: 'Posse' },
  { key: 'counterAttack', label: 'Contra-ataque', low: 'Posicional', high: 'Contra-ataque' },
  { key: 'highPress', label: 'Pressão alta', low: 'Recuado', high: 'Pressing' },
  { key: 'lowBlock', label: 'Bloco baixo', low: 'Aberto', high: 'Bloco baixo' },
  { key: 'widePlay', label: 'Jogo pelas laterais', low: 'Central', high: 'Laterais' },
  { key: 'throughMiddle', label: 'Jogo pelo meio', low: 'Laterais', high: 'Meio' },
  { key: 'longBalls', label: 'Bolas longas', low: 'Curto', high: 'Longo' },
  { key: 'shortBuildUp', label: 'Construção curta', low: 'Longa', high: 'Curta' },
  { key: 'tempo', label: 'Ritmo', low: 'Lento', high: 'Rápido' },
  { key: 'intensity', label: 'Intensidade', low: 'Suave', high: 'Intensa' },
  { key: 'defensiveLine', label: 'Linha defensiva', low: 'Baixa', high: 'Alta' },
];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// categorias exibidas no painel de reservas (por posição primária)
const BENCH_CATEGORIES: { label: string; icon: string; pos: Position[] }[] = [
  { label: 'Goleiros', icon: '🧤', pos: ['GK'] },
  { label: 'Laterais', icon: '🛡️', pos: ['LB', 'RB'] },
  { label: 'Zagueiros', icon: '🧱', pos: ['CB'] },
  { label: 'Volantes', icon: '⚙️', pos: ['DM'] },
  { label: 'Meias', icon: '🎯', pos: ['CM', 'AM'] },
  { label: 'Atacantes e pontas', icon: '⚽', pos: ['LW', 'RW', 'ST', 'CF'] },
];


export function TacticsScreen() {
  const { career, setLineup, navigate, goBack } = useGame();
  const [slotPick, setSlotPick] = useState<string | null>(null);
  const [instPlayer, setInstPlayer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const world = career!.world;
  const lineup = career!.lineup;
  const squad = useMemo(() => Object.values(world.players).filter((p) => p.clubId === career!.clubId && p.status === 'active' && !p.arrivingUntil), [world, career]);
  const formation = FORMATIONS[lineup.formation];
  const filled = new Set(Object.values(lineup.slots));

  const slotPlayer = (slotId: string) => {
    const pid = lineup.slots[slotId];
    return pid ? world.players[pid] : undefined;
  };

  /**
   * Coloca um jogador em uma vaga. O jogador movido vai para onde foi solto;
   * quem ocupava a vaga alvo vai para o banco (NUNCA puxa outro jogador para a
   * posição que o movido deixou — a vaga antiga fica livre). `pos` (opcional)
   * registra uma posição livre no campo (x,y em %).
   */
  const assign = (slotId: string, playerId: string, pos?: { x: number; y: number }) => {
    const slots = { ...lineup.slots };
    const positions = { ...(lineup.positions ?? {}) };
    if (slots[slotId] === playerId) {
      if (pos) {
        positions[slotId] = pos;
        setLineup({ ...lineup, slots, positions });
      }
      setSlotPick(null);
      return;
    }
    // remove o jogador da vaga anterior (nunca fica em duas vagas)
    const prevSlot = Object.entries(slots).find(([, v]) => v === playerId)?.[0];
    if (prevSlot) {
      delete slots[prevSlot];
      delete positions[prevSlot];
    }
    // quem estava na vaga alvo sai para o banco (sem trocar de posição)
    slots[slotId] = playerId;
    if (pos) positions[slotId] = pos;
    else delete positions[slotId];
    setLineup({ ...lineup, slots, positions });
    setSlotPick(null);
  };

  /** preenche a formação com o melhor jogador disponível por um critério (overall ou energia) */
  const bestSlotsByScore = (scoreFn: (p: Player) => number): Record<string, string> => {
    const slots: Record<string, string> = {};
    const used = new Set<string>();
    for (const slot of formation) {
      let best: string | null = null;
      let bestScore = -Infinity;
      for (const p of squad) {
        if (used.has(p.id) || p.injury || p.suspension > 0) continue;
        const fit = p.position === slot.position ? 3 : p.secondaryPositions.includes(slot.position) ? 2 : 0;
        // posição domina (nunca 2 goleiros etc.); o critério (overall/energia) desempata dentro da posição
        const score = fit * 20 + scoreFn(p);
        if (score > bestScore) { bestScore = score; best = p.id; }
      }
      if (best) { slots[slot.id] = best; used.add(best); }
    }
    return slots;
  };

  const pickBestTeam = () => {
    setLineup({ ...lineup, slots: bestSlotsByScore((p) => overallOf(p)), positions: {} });
  };

  const pickRestTeam = () => {
    setLineup({ ...lineup, slots: bestSlotsByScore((p) => playerEnergy(p)), positions: {} });
  };

  /** melhor vaga para um ponto (x,y) do campo: prefere vaga vazia e compatível com a posição do jogador */
  const nearestSlotFor = (x: number, y: number, player?: Player): FormationSlot | null => {
    let best: FormationSlot | null = null;
    let bestScore = -Infinity;
    for (const slot of formation) {
      const dist = Math.hypot(slot.x - x, slot.y - y);
      const occupant = lineup.slots[slot.id];
      if (occupant === player?.id) continue;
      const compat = player
        ? (player.position === slot.position ? 0 : player.secondaryPositions.includes(slot.position) ? 1 : 3)
        : 1;
      // vazia muito mais atraente; compatibilidade pesa; proximidade desempata
      const score = -dist - compat * 12 - (occupant ? 80 : 0);
      if (score > bestScore) { bestScore = score; best = slot; }
    }
    return best;
  };

  /** solta o jogador em uma área do campo: converte o ponto em % e escolhe a vaga mais adequada */
  const placeOnPitch = (e: React.DragEvent<HTMLDivElement>, playerId: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = clamp(((e.clientX - rect.left) / rect.width) * 100, 3, 97);
    const y = clamp(((e.clientY - rect.top) / rect.height) * 100, 3, 97);
    const p = world.players[playerId];
    const slot = nearestSlotFor(x, y, p);
    if (!slot) return;
    assign(slot.id, playerId, { x, y });
  };

  /** vaga alvo para o destaque visual durante o arrasto */
  const highlightTarget = (e: React.DragEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = clamp(((e.clientX - rect.left) / rect.width) * 100, 3, 97);
    const y = clamp(((e.clientY - rect.top) / rect.height) * 100, 3, 97);
    const p = dragId ? world.players[dragId] : undefined;
    setDropTarget(nearestSlotFor(x, y, p)?.id ?? null);
  };

  const fitInfo = (p: Player | undefined, slotPos: Position) => {
    if (!p) return null;
    const fit = positionFit(p, slotPos);
    if (fit === 100) return { label: 'Ideal', cls: 'bg-emerald-500/90', penalty: 0 };
    if (fit === 80) return { label: 'Adaptado', cls: 'bg-amber-500/90', penalty: 0 };
    if (fit === 55) return { label: 'Fora de posição', cls: 'bg-orange-500/90', penalty: Math.max(1, Math.round((overallOf(p) - overallAt(p, slotPos)) * 0.4)) };
    return { label: 'Improvisado', cls: 'bg-red-500/90', penalty: Math.max(2, overallOf(p) - overallAt(p, slotPos)) };
  };

  const restore = () => {
    const rng = new RNG(hashString(career!.world.seed) ^ hashString(`${career!.id}|default-lineup`));
    const best = pickBestLineup(squad, lineup.formation, rng, career!.world.date);
    const slots: Record<string, string> = {};
    const ids = [...best.playerIds];
    FORMATIONS[lineup.formation].forEach((s, i) => { if (ids[i]) slots[s.id] = ids[i]; });
    setLineup({ ...lineup, slots, positions: {} });
  };

  const resetPositions = () => {
    setLineup({ ...lineup, positions: {} });
  };

  const changeFormation = (f: string) => {
    setBusy(true);
    // tenta manter jogadores por posição compatível
    const slots: Record<string, string> = {};
    const used = new Set<string>();
    for (const slot of FORMATIONS[f]) {
      const prev = lineup.slots[slot.id];
      if (prev && !used.has(prev)) {
        const p = world.players[prev];
        if (p) {
          const fit = p.position === slot.position || p.secondaryPositions.includes(slot.position);
          if (fit) {
            slots[slot.id] = prev;
            used.add(prev);
            continue;
          }
        }
      }
      // melhor disponível
      let best: string | null = null;
      let bestScore = -Infinity;
      for (const p of squad) {
        if (used.has(p.id) || p.injury || p.suspension > 0) continue;
        const fit = p.position === slot.position ? 3 : p.secondaryPositions.includes(slot.position) ? 2 : 0;
        const score = overallOf(p) + fit * 3;
        if (score > bestScore) {
          bestScore = score;
          best = p.id;
        }
      }
      if (best) {
        slots[slot.id] = best;
        used.add(best);
      }
    }
    setLineup({ ...lineup, formation: f, slots, positions: {} });
    setBusy(false);
  };

  const setStyle = (key: keyof TeamStyle, value: number) => {
    setLineup({ ...lineup, style: { ...lineup.style, [key]: value } });
  };

  const setInstruction = (playerId: string, inst: IndividualInstruction) => {
    const instructions = { ...lineup.instructions };
    if (inst === 'Apoiar') delete instructions[playerId];
    else instructions[playerId] = inst;
    setLineup({ ...lineup, instructions });
    setInstPlayer(null);
  };

  const starters = formation.map((s) => slotPlayer(s.id)).filter(Boolean);
  const teamOv = starters.length > 0 ? Math.round(starters.reduce((s, p) => s + overallOf(p!), 0) / starters.length) : 0;
  const freePositions = Object.keys(lineup.positions ?? {}).length;
  // só reservas aparecem na lista arrastável — titulares já estão no campo (evita impressão de duplicado)
  const benchPlayers = squad.filter((p) => !filled.has(p.id));

  return (
    <div className="space-y-4 animate-fadeUp">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={goBack} className="btn-ghost !px-3 text-sm">← Voltar</button>
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100">Táticas</h1>
          <p className="text-sm text-slate-500">Formação {lineup.formation} · Força do time: <span className="text-accent font-semibold">{teamOv}</span></p>
        </div>
        <div className="flex-1" />
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={resetPositions} disabled={freePositions === 0} className="btn-ghost !px-3 text-xs" title="Volta os jogadores às posições da formação">
            🎯 Posições padrão{freePositions > 0 ? ` (${freePositions})` : ''}
          </button>
          <button onClick={pickBestTeam} className="btn-ghost !px-3 text-xs" title="Escala os 11 jogadores de maior overall, respeitando as posições da formação">🏆 Melhor time</button>
          <button onClick={pickRestTeam} className="btn-ghost !px-3 text-xs" title="Escala os jogadores mais descansados (maior energia)">😴 Time descansado</button>
          <button onClick={restore} className="btn-ghost !px-3 text-xs" title="Escala os melhores jogadores disponíveis na formação atual">↩ Restaurar</button>
          {FORMATION_LIST.map((f) => (
            <button key={f} onClick={() => changeFormation(f)} disabled={busy} className={`badge border px-3 py-1.5 ${lineup.formation === f ? 'bg-accent text-surface-950 border-accent' : 'bg-surface-800 text-slate-300 border-surface-600 hover:border-surface-500'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* quadro tático */}
        <div className="lg:col-span-3">
          <div className="card p-4">
            <div
              className="pitch-bg rounded-xl border border-surface-700 relative aspect-[3/4] sm:aspect-[16/10] overflow-hidden"
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; highlightTarget(e); }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDropTarget(null);
                const pid = e.dataTransfer.getData('text/plain') || dragId;
                if (pid && world.players[pid]) placeOnPitch(e, pid);
                setDragId(null);
              }}
            >
              {/* linhas do campo */}
              <div className="absolute inset-4 border border-white/15 rounded-lg" />
              <div className="absolute left-4 right-4 top-1/2 border-t border-white/15" />
              <div className="absolute left-1/2 top-4 bottom-4 border border-white/15 w-24 -translate-x-1/2 rounded-full" />
              <div className="absolute left-1/2 top-0 bottom-0 border-l border-dashed border-white/10" />
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-6 h-16 border border-white/15 rounded-r-full" />
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-6 h-16 border border-white/15 rounded-l-full" />

              {formation.map((slot) => {
                const p = slotPlayer(slot.id);
                const fit = fitInfo(p, slot.position);
                const effOv = p ? overallAt(p, slot.position) : 0;
                const pos = (lineup.positions ?? {})[slot.id] ?? { x: slot.x, y: slot.y };
                return (
                  <button
                    key={slot.id}
                    onClick={() => setSlotPick(slot.id)}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDropTarget(null);
                      const pid = e.dataTransfer.getData('text/plain') || dragId;
                      if (pid && world.players[pid]) assign(slot.id, pid);
                      setDragId(null);
                    }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 group ${dropTarget === slot.id ? 'ring-2 ring-accent rounded-full' : ''}`}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                    title={p ? `${p.firstName} ${p.lastName} — ${POSITION_LABELS[p.position]}` : `Vaga ${slot.label} — solte um jogador aqui`}
                  >
                    {p ? (
                      <div
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move'; setDragId(p.id); }}
                        onDragEnd={() => setDragId(null)}
                        className={`flex flex-col items-center gap-0.5 cursor-grab active:cursor-grabbing ${dragId === p.id ? 'opacity-50' : ''}`}
                      >
                        <PlayerAvatar player={p} size={40} />
                        <span className="rounded bg-surface-950/90 border border-surface-600 px-1 text-[9px] text-slate-300 whitespace-nowrap">
                          {p.lastName.slice(0, 10)} {effOv !== overallOf(p) && <b className="text-red-400">{effOv}</b>}
                        </span>
                        {fit && (
                          <span className={`rounded-full px-1.5 text-[8px] font-bold text-surface-950 ${fit.cls}`} title={fit.label}>
                            {fit.label}
                          </span>
                        )}
                        <EnergyBadge player={p} />
                        {lineup.instructions[p.id] && (
                          <span className="text-[9px] text-accent">{lineup.instructions[p.id]}</span>
                        )}
                      </div>
                    ) : (
                      <div className={`flex flex-col items-center gap-0.5 ${dropTarget === slot.id ? 'ring-2 ring-accent rounded-full' : ''}`}>
                        <div className="w-10 h-10 rounded-full border-2 border-dashed border-surface-500 bg-surface-900/60 flex items-center justify-center text-[10px] text-slate-400">
                          {slot.label}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-600 mt-2">Arraste um jogador para uma área livre do campo — ele assume a vaga mais próxima e a posição fica salva. Solte sobre um jogador para trocar.</p>
          </div>
        </div>

        {/* elenco arrastável e estilo */}
        <div className="lg:col-span-2 space-y-5">
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Reservas — arraste para o campo</p>
            <p className="text-[10px] text-slate-600 mb-3">{starters.length} titulares no campo · solte sobre um titular para substituí-lo (ele vai ao banco) · clique na vaga para escolher</p>
            <div className="max-h-72 overflow-y-auto pr-1">
              {BENCH_CATEGORIES.map((cat) => {
                const players = benchPlayers.filter((p) => cat.pos.includes(p.position));
                if (players.length === 0) return null;
                return (
                  <div key={cat.label} className="mb-2">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">{cat.icon} {cat.label} <span className="text-slate-600">({players.length})</span></p>
                    <div className="flex flex-wrap gap-1.5">
                      {players.map((p) => (
                        <div
                          key={p.id}
                          draggable={!p.injury && p.suspension <= 0}
                          onDragStart={(e) => { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move'; setDragId(p.id); }}
                          onDragEnd={() => setDragId(null)}
                          title={p.injury ? 'Lesionado — não pode ser escalado' : `${p.firstName} ${p.lastName} · ${POSITION_LABELS[p.position]} · Energia ${Math.round(playerEnergy(p))}%`}
                          className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs cursor-grab active:cursor-grabbing transition ${dragId === p.id ? 'border-accent bg-accent/10' : 'border-surface-600 bg-surface-800 hover:border-surface-500'}`}
                        >
                          <PlayerAvatar player={p} size={22} showPos={false} />
                          <span className="font-semibold text-slate-300">{p.lastName.slice(0, 14)}</span>
                          <span className="text-[9px] text-slate-500">{POSITION_LABELS[p.position]}</span>
                          <OverallBadge player={p} size="sm" />
                          {p.injury && <span className="text-xs">🩹</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Estilo de jogo</p>
            <div className="space-y-3">
              {STYLE_ITEMS.map((s) => (
                <div key={s.key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">{s.label}</span>
                    <span className="font-mono font-bold text-accent">{lineup.style[s.key]}</span>
                  </div>
                  <input
                    type="range" min={0} max={100} value={lineup.style[s.key]}
                    onChange={(e) => setStyle(s.key, Number(e.target.value))}
                    className="w-full accent-[#3ddc84]"
                  />
                  <div className="flex justify-between text-[9px] text-slate-600">
                    <span>{s.low}</span><span>{s.high}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Instruções individuais</p>
            <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
              {starters.map((p) => (
                <button
                  key={p!.id}
                  onClick={() => setInstPlayer(p!.id)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${lineup.instructions[p!.id] ? 'border-accent/50 bg-accent/10 text-accent' : 'border-surface-600 bg-surface-800 text-slate-300 hover:border-surface-500'}`}
                >
                  <span className="font-semibold">{p!.lastName}</span>
                  {lineup.instructions[p!.id] && <span className="text-[9px] text-accent">· {lineup.instructions[p!.id]}</span>}
                </button>
              ))}
            </div>
            <button onClick={() => navigate('training')} className="btn-secondary w-full mt-4 text-xs">Definir foco de treino →</button>
          </div>
        </div>
      </div>

      {/* seletor de jogador */}
      <Modal open={!!slotPick} onClose={() => setSlotPick(null)} title={slotPick ? `Escalar ${formation.find((s) => s.id === slotPick)?.label ?? ''} — ${slotPick ? POSITION_LABELS[formation.find((s) => s.id === slotPick)?.position as Position] ?? '' : ''}` : ''} wide>
        <div className="grid sm:grid-cols-2 gap-2 max-h-96 overflow-y-auto">
          {squad.map((p) => {
            const slotPos = formation.find((s) => s.id === slotPick)?.position as Position;
            const fit = p.position === slotPos ? 3 : p.secondaryPositions.includes(slotPos) ? 2 : 0;
            const selected = filled.has(p.id);
            return (
              <button
                key={p.id}
                disabled={selected && lineup.slots[slotPick!] !== p.id}
                onClick={() => slotPick && assign(slotPick, p.id)}
                className={`flex items-center gap-3 rounded-lg border p-2.5 text-left transition ${lineup.slots[slotPick!] === p.id ? 'border-accent bg-accent/10' : selected ? 'opacity-40' : 'border-surface-600 hover:border-surface-500'}`}
              >
                <PlayerAvatar player={p} size={34} showPos={false} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{playerName(p)}</p>
                  <p className="text-[11px] text-slate-500">{POSITION_LABELS[p.position]}{fit === 3 ? ' · ideal' : fit === 2 ? ' · compatível' : ' · fora de posição'}</p>
                </div>
                <EnergyBadge player={p} showPct />
                <OverallBadge player={p} size="sm" />
                {p.injury && <span className="text-sm" title="Lesionado">🩹</span>}
              </button>
            );
          })}
        </div>
      </Modal>

      {/* instruções */}
      <Modal open={!!instPlayer} onClose={() => setInstPlayer(null)} title="Instrução individual">
        {instPlayer && (
          <div>
            <p className="text-sm text-slate-300 mb-3">{world.players[instPlayer] ? playerName(world.players[instPlayer]) : ''}</p>
            <div className="grid grid-cols-2 gap-2">
              {INDIVIDUAL_INSTRUCTIONS.map((inst) => (
                <button
                  key={inst}
                  onClick={() => setInstruction(instPlayer, inst)}
                  className={`rounded-lg border px-3 py-2 text-sm transition ${lineup.instructions[instPlayer] === inst ? 'border-accent bg-accent/10 text-accent' : 'border-surface-600 text-slate-300 hover:border-surface-500'}`}
                >
                  {inst}
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

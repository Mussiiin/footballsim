import { useGame } from '../../state/store';
import { TRAINING_FOCUSES, TrainingFocus } from '../../lib/types';
import { PlayerAvatar, Bar } from '../components';
import { fmtInt, fmtMoney } from '../../lib/format';
import { overallOf, overallAt } from '../../game/overall';
import { youthUpgradeCost } from '../../game/development';

const FOCUS_INFO: Record<TrainingFocus, { icon: string; desc: string }> = {
  'Físico': { icon: '💪', desc: 'Velocidade, força e resistência. Recupera condição mais rápido.' },
  'Ataque': { icon: '⚽', desc: 'Finalização, posicionamento e drible.' },
  'Defesa': { icon: '🛡️', desc: 'Marcação, desarme e interceptação.' },
  'Passe': { icon: '↔️', desc: 'Qualidade de passe e visão de jogo.' },
  'Finalização': { icon: '🎯', desc: 'Precisão de chute e finalização.' },
  'Posse': { icon: '🔁', desc: 'Controle e técnica para manter a bola.' },
  'Tática': { icon: '📋', desc: 'Inteligência tática e posicionamento.' },
  'Recuperação': { icon: '🛌', desc: 'Recupera condição e reduz fadiga rapidamente.' },
};

export function TrainingScreen() {
  const { career, setTrainingFocus, investInYouth, promoteYouth, releaseYouth } = useGame();
  const world = career!.world;
  const club = world.clubs[career!.clubId];
  const squad = Object.values(world.players).filter((p) => p.clubId === career!.clubId && p.status === 'active');
  const focus = career!.trainingFocus;
  const youthPool = world.youth?.[career!.clubId] ?? [];
  const academy = club.facilities.youth;
  const cost5 = youthUpgradeCost(club.facilities, club.tier, 5);
  const cost10 = youthUpgradeCost(club.facilities, club.tier, 10);

  const young = squad.filter((p) => p.age <= 22 && p.potential > overallOf(p)).sort((a, b) => (b.potential - overallOf(b)) - (a.potential - overallOf(a)));

  return (
    <div className="space-y-5 animate-fadeUp">
      <div>
        <h1 className="font-display font-bold text-2xl text-slate-100">Centro de Treinamento</h1>
        <p className="text-sm text-slate-500">Escolha o foco semanal do treino — afeta evolução, forma e condição.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {TRAINING_FOCUSES.map((f) => (
          <button
            key={f}
            onClick={() => setTrainingFocus(f)}
            className={`card p-4 text-left transition ${focus === f ? 'border-accent shadow-glow' : 'card-hover'}`}
          >
            <div className="text-2xl mb-2">{FOCUS_INFO[f].icon}</div>
            <p className={`font-semibold ${focus === f ? 'text-accent' : 'text-slate-100'}`}>{f}</p>
            <p className="text-xs text-slate-500 mt-1 leading-snug">{FOCUS_INFO[f].desc}</p>
            {focus === f && <span className="badge bg-accent text-surface-950 mt-2">Ativo</span>}
          </button>
        ))}
      </div>

      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Instalações do clube</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Facility label="Centro de treinamento" value={world.clubs[career!.clubId].facilities.training} />
          <Facility label="Academia (base)" value={world.clubs[career!.clubId].facilities.youth} />
          <Facility label="Departamento médico" value={world.clubs[career!.clubId].facilities.medical} />
          <Facility label="Estrutura comercial" value={world.clubs[career!.clubId].facilities.commercial} />
        </div>
      </div>

      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">⭐ Jovens promessas do elenco</p>
        {young.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum jovem promissor no momento. Invista na base!</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {young.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg bg-surface-800/50 p-3">
                <PlayerAvatar player={p} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{p.firstName} {p.lastName}</p>
                  <p className="text-[11px] text-slate-500">{p.age} anos · {p.position}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">Ovr <span className="font-bold text-slate-100">{overallOf(p)}</span></p>
                  <p className="text-xs text-accent">Pot <span className="font-bold">{p.potential}</span></p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">🏟️ Categorias de Base</p>
          <span className="badge bg-surface-800 text-slate-400 border border-surface-600">{youthPool.length} jovens</span>
        </div>
        <p className="text-xs text-slate-500 mb-4">Invista na academia para revelar promessas mais talentosas a cada temporada — depois promova as melhores ao elenco principal.</p>

        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-surface-800/50 p-4 mb-4">
          <div className="flex-1 min-w-[200px]">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-300">Nível da academia</span>
              <span className="font-mono font-bold text-slate-100">{fmtInt(academy)}</span>
            </div>
            <Bar value={academy} />
          </div>
          <button
            onClick={() => investInYouth(5)}
            disabled={club.balance < cost5 || academy >= 100}
            className="btn-secondary !px-3 text-xs"
          >
            +5 · {fmtMoney(cost5)}
          </button>
          <button
            onClick={() => investInYouth(10)}
            disabled={club.balance < cost10 || academy >= 96}
            className="btn-primary !px-3 text-xs"
          >
            +10 · {fmtMoney(cost10)}
          </button>
        </div>

        {youthPool.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum jovem na base no momento. Invista na academia e aguarde a próxima fornada (fim de temporada).</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {youthPool.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg bg-surface-800/50 p-3">
                <PlayerAvatar player={p} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{p.firstName} {p.lastName}</p>
                  <p className="text-[11px] text-slate-500">{p.age} anos · {p.position} · {p.personality}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-400">Ovr <span className="font-bold text-slate-100">{overallOf(p)}</span></p>
                  <p className="text-xs text-accent">Pot <span className="font-bold">{p.potential}</span></p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={() => promoteYouth(p.id)} className="btn-primary !px-2 !py-1 text-[11px]">Promover</button>
                  <button onClick={() => releaseYouth(p.id)} className="btn-danger !px-2 !py-1 text-[11px]">Dispensar</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Condição do elenco</p>
        <div className="space-y-2">
          {squad.sort((a, b) => a.condition - b.condition).slice(0, 10).map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              <PlayerAvatar player={p} size={28} showPos={false} />
              <span className="w-36 text-sm text-slate-300 truncate">{p.firstName} {p.lastName}</span>
              <Bar value={p.condition} className="flex-1" />
              <span className={`w-10 text-right font-mono text-xs ${p.condition >= 70 ? 'text-accent' : p.condition >= 45 ? 'text-gold' : 'text-red-400'}`}>{p.condition}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Facility({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-300">{label}</span>
        <span className="font-mono font-bold text-slate-100">{fmtInt(value)}</span>
      </div>
      <Bar value={value} />
    </div>
  );
}

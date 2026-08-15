import React, { useMemo, useState } from 'react';
import { useGame } from '../../state/store';
import { NATIONALITIES } from '../../game/names';
import { ManagerLicense, ManagerStyle, Difficulty, DIFFICULTY_CONFIG } from '../../lib/types';
import { eligibleClubs, createManager } from '../../game/career';
import { ClubCrest, TierBadge } from '../components';
import { formatDateBR } from '../../lib/date';
import { fmtMoney } from '../../lib/format';

export function NewCareerScreen() {
  const { navigate, newCareer } = useGame();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [nationality, setNationality] = useState(NATIONALITIES[0].name);
  const [age, setAge] = useState(38);
  const [license, setLicense] = useState<ManagerLicense>('B');
  const [style, setStyle] = useState<ManagerStyle>('Equilibrado');
  const [difficulty, setDifficulty] = useState<Difficulty>('Normal');
  const [clubId, setClubId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [countrySel, setCountrySel] = useState<string | null>(null);
  const [tierSel, setTierSel] = useState<number | null>(null);

  const world = useMemo(() => createDummyWorld(), []);

  const manager = useMemo(
    () => (name.trim() ? createManager({ name: name.trim() || 'Treinador', nationality, age, license, style }) : null),
    [name, nationality, age, license, style],
  );

  const choices = useMemo(() => {
    if (!manager) return [];
    return eligibleClubs(world, manager);
  }, [manager, world]);

  const selectedCountry = world.countries.find((c) => c.id === countrySel) ?? null;
  const divisions = selectedCountry ? selectedCountry.divisions.map((id) => world.competitions[id]) : [];

  const filtered = choices.filter(({ club }) => {
    if (countrySel && club.countryId !== countrySel) return false;
    if (tierSel && world.competitions[club.leagueId]?.tier !== tierSel) return false;
    return !filter || club.name.toLowerCase().includes(filter.toLowerCase()) || club.city.toLowerCase().includes(filter.toLowerCase());
  });

  const start = async () => {
    if (!name.trim() || !clubId) return;
    setBusy(true);
    try {
      await newCareer({ name: name.trim(), nationality, age, license, style }, clubId, difficulty);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-slate-100">Nova Carreira</h1>
          <p className="text-sm text-slate-500">Passo {step} de 2 — {step === 1 ? 'Crie seu treinador' : 'Escolha seu clube'}</p>
        </div>
        <div className="flex gap-1.5">
          <div className={`h-1.5 w-10 rounded-full ${step === 1 ? 'bg-accent' : 'bg-surface-600'}`} />
          <div className={`h-1.5 w-10 rounded-full ${step === 2 ? 'bg-accent' : 'bg-surface-600'}`} />
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-6 animate-fadeUp">
          <div className="card p-6 space-y-5">
            <div>
              <label className="label">Nome do treinador</label>
              <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Carlos Souza" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Nacionalidade</label>
                <select className="input w-full" value={nationality} onChange={(e) => setNationality(e.target.value)}>
                  {NATIONALITIES.map((c) => (
                    <option key={c.name} value={c.name}>{c.flag} {c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Idade ({age} anos)</label>
                <input type="range" min={30} max={65} value={age} onChange={(e) => setAge(Number(e.target.value))} className="w-full mt-3 accent-[#3ddc84]" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Licença</label>
                <select className="input w-full" value={license} onChange={(e) => setLicense(e.target.value as ManagerLicense)}>
                  {(['Nenhuma', 'C', 'B', 'A', 'PRO'] as ManagerLicense[]).map((l) => (
                    <option key={l} value={l}>{l}{l !== 'Nenhuma' ? ` (rep +${[{ Nenhuma: 0, C: 15, B: 30, A: 55, PRO: 80 }[l]]})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Estilo de jogo</label>
                <select className="input w-full" value={style} onChange={(e) => setStyle(e.target.value as ManagerStyle)}>
                  {(['Ofensivo', 'Defensivo', 'Equilibrado', 'Pressing alto', 'Contra-ataque', 'Posse de bola'] as ManagerStyle[]).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Dificuldade</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['Fácil', 'Normal', 'Difícil', 'Hardcore'] as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDifficulty(d)}
                    className={`rounded-xl border p-3 text-left transition ${difficulty === d ? 'border-accent bg-accent/10' : 'border-surface-600 hover:border-surface-500'}`}
                  >
                    <p className="font-semibold text-sm text-slate-100">{d}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {d === 'Fácil' ? 'IA mais fraca, diretoria paciente' : d === 'Normal' ? 'Experiência equilibrada' : d === 'Difícil' ? 'IA forte, mercado caro' : 'Sem piedade'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {manager && (
            <div className="card p-5 animate-fadeUp">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Atributos do treinador</p>
              <div className="grid grid-cols-3 gap-3">
                {(['tactical', 'development', 'motivation', 'management', 'scouting', 'negotiation'] as const).map((k) => (
                  <div key={k}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400 capitalize">{k === 'tactical' ? 'Tática' : k === 'development' ? 'Desenvolvimento' : k === 'motivation' ? 'Motivação' : k === 'management' ? 'Gestão' : k === 'scouting' ? 'Scouting' : 'Negociação'}</span>
                      <span className="font-mono font-bold text-slate-200">{manager.attrs[k]}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-700">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${manager.attrs[k]}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-3">Reputação: <span className="text-accent font-semibold">{manager.reputation}</span> · Salário base: {fmtMoney(manager.salary)}/sem</p>
            </div>
          )}

          <div className="flex justify-end">
            <button disabled={!name.trim()} onClick={() => setStep(2)} className="btn-primary px-8">Próximo →</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 animate-fadeUp">
          <div className="flex items-center gap-3">
            <input className="input flex-1" placeholder="Filtrar por clube ou cidade…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <button onClick={() => setStep(1)} className="btn-secondary">← Treinador</button>
          </div>

          {/* países */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => { setCountrySel(null); setTierSel(null); }}
              className={`badge border px-3 py-1.5 transition ${!countrySel ? 'bg-accent text-surface-950 border-accent' : 'bg-surface-800 text-slate-300 border-surface-600 hover:border-surface-500'}`}
            >
              🌍 Todos os países
            </button>
            {world.countries.map((c) => (
              <button
                key={c.id}
                onClick={() => { setCountrySel(c.id); setTierSel(null); }}
                className={`badge border px-3 py-1.5 transition ${countrySel === c.id ? 'bg-accent text-surface-950 border-accent' : 'bg-surface-800 text-slate-300 border-surface-600 hover:border-surface-500'}`}
              >
                {c.flag} {c.name}
              </button>
            ))}
          </div>

          {/* divisões do país selecionado */}
          {selectedCountry && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setTierSel(null)}
                className={`badge border px-3 py-1 transition ${!tierSel ? 'bg-gold text-surface-950 border-gold' : 'bg-surface-800 text-slate-300 border-surface-600 hover:border-surface-500'}`}
              >
                Todas as divisões
              </button>
              {divisions.map((comp) => (
                <button
                  key={comp.id}
                  onClick={() => setTierSel(comp.tier)}
                  className={`badge border px-3 py-1 transition ${tierSel === comp.tier ? 'bg-gold text-surface-950 border-gold' : 'bg-surface-800 text-slate-300 border-surface-600 hover:border-surface-500'}`}
                >
                  {comp.tier}ª Divisão · {comp.name}
                </button>
              ))}
            </div>
          )}

          <p className="text-xs text-slate-500">
            {filtered.length} clube{filtered.length === 1 ? '' : 's'}{selectedCountry ? ` em ${selectedCountry.flag} ${selectedCountry.name}` : ''}{tierSel ? ` · ${tierSel}ª divisão` : ''}
          </p>

          <div className="grid sm:grid-cols-2 gap-3">
            {filtered.map(({ club, locked, reason }) => {
              const comp = world.competitions[club.leagueId];
              const ctry = world.countries.find((c) => c.id === club.countryId);
              return (
                <button
                  key={club.id}
                  disabled={locked}
                  onClick={() => setClubId(club.id)}
                  className={`card p-4 text-left transition ${clubId === club.id ? 'border-accent shadow-glow' : locked ? 'opacity-45 cursor-not-allowed' : 'card-hover'}`}
                >
                  <div className="flex items-center gap-3">
                    <ClubCrest club={club} size={44} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-100 truncate">{club.name}</p>
                        <TierBadge tier={club.tier} />
                      </div>
                      <p className="text-xs text-slate-500 truncate">
                        {ctry ? `${ctry.flag} ${ctry.name}` : club.countryId} · {comp ? `${comp.tier}ª divisão` : ''} · {club.city}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{club.stadium.name} ({fmtMoney(club.stadium.capacity)} lugares)</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-surface-800/70 py-1.5">
                      <p className="font-display font-bold text-slate-200">{club.squadStrength.toFixed(1)}</p>
                      <p className="text-[10px] text-slate-500">Força</p>
                    </div>
                    <div className="rounded-lg bg-surface-800/70 py-1.5">
                      <p className="font-display font-bold text-slate-200">{club.reputation}</p>
                      <p className="text-[10px] text-slate-500">Reputação</p>
                    </div>
                    <div className="rounded-lg bg-surface-800/70 py-1.5">
                      <p className="font-display font-bold text-gold">{fmtMoney(club.balance)}</p>
                      <p className="text-[10px] text-slate-500">Caixa</p>
                    </div>
                  </div>
                  {locked && <p className="mt-2 text-[11px] text-red-400/80">🔒 {reason}</p>}
                </button>
              );
            })}
          </div>

          <div className="flex justify-end gap-3 sticky bottom-0 pt-4 pb-2 bg-surface-950/90 backdrop-blur">
            <p className="text-xs text-slate-500 self-center mr-auto">
              {clubId ? `Selecionado: ${choices.find((c) => c.club.id === clubId)?.club.name}` : 'Selecione um clube para começar'}
            </p>
            <button onClick={() => setStep(1)} className="btn-secondary">Voltar</button>
            <button onClick={() => void start()} disabled={!clubId || busy} className="btn-primary px-8">
              {busy ? 'Criando carreira…' : '🚀 Começar carreira'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// mundo dummy para listar clubes sem gerar tudo duas vezes
import { generateWorld } from '../../game/worldgen';
let _dummyWorld: ReturnType<typeof generateWorld> | null = null;
function createDummyWorld() {
  if (!_dummyWorld) _dummyWorld = generateWorld('club-list');
  return _dummyWorld;
}

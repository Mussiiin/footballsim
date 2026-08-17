import React, { useEffect, useState } from 'react';
import { X, Rocket, CheckCircle2, History, ChevronLeft, ShieldAlert } from 'lucide-react';
import {
  LATEST_UPDATE,
  UPDATE_HISTORY,
  appliedVersion,
  BUILD_ID,
  GENERIC_BUILD_UPDATE,
  hasUnseenPatchNotes,
  dismissUpdatePopup,
  markUpdateApplied,
} from '../game/updateNotes';
import type { UpdateNoteVersion, UpdateNoteItem } from '../game/updateNotes';

type View = 'intro' | 'notes' | 'history' | 'confirm' | 'progress' | 'done';

function PatchCard({ icon, item }: { icon: string; item: UpdateNoteItem }) {
  return (
    <div className="rounded-lg border border-surface-700 bg-surface-800/40 p-3">
      <p className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
        <span>{icon}</span> {item.title}
      </p>
      {item.description && <p className="mt-1 text-xs text-slate-400 leading-relaxed">{item.description}</p>}
    </div>
  );
}

function PatchNotesBody({ version }: { version: UpdateNoteVersion }) {
  const total =
    version.newFeatures.length +
    version.improvements.length +
    version.bugFixes.length +
    (version.football?.length ?? 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {version.newFeatures.length > 0 && <span className="badge bg-accent/15 text-accent border border-accent/30">✨ {version.newFeatures.length} novo(s)</span>}
        {version.improvements.length > 0 && <span className="badge bg-sky-500/15 text-sky-400 border border-sky-500/30">🔧 {version.improvements.length} melhoria(s)</span>}
        {version.bugFixes.length > 0 && <span className="badge bg-red-500/15 text-red-400 border border-red-500/30">🐛 {version.bugFixes.length} correção(ões)</span>}
        {(version.football?.length ?? 0) > 0 && <span className="badge bg-gold/15 text-gold border border-gold/30">⚽ {version.football!.length} futebol</span>}
      </div>
      <p className="text-[11px] text-slate-500">{total} novidade(s) nesta versão</p>

      {version.newFeatures.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-accent mb-2">✨ Novo</p>
          <div className="space-y-2">
            {version.newFeatures.map((item, i) => <PatchCard key={i} icon="✨" item={item} />)}
          </div>
        </div>
      )}
      {version.improvements.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-2">🔧 Melhorias</p>
          <div className="space-y-2">
            {version.improvements.map((item, i) => <PatchCard key={i} icon="🔧" item={item} />)}
          </div>
        </div>
      )}
      {version.bugFixes.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-red-400 mb-2">🐛 Correções</p>
          <div className="space-y-2">
            {version.bugFixes.map((item, i) => <PatchCard key={i} icon="🐛" item={item} />)}
          </div>
        </div>
      )}
      {(version.football?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-gold mb-2">⚽ Futebol</p>
          <div className="space-y-2">
            {version.football!.map((item, i) => <PatchCard key={i} icon="⚽" item={item} />)}
          </div>
        </div>
      )}
    </div>
  );
}

export function UpdateModal({
  open,
  onClose,
  forceView,
}: {
  open: boolean;
  onClose: () => void;
  forceView?: 'intro' | 'history';
}) {
  const [view, setView] = useState<View>('intro');
  const [selected, setSelected] = useState<UpdateNoteVersion>(LATEST_UPDATE);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<'download' | 'install' | 'finalize'>('download');

  const isRequired = LATEST_UPDATE.required === true;

  useEffect(() => {
    if (open) {
      setView(forceView ?? 'intro');
      // Se o usuário já viu as patch notes, mostra o resumo genérico do build novo.
      setSelected(hasUnseenPatchNotes() ? LATEST_UPDATE : GENERIC_BUILD_UPDATE);
      setProgress(0);
      setStage('download');
    }
  }, [open, forceView]);

  // Simulação do processo de atualização (download → instalação → finalização)
  useEffect(() => {
    if (view !== 'progress') return;
    let cancelled = false;
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    (async () => {
      for (let p = 0; p <= 100 && !cancelled; p += 5) {
        setStage('download');
        setProgress(p);
        await delay(75);
      }
      for (let p = 0; p <= 100 && !cancelled; p += 10) {
        setStage('install');
        setProgress(p);
        await delay(55);
      }
      if (!cancelled) {
        setStage('finalize');
        setProgress(100);
        await delay(800);
      }
      if (!cancelled) {
        markUpdateApplied();
        setView('done');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view]);

  if (!open) return null;

  const currentVersion = appliedVersion();
  // Atualização apenas de build (sem patch notes novas) — o usuário já está na versão mais recente.
  const buildOnly = !hasUnseenPatchNotes();

  const closeBtn = !isRequired && (
    <button
      onClick={onClose}
      className="rounded-lg p-1.5 text-slate-400 hover:bg-surface-700 hover:text-slate-200"
      aria-label="Fechar"
    >
      <X size={18} />
    </button>
  );

  const versionBadge = (
    <div className="inline-flex items-center gap-2 rounded-lg bg-surface-800 border border-surface-600 px-3 py-1.5 font-mono text-sm">
      <span className="text-slate-400">{currentVersion}</span>
      <span className="text-accent">→</span>
      <span className="font-bold text-accent">
        {buildOnly ? `build ${BUILD_ID}` : LATEST_UPDATE.version}
      </span>
    </div>
  );

  const updateButton = (
    <button onClick={() => setView('confirm')} className="btn-primary flex-1 !py-2.5 text-sm">
      <Rocket size={16} /> Atualizar jogo
    </button>
  );

  const laterButton = !isRequired && (
    <button onClick={onClose} className="btn-ghost flex-1 !py-2.5 text-sm">
      Depois
    </button>
  );

  const historyButton = (
    <button
      onClick={() => setView('history')}
      className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition"
    >
      <History size={13} /> Histórico de atualizações
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
      onClick={() => {
        if (!isRequired) onClose();
      }}
    >
      <div
        className="card w-full max-w-lg max-h-[90vh] flex flex-col animate-fadeUp overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-surface-700/50">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent to-sky-500 flex items-center justify-center text-surface-950">
              <Rocket size={22} />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-slate-100 leading-tight">🚀 Nova atualização</h3>
              <p className="text-[11px] text-slate-500">FootballSim v{LATEST_UPDATE.version} · build {BUILD_ID}</p>
            </div>
          </div>
          {closeBtn}
        </div>

        {/* Body */}
        <div className="px-6 py-4 flex-1 overflow-y-auto min-h-0">
          {view === 'intro' && (
            <div className="space-y-4">
              <div className="flex justify-center">{versionBadge}</div>
              {isRequired && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400">
                  <ShieldAlert size={15} /> ESTA ATUALIZAÇÃO É OBRIGATÓRIA
                </div>
              )}
              {buildOnly && (
                <div className="flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-300">
                  🛠️ Novas melhorias e correções foram publicadas para o FootballSim.
                </div>
              )}
              <p className="text-sm text-slate-300 leading-relaxed">
                Uma nova atualização do <span className="font-semibold text-slate-100">Football Simulator</span> está disponível!
                Foram adicionados novos recursos, correções e melhorias no jogo.
              </p>
              <div className="space-y-2">
                <button onClick={() => setView('notes')} className="btn-secondary w-full !py-2.5 text-sm">
                  📋 Ver atualização
                </button>
                {updateButton}
                {laterButton}
              </div>
              <div className="flex justify-center">{historyButton}</div>
            </div>
          )}

          {view === 'notes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setView(selected === GENERIC_BUILD_UPDATE || selected.version === LATEST_UPDATE.version ? 'intro' : 'history')}
                  className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition"
                >
                  <ChevronLeft size={14} /> Voltar
                </button>
                <div className="font-mono text-xs text-slate-500">{selected === GENERIC_BUILD_UPDATE ? `build ${BUILD_ID}` : `v${selected.version}`} · {selected.date}</div>
              </div>
              <p className="font-display font-bold text-slate-100">{selected.title}</p>
              <PatchNotesBody version={selected} />
              {selected === GENERIC_BUILD_UPDATE || selected.version === LATEST_UPDATE.version ? (
                <div className="pt-2 space-y-2 border-t border-surface-700/50">
                  {updateButton}
                  {laterButton}
                </div>
              ) : null}
            </div>
          )}

          {view === 'history' && (
            <div className="space-y-3">
              <button
                onClick={() => setView('intro')}
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition"
              >
                <ChevronLeft size={14} /> Voltar
              </button>
              <p className="font-display font-bold text-slate-100">📜 Histórico de atualizações</p>
              <div className="space-y-2">
                {UPDATE_HISTORY.map((v) => (
                  <button
                    key={v.version}
                    onClick={() => {
                      setSelected(v);
                      setView('notes');
                    }}
                    className="w-full flex items-center justify-between rounded-lg border border-surface-700 bg-surface-800/40 px-3 py-2.5 hover:border-accent/40 hover:bg-surface-800 transition"
                  >
                    <span className="font-mono font-bold text-accent">v{v.version}</span>
                    <span className="text-sm text-slate-300 flex-1 text-left ml-3 truncate">{v.title}</span>
                    <span className="text-[11px] text-slate-500">{v.date}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {view === 'confirm' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-xs font-semibold text-gold">
                ⚠️ ATUALIZAR JOGO
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                Uma nova versão ({currentVersion} → {LATEST_UPDATE.version}) será instalada.
                O jogo poderá ser recarregado durante o processo. Seus dados de carreira não serão afetados.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setView('intro')} className="btn-ghost flex-1 !py-2.5 text-sm">Cancelar</button>
                <button onClick={() => setView('progress')} className="btn-primary flex-1 !py-2.5 text-sm">
                  <Rocket size={16} /> Atualizar agora
                </button>
              </div>
            </div>
          )}

          {view === 'progress' && (
            <div className="space-y-4 py-2">
              <p className="text-sm font-semibold text-slate-100 text-center">
                {stage === 'download' && 'Baixando atualização…'}
                {stage === 'install' && 'Instalando atualização…'}
                {stage === 'finalize' && 'Finalizando…'}
              </p>
              <div className="h-2.5 rounded-full bg-surface-700/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-sky-500 transition-all duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-center font-mono text-xs text-slate-400">{Math.round(progress)}%</p>
              <p className="text-center text-[11px] text-slate-500">Não feche o jogo durante a atualização.</p>
            </div>
          )}

          {view === 'done' && (
            <div className="space-y-4 py-2">
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-full bg-accent/15 border border-accent/40 flex items-center justify-center text-accent">
                  <CheckCircle2 size={30} />
                </div>
              </div>
              <p className="text-center font-display font-bold text-slate-100">Atualização concluída!</p>
              <p className="text-center text-sm text-slate-400">
                FootballSim <span className="font-mono font-bold text-accent">v{LATEST_UPDATE.version}</span> instalado com sucesso.
              </p>
              <button onClick={() => window.location.reload()} className="btn-primary w-full !py-2.5 text-sm">
                🔄 Recarregar jogo
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {view === 'progress' && (
          <div className="px-6 py-3 border-t border-surface-700/50">
            <p className="text-center text-[11px] text-slate-500">FootballSim {LATEST_UPDATE.version} · não interrompa</p>
          </div>
        )}
      </div>
    </div>
  );
}

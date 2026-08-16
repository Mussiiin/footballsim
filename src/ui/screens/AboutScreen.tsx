import { useGame } from '../../state/store';

export function AboutScreen() {
  const { navigate } = useGame();

  const features = [
    ['🌍', 'Mundo vivo', '5 países (Inglaterra, Alemanha, Espanha, Itália e Brasil), 16 ligas, 320 clubes e mais de 8.000 jogadores simulados com IA.'],
    ['⚽', 'Motor de partidas', 'Simulação determinística minuto a minuto com gols, cartões, lesões, xG e notas.'],
    ['🧠', 'IA dos clubes', 'Diretorias demitem e contratam, clubes negociam e o mundo evolui sem você.'],
    ['📅', 'Temporadas infinitas', 'Promoção, rebaixamento, copas, continental, aposentadorias e novas gerações.'],
    ['💼', 'Mercado real', 'Propostas, contrapropostas, empréstimos, cláusulas e contratos.'],
    ['🏆', 'História', 'Recordes, Hall da Fama, conquistas e notícias geradas dos eventos reais.'],
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6 animate-fadeUp">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-sky-500 mx-auto flex items-center justify-center font-display font-extrabold text-2xl text-surface-950 shadow-glow">
          FS
        </div>
        <h1 className="font-display font-extrabold text-3xl text-slate-50 mt-4">FootballSim</h1>
        <p className="text-slate-400 mt-2 max-w-md mx-auto">
          Um simulador de gerenciamento de futebol com arquitetura preparada para escalar
          (React + TypeScript + Tailwind + Supabase/PostgreSQL com RLS).
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {features.map(([icon, title, desc]) => (
          <div key={title} className="card p-4">
            <p className="text-2xl">{icon}</p>
            <p className="font-semibold text-slate-100 mt-2">{title}</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      <div className="card p-5 text-xs text-slate-500 space-y-2">
        <p><span className="text-slate-300 font-semibold">Como funciona o tempo:</span> avance dias, semanas ou até a próxima partida. O mundo simula outros jogos, treinos, transferências e eventos enquanto você gerencia seu clube.</p>
        <p><span className="text-slate-300 font-semibold">Sistema de salvamento:</span> autosave a cada ação + salvamento manual. Tudo protegido por RLS (cada treinador acessa só as próprias carreiras).</p>
        <p><span className="text-slate-300 font-semibold">Preparado para dados reais:</span> a geração fictícia pode ser substituída por APIs externas sem mudar a arquitetura.</p>
      </div>

      <div className="flex justify-center gap-3">
        <button onClick={() => navigate('home')} className="btn-primary">Voltar ao início</button>
      </div>
    </div>
  );
}

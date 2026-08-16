import React, { useEffect, useRef, useState } from 'react';
import { GameProvider, useGame } from './state/store';
import { UpdateModal } from './ui/UpdateModal';
import { ConversationGate } from './ui/PlayerConversationModal';
import {
  shouldShowUpdatePopup,
  dismissUpdatePopup,
  OPEN_UPDATE_EVENT,
} from './game/updateNotes';
import { HomeScreen } from './ui/screens/HomeScreen';
import { AuthScreen } from './ui/screens/AuthScreen';
import { NewCareerScreen } from './ui/screens/NewCareerScreen';
import { MyCareersScreen } from './ui/screens/MyCareersScreen';
import { DashboardScreen } from './ui/screens/DashboardScreen';
import { SquadScreen } from './ui/screens/SquadScreen';
import { PlayerScreen } from './ui/screens/PlayerScreen';
import { TacticsScreen } from './ui/screens/TacticsScreen';
import { CompetitionsScreen } from './ui/screens/CompetitionsScreen';
import { CalendarScreen } from './ui/screens/CalendarScreen';
import { MatchDayScreen } from './ui/screens/MatchDayScreen';
import { LiveMatchScreen } from './ui/screens/LiveMatchScreen';
import { TransfersScreen } from './ui/screens/TransfersScreen';
import { PromisesScreen } from './ui/screens/PromisesScreen';
import { PlayerTalkScreen } from './ui/screens/PlayerTalkScreen';
import { NegotiationScreen } from './ui/screens/NegotiationScreen';
import { RenewalScreen } from './ui/screens/RenewalScreen';
import { FinancesScreen } from './ui/screens/FinancesScreen';
import { StadiumScreen } from './ui/screens/StadiumScreen';
import { TrainingScreen } from './ui/screens/TrainingScreen';
import { NewsScreen } from './ui/screens/NewsScreen';
import { ClubScreen } from './ui/screens/ClubScreen';
import { StaffScreen } from './ui/screens/StaffScreen';
import { RecordsScreen } from './ui/screens/RecordsScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { AboutScreen } from './ui/screens/AboutScreen';
import { JobsScreen } from './ui/screens/JobsScreen';
import { SeasonEndScreen } from './ui/screens/SeasonEndScreen';
import { MessagesScreen } from './ui/screens/MessagesScreen';
import { Shell } from './ui/Shell';

function Router() {
  const { route, career, loading, user } = useGame();

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <div className="w-14 h-14 rounded-full border-4 border-accent/20 border-t-accent animate-spin" />
        <p className="text-slate-400 text-sm animate-pulse">Carregando FootballSim…</p>
      </div>
    );
  }

  if (!user) return <AuthScreen />;

  if (route === 'home' || (!career && route === 'dashboard')) return <HomeScreen />;
  if (route === 'auth') return <AuthScreen />;
  if (route === 'new-career') return <NewCareerScreen />;
  if (route === 'my-careers') return <MyCareersScreen />;
  if (route === 'settings') return <SettingsScreen />;
  if (route === 'about') return <AboutScreen />;
  if (route === 'about-only') return <AboutScreen />;

  // telas dentro do jogo
  if (!career) return <HomeScreen />;

  // desempregado: apenas telas que não exigem clube são permitidas
  const needsClub =
    route.startsWith('squad') || route.startsWith('tactics') || route.startsWith('competitions') ||
    route.startsWith('calendar') || route.startsWith('transfers') || route.startsWith('negotiation') ||
    route.startsWith('renewal') || route.startsWith('promises') || route.startsWith('matchday') ||
    route === 'finances' || route === 'stadium' || route === 'training' || route === 'club' ||
    route === 'staff' || route === 'season-end' || route === 'live' || route === 'messages' ||
    route.startsWith('talk:') || route.startsWith('player:') || route.startsWith('renewal:') || route.startsWith('club:');
  if (!career.clubId && needsClub) {
    return <Shell active="jobs"><DashboardScreen /></Shell>;
  }

  if (route.startsWith('player:')) {
    const id = route.slice(7);
    return <Shell active="squad"><PlayerScreen playerId={id} /></Shell>;
  }
  if (route.startsWith('talk:')) {
    const id = route.slice(5);
    return <Shell active="squad"><PlayerTalkScreen key={id} playerId={id} /></Shell>;
  }
  if (route.startsWith('club:')) {
    const id = route.slice(5);
    return <Shell active="club"><ClubScreen clubId={id} /></Shell>;
  }
  if (route.startsWith('negotiation:')) {
    const id = route.slice(12);
    return <Shell active="transfers"><NegotiationScreen key={id} playerId={id} /></Shell>;
  }
  if (route.startsWith('renewal:')) {
    const id = route.slice(8);
    return <Shell active="squad"><RenewalScreen key={id} playerId={id} /></Shell>;
  }
  if (route === 'live') return <LiveMatchScreen />;
  if (route === 'matchday') return <Shell active="calendar"><MatchDayScreen /></Shell>;
  if (route === 'season-end') return <SeasonEndScreen />;
  if (route === 'promises') return <Shell active="squad"><PromisesScreen key={career.id} /></Shell>;
  if (route.startsWith('transfers:')) {
    const tab = route.slice(10);
    return <Shell active="transfers"><TransfersScreen key={tab} initialTab={tab} /></Shell>;
  }

  const map: Record<string, React.ReactNode> = {
    dashboard: <DashboardScreen />,
    squad: <SquadScreen />,
    tactics: <TacticsScreen />,
    competitions: <CompetitionsScreen />,
    calendar: <CalendarScreen />,
    transfers: <TransfersScreen />,
    finances: <FinancesScreen />,
    stadium: <StadiumScreen />,
    training: <TrainingScreen />,
    news: <NewsScreen />,
    club: <ClubScreen clubId={career.clubId || undefined} />,
    staff: <StaffScreen />,
    records: <RecordsScreen />,
    jobs: <JobsScreen />,
    messages: <MessagesScreen />,
  };
  const screen = map[route] ?? <DashboardScreen />;
  return <Shell active={route}>{screen}</Shell>;
}

function UpdateGate() {
  const [open, setOpen] = useState(false);
  const [forceView, setForceView] = useState<'intro' | 'history' | undefined>(undefined);
  const checkedOnce = useRef(false);

  useEffect(() => {
    // Abre automaticamente uma vez por versão, logo após carregar o jogo.
    if (!checkedOnce.current) {
      checkedOnce.current = true;
      if (shouldShowUpdatePopup()) setOpen(true);
    }
    // Menu/configurações podem abrir o popup a qualquer momento.
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { view?: 'intro' | 'history' } | undefined;
      setForceView(detail?.view);
      setOpen(true);
    };
    window.addEventListener(OPEN_UPDATE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_UPDATE_EVENT, onOpen);
  }, []);

  return (
    <UpdateModal
      open={open}
      forceView={forceView}
      onClose={() => {
        dismissUpdatePopup();
        setOpen(false);
      }}
    />
  );
}

export default function App() {
  return (
    <GameProvider>
      <Router />
      <UpdateGate />
      <ConversationGate />
    </GameProvider>
  );
}

import { useEffect } from 'react';
import { useGame } from '../../state/store';
import { openPlayerConversation } from '../../game/messages';

/**
 * Rota de deep link (notificações → talk:playerId).
 * Abre o mesmo PlayerConversationModal reutilizável em cima da tela atual.
 */
export function PlayerTalkScreen({ playerId }: { playerId: string }) {
  const { goBack, career } = useGame();

  useEffect(() => {
    // Abre o modal reutilizável por cima da tela anterior e sai da rota talk: vazia.
    if (career?.world.players[playerId]) {
      openPlayerConversation(playerId);
      goBack();
    } else {
      goBack();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, career?.world]);

  return null;
}

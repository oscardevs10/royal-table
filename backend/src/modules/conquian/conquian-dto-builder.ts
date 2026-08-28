import { Room } from '../rooms/room.types';
import { ConquianEngine } from './conquian-engine';
import { ConquianStateDTO, ConquianPlayerPublicDTO } from '../../types/conquian-dto.types';

export function buildConquianStateDTO(room: Room, recipientPlayerId: string): ConquianStateDTO | null {
  if (!room.engine || room.config.gameMode !== 'CONQUIAN') return null;
  const engine = room.engine as ConquianEngine;
  const state = engine.getState();
  const me = state.players.find((p) => p.id === recipientPlayerId);
  if (!me) return null;

  const players: ConquianPlayerPublicDTO[] = state.players.map((p) => ({
    id: p.id,
    name: p.name,
    seatIndex: p.seatIndex,
    chips: p.chips,
    status: p.status,
    connected: p.connected,
    isBot: p.isBot,
    isHost: p.isHost,
    handCount: p.hand.length,
    isCurrentTurn: p.seatIndex === state.currentPlayerPosition && state.handInProgress,
  }));

  const isMyTurn = state.handInProgress && state.players[state.currentPlayerPosition]?.id === me.id;

  return {
    roomId: state.roomId,
    roomCode: state.roomCode,
    handNumber: state.handNumber,
    players,
    dealerPosition: state.dealerPosition,
    currentPlayerPosition: state.currentPlayerPosition,
    stockCount: state.stock.length,
    discardTopCard: state.discardPile.length > 0 ? state.discardPile[state.discardPile.length - 1] : null,
    discardCount: state.discardPile.length,
    melds: state.melds,
    ante: state.ante,
    pot: state.pot,
    turnPhase: state.turnPhase,
    handInProgress: state.handInProgress,
    myPlayerId: me.id,
    myHand: me.hand,
    myAvailableActions: {
      canDrawStock: isMyTurn && state.turnPhase === 'DRAW' && state.stock.length > 0,
      canDrawDiscard: isMyTurn && state.turnPhase === 'DRAW' && state.discardPile.length > 0,
      canDiscard: isMyTurn && state.turnPhase === 'ACT',
    },
  };
}

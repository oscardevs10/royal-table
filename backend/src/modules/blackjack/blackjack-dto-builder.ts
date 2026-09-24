import { Room } from '../rooms/room.types';
import { BlackjackEngine } from './blackjack-engine';
import { handValue, isNaturalBlackjack } from './hand-value';
import { BlackjackStateDTO, BlackjackHandDTO, BlackjackDealerDTO } from '../../types/blackjack-dto.types';

export function buildBlackjackStateDTO(room: Room, recipientPlayerId: string): BlackjackStateDTO | null {
  if (!room.engine || room.config.gameMode !== 'BLACKJACK') return null;
  const engine = room.engine as BlackjackEngine;
  const state = engine.getState();
  const me = state.players.find((p) => p.id === recipientPlayerId);
  if (!me) return null;

  const activeHand = engine.getActiveHand();

  const hands: BlackjackHandDTO[] = state.hands.map((h) => {
    const value = handValue(h.cards);
    return {
      id: h.id,
      playerId: h.playerId,
      playerName: h.playerName,
      seatIndex: h.seatIndex,
      cards: h.cards,
      total: value.total,
      soft: value.soft,
      bet: h.bet,
      doubled: h.doubled,
      fromSplit: h.fromSplit,
      status: h.status,
      outcome: h.outcome,
      payout: h.payout,
      isActive: activeHand?.id === h.id,
    };
  });

  const visibleDealerCards = state.dealerHoleRevealed ? state.dealerCards : state.dealerCards.slice(0, 1);
  const dealerValue = visibleDealerCards.length > 0 ? handValue(visibleDealerCards) : null;
  const dealer: BlackjackDealerDTO = {
    cards: visibleDealerCards,
    hiddenCardCount: state.dealerCards.length - visibleDealerCards.length,
    total: dealerValue?.total ?? null,
    soft: dealerValue?.soft ?? false,
    isBlackjack: state.dealerHoleRevealed && isNaturalBlackjack(state.dealerCards),
  };

  const someoneBet = state.players.some((p) => p.status === 'ACTIVE' && p.pendingBet > 0);

  return {
    roomId: state.roomId,
    roomCode: state.roomCode,
    roundNumber: state.roundNumber,
    phase: state.phase,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      seatIndex: p.seatIndex,
      chips: p.chips,
      status: p.status,
      connected: p.connected,
      isHost: p.isHost,
      pendingBet: p.pendingBet,
    })),
    hands,
    activeHandId: activeHand?.id ?? null,
    dealer,
    minBet: state.minBet,
    maxBet: state.maxBet,
    shoe: engine.getShoeInfo(),
    lastRoundResult: engine.getDisplayedRoundResult(),
    myPlayerId: me.id,
    myAvailableActions: engine.getAvailableActions(me.id),
    canPlaceBet: state.phase === 'BETTING' && me.status === 'ACTIVE' && me.chips >= state.minBet,
    canForceDeal: state.phase === 'BETTING' && me.isHost && someoneBet,
  };
}

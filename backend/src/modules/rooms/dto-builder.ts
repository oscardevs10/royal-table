import { Room } from './room.types';
import { GameStateDTO, PlayerPublicDTO, RoomStateDTO, RoomPlayerDTO } from '../../types/dto.types';
import { GameState, PlayerState } from '../../types/game.types';
import { GameEngine } from '../poker/game-engine';
import { getAvailableActions, callAmount } from '../poker/betting-round';
import { calculateHandOdds, describeCurrentHand, oddsToSortedList, CurrentHandInfo, HandOddsEntry } from '../poker/hand-odds';

export function buildRoomStateDTO(room: Room): RoomStateDTO {
  const players: RoomPlayerDTO[] = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    seatIndex: p.seatIndex,
    isHost: p.isHost,
    isReady: p.ready,
    connected: p.connected,
    isBot: p.isBot,
  }));

  return {
    roomId: room.id,
    code: room.code,
    gameMode: room.config.gameMode,
    maxPlayers: room.config.maxPlayers,
    startingStack: room.config.startingStack,
    smallBlind: room.config.gameMode === 'HOLDEM' ? room.config.smallBlind : undefined,
    bigBlind: room.config.gameMode === 'HOLDEM' ? room.config.bigBlind : undefined,
    minBet: room.config.gameMode === 'BLACKJACK' ? room.config.minBet : undefined,
    maxBet: room.config.gameMode === 'BLACKJACK' ? room.config.maxBet : undefined,
    deckCount: room.config.gameMode === 'BLACKJACK' ? room.config.deckCount : undefined,
    status: room.status,
    players,
  };
}

interface HandInsights {
  currentHand: CurrentHandInfo;
  odds: HandOddsEntry[];
  isExact: boolean;
}

interface CacheEntry extends HandInsights {
  versionKey: string;
}

/**
 * Hand-strength odds only change when hole cards or community cards change,
 * not on every betting action - so we cache per (room, player) keyed by
 * hand number + street, avoiding recomputing the same Monte Carlo/enumeration
 * pass on every check/call broadcast within a street. Keyed by the Room
 * object itself so entries are garbage-collected automatically once a room
 * is discarded - no separate cleanup needed.
 */
const insightsCache = new WeakMap<Room, Map<string, CacheEntry>>();

function getHandInsights(room: Room, state: GameState, me: PlayerState): HandInsights {
  let roomCache = insightsCache.get(room);
  if (!roomCache) {
    roomCache = new Map();
    insightsCache.set(room, roomCache);
  }

  const versionKey = `${state.handNumber}:${state.communityCards.length}`;
  const cached = roomCache.get(me.id);
  if (cached && cached.versionKey === versionKey) {
    return cached;
  }

  const currentHand = describeCurrentHand(me.holeCards, state.communityCards);
  const odds = calculateHandOdds(me.holeCards, state.communityCards);
  const entry: CacheEntry = { versionKey, currentHand, odds: oddsToSortedList(odds), isExact: odds.isExact };
  roomCache.set(me.id, entry);
  return entry;
}

/**
 * Builds a GameStateDTO tailored to a single recipient: their own hole cards
 * are included, everyone else's are hidden unless they were revealed at
 * showdown (tracked separately, not embedded in the live GameState).
 */
export function buildGameStateDTO(room: Room, recipientPlayerId: string): GameStateDTO | null {
  if (!room.engine || room.config.gameMode !== 'HOLDEM') return null;
  const engine = room.engine as GameEngine;
  const state = engine.getState();
  const me = state.players.find((p) => p.id === recipientPlayerId);
  if (!me) return null;

  // During an all-in runout (nobody left to act) and at showdown, hands are shown face-up
  // on the table itself - not just in the showdown popup - so everyone can watch the reveal.
  const revealOnTable = engine.isAllInRunout() || state.currentPhase === 'SHOWDOWN';

  const players: PlayerPublicDTO[] = state.players.map((p: PlayerState) => ({
    id: p.id,
    name: p.name,
    seatIndex: p.seatIndex,
    chips: p.chips,
    status: p.status,
    currentBet: p.currentBet,
    totalBetInHand: p.totalBetInHand,
    isHost: p.isHost,
    connected: p.connected,
    isBot: p.isBot,
    hasCards: p.holeCards.length > 0 && p.status !== 'OUT',
    isCurrentTurn: p.seatIndex === state.currentPlayerPosition && state.handInProgress,
    revealedHoleCards: revealOnTable && p.holeCards.length > 0 && p.status !== 'FOLDED' ? p.holeCards : undefined,
  }));

  const pot = state.players.reduce((sum, p) => sum + p.totalBetInHand, 0);
  const availableActions = state.handInProgress ? getAvailableActions(state, me) : [];

  const showHandInsights = state.handInProgress && me.holeCards.length === 2 && me.status !== 'OUT';
  const insights = showHandInsights ? getHandInsights(room, state, me) : null;

  return {
    roomId: state.roomId,
    roomCode: state.roomCode,
    handNumber: state.handNumber,
    players,
    dealerPosition: state.dealerPosition,
    currentPlayerPosition: state.currentPlayerPosition,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    pot,
    sidePots: state.sidePots,
    communityCards: state.communityCards,
    currentPhase: state.currentPhase,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    handInProgress: state.handInProgress,
    myPlayerId: me.id,
    myHoleCards: me.holeCards,
    myAvailableActions: availableActions,
    myCallAmount: callAmount(state, me),
    myCurrentHand: insights?.currentHand ?? null,
    myHandOdds: insights?.odds ?? null,
    myHandOddsExact: insights?.isExact ?? true,
  };
}

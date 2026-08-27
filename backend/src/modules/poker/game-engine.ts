import { Deck } from './deck';
import { evaluateBestHand, compareHands, HandResult } from './hand-evaluator';
import { buildSidePots } from './pot-manager';
import { GameState, PlayerState, ActionType, ShowdownResult, WinnerInfo, SidePot } from '../../types/game.types';
import { getAvailableActions, isBettingRoundComplete, isHandOver, isInHand, canAct } from './betting-round';

export interface SeatInput {
  id: string;
  name: string;
  chips: number;
  seatIndex: number;
  sessionToken: string;
  isHost: boolean;
  isBot: boolean;
}

export interface ActionResult {
  success: boolean;
  error?: string;
}

export class GameEngine {
  private state: GameState;
  private lastEliminated: PlayerState[] = [];
  private deck: Deck | null = null;

  constructor(roomId: string, roomCode: string, seats: SeatInput[], smallBlind: number, bigBlind: number) {
    this.state = {
      roomId,
      roomCode,
      handNumber: 0,
      players: seats
        .sort((a, b) => a.seatIndex - b.seatIndex)
        .map((s) => ({
          id: s.id,
          sessionToken: s.sessionToken,
          name: s.name,
          seatIndex: s.seatIndex,
          chips: s.chips,
          holeCards: [],
          status: 'ACTIVE',
          currentBet: 0,
          totalBetInHand: 0,
          hasActedThisRound: false,
          isHost: s.isHost,
          connected: true,
          isBot: s.isBot,
        })),
      dealerPosition: -1,
      currentPlayerPosition: -1,
      smallBlind,
      bigBlind,
      pot: 0,
      sidePots: [],
      communityCards: [],
      currentPhase: 'WAITING',
      currentBet: 0,
      minRaise: bigBlind,
      deck: [],
      lastAggressorPosition: null,
      handInProgress: false,
    };
  }

  getState(): GameState {
    return this.state;
  }

  getPlayer(playerId: string): PlayerState | undefined {
    return this.state.players.find((p) => p.id === playerId);
  }

  getPlayerBySession(sessionToken: string): PlayerState | undefined {
    return this.state.players.find((p) => p.sessionToken === sessionToken);
  }

  consumeEliminated(): PlayerState[] {
    const eliminated = this.lastEliminated;
    this.lastEliminated = [];
    return eliminated;
  }

  activePlayerCount(): number {
    return this.state.players.filter((p) => p.status !== 'OUT').length;
  }

  isGameOver(): boolean {
    return this.activePlayerCount() <= 1;
  }

  addPlayer(seat: SeatInput): void {
    this.state.players.push({
      id: seat.id,
      sessionToken: seat.sessionToken,
      name: seat.name,
      seatIndex: seat.seatIndex,
      chips: seat.chips,
      holeCards: [],
      status: this.state.handInProgress ? 'SITTING_OUT' : 'ACTIVE',
      currentBet: 0,
      totalBetInHand: 0,
      hasActedThisRound: false,
      isHost: seat.isHost,
      connected: true,
      isBot: seat.isBot,
    });
  }

  markDisconnected(playerId: string): void {
    const player = this.getPlayer(playerId);
    if (player) player.connected = false;
  }

  markReconnected(playerId: string): void {
    const player = this.getPlayer(playerId);
    if (player) player.connected = true;
  }

  private nextOccupiedSeat(fromPosition: number, predicate: (p: PlayerState) => boolean): number {
    const seatCount = this.state.players.length;
    for (let step = 1; step <= seatCount; step++) {
      const position = (fromPosition + step) % seatCount;
      const player = this.state.players.find((p) => p.seatIndex === position);
      if (player && predicate(player)) return position;
    }
    return fromPosition;
  }

  startNewHand(): void {
    this.state.handNumber += 1;
    this.state.communityCards = [];
    this.state.pot = 0;
    this.state.sidePots = [];
    this.state.currentBet = 0;
    this.state.minRaise = this.state.bigBlind;
    this.state.lastAggressorPosition = null;
    this.state.handInProgress = true;

    for (const player of this.state.players) {
      player.holeCards = [];
      player.currentBet = 0;
      player.totalBetInHand = 0;
      player.hasActedThisRound = false;
      if (player.status !== 'OUT') {
        player.status = 'ACTIVE';
      }
    }

    const deck = new Deck();
    deck.shuffle();
    this.state.deck = [];

    const eligible = () => this.state.players.filter((p) => p.status === 'ACTIVE');

    this.state.dealerPosition =
      this.state.dealerPosition === -1
        ? this.state.players.find((p) => p.status === 'ACTIVE')!.seatIndex
        : this.nextOccupiedSeat(this.state.dealerPosition, (p) => p.status === 'ACTIVE');

    // Heads-up: the dealer posts the small blind and acts first pre-flop (standard rule).
    const isHeadsUp = eligible().length === 2;
    const sbPosition = isHeadsUp
      ? this.state.dealerPosition
      : this.nextOccupiedSeat(this.state.dealerPosition, (p) => p.status === 'ACTIVE');
    const bbPosition = this.nextOccupiedSeat(sbPosition, (p) => p.status === 'ACTIVE');

    this.postBlind(sbPosition, this.state.smallBlind);
    this.postBlind(bbPosition, this.state.bigBlind);
    this.state.currentBet = this.state.bigBlind;

    // Deal two hole cards to each active player, one at a time around the table.
    for (let round = 0; round < 2; round++) {
      for (const player of eligible().sort((a, b) => a.seatIndex - b.seatIndex)) {
        player.holeCards.push(deck.draw());
      }
    }
    this.state.deck = [];
    this.deck = deck;

    this.state.currentPhase = 'PRE_FLOP';

    const firstToAct =
      eligible().length === 2 ? this.state.dealerPosition : this.nextOccupiedSeat(bbPosition, (p) => p.status === 'ACTIVE');
    this.state.currentPlayerPosition = firstToAct;
  }

  private postBlind(position: number, amount: number): void {
    const player = this.state.players.find((p) => p.seatIndex === position);
    if (!player) return;
    const posted = Math.min(amount, player.chips);
    player.chips -= posted;
    player.currentBet = posted;
    player.totalBetInHand = posted;
    if (player.chips === 0) player.status = 'ALL_IN';
  }

  getAvailableActionsFor(playerId: string) {
    const player = this.getPlayer(playerId);
    if (!player) return [];
    return getAvailableActions(this.state, player);
  }

  applyAction(playerId: string, type: ActionType, amount?: number): ActionResult {
    const player = this.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (this.state.players[this.state.currentPlayerPosition]?.id !== playerId) {
      return { success: false, error: 'Not your turn' };
    }

    const available = getAvailableActions(this.state, player);
    const chosen = available.find((a) => a.type === type);
    if (!chosen) {
      return { success: false, error: `Action ${type} is not available` };
    }

    switch (type) {
      case 'FOLD':
        player.status = 'FOLDED';
        break;

      case 'CHECK':
        break;

      case 'CALL': {
        const toCall = chosen.maxAmount ?? 0;
        player.chips -= toCall;
        player.currentBet += toCall;
        player.totalBetInHand += toCall;
        if (player.chips === 0) player.status = 'ALL_IN';
        break;
      }

      case 'RAISE': {
        const raiseTo = amount ?? 0;
        if (raiseTo < (chosen.minAmount ?? 0) || raiseTo > (chosen.maxAmount ?? 0)) {
          return { success: false, error: `Invalid raise amount. Must be between ${chosen.minAmount} and ${chosen.maxAmount}` };
        }
        const additional = raiseTo - player.currentBet;
        const raiseSize = raiseTo - this.state.currentBet;
        player.chips -= additional;
        player.currentBet = raiseTo;
        player.totalBetInHand += additional;
        this.state.minRaise = Math.max(this.state.minRaise, raiseSize);
        this.state.currentBet = raiseTo;
        this.state.lastAggressorPosition = player.seatIndex;
        if (player.chips === 0) player.status = 'ALL_IN';
        this.resetActedFlagsExcept(player.id);
        break;
      }

      case 'ALL_IN': {
        const allInTo = player.currentBet + player.chips;
        const additional = player.chips;
        const isRaise = allInTo > this.state.currentBet;
        player.currentBet = allInTo;
        player.totalBetInHand += additional;
        player.chips = 0;
        player.status = 'ALL_IN';
        if (isRaise) {
          const raiseSize = allInTo - this.state.currentBet;
          if (raiseSize >= this.state.minRaise) {
            this.state.minRaise = raiseSize;
          }
          this.state.currentBet = allInTo;
          this.state.lastAggressorPosition = player.seatIndex;
          this.resetActedFlagsExcept(player.id);
        }
        break;
      }
    }

    player.hasActedThisRound = true;
    this.progressGame();
    return { success: true };
  }

  private resetActedFlagsExcept(playerId: string): void {
    for (const p of this.state.players) {
      if (p.id !== playerId && canAct(p)) {
        p.hasActedThisRound = false;
      }
    }
  }

  private progressGame(): void {
    if (isHandOver(this.state)) {
      this.finishHandByFold();
      return;
    }

    if (!isBettingRoundComplete(this.state)) {
      const next = this.findNextActionable(this.state.currentPlayerPosition);
      if (next !== null) {
        this.state.currentPlayerPosition = next;
        return;
      }
    }

    this.moveToNextPhase();
  }

  private findNextActionable(fromPosition: number): number | null {
    const seatCount = this.state.players.length;
    for (let step = 1; step <= seatCount; step++) {
      const position = (fromPosition + step) % seatCount;
      const player = this.state.players.find((p) => p.seatIndex === position);
      if (player && canAct(player)) return position;
    }
    return null;
  }

  private moveToNextPhase(): void {
    for (const player of this.state.players) {
      player.currentBet = 0;
      player.hasActedThisRound = false;
    }
    this.state.currentBet = 0;
    this.state.minRaise = this.state.bigBlind;
    this.state.lastAggressorPosition = null;

    const deck = this.deck!;

    switch (this.state.currentPhase) {
      case 'PRE_FLOP':
        deck.burn();
        this.state.communityCards.push(deck.draw(), deck.draw(), deck.draw());
        this.state.currentPhase = 'FLOP';
        break;
      case 'FLOP':
        deck.burn();
        this.state.communityCards.push(deck.draw());
        this.state.currentPhase = 'TURN';
        break;
      case 'TURN':
        deck.burn();
        this.state.communityCards.push(deck.draw());
        this.state.currentPhase = 'RIVER';
        break;
      case 'RIVER':
        this.runShowdown();
        return;
    }

    const actionablePlayers = this.state.players.filter(canAct);
    if (actionablePlayers.length <= 1) {
      // Everyone remaining is all-in: auto-run out the rest of the board.
      this.moveToNextPhase();
      return;
    }

    this.state.currentPlayerPosition = this.nextOccupiedSeat(this.state.dealerPosition, (p) => canAct(p));
  }

  private finishHandByFold(): void {
    const winner = this.state.players.find(isInHand)!;
    const amountWon = this.state.players.reduce((sum, p) => sum + p.totalBetInHand, 0);
    winner.chips += amountWon;
    for (const p of this.state.players) {
      p.totalBetInHand = 0;
      p.currentBet = 0;
    }
    this.state.pot = 0;
    this.state.sidePots = [];
    this.state.currentPhase = 'SHOWDOWN';
    this.state.handInProgress = false;

    this.lastShowdownResult = {
      winners: [
        {
          playerId: winner.id,
          playerName: winner.name,
          amountWon,
          handRank: 'WIN_BY_FOLD',
          handDescription: 'Won uncontested',
          bestCards: [],
        },
      ],
      revealedHands: [],
    };

    this.applyEliminations();
  }

  private lastShowdownResult: ShowdownResult | null = null;

  consumeShowdownResult(): ShowdownResult | null {
    const result = this.lastShowdownResult;
    this.lastShowdownResult = null;
    return result;
  }

  private runShowdown(): void {
    this.state.currentPhase = 'SHOWDOWN';
    this.state.handInProgress = false;

    const contesting = this.state.players.filter(isInHand);
    const handResults = new Map<string, HandResult>();
    for (const player of contesting) {
      handResults.set(player.id, evaluateBestHand([...player.holeCards, ...this.state.communityCards]));
    }

    const sidePots: SidePot[] = buildSidePots(
      this.state.players.map((p) => ({ playerId: p.id, totalBetInHand: p.totalBetInHand, isFolded: p.status === 'FOLDED' }))
    );

    const winnings = new Map<string, number>();

    for (const pot of sidePots) {
      const eligible = pot.eligiblePlayerIds.filter((id) => handResults.has(id));
      if (eligible.length === 0) continue;

      let bestPlayerIds = [eligible[0]];
      for (const id of eligible.slice(1)) {
        const cmp = compareHands(handResults.get(id)!, handResults.get(bestPlayerIds[0])!);
        if (cmp > 0) {
          bestPlayerIds = [id];
        } else if (cmp === 0) {
          bestPlayerIds.push(id);
        }
      }

      const share = Math.floor(pot.amount / bestPlayerIds.length);
      let remainder = pot.amount - share * bestPlayerIds.length;

      const orderedBySeat = [...bestPlayerIds].sort((a, b) => {
        const pa = this.state.players.find((p) => p.id === a)!.seatIndex;
        const pb = this.state.players.find((p) => p.id === b)!.seatIndex;
        const relA = (pa - this.state.dealerPosition - 1 + this.state.players.length) % this.state.players.length;
        const relB = (pb - this.state.dealerPosition - 1 + this.state.players.length) % this.state.players.length;
        return relA - relB;
      });

      for (const id of orderedBySeat) {
        let amount = share;
        if (remainder > 0) {
          amount += 1;
          remainder -= 1;
        }
        winnings.set(id, (winnings.get(id) ?? 0) + amount);
      }
    }

    for (const [playerId, amount] of winnings.entries()) {
      const player = this.state.players.find((p) => p.id === playerId)!;
      player.chips += amount;
    }

    for (const p of this.state.players) {
      p.totalBetInHand = 0;
      p.currentBet = 0;
    }
    this.state.pot = 0;
    this.state.sidePots = [];

    const winners: WinnerInfo[] = Array.from(winnings.entries()).map(([playerId, amountWon]) => {
      const player = this.state.players.find((p) => p.id === playerId)!;
      const result = handResults.get(playerId)!;
      return {
        playerId,
        playerName: player.name,
        amountWon,
        handRank: result.category,
        handDescription: result.description,
        bestCards: result.bestFiveCards,
      };
    });

    this.lastShowdownResult = {
      winners,
      revealedHands: contesting.map((p) => {
        const result = handResults.get(p.id)!;
        return { playerId: p.id, holeCards: p.holeCards, handRank: result.category, handDescription: result.description };
      }),
    };

    this.applyEliminations();
  }

  private applyEliminations(): void {
    for (const player of this.state.players) {
      if (player.status !== 'OUT' && player.chips <= 0) {
        player.status = 'OUT';
        this.lastEliminated.push(player);
      }
    }
  }
}

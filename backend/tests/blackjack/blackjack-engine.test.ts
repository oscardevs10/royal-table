import { BlackjackEngine, BlackjackSeatInput } from '../../src/modules/blackjack/blackjack-engine';
import { BlackjackAction } from '../../src/modules/blackjack/blackjack.types';
import { buildBlackjackStateDTO } from '../../src/modules/blackjack/blackjack-dto-builder';
import { Shoe } from '../../src/modules/blackjack/shoe';
import { Room } from '../../src/modules/rooms/room.types';
import { Card, Rank, Suit } from '../../src/types/card.types';

const c = (rank: Rank, suit: Suit = 'spades'): Card => ({ rank, suit });

function makeSeats(count: number, chips = 1000): BlackjackSeatInput[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    chips,
    seatIndex: i,
    sessionToken: `tok${i}`,
    isHost: i === 0,
    isBot: false,
  }));
}

/**
 * Builds an engine whose next cards are exactly `stacked`, in deal order:
 * one card to each hand, dealer up card, second card to each hand, dealer hole card, then hits.
 */
function setup(players: number, stacked: Card[], opts: { chips?: number; minBet?: number; maxBet?: number; deckCount?: number } = {}) {
  const shoe = new Shoe(opts.deckCount ?? 6);
  shoe.stack(stacked);
  const engine = new BlackjackEngine('room1', 'ABCDE', makeSeats(players, opts.chips ?? 1000), {
    minBet: opts.minBet ?? 10,
    maxBet: opts.maxBet ?? 500,
    deckCount: shoe.deckCount,
    shoe,
  });
  engine.startBetting();
  return { engine, shoe };
}

const chipsOf = (engine: BlackjackEngine, id: string) => engine.getPlayer(id)!.chips;

describe('BlackjackEngine - solo against the dealer', () => {
  it('pays 1:1 when the player beats the dealer', () => {
    // Player 10+9 = 19, dealer 10+7 = 17.
    const { engine } = setup(1, [c('10'), c('10', 'hearts'), c('9'), c('7')]);
    expect(engine.placeBet('p0', 100).success).toBe(true);

    expect(engine.getState().phase).toBe('PLAYER_TURNS');
    expect(chipsOf(engine, 'p0')).toBe(900);

    expect(engine.act('p0', 'STAND').success).toBe(true);
    expect(engine.getState().phase).toBe('DEALER_TURN');
    engine.runDealerToCompletion();

    const state = engine.getState();
    expect(state.phase).toBe('ROUND_OVER');
    expect(state.hands[0].outcome).toBe('WIN');
    expect(chipsOf(engine, 'p0')).toBe(1100);
    expect(engine.consumeRoundResult()?.players[0].net).toBe(100);
  });

  it('pays a natural blackjack 3:2 and the dealer does not draw against it', () => {
    const { engine } = setup(1, [c('A'), c('9'), c('K'), c('6'), c('10', 'hearts')]);
    engine.placeBet('p0', 100);

    expect(engine.getState().hands[0].status).toBe('BLACKJACK');
    expect(engine.getState().phase).toBe('DEALER_TURN');
    engine.runDealerToCompletion();

    expect(engine.getState().dealerCards).toHaveLength(2);
    expect(engine.getState().hands[0].outcome).toBe('BLACKJACK');
    expect(chipsOf(engine, 'p0')).toBe(1150);
  });

  it('dealer peeks with an ace up: a dealer blackjack ends the round immediately, losing only the original bet', () => {
    const { engine } = setup(1, [c('10'), c('A'), c('9'), c('K')]);
    engine.placeBet('p0', 100);

    const state = engine.getState();
    expect(state.phase).toBe('ROUND_OVER');
    expect(state.dealerHoleRevealed).toBe(true);
    expect(state.hands[0].outcome).toBe('LOSE');
    expect(chipsOf(engine, 'p0')).toBe(900);
    expect(engine.act('p0', 'DOUBLE').success).toBe(false);
  });

  it('a player blackjack pushes against a dealer blackjack', () => {
    const { engine } = setup(1, [c('A'), c('K'), c('Q'), c('A', 'hearts')]);
    engine.placeBet('p0', 100);

    expect(engine.getState().hands[0].outcome).toBe('PUSH');
    expect(chipsOf(engine, 'p0')).toBe(1000);
  });

  it('busting loses immediately and the dealer does not draw when every hand is dead', () => {
    const { engine } = setup(1, [c('10'), c('6'), c('6', 'hearts'), c('10', 'hearts'), c('K')]);
    engine.placeBet('p0', 100);

    engine.act('p0', 'HIT');
    expect(engine.getState().hands[0].status).toBe('BUST');
    engine.runDealerToCompletion();

    expect(engine.getState().dealerCards).toHaveLength(2);
    expect(engine.getState().hands[0].outcome).toBe('LOSE');
    expect(chipsOf(engine, 'p0')).toBe(900);
  });

  it('dealer hits 16 and stands once reaching 17', () => {
    // Player 10+9 = 19; dealer 10+6 = 16, hits an A -> hard 17 and stands.
    const { engine } = setup(1, [c('10'), c('10', 'hearts'), c('9'), c('6'), c('A'), c('5')]);
    engine.placeBet('p0', 50);
    engine.act('p0', 'STAND');
    engine.runDealerToCompletion();

    expect(engine.getState().dealerCards.map((x) => x.rank)).toEqual(['10', '6', 'A']);
    expect(engine.consumeRoundResult()?.dealerTotal).toBe(17);
    expect(chipsOf(engine, 'p0')).toBe(1050);
  });

  it('dealer stands on soft 17 (S17)', () => {
    // Player 10+9 = 19; dealer A+6 = soft 17 (peeked, no blackjack) stands without drawing.
    const { engine } = setup(1, [c('10'), c('A'), c('9'), c('6'), c('5')]);
    engine.placeBet('p0', 50);
    engine.act('p0', 'STAND');
    engine.runDealerToCompletion();

    expect(engine.getState().dealerCards).toHaveLength(2);
    expect(chipsOf(engine, 'p0')).toBe(1050);
  });

  it('doubling doubles the stake, draws exactly one card and ends the hand', () => {
    const { engine } = setup(1, [c('6'), c('10'), c('5'), c('7'), c('10', 'hearts')]);
    engine.placeBet('p0', 100);

    expect(engine.getAvailableActions('p0')).toContain('DOUBLE');
    engine.act('p0', 'DOUBLE');

    const hand = engine.getState().hands[0];
    expect(hand.cards).toHaveLength(3);
    expect(hand.bet).toBe(200);
    expect(hand.status).toBe('STOOD');
    engine.runDealerToCompletion();
    expect(chipsOf(engine, 'p0')).toBe(1200);
  });

  it('splits a pair into two hands played in turn, with double after split', () => {
    // Player 8,8 vs dealer 6 (+10 hole = 16). Split: hand 1 gets 3 (11), hand 2 gets 10 (18).
    // Hand 1 doubles onto a K (21). Hand 2 stands. Dealer hits a 9 and busts.
    const { engine } = setup(1, [c('8'), c('6'), c('8', 'hearts'), c('10'), c('3'), c('10', 'hearts'), c('K'), c('9')]);
    engine.placeBet('p0', 100);

    expect(engine.getAvailableActions('p0')).toContain('SPLIT');
    engine.act('p0', 'SPLIT');
    expect(engine.getState().hands).toHaveLength(2);
    expect(chipsOf(engine, 'p0')).toBe(800);

    const [first, second] = engine.getState().hands;
    expect(engine.getActiveHand()?.id).toBe(first.id);
    expect(first.cards.map((x) => x.rank)).toEqual(['8', '3']);
    expect(second.cards.map((x) => x.rank)).toEqual(['8', '10']);

    engine.act('p0', 'DOUBLE');
    expect(engine.getActiveHand()?.id).toBe(second.id);
    engine.act('p0', 'STAND');

    engine.runDealerToCompletion();
    const result = engine.consumeRoundResult()!;
    expect(result.dealerBust).toBe(true);
    expect(engine.getState().hands.map((h) => h.outcome)).toEqual(['WIN', 'WIN']);
    // 1000 - 100 bet - 100 split - 100 double + 400 + 200
    expect(chipsOf(engine, 'p0')).toBe(1300);
  });

  it('split aces get one card each, and 21 on a split hand pays 1:1, not 3:2', () => {
    const { engine } = setup(1, [c('A'), c('9'), c('A', 'hearts'), c('8'), c('K'), c('5')]);
    engine.placeBet('p0', 100);
    engine.act('p0', 'SPLIT');

    const hands = engine.getState().hands;
    expect(hands.every((h) => h.status === 'STOOD' && h.cards.length === 2)).toBe(true);
    expect(engine.getState().phase).toBe('DEALER_TURN');

    engine.runDealerToCompletion();
    expect(hands.map((h) => h.outcome)).toEqual(['WIN', 'LOSE']);
    expect(hands[0].payout).toBe(200);
    expect(chipsOf(engine, 'p0')).toBe(1000);
  });

  it('can split up to four hands at most', () => {
    const { engine } = setup(1, [c('8'), c('10'), c('8', 'hearts'), c('7'), c('8', 'clubs'), c('8', 'diamonds'), c('8', 'hearts'), c('2'), c('8'), c('2', 'hearts')]);
    engine.placeBet('p0', 10);
    engine.act('p0', 'SPLIT'); // 2 hands: [8,8] [8,8]
    engine.act('p0', 'SPLIT'); // 3 hands: [8,8] [8,2] [8,8]
    engine.act('p0', 'SPLIT'); // 4 hands
    expect(engine.getState().hands).toHaveLength(4);
    expect(engine.getAvailableActions('p0')).not.toContain('SPLIT');
    expect(engine.act('p0', 'SPLIT').success).toBe(false);
  });

  it('rejects bets outside the table limits or above the player\'s chips', () => {
    const { engine } = setup(1, [], { chips: 300, minBet: 25, maxBet: 1000 });
    expect(engine.placeBet('p0', 10).success).toBe(false);
    expect(engine.placeBet('p0', 400).success).toBe(false);
    expect(engine.placeBet('p0', 12.5).success).toBe(false);
    expect(engine.getState().phase).toBe('BETTING');
    expect(engine.placeBet('p0', 300).success).toBe(true);
    expect(engine.placeBet('p0', 100).success).toBe(false); // betting closed once dealt
  });

  it('eliminates a player who can no longer cover the minimum bet, ending a solo game', () => {
    const { engine } = setup(1, [c('10'), c('10', 'hearts'), c('6'), c('9')], { chips: 100, minBet: 50 });
    engine.placeBet('p0', 60);
    engine.act('p0', 'STAND');
    engine.runDealerToCompletion();

    expect(chipsOf(engine, 'p0')).toBe(40);
    expect(engine.getPlayer('p0')!.status).toBe('OUT');
    expect(engine.consumeEliminated().map((p) => p.id)).toEqual(['p0']);
    expect(engine.isGameOver()).toBe(true);
  });
});

describe('BlackjackEngine - multiplayer table', () => {
  it('waits for every connected player to bet, then plays hands in seat order', () => {
    // Deal: p0, p1, dealer up, p0, p1, dealer hole.
    const { engine } = setup(2, [c('10'), c('9'), c('7'), c('8'), c('9', 'hearts'), c('10', 'hearts')]);

    engine.placeBet('p1', 50);
    expect(engine.getState().phase).toBe('BETTING');
    engine.placeBet('p0', 100);
    expect(engine.getState().phase).toBe('PLAYER_TURNS');

    expect(engine.getActiveHand()?.playerId).toBe('p0');
    expect(engine.act('p1', 'STAND')).toEqual({ success: false, error: 'No es tu turno' });

    engine.act('p0', 'STAND');
    expect(engine.getActiveHand()?.playerId).toBe('p1');
    engine.act('p1', 'STAND');
    engine.runDealerToCompletion();

    // Dealer 17: p0 has 18 (win), p1 has 18 (win).
    expect(chipsOf(engine, 'p0')).toBe(1100);
    expect(chipsOf(engine, 'p1')).toBe(1050);
  });

  it('lets the host deal without waiting on players who have not bet', () => {
    const { engine } = setup(3, []);
    engine.placeBet('p1', 20);

    expect(engine.forceDeal('p1').success).toBe(false);
    expect(engine.forceDeal('p0').success).toBe(true);

    const state = engine.getState();
    expect(state.hands.map((h) => h.playerId)).toEqual(['p1']);
    expect(chipsOf(engine, 'p0')).toBe(1000);
  });

  it('does not wait on disconnected players to bet', () => {
    const { engine } = setup(2, []);
    engine.placeBet('p0', 20);
    expect(engine.getState().phase).toBe('BETTING');

    engine.markDisconnected('p1');
    expect(engine.getState().hands.map((h) => h.playerId)).toEqual(['p0']);
  });

  it('a player who joins mid-round sits in from the next betting phase', () => {
    const { engine } = setup(1, [c('10'), c('10', 'hearts'), c('9'), c('7')]);
    engine.placeBet('p0', 10);
    engine.addPlayer({ id: 'late', name: 'Late', chips: 500, seatIndex: 1, sessionToken: 't', isHost: false, isBot: false });

    expect(engine.getState().hands).toHaveLength(1);
    engine.act('p0', 'STAND');
    engine.runDealerToCompletion();
    engine.startBetting();

    expect(engine.placeBet('late', 50).success).toBe(true);
  });

  it('a player leaving on their turn has the hand stood and play moves on', () => {
    const { engine } = setup(2, [c('10'), c('9'), c('7'), c('8'), c('9', 'hearts'), c('10', 'hearts')]);
    engine.placeBet('p0', 100);
    engine.placeBet('p1', 50);

    engine.removePlayer('p0');
    expect(engine.getActiveHand()?.playerId).toBe('p1');
    engine.act('p1', 'STAND');
    engine.runDealerToCompletion();
    expect(engine.getState().phase).toBe('ROUND_OVER');
  });

  it('auto-stands only the hand it was scheduled for', () => {
    const { engine } = setup(2, [c('10'), c('9'), c('7'), c('8'), c('9', 'hearts'), c('10', 'hearts')]);
    engine.placeBet('p0', 100);
    engine.placeBet('p1', 50);

    const p1Hand = engine.getState().hands[1];
    expect(engine.autoStandActiveHand(p1Hand.id)).toBe(false);
    expect(engine.autoStandActiveHand(engine.getActiveHand()!.id)).toBe(true);
    expect(engine.getActiveHand()?.id).toBe(p1Hand.id);
  });
});

describe('BlackjackEngine - shoe length', () => {
  it('never loses or duplicates a card and conserves chips over many random rounds', () => {
    const deckCount = 1;
    const shoe = new Shoe(deckCount);
    const engine = new BlackjackEngine('r', 'CODE', makeSeats(3, 5000), { minBet: 5, maxBet: 100, deckCount, shoe });
    engine.startBetting();
    const actions: BlackjackAction[] = ['HIT', 'STAND', 'DOUBLE', 'SPLIT'];
    let reshuffles = 0;

    for (let round = 0; round < 300; round++) {
      for (const p of engine.getState().players) {
        if (p.status === 'ACTIVE') engine.placeBet(p.id, 5 + Math.floor(Math.random() * 20));
      }

      let guard = 0;
      while (engine.getState().phase === 'PLAYER_TURNS' && guard++ < 200) {
        const hand = engine.getActiveHand()!;
        const legal = engine.getAvailableActions(hand.playerId);
        const pick = actions.filter((a) => legal.includes(a));
        engine.act(hand.playerId, pick[Math.floor(Math.random() * pick.length)]);
      }
      engine.runDealerToCompletion();
      expect(engine.getState().phase).toBe('ROUND_OVER');

      const state = engine.getState();
      const onTable = state.hands.reduce((n, h) => n + h.cards.length, 0) + state.dealerCards.length;
      expect(shoe.remaining() + shoe.discardCount() + onTable).toBe(deckCount * 52);
      for (const p of state.players) expect(p.chips).toBeGreaterThanOrEqual(0);

      engine.startBetting();
      if (engine.getShoeInfo().justReshuffled) reshuffles++;
      if (engine.isGameOver()) break;
    }

    // A 3-seat table on a single deck hits the cut card every few rounds.
    expect(reshuffles).toBeGreaterThan(10);
  });

  it('reshuffles between rounds once the cut card comes out, not mid-round', () => {
    const shoe = new Shoe(1);
    const engine = new BlackjackEngine('r', 'CODE', makeSeats(1), { minBet: 10, maxBet: 100, deckCount: 1, shoe });
    engine.startBetting();
    while (shoe.remaining() >= shoe.cutCardAt()) shoe.discard([shoe.draw()]);

    engine.placeBet('p0', 10);
    engine.act('p0', 'STAND');
    engine.runDealerToCompletion();
    expect(engine.getShoeInfo().remaining).toBeLessThan(13);

    engine.startBetting();
    expect(engine.getShoeInfo()).toMatchObject({ remaining: 52, justReshuffled: true });
  });
});

describe('Blackjack state DTO', () => {
  it('never sends the dealer hole card before it is revealed', () => {
    const { engine } = setup(1, [c('10'), c('7'), c('9'), c('Q', 'hearts')]);
    engine.placeBet('p0', 10);

    const room = {
      id: 'room1',
      code: 'ABCDE',
      config: { gameMode: 'BLACKJACK', maxPlayers: 1, startingStack: 1000, minBet: 10, maxBet: 500, deckCount: 6 },
      status: 'PLAYING',
      players: [],
      engine,
      createdAt: 0,
    } as unknown as Room;

    const dto = buildBlackjackStateDTO(room, 'p0')!;
    expect(dto.dealer.cards).toEqual([c('7')]);
    expect(dto.dealer.hiddenCardCount).toBe(1);
    expect(JSON.stringify(dto)).not.toContain('"Q"');
    expect(dto.myAvailableActions).toEqual(['HIT', 'STAND', 'DOUBLE']);

    engine.act('p0', 'STAND');
    engine.dealerStep();
    const revealed = buildBlackjackStateDTO(room, 'p0')!;
    expect(revealed.dealer.cards).toEqual([c('7'), c('Q', 'hearts')]);
    expect(revealed.dealer.hiddenCardCount).toBe(0);
  });
});

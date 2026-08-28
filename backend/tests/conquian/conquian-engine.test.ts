import { ConquianEngine, ConquianSeatInput } from '../../src/modules/conquian/conquian-engine';

function makeSeats(count: number, chips = 500): ConquianSeatInput[] {
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

function currentPlayer(engine: ConquianEngine) {
  const state = engine.getState();
  return state.players.find((p) => p.seatIndex === state.currentPlayerPosition)!;
}

describe('ConquianEngine - dealing', () => {
  it('deals 10 cards each to 2 players', () => {
    const engine = new ConquianEngine('r1', 'AAAAA', makeSeats(2), 10);
    engine.startNewHand();
    const state = engine.getState();
    expect(state.players[0].hand).toHaveLength(10);
    expect(state.players[1].hand).toHaveLength(10);
    expect(state.stock.length).toBe(52 - 20);
  });

  it('deals 7 cards each to 3 players and 6 each to 4 players', () => {
    const e3 = new ConquianEngine('r1', 'BBBBB', makeSeats(3), 10);
    e3.startNewHand();
    expect(e3.getState().players.every((p) => p.hand.length === 7)).toBe(true);
    expect(e3.getState().stock.length).toBe(52 - 21);

    const e4 = new ConquianEngine('r1', 'CCCCC', makeSeats(4), 10);
    e4.startNewHand();
    expect(e4.getState().players.every((p) => p.hand.length === 6)).toBe(true);
    expect(e4.getState().stock.length).toBe(52 - 24);
  });

  it('deducts the ante from every active player into the pot', () => {
    const engine = new ConquianEngine('r1', 'DDDDD', makeSeats(2, 500), 15);
    engine.startNewHand();
    const state = engine.getState();
    expect(state.pot).toBe(30);
    expect(state.players[0].chips).toBe(485);
    expect(state.players[1].chips).toBe(485);
  });

  it('starts with an empty discard pile and DRAW phase for the first actor', () => {
    const engine = new ConquianEngine('r1', 'EEEEE', makeSeats(2), 10);
    engine.startNewHand();
    const state = engine.getState();
    expect(state.discardPile).toHaveLength(0);
    expect(state.turnPhase).toBe('DRAW');
    expect(state.handInProgress).toBe(true);
  });
});

describe('ConquianEngine - turn flow', () => {
  it('rejects melding before drawing', () => {
    const engine = new ConquianEngine('r1', 'FFFFF', makeSeats(2), 10);
    engine.startNewHand();
    const player = currentPlayer(engine);
    const result = engine.meld(player.id, [player.hand[0], player.hand[1], player.hand[2]]);
    expect(result.success).toBe(false);
  });

  it('rejects a second draw in the same turn', () => {
    const engine = new ConquianEngine('r1', 'GGGGG', makeSeats(2), 10);
    engine.startNewHand();
    const player = currentPlayer(engine);
    expect(engine.draw(player.id, 'STOCK').success).toBe(true);
    expect(engine.draw(player.id, 'STOCK').success).toBe(false);
  });

  it('rejects drawing from an empty discard pile', () => {
    const engine = new ConquianEngine('r1', 'HHHHH', makeSeats(2), 10);
    engine.startNewHand();
    const player = currentPlayer(engine);
    const result = engine.draw(player.id, 'DISCARD');
    expect(result.success).toBe(false);
  });

  it('rejects actions from a player who is not on turn', () => {
    const engine = new ConquianEngine('r1', 'IIIII', makeSeats(2), 10);
    engine.startNewHand();
    const player = currentPlayer(engine);
    const other = engine.getState().players.find((p) => p.id !== player.id)!;
    expect(engine.draw(other.id, 'STOCK').success).toBe(false);
  });

  it('advances the turn to the next player after a discard', () => {
    const engine = new ConquianEngine('r1', 'JJJJJ', makeSeats(3), 10);
    engine.startNewHand();
    const first = currentPlayer(engine);
    engine.draw(first.id, 'STOCK');
    const drawnCard = first.hand[first.hand.length - 1];
    engine.discard(first.id, drawnCard);

    const state = engine.getState();
    expect(state.turnPhase).toBe('DRAW');
    expect(state.currentPlayerPosition).not.toBe(first.seatIndex);
  });

  it('draws the top card of the discard pile', () => {
    const engine = new ConquianEngine('r1', 'KKKKK', makeSeats(2), 10);
    engine.startNewHand();
    const first = currentPlayer(engine);
    engine.draw(first.id, 'STOCK');
    const discarded = first.hand[0];
    engine.discard(first.id, discarded);

    const second = currentPlayer(engine);
    const before = second.hand.length;
    const result = engine.draw(second.id, 'DISCARD');
    expect(result.success).toBe(true);
    expect(second.hand).toHaveLength(before + 1);
    expect(second.hand.some((c) => c.rank === discarded.rank && c.suit === discarded.suit)).toBe(true);
    expect(engine.getState().discardPile).toHaveLength(0);
  });
});

describe('ConquianEngine - melding', () => {
  it('lets a player form a new set from their hand and removes it from hand', () => {
    const engine = new ConquianEngine('r1', 'LLLLL', makeSeats(2), 10);
    engine.startNewHand();
    const player = currentPlayer(engine);
    engine.draw(player.id, 'STOCK');

    // Rig a fully deterministic hand (not mixed with the real deal) so no leftover card can
    // coincidentally collide with the rigged meld's rank/suit.
    const state = engine.getState();
    const target = state.players.find((p) => p.id === player.id)!;
    target.hand = [
      { rank: '7', suit: 'hearts' },
      { rank: '7', suit: 'diamonds' },
      { rank: '7', suit: 'clubs' },
      { rank: '2', suit: 'spades' },
    ];

    const result = engine.meld(player.id, [
      { rank: '7', suit: 'hearts' },
      { rank: '7', suit: 'diamonds' },
      { rank: '7', suit: 'clubs' },
    ]);
    expect(result.success).toBe(true);
    expect(engine.getState().melds).toHaveLength(1);
    expect(engine.getState().melds[0].type).toBe('SET');
    expect(target.hand.some((c) => c.rank === '7')).toBe(false);
  });

  it('rejects melding cards the player does not hold', () => {
    const engine = new ConquianEngine('r1', 'MMMMM', makeSeats(2), 10);
    engine.startNewHand();
    const player = currentPlayer(engine);
    engine.draw(player.id, 'STOCK');

    const result = engine.meld(player.id, [
      { rank: 'K', suit: 'hearts' },
      { rank: 'K', suit: 'diamonds' },
      { rank: 'K', suit: 'clubs' },
    ]);
    // Extremely unlikely (but not impossible) the player was dealt exactly these - force failure path
    // by asserting the hand doesn't contain all three; if it did by pure chance the meld would succeed,
    // so guard the assertion on that precondition.
    const state = engine.getState();
    const hasAllThree = ['hearts', 'diamonds', 'clubs'].every((suit) =>
      state.players.find((p) => p.id === player.id)!.hand.some((c) => c.rank === 'K' && c.suit === suit)
    );
    if (!hasAllThree) {
      expect(result.success).toBe(false);
    }
  });

  it('lets a player lay off a card onto an existing meld', () => {
    const engine = new ConquianEngine('r1', 'NNNNN', makeSeats(2), 10);
    engine.startNewHand();
    const player = currentPlayer(engine);
    engine.draw(player.id, 'STOCK');

    const state = engine.getState();
    const target = state.players.find((p) => p.id === player.id)!;
    target.hand = [
      { rank: '7', suit: 'hearts' },
      { rank: '7', suit: 'diamonds' },
      { rank: '7', suit: 'clubs' },
      { rank: '7', suit: 'spades' },
    ];

    engine.meld(player.id, [
      { rank: '7', suit: 'hearts' },
      { rank: '7', suit: 'diamonds' },
      { rank: '7', suit: 'clubs' },
    ]);
    const meldId = engine.getState().melds[0].id;

    const result = engine.meld(player.id, [{ rank: '7', suit: 'spades' }], meldId);
    expect(result.success).toBe(true);
    expect(engine.getState().melds[0].cards).toHaveLength(4);
  });
});

describe('ConquianEngine - winning a hand', () => {
  it('awards the pot to whoever discards their last card and marks the hand over', () => {
    const engine = new ConquianEngine('r1', 'OOOOO', makeSeats(2, 500), 20);
    engine.startNewHand();
    const player = currentPlayer(engine);
    const potBefore = engine.getState().pot;
    const chipsBefore = engine.getState().players.find((p) => p.id === player.id)!.chips;

    engine.draw(player.id, 'STOCK');

    // Force the player down to exactly one card, meld the rest as a valid set, then discard the last to go out.
    const state = engine.getState();
    const target = state.players.find((p) => p.id === player.id)!;
    target.hand = [
      { rank: '9', suit: 'hearts' },
      { rank: '9', suit: 'diamonds' },
      { rank: '9', suit: 'clubs' },
      { rank: '2', suit: 'spades' },
    ];
    engine.meld(player.id, [
      { rank: '9', suit: 'hearts' },
      { rank: '9', suit: 'diamonds' },
      { rank: '9', suit: 'clubs' },
    ]);
    expect(target.hand).toHaveLength(1);

    const result = engine.discard(player.id, { rank: '2', suit: 'spades' });
    expect(result.success).toBe(true);

    const finalState = engine.getState();
    expect(finalState.handInProgress).toBe(false);
    expect(finalState.pot).toBe(0);

    const handResult = engine.consumeHandResult();
    expect(handResult).not.toBeNull();
    expect(handResult!.winnerId).toBe(player.id);
    expect(handResult!.potWon).toBe(potBefore);

    const chipsAfter = finalState.players.find((p) => p.id === player.id)!.chips;
    expect(chipsAfter).toBe(chipsBefore + potBefore);
  });

  it('conserves total chips across a full hand', () => {
    const engine = new ConquianEngine('r1', 'PPPPP', makeSeats(2, 300), 10);
    engine.startNewHand();
    const totalBefore = engine.getState().players.reduce((s, p) => s + p.chips, 0) + engine.getState().pot;

    const player = currentPlayer(engine);
    engine.draw(player.id, 'STOCK');
    const state = engine.getState();
    const target = state.players.find((p) => p.id === player.id)!;
    target.hand = [
      { rank: '5', suit: 'hearts' },
      { rank: '6', suit: 'hearts' },
      { rank: '7', suit: 'hearts' },
      { rank: '3', suit: 'clubs' },
    ];
    engine.meld(player.id, [
      { rank: '5', suit: 'hearts' },
      { rank: '6', suit: 'hearts' },
      { rank: '7', suit: 'hearts' },
    ]);
    engine.discard(player.id, { rank: '3', suit: 'clubs' });

    const totalAfter = engine.getState().players.reduce((s, p) => s + p.chips, 0) + engine.getState().pot;
    expect(totalAfter).toBe(totalBefore);
  });
});

describe('ConquianEngine - eliminations and game over', () => {
  it('marks a player OUT once their chips cannot cover the next ante', () => {
    const seats = makeSeats(2, 15);
    const engine = new ConquianEngine('r1', 'QQQQQ', seats, 10);
    engine.startNewHand();
    expect(engine.getState().players.every((p) => p.status === 'ACTIVE')).toBe(true);

    // Simulate this player losing repeatedly until they can't afford the next ante.
    const loser = engine.getState().players[0];
    loser.chips = 5;

    engine.startNewHand();
    expect(engine.getState().players.find((p) => p.id === loser.id)!.status).toBe('OUT');
    expect(engine.isGameOver()).toBe(true);
  });
});

describe('ConquianEngine - 4 players', () => {
  it('plays a hand where the dealer rotates and everyone gets fewer cards', () => {
    const engine = new ConquianEngine('r1', 'RRRRR', makeSeats(4, 200), 5);
    engine.startNewHand();
    const firstDealer = engine.getState().dealerPosition;
    expect(engine.getState().players.every((p) => p.hand.length === 6)).toBe(true);

    // End the hand artificially via a push (drain the stock) to test rotation without needing real melds.
    while (engine.getState().stock.length > 0) {
      engine.getState().stock.pop();
    }
    const player = currentPlayer(engine);
    engine.draw(player.id, 'STOCK');

    expect(engine.getState().handInProgress).toBe(false);
    const handResult = engine.consumeHandResult();
    expect(handResult!.isPush).toBe(true);

    engine.startNewHand();
    expect(engine.getState().dealerPosition).not.toBe(firstDealer);
  });
});

// Mirrors backend/src/modules/blackjack/shoe.ts so the form only offers shoe sizes the server accepts.

export const CARDS_PER_DECK = 52;
export const ALLOWED_DECK_COUNTS = [1, 2, 4, 6, 8];
export const BLACKJACK_MAX_SEATS = 7;

/** One 52-card deck can't cover a full table: bigger tables need a bigger shoe behind the cut card. */
export function minDecksForSeats(seats: number): number {
  if (seats <= 2) return 1;
  if (seats <= 4) return 2;
  return 4;
}

export function recommendedDecksForSeats(seats: number): number {
  if (seats <= 2) return 2;
  if (seats <= 4) return 4;
  return 6;
}

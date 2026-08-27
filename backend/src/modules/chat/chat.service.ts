const MAX_MESSAGE_LENGTH = 200;

export function sanitizeChatText(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, MAX_MESSAGE_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

export interface LobbyPlayer {
  id: string;
  sessionToken: string;
  name: string;
  seatIndex: number;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  socketId: string | null;
  chips: number;
  eliminated: boolean;
  isBot: boolean;
}

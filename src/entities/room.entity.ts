import { Player } from './player.entity';
import { Card } from './card.entity';

export class Room {
  id: string;
  players: Record<string, Player>; // clé = socketId
  market: Card[];
  started: boolean;
  turnOrder: string[]; // liste de socketId
  currentTurnIndex: number;

  constructor(id: string) {
    this.id = id;
    this.players = {};
    this.market = [];
    this.started = false;
    this.turnOrder = [];
    this.currentTurnIndex = 0;
  }

  addPlayer(player: Player) {
    this.players[player.socketId] = player;
  }

  setPlayerReady(playerId: string) {
    const player = this.players[playerId];
    if (player) {
      player.ready = true;
    }
  }
}

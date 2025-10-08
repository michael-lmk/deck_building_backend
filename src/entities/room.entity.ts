import { Player } from './player.entity';
import { Card } from './card.entity';
export class Room {
  id: string;
  players: Record<string, Player>;
  market: Card[];
  started: boolean;
  turnOrder: string[];
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
}

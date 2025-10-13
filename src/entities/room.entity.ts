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

  /**
   * Passe au joueur suivant dans l'ordre des tours.
   * Si on est à la fin du tableau, on revient au début.
   * Retourne le prochain joueur.
   */
  nextPlayer(): Player {
    if (!this.turnOrder.length) {
      throw new Error('No players in turn order');
    }

    // Avancer d’un cran
    this.currentTurnIndex++;

    // Si on dépasse, on revient au début
    if (this.currentTurnIndex >= this.turnOrder.length) {
      this.currentTurnIndex = 0;
    }

    const nextSocketId = this.turnOrder[this.currentTurnIndex];
    return this.players[nextSocketId];
  }

  /**
   * Retourne le joueur actuellement en train de jouer.
   */
  getCurrentPlayer(): Player {
    if (!this.turnOrder.length) {
      throw new Error('No players in turn order');
    }

    const socketId = this.turnOrder[this.currentTurnIndex];
    return this.players[socketId];
  }

  /**
   * Réinitialise l’ordre des tours (utile au démarrage de partie).
   */
  initTurnOrder() {
    this.turnOrder = Object.keys(this.players);
    this.currentTurnIndex = 0;
  }
}

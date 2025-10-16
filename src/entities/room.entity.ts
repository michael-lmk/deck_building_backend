import { Player } from './player.entity';
import { Card, CardsJson } from './card.entity';

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

  generateInitialMarket(cardBase: CardsJson) {
    const { star, non_star } = cardBase;

    // On tire 2 stars aléatoires
    const stars = this.shuffle([...star]).slice(0, 2);

    // On veut remplir le reste avec des non-stars cohérents
    const marketSize = 15; // total cartes du market
    const remaining = marketSize - stars.length;

    const affordableNonStars = non_star.filter((c) => c.cost <= 6);
    const highCostNonStars = non_star.filter((c) => c.cost > 6);

    const nonStars: Card[] = [];

    while (nonStars.length < remaining) {
      const pool = Math.random() < 0.8 ? affordableNonStars : highCostNonStars;
      const candidate = pool[Math.floor(Math.random() * pool.length)];

      // Vérifie si elle n'est pas déjà dans le market
      if (![...stars, ...nonStars].some((c) => c.name === candidate.name)) {
        nonStars.push(candidate);
      }
    }

    // Market final trié par coût croissant
    const market = [...stars, ...nonStars].sort(
      (a, b) => (a.cost ?? 0) - (b.cost ?? 0),
    );

    return market;
  }

  // Utilitaire simple pour mélanger un tableau
  shuffle(array) {
    return array
      .map((v) => ({ v, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ v }) => v);
  }
}

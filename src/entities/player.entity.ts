import { Card } from './card.entity';

export class Player {
  socketId: string;
  roomId: string;
  name: string;
  ready: boolean;

  deck: Card[];
  discard: Card[];
  used: Card[];
  unsed: Card[];

  houseCapacity: number;
  popularity: number;
  money: number;

  // 🔒 pour éviter les spams concurrents manuels
  manualLock: boolean;

  constructor(
    socketId: string,
    roomId: string,
    name: string,
    initialDeck: Card[],
  ) {
    this.socketId = socketId;
    this.roomId = roomId;
    this.name = name;
    this.deck = initialDeck;

    this.ready = false;
    this.used = [];
    this.unsed = [];
    this.discard = [];

    this.houseCapacity = 5;
    this.popularity = 0;
    this.money = 0;

    this.manualLock = false;
  }

  toggleReady() {
    this.ready = !this.ready;
  }

  initializeRound() {
    this.used = [];
    this.unsed = [...this.deck];
    // this.discard = [];
  }

  /**
   * Tire une carte aléatoire dans la pile "unsed"
   */
  drawCards(): Card | null {
    if (!this.unsed.length) return null;
    const card = this.unsed[Math.floor(Math.random() * this.unsed.length)];
    return card;
  }

  /**
   * Ajoute une carte au joueur
   */
  addCard(card: Card): void {
    this.used.push(card);
    this.unsed = this.unsed.filter((c) => c !== card);
  }

  /**
   * Tente d'ajouter une carte au joueur
   * - Empêche le dépassement manuel
   * - Autorise le dépassement auto (et renvoie une raison de perte)
   */
  tryAddCard(
    card: Card,
    options: { allowOverflow?: boolean } = {},
  ): { success: boolean; reason?: string } {
    const allowOverflow = !!options.allowOverflow;
    const newUsed = [...this.used, card];

    // Si on ne permet pas de dépasser la capacité
    if (!allowOverflow && newUsed.length > this.houseCapacity) {
      return { success: false }; // refus silencieux (pour cannotInvite)
    }

    // Si on permet le dépassement et qu'on le dépasse -> perte immédiate
    if (allowOverflow && newUsed.length > this.houseCapacity) {
      this.used = newUsed;
      this.unsed = this.unsed.filter((c) => c !== card);
      return { success: false, reason: "Trop de monde, c'est perdu !" };
    }

    // Vérifie les cartes "trouble"
    const troubleCount = newUsed.filter((c) => c.trouble).length;
    if (troubleCount > 2) {
      this.used = newUsed;
      this.unsed = this.unsed.filter((c) => c !== card);
      return { success: false, reason: "Trop de trouble, c'est perdu !" };
    }

    // ✅ tout est OK
    this.used = newUsed;
    this.unsed = this.unsed.filter((c) => c !== card);
    return { success: true };
  }

  /**
   * Exemple pour bloquer le spam manuel concurrent (sans cooldown)
   */
  lockManualAction(): boolean {
    if (this.manualLock) return false; // déjà bloqué
    this.manualLock = true;
    // Déverrouillage automatique très court (100 ms par ex)
    setTimeout(() => (this.manualLock = false), 100);
    return true;
  }

  countScore(): Player {
    return this;
  }
}

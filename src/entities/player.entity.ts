import { Card } from './card.entity';

export class Player {
  socketId: string;
  roomId: string;
  name: string;
  ready: boolean;

  deck: Card[]; // all cards deck

  discard: Card[]; // cards in the discard for this round
  used: Card[]; // cards already played this round
  unsed: Card[]; // cards for the round

  houseCapacity: number;
  popularity: number;
  money: number;

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
  }

  toggleReady() {
    this.ready = !this.ready;
  }

  initializeRound() {
    this.used = [];
    this.unsed = [...this.deck];
    // this.discard = [];
  }

  drawCards(): Card {
    const card = this.unsed[Math.floor(Math.random() * this.unsed.length)];

    return card;
  }

  addCard(card: Card): void {
    this.used.push(card);
    this.unsed = this.unsed.filter((c) => c !== card);
  }
}

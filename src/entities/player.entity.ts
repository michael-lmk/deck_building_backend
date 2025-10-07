import { Card } from './card.entity';

export class Player {
  socketId: string;
  roomId: string;
  name: string;
  ready: boolean;

  // Card piles
  deck: Card[]; // The draw pile
  hand: Card[];
  discard: Card[];

  // Player stats
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
    this.deck = initialDeck; // The initial deck is the draw pile

    this.ready = false;
    this.hand = [];
    this.discard = [];

    this.houseCapacity = 5;
    this.popularity = 0;
    this.money = 0;
  }
}

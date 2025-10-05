import { Card } from './cards.types';

export interface Player {
  socketId: string;
  name: string;
  ready: boolean;
  hand: Card[];        // cartes en main
  deck: Card[];        // cartes possédées
  discard: Card[];     // cartes utilisées / défaussées
  popularity?: number; // optional, pour le score courant
  money?: number;      // optional, pour le score courant
}

import { Player } from './player.types';
import { Card } from './cards.types';

export interface Room {
  id: string;
  players: Record<string, Player>; // clé = socketId
  market: Card[]; // cartes disponibles à l'achat
  started: boolean; // true si partie lancée
  turnOrder: string[]; // tableau de socketIds
  currentTurnIndex: number; // index du joueur actif
  // Nouveau : état de la fête
  party: {
    guestsInHouse: Card[];
    houseCapacity: number; // commence à 5
    isActive: boolean;
  };
}

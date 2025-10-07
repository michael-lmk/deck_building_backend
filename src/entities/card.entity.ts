export enum CardType {
  DEFAULT = 'default',
  GUEST = 'guest',
  STAR = 'star',
}

export class Card {
  id: string; // identifiant unique
  name: string;
  type: CardType;
  cost?: number; // coût en boutique ou null si carte spéciale
  popularity: number;
  money: number; // argent ou coût
  ability?: string | null; // description de la capacité
  trouble: boolean; // true si PROBLème !
  buyable?: boolean; // false si ne peut pas être acheté (ex: Wild Buddy)
  quantity?: number; // Nombre d'exemplaires de cette carte
}

export interface CardsJson {
  default: Card[];
  non_star: Card[];
  star: Card[];
}

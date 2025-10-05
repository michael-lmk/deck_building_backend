export type CardType = 'default' | 'guest' | 'star';

export interface Card {
  id: string; // identifiant unique
  name: string;
  type: CardType;
  cost?: number; // coût en boutique ou null si carte spéciale
  popularity: number;
  money: number; // argent ou coût
  ability?: string | null; // description de la capacité
  trouble: boolean; // true si PROBLÈME !
  buyable?: boolean; // false si ne peut pas être acheté (ex: Wild Buddy)
}

export interface CardsJson {
  default: Card[];
  non_star: Card[];
  star: Card[];
}

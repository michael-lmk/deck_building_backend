export interface CreateRoomDto {
  roomId: string;
}

export interface JoinRoomDto {
  roomId: string;
  name: string;
}

export interface PlayerReadyDto {
  roomId: string;
}

export interface BuyCardDto {
  roomId: string;
  cardName: string;
}

export interface StartPartyDto {
  roomId: string;
}

export interface PartyResults {
  popularity: number;
  money: number;
  reason?: string; // si la fête s'est arrêtée par police/pompiers
}

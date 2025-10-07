import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRoomDto {
  @IsString()
  @IsNotEmpty()
  roomId: string; // Identifiant unique de la room

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  playerName?: string; // Nom du joueur créateur (optionnel)
}

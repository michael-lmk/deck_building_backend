// src/auth/jwt-ws.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PartyGateway } from 'src/gateway/party.gateway';
import { forwardRef, Inject } from '@nestjs/common';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => PartyGateway))
    private readonly gateway: PartyGateway,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient();
    const data = context.switchToWs().getData();

    const token = client.handshake.auth?.token;
    if (!token) {
      throw new ForbiddenException('No token provided');
    }

    try {
      const payload = this.jwtService.verify(token);
      client.user = payload; // on stocke l’utilisateur
    } catch (e) {
      throw new ForbiddenException('Invalid token');
    }

    const roomId = data?.roomId;
    if (!roomId) {
      throw new ForbiddenException('Missing roomId in message');
    }

    const room = this.gateway.getRoom(roomId);
    if (!room) {
      throw new ForbiddenException('Room not found');
    }

    const currentPlayer = room.getCurrentPlayer();
    if (!currentPlayer) {
      throw new ForbiddenException('No current player');
    }

    if (currentPlayer.socketId !== client.id) {
      throw new ForbiddenException('Not your turn');
    }

    return true;
  }
}

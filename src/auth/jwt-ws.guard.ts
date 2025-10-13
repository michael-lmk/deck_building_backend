// jwt-ws.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable } from 'rxjs';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const client = context.switchToWs().getClient();
    const token = client.handshake.auth?.token; // on récupère le token du handshake

    if (!token) return false;

    try {
      const payload = this.jwtService.verify(token);
      client.user = payload; // on stocke l'user sur le socket pour l’utiliser plus tard
      return true;
    } catch (err) {
      return false;
    }
  }
}

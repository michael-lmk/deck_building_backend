import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WsJwtGuard } from './jwt-ws.guard';
import { PartyGateway } from 'src/gateway/party.gateway';

@Module({
  imports: [
    forwardRef(() =>
      JwtModule.register({ global: true, secret: process.env.JWT_SECRET }),
    ),
  ],
  providers: [WsJwtGuard, PartyGateway],
  exports: [WsJwtGuard],
})
export class AuthModule {}

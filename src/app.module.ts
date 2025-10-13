import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PartyGateway } from './gateway/party.gateway';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './auth/auth.module';
@Module({
  controllers: [AppController],
  imports: [
    AuthModule,
    JwtModule.register({
      secret: 'MA_CLE_SECRETE', // 🔑 Obligatoire pour signer le JWT
      signOptions: { expiresIn: '10h' },
    }),
  ],
  providers: [AppService, PartyGateway],
})
export class AppModule {}

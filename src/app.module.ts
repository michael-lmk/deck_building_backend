import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PartyGateway } from './gateway/party.gateway';

@Module({
  controllers: [AppController],
  providers: [AppService, PartyGateway],
})
export class AppModule {}

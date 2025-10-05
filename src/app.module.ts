import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CardsModule } from './cards/cards.module';
import { PartyGateway } from './gateway/party.gateway';

@Module({
  imports: [CardsModule],
  controllers: [AppController],
  providers: [AppService, PartyGateway],
})
export class AppModule {}

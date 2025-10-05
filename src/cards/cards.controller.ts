import { Controller, Get, Param } from '@nestjs/common';
import { CardsService } from '../services/cards.service';

@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Get()
  getAll() {
    return this.cardsService.getAll();
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    // return this.cardsService.getById(id) || { error: 'Card not found' };
  }
}

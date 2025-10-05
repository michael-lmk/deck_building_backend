import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CardsService {
  private cardsCache: any[] | null = null;

  getAll() {
    // if (this.cardsCache) return this.cardsCache;
    // const file = path.join(__dirname, 'assets', 'cards.json');
    // const raw = fs.readFileSync(file, 'utf-8');
    // this.cardsCache = JSON.parse(raw);
    // return this.cardsCache;
  }

  getById(id: string) {
    // const all = this.getAll();
    // return all.find(c => c.id === id) || null;
  }
}

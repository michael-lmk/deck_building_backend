import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as fs from 'fs';
import * as path from 'path';
import { Card } from '../types/cards.types';
import { CardsJson } from '../types/cards.types';
import { Room } from '../types/room.types';
import { Player } from '../types/player.types';
import {
  CreateRoomDto,
  JoinRoomDto,
  PlayerReadyDto,
  BuyCardDto,
  StartPartyDto,
  PartyResults,
} from '../types/events.types';

@WebSocketGateway({ cors: { origin: '*' } })
export class PartyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private allCards: CardsJson;
  private rooms: Record<string, Room> = {};

  constructor() {
    const file = path.join(__dirname, '../assets/cards.json');
    this.allCards = JSON.parse(fs.readFileSync(file, 'utf-8'))
      .cards as CardsJson;

    console.log(
      `Cards loaded: default(${this.allCards.default.length}), non_star(${this.allCards.non_star.length}), star(${this.allCards.star.length})`,
    );
  }

  handleConnection(socket: Socket) {
    console.log(`Player connected: ${socket.id} room id : ${this.rooms.id}`);
  }

  handleDisconnect(socket: Socket) {
    console.log(`Player disconnected: ${socket.id}`);
    for (const roomId in this.rooms) {
      const room = this.rooms[roomId];
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        this.server
          .to(roomId)
          .emit('updatePlayers', Object.values(room.players));
        if (Object.keys(room.players).length === 0) {
          delete this.rooms[roomId];
          console.log(`Room ${roomId} closed`);
        }
      }
    }
  }

  private createExpandedDeck(cards: Card[]): Card[] {
    return cards.reduce((acc, card) => {
      const quantity = card.quantity || 1;
      for (let i = 0; i < quantity; i++) {
        // Créer une nouvelle instance pour chaque carte
        acc.push({ ...card });
      }
      return acc;
    }, [] as Card[]);
  }

  @SubscribeMessage('createRoom')
  createRoom(
    @MessageBody() data: CreateRoomDto,
    @ConnectedSocket() socket: Socket,
  ) {
    if (this.rooms[data.roomId]) {
      socket.emit('error', 'Room already exists');
      return;
    }

    const initialDeck = this.createExpandedDeck(this.allCards.default);
    console.log(`Initial deck created with ${initialDeck.length} cards:`, initialDeck.map(c => c.name));

    this.rooms[data.roomId] = {
      id: data.roomId,
      players: {},
      market: [],
      started: false,
      turnOrder: [],
      currentTurnIndex: 0,
      party: null,
    };

    socket.join(data.roomId);
    this.rooms[data.roomId].players[socket.id] = {
      socketId: socket.id,
      name: 'Player1',
      ready: false,
      hand: [],
      deck: initialDeck,
      discard: [],
    };

    socket.emit('roomCreated', { roomId: data.roomId });
    console.log(`Room ${data.roomId} created by ${socket.id}`);
  }

  // Rejoindre room
  @SubscribeMessage('joinRoom')
  handleJoin(client: Socket, data: { roomId: string; name: string }) {
    let room = this.rooms[data.roomId];
    if (!room) {
      room = {
        id: data.roomId,
        players: {}, // objet
        market: [],
        started: false,
        turnOrder: [],
        currentTurnIndex: 0,
        party: null, // Add default value for the 'party' property
      };
      this.rooms[data.roomId] = room;
    }

    const initialDeck = this.createExpandedDeck(this.allCards.default);

    room.players[client.id] = {
      socketId: client.id,
      name: data.name,
      ready: false,
      hand: [],
      deck: initialDeck,
      discard: [],
    };

    client.join(data.roomId);

    client.emit('joinedRoom', { });

    // Convertir en tableau pour l’envoi
    this.server
      .to(data.roomId)
      .emit('updatePlayers', Object.values(room.players));
  }

  @SubscribeMessage('playerReady')
  playerReady(
    @MessageBody() data: PlayerReadyDto,
    @ConnectedSocket() socket: Socket,
  ) {
    const room = this.rooms[data.roomId];
    if (!room) return;

    room.players[socket.id].ready = true;
    this.server.to(data.roomId).emit('updatePlayers', Object.values(room.players));

    const allReady = Object.values(room.players).every((p) => p.ready);
    if (allReady && !room.started) {
      room.started = true;

      // Mélanger le deck de chaque joueur
      for (const playerId in room.players) {
        const player = room.players[playerId];
        player.deck = player.deck.sort(() => Math.random() - 0.5);
        player.hand = [];
        player.discard = [];
      }

      room.turnOrder = Object.keys(room.players);
      room.currentTurnIndex = 0;

      const currentPlayerId = room.turnOrder[room.currentTurnIndex];
      this.startTurn(room, currentPlayerId);

      this.server.to(data.roomId).emit('startGame', { market: room.market });
    }
  }

  private startTurn(room: Room, playerId: string) {
    const player = room.players[playerId];
    if (!player) return;

    room.party = {
      guestsInHouse: [],
      houseCapacity: 5,
      isActive: true,
    };
    this.server.to(playerId).emit('yourTurn', {
      party: room.party,
      deck: player.deck,
      discard: player.discard,
    });
    this.server.to(room.id).emit('partyUpdate', room.party.guestsInHouse);
  }

  @SubscribeMessage('drawCard')
  drawCard(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    console.log(`'drawCard' event received from ${socket.id}`);
    const room = this.rooms[data.roomId];
    if (!room) {
      console.log('Room not found');
      return;
    }
    if (!room.party?.isActive) {
      console.log('Party is not active');
      return;
    }

    const player = room.players[socket.id];
    const currentPlayerId = room.turnOrder[room.currentTurnIndex];
    console.log(`Current player should be: ${currentPlayerId}`);

    if (!player || socket.id !== currentPlayerId) {
      console.log(`Not your turn. Player: ${player?.socketId}, Expected: ${currentPlayerId}`);
      socket.emit('error', 'Not your turn');
      return;
    }

    console.log(`Checks passed. Player deck size: ${player.deck.length}, Discard size: ${player.discard.length}`);

    // Piocher une carte
    if (player.deck.length === 0) {
      console.log('Deck is empty, reshuffling discard pile.');
      player.deck = player.discard.sort(() => Math.random() - 0.5);
      player.discard = [];
    }

    if (player.deck.length === 0) {
      // Le joueur n'a plus de cartes, terminer la fête
      this.endParty({ roomId: data.roomId }, socket);
      return;
    }

    const card = player.deck.pop();
    console.log(`Player drew: ${card.name}`);
    player.discard.push(card); // Mettre la carte dans la défausse pour le prochain cycle
    room.party.guestsInHouse.push(card);

    // Notifier le client de l'état mis à jour du deck
    socket.emit('deckStateUpdated', { deck: player.deck, discard: player.discard });

    console.log(`After draw. Player deck size: ${player.deck.length}, Discard size: ${player.discard.length}`);

    this.server.to(data.roomId).emit('partyUpdate', room.party.guestsInHouse);

    // Vérifier les conditions de défaite (bust)
    const troubleCount = room.party.guestsInHouse.filter((c) => c.trouble).length;
    if (troubleCount >= 3) {
      this.server.to(socket.id).emit('partyBusted', { reason: 'Trop de trouble ! La police est intervenue.' });
      this.endParty({ roomId: data.roomId }, socket, true /* isBusted */);
      return;
    }

    if (room.party.guestsInHouse.length >= room.party.houseCapacity) {
      this.server.to(socket.id).emit('partyBusted', { reason: 'La maison est pleine ! Les pompiers ont fermé la fête.' });
      this.endParty({ roomId: data.roomId }, socket, true /* isBusted */);
      return;
    }
  }

  @SubscribeMessage('buyCard')
  buyCard(@MessageBody() data: BuyCardDto, @ConnectedSocket() socket: Socket) {
    const room = this.rooms[data.roomId];
    if (!room) return;

    const currentPlayerId = room.turnOrder[room.currentTurnIndex];
    if (socket.id !== currentPlayerId) {
      socket.emit('error', 'Not your turn');
      return;
    }

    const player = room.players[socket.id];
    if (!player) return;

    const cardIndex = room.market.findIndex((c) => c.name === data.cardName);
    if (cardIndex === -1) {
      socket.emit('error', 'Card not found in market');
      return;
    }

    const card = room.market[cardIndex];
    player.hand.push(card);
    player.deck.push(card);
    room.market.splice(cardIndex, 1);

    socket.emit('handUpdate', player.hand);
    this.server.to(data.roomId).emit('marketUpdate', room.market);

    // Passer au joueur suivant
    room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
    const nextPlayerId = room.turnOrder[room.currentTurnIndex];

    // Vérifier si tout le monde a joué (fin de tour)
    if (room.currentTurnIndex === 0) {
      // Lancer la fête après que tous les joueurs ont acheté
      this.startPartyInternal(data.roomId);
    } else {
      this.server.to(nextPlayerId).emit('yourTurn', { market: room.market });
    }
  }

  private startPartyInternal(roomId: string) {
    const room = this.rooms[roomId];
    if (!room) return;

    const results: PartyResults = {
      popularity: 0,
      money: 0,
    };

    for (const playerId in room.players) {
      const player = room.players[playerId];
      const troubleCount = player.hand.filter((c) => c.trouble).length;
      const guestCount = player.hand.length;

      if (troubleCount >= 3) {
        this.server
          .to(playerId)
          .emit('partyStopped', { reason: 'Police est intervenue!' });
      } else if (guestCount > 5) {
        this.server
          .to(playerId)
          .emit('partyStopped', { reason: 'Pompiers ont fermé la maison!' });
      } else {
        results.popularity += Math.floor(Math.random() * 5) + 1;
        results.money += Math.floor(Math.random() * 3) + 1;
      }
    }

    this.server.to(roomId).emit('partyResults', results);
    console.log(`Party finished in room ${roomId}:`, results);
  }

  @SubscribeMessage('passTurn')
  passTurn(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    const room = this.rooms[data.roomId];
    if (!room) return;

    const currentPlayerId = room.turnOrder[room.currentTurnIndex];
    if (socket.id !== currentPlayerId) return; // seulement joueur actif

    // passer au joueur suivant
    room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
    const nextPlayerId = room.turnOrder[room.currentTurnIndex];

    if (room.currentTurnIndex === 0) {
      this.startPartyInternal(data.roomId);
    }
    else {
      this.server.to(nextPlayerId).emit('yourTurn', { market: room.market });
    }
  }

  @SubscribeMessage('endParty')
  endParty(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() socket: Socket,
    isBusted = false, // Ajout d'un drapeau pour les tours perdus
  ) {
    const room = this.rooms[data.roomId];
    if (!room || !room.party.isActive) return;

    const player = room.players[socket.id];
    if (!player) return;

    room.party.isActive = false;

    let results = { popularity: 0, money: 0 };
    if (!isBusted) {
      const guests = room.party.guestsInHouse;
      results.popularity = guests.reduce((sum, g) => sum + (Number(g.popularity) || 0), 0);
      results.money = guests.reduce((sum, g) => sum + (Number(g.money) || 0), 0);
    }
    // Si isBusted, les résultats restent à 0

    this.server.to(socket.id).emit('partyResults', results);

    // Passer au joueur suivant
    room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
    const nextPlayerId = room.turnOrder[room.currentTurnIndex];
    this.startTurn(room, nextPlayerId);
  }
}
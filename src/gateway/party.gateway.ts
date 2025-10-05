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

  @SubscribeMessage('createRoom')
  createRoom(
    @MessageBody() data: CreateRoomDto,
    @ConnectedSocket() socket: Socket,
  ) {
    if (this.rooms[data.roomId]) {
      socket.emit('error', 'Room already exists');
      return;
    }

    const defaultDeck: Card[] = [...this.allCards.default];

    this.rooms[data.roomId] = {
      id: data.roomId,
      players: {},
      market: [],
      defaultDeck,
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
      hand: [...defaultDeck],
      deck: [...defaultDeck],
      discard: [],
    };

    socket.emit('roomCreated', { roomId: data.roomId, hand: defaultDeck });
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
        defaultDeck: [...this.allCards.default], // Add defaultDeck property
        started: false,
        turnOrder: [],
        currentTurnIndex: 0,
        party: null, // Add default value for the 'party' property
      };
      this.rooms[data.roomId] = room;
    }

    room.players[client.id] = {
      socketId: client.id,
      name: data.name,
      ready: false,
      hand: [...this.allCards.default],
      deck: [...this.allCards.default],
      discard: [],
    };

    client.join(data.roomId);

    client.emit('joinedRoom', { hand: [...this.allCards.default] });

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
    this.server
      .to(data.roomId)
      .emit('updatePlayers', Object.values(room.players));

    const allReady = Object.values(room.players).every((p) => p.ready);
    if (allReady && !room.started) {
      room.started = true;

      // Génération d'une boutique partagée de 7 cartes aléatoires
      const shuffled = [...this.allCards.non_star, ...this.allCards.star].sort(
        () => Math.random() - 0.5,
      );
      room.market = shuffled.slice(0, 7);

      // Définir l'ordre des tours
      room.turnOrder = Object.keys(room.players);
      room.currentTurnIndex = 0;

      // Notifier le premier joueur
      const currentPlayerId = room.turnOrder[room.currentTurnIndex];
      room.party = {
        guestsInHouse: [],
        houseCapacity: 5,
        isActive: true,
      };
      this.server.to(currentPlayerId).emit('yourTurn', { market: room.market });

      this.server.to(data.roomId).emit('startGame', { market: room.market });
      console.log(
        `Room ${data.roomId} started - turn order: ${room.turnOrder.join(', ')}`,
      );
    }
  }

  @SubscribeMessage('inviteGuest')
  inviteGuest(
    @MessageBody() data: { roomId: string; cardName: string },
    @ConnectedSocket() socket: Socket,
  ) {
    const room = this.rooms[data.roomId];
    if (!room?.party?.isActive) return;

    const player = room.players[socket.id];
    if (!player) return;

    // Vérifier que c'est bien le joueur actif
    if (socket.id !== room.turnOrder[room.currentTurnIndex]) {
      socket.emit('error', 'Not your turn');
      return;
    }

    // Vérifier si la carte est dans sa main
    const cardIndex = player.hand.findIndex((c) => c.name === data.cardName);
    if (cardIndex === -1) {
      socket.emit('error', 'Card not in hand');
      return;
    }

    const card = player.hand[cardIndex];

    // Ajouter à la maison
    room.party.guestsInHouse.push(card);

    // Supprimer de la main
    player.hand.splice(cardIndex, 1);

    // Vérifier les conditions d'arrêt
    const troubleCount = room.party.guestsInHouse.filter(
      (c) => c.trouble,
    ).length;
    if (troubleCount > 2) {
      // Fête stoppée par les problèmes
      room.party.isActive = false;
      this.server
        .to(socket.id)
        .emit('partyStopped', { reason: 'Trop de trouble ! Tour perdu' });
      return;
    }

    if (room.party.guestsInHouse.length > room.party.houseCapacity) {
      // Capacité dépassée (peut arriver à cause de certaines cartes)
      room.party.isActive = false;
      this.server
        .to(socket.id)
        .emit('partyStopped', { reason: 'Capacité dépassée ! Tour perdu' });
      return;
    }

    // Informer le joueur et les spectateurs
    this.server.to(socket.id).emit('handUpdate', player.hand);
    this.server.to(socket.id).emit('partyUpdate', room.party.guestsInHouse);
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
    } else {
      this.server.to(nextPlayerId).emit('yourTurn', { market: room.market });
    }
  }

  @SubscribeMessage('endParty')
  endParty(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    const room = this.rooms[data.roomId];
    if (!room?.party?.isActive) return;

    const player = room.players[socket.id];
    if (!player) return;

    room.party.isActive = false;

    const guests = room.party.guestsInHouse;
    const troubleCount = guests.filter((c) => c.trouble).length;
    const houseCapacity = room.party.houseCapacity;

    let results;
    if (troubleCount > 2 || guests.length > houseCapacity) {
      results = { popularity: 0, money: 0 }; // tour perdu
    } else {
      const popularity = guests.reduce(
        (sum, g) => sum + (Number(g.popularity) || 0),
        0,
      );
      const money = guests.reduce((sum, g) => sum + (Number(g.money) || 0), 0);

      results = { popularity, money };
    }

    this.server.to(socket.id).emit('partyResults', results);

    // Passer au joueur suivant
    room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
    const nextPlayerId = room.turnOrder[room.currentTurnIndex];
    this.server.to(nextPlayerId).emit('yourTurn', {
      hand: room.players[nextPlayerId].hand,
      houseCapacity: 5,
    });
  }
}

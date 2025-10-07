import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { UsePipes, ValidationPipe } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as fs from 'fs';
import * as path from 'path';
import { Card, CardsJson } from '../entities/card.entity';
import { Room } from '../entities/room.entity';
import { Player } from '../entities/player.entity';
import { CreateRoomDto } from '../dtos/create-room.dto';
import { JoinRoomDto } from '../dtos/join-room.dto';
import { PlayerReadyDto } from '../dtos/player-ready.dto';

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

  @UsePipes(new ValidationPipe())
  @SubscribeMessage('createRoom')
  createRoom(
    @MessageBody() data: CreateRoomDto,
    @ConnectedSocket() socket: Socket,
  ) {
    if (this.rooms[data.roomId]) {
      socket.emit('error', 'Room already exists');
      return;
    }

    // Create new entities
    const room = new Room(data.roomId);
    const initialDeck = this.createExpandedDeck(this.allCards.default);
    const playerName = data.playerName || 'Player1';
    const player = new Player(socket.id, data.roomId, playerName, initialDeck);

    // Add player to room and save the room
    room.addPlayer(player);
    this.rooms[data.roomId] = room;

    // Join socket and emit events
    socket.join(data.roomId);
    socket.emit('roomCreated', { roomId: data.roomId });
    this.server
      .to(data.roomId)
      .emit('updatePlayers', Object.values(room.players)); // Also emit player update

    console.log(`Room ${data.roomId} created by ${player.name} (${socket.id})`);
  }

  // Rejoindre room
  @UsePipes(new ValidationPipe())
  @SubscribeMessage('joinRoom')
  handleJoin(
    @MessageBody() data: JoinRoomDto,
    @ConnectedSocket() client: Socket,
  ) {
    // Find room or create it if it doesn't exist
    let room = this.rooms[data.roomId];
    if (!room) {
      room = new Room(data.roomId);
      this.rooms[data.roomId] = room;
    }

    // Create new player and add to the room
    const initialDeck = this.createExpandedDeck(this.allCards.default);
    const player = new Player(client.id, data.roomId, data.name, initialDeck);
    room.addPlayer(player);

    // Join socket and emit events
    client.join(data.roomId);
    client.emit('joinedRoom', { roomId: data.roomId }); // Send room id back
    this.server
      .to(data.roomId)
      .emit('updatePlayers', Object.values(room.players));
  }

  @UsePipes(new ValidationPipe())
  @SubscribeMessage('playerReady')
  playerReady(
    @MessageBody() data: PlayerReadyDto,
    @ConnectedSocket() socket: Socket,
  ) {
    const room = this.rooms[data.roomId];
    if (!room) {
      // Optional: handle room not found error
      return;
    }

    room.setPlayerReady(socket.id);

    // Convertir en tableau pour l’envoi
    this.server
      .to(data.roomId)
      .emit('updatePlayers', Object.values(room.players));
  }
}

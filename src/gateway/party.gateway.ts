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
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({ cors: { origin: '*' } })
export class PartyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private allCards: CardsJson;
  private rooms: Record<string, Room> = {};
  private jwtService: JwtService;

  constructor(jwtService: JwtService) {
    this.jwtService = jwtService;
    const file = path.join(__dirname, '../assets/cards.json');
    this.allCards = JSON.parse(fs.readFileSync(file, 'utf-8'))
      .cards as CardsJson;
  }

  handleConnection(socket: Socket) {
    const { userName } = socket.handshake.auth;

    // Générer un JWT basé sur l'id de socket (temporaire)
    const token = this.jwtService.sign(
      { socketId: socket.id, userName },
      { expiresIn: '6h' },
    );

    socket.data.userName = userName;
    socket.data.jwt = token;

    // Envoyer le token au client
    socket.emit('jwt', token);

    console.log(`✔️ Player connected: ${userName} (${socket.id})`);
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
    console.log('user Join');

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
    const player = room.players[socket.id];

    if (!room || !player) {
      // Optional: handle room not found error
      return;
    }

    player.toggleReady();

    // Convertir en tableau pour l’envoi
    this.server
      .to(data.roomId)
      .emit('updatePlayers', Object.values(room.players));

    if (
      Object.values(room.players).every((p) => p.ready) &&
      Object.values(room.players).length >= 1
    ) {
      this.server.to(data.roomId).emit('startGame', room);

      room.initTurnOrder();
      const firstPlayer = room.getCurrentPlayer();
      firstPlayer.initializeRound();

      this.server.to(room.id).emit('updateRoom', room);
      this.server.to(firstPlayer.socketId).emit('yourTurn');
    }
  }

  @SubscribeMessage('startRound')
  initRound(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    const room = this.rooms[data.roomId];
    const player = room.players[socket.id];

    if (!room || !player) {
      // Optional: handle room not found error
      return;
    }

    this.server.to(data.roomId).emit('updateRoom', room);

    this.server
      .to(data.roomId)
      .emit('updatePlayers', Object.values(room.players));
  }

  @SubscribeMessage('inviteGuest')
  inviteGuest(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    const room = this.rooms[data.roomId];
    const player = room.players[socket.id];

    if (!room || !player) {
      // Optional: handle room not found error
      return;
    }

    const card = player.drawCards();
    console.log(card);

    player.addCard(card);
    console.log(player);

    this.server.to(room.id).emit('updatePlayers', Object.values(room.players));

    if (player.used.length > player.houseCapacity) {
      this.server
        .to(room.id)
        .emit('lostRound', { message: "Trop de monde, c'est perdu !" });
      return;
    }

    if (player.used.filter((c) => c.trouble === true).length > 2) {
      this.server
        .to(room.id)
        .emit('lostRound', { message: "trop de trouble, c'est perdu !" });
      return;
    }

    if (player.used.length === player.houseCapacity) {
      this.endDrawPhase({ roomId: data.roomId }, socket);
    }
  }

  @SubscribeMessage('toggleMarket')
  endDrawPhase(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    console.log('togglemarket');

    this.server.to(data.roomId).emit('toggleMarket');
  }

  @SubscribeMessage('nextPlayer')
  nextPlayer(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    const room = this.rooms[data.roomId];
    if (!room) return;

    const currentPlayer = room.getCurrentPlayer();

    const next = room.nextPlayer();
    next.initializeRound();

    // Notifie le joueur suivant
    this.server.to(next.socketId).emit('yourTurn');

    // Met à jour la room pour tous
    this.server.to(data.roomId).emit('updateRoom', room);
  }
}

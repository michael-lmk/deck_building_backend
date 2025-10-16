import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
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
import { WsJwtGuard } from 'src/auth/jwt-ws.guard';

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

  getRoom(roomId: string): Room | undefined {
    return this.rooms[roomId];
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

  @SubscribeMessage('playerReady')
  handlePlayerReady(
    @MessageBody() data: { roomId: string; playerName: string },
    @ConnectedSocket() socket: Socket,
  ) {
    const room = this.rooms[data.roomId];
    if (!room) return;

    const player = room.players[socket.id];
    if (!player) return;

    player.toggleReady();

    // Vérifie si tous les joueurs sont prêts
    const allReady = Object.values(room.players).every((p) => p.ready);

    if (allReady) {
      //  Démarre la partie
      room.started = true;
      room.initTurnOrder();

      // Génère le market
      room.market = room.generateInitialMarket(this.allCards);

      // Initialise chaque joueur pour le round
      Object.values(room.players).forEach((p) => p.initializeRound());

      // Notifie tous les joueurs que la partie commence
      this.server.to(room.id).emit('startGame', { market: room.market });

      //  Lance le premier tour
      this.server.to(room.id).emit('updateRoom', room);
      const currentPlayer = room.getCurrentPlayer();
      this.server
        .to(room.id)
        .emit('yourTurn', { socketId: currentPlayer.socketId });
    }

    // Met à jour les joueurs
    this.server.to(room.id).emit('updatePlayers', Object.values(room.players));
  }

  @SubscribeMessage('inviteGuest')
  inviteGuest(
    @MessageBody() data: { roomId: string; isAuto?: boolean },
    @ConnectedSocket() socket: Socket,
  ) {
    const room = this.rooms[data.roomId];
    const player = room?.players[socket.id];
    if (!room || !player) return;

    const isAuto = !!data.isAuto;

    // bloque le spam manuel concurrent
    if (!isAuto && !player.lockManualAction()) {
      return;
    }

    const card = player.drawCards();
    if (!card) return socket.emit('noCard');

    const result = player.tryAddCard(card, { allowOverflow: isAuto });

    if (result.success) {
      this.server
        .to(room.id)
        .emit('updatePlayers', Object.values(room.players));

      if (player.used.length === player.houseCapacity) {
        this.endDrawPhase({ roomId: data.roomId }, socket);
      }
    } else if (result.reason) {
      // perte déclenchée
      this.server
        .to(room.id)
        .emit('updatePlayers', Object.values(room.players));
      this.server.to(room.id).emit('lostRound', { message: result.reason });
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('toggleMarket')
  endDrawPhase(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    console.log('togglemarket');
    const room = this.rooms[data.roomId];
    const player = room.getCurrentPlayer();

    player.countScore();
    this.server.to(data.roomId).emit('toggleMarket');
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('toggleLost')
  toggleLostModal(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    this.server.to(data.roomId).emit('lostRound');
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('nextPlayer')
  nextPlayer(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    const room = this.rooms[data.roomId];
    if (!room) return;

    const currentPlayer = room.getCurrentPlayer();
    currentPlayer.initializeRound();

    const next = room.nextPlayer();
    next.initializeRound();

    console.log('turn of : ', next.socketId);

    // Notifie le joueur suivant
    this.server.to(next.socketId).emit('yourTurn');

    // Met à jour la room pour tous
    this.server.to(data.roomId).emit('updateRoom', room);
  }
}

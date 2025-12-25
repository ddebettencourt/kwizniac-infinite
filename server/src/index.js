import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomManager } from './rooms.js';
import { GameManager } from './game.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Allow all origins in production (Railway handles this)
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || true,
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Serve static files from client build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
}

const roomManager = new RoomManager();
const gameManager = new GameManager(io, roomManager);

// REST endpoints for room listing
app.get('/api/rooms', (req, res) => {
  res.json(roomManager.getPublicRooms());
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Join a room
  socket.on('join-room', ({ roomId, nickname }) => {
    const result = roomManager.joinRoom(roomId, socket.id, nickname);
    if (result.success) {
      socket.join(roomId);
      socket.roomId = roomId;
      socket.nickname = nickname;

      const room = roomManager.getRoom(roomId);

      // Notify everyone in the room
      io.to(roomId).emit('room-update', room);
      socket.emit('join-success', { room, playerId: socket.id });

      // If joining mid-game, send them the current game state
      if (result.joinedMidGame) {
        const currentGameState = gameManager.getCurrentGameState(roomId);
        if (currentGameState) {
          // First tell them the game has started so they enter game mode
          socket.emit('game-started', { gameMode: currentGameState.gameMode });

          // Then send them the current game state
          socket.emit('mid-game-sync', currentGameState);
        }
      }
    } else {
      socket.emit('join-error', { message: result.message });
    }
  });

  // Create a room
  socket.on('create-room', ({ roomName, nickname, settings }) => {
    const room = roomManager.createRoom(roomName, socket.id, nickname, settings);
    socket.join(room.id);
    socket.roomId = room.id;
    socket.nickname = nickname;

    socket.emit('room-created', { room, playerId: socket.id });
    // Also emit room-update so the Room page gets the initial state
    socket.emit('room-update', room);
    io.emit('rooms-updated', roomManager.getPublicRooms());
  });

  // Host starts the game
  socket.on('start-game', () => {
    const room = roomManager.getRoom(socket.roomId);
    if (room && room.hostId === socket.id) {
      gameManager.startGame(socket.roomId);
    }
  });

  // Host reveals next clue
  socket.on('reveal-clue', () => {
    const room = roomManager.getRoom(socket.roomId);
    if (room && room.hostId === socket.id) {
      gameManager.revealNextClue(socket.roomId);
    }
  });

  // Host skips to next question
  socket.on('next-question', () => {
    const room = roomManager.getRoom(socket.roomId);
    if (room && room.hostId === socket.id) {
      gameManager.nextQuestion(socket.roomId);
    }
  });

  // Player buzzes in
  socket.on('buzz', () => {
    gameManager.handleBuzz(socket.roomId, socket.id, socket.nickname);
  });

  // Player submits answer
  socket.on('submit-answer', ({ answer }) => {
    gameManager.handleAnswer(socket.roomId, socket.id, answer);
  });

  // Custom Mode: Picker submits their answer
  socket.on('submit-picker-answer', ({ answer }) => {
    gameManager.handlePickerSubmit(socket.roomId, socket.id, answer);
  });

  // Host kicks a player
  socket.on('kick-player', ({ playerId }) => {
    const room = roomManager.getRoom(socket.roomId);
    if (room && room.hostId === socket.id && playerId !== socket.id) {
      const kickedSocket = io.sockets.sockets.get(playerId);
      if (kickedSocket) {
        kickedSocket.leave(socket.roomId);
        kickedSocket.emit('kicked');
        roomManager.removePlayer(socket.roomId, playerId);
        io.to(socket.roomId).emit('room-update', roomManager.getRoom(socket.roomId));
      }
    }
  });

  // Update room settings
  socket.on('update-settings', ({ settings }) => {
    const room = roomManager.getRoom(socket.roomId);
    if (room && room.hostId === socket.id) {
      roomManager.updateSettings(socket.roomId, settings);
      io.to(socket.roomId).emit('room-update', roomManager.getRoom(socket.roomId));
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    if (socket.roomId) {
      const wasHost = roomManager.removePlayer(socket.roomId, socket.id);
      const room = roomManager.getRoom(socket.roomId);

      if (room) {
        io.to(socket.roomId).emit('room-update', room);
        if (wasHost) {
          io.to(socket.roomId).emit('host-changed', { newHostId: room.hostId });
        }
      }

      io.emit('rooms-updated', roomManager.getPublicRooms());
    }
  });
});

// Catch-all route for client-side routing in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Kwizniac server running on port ${PORT}`);
});

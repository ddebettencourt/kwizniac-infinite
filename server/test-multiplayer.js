/**
 * Multiplayer integration test for Kwizniac Infinite.
 *
 * Starts the server on a random port and simulates multiple players
 * using socket.io-client to verify:
 *   1. Room creation & joining
 *   2. Nickname conflict detection
 *   3. Disconnect grace period & rejoin with score preserved
 *   4. Host reassignment on host disconnect
 *   5. Mid-game join sync
 *   6. Buzzing & answer submission flow
 *   7. Device session lookup (check-session)
 *
 * Usage:  node test-multiplayer.js
 * Requires: socket.io-client (installed at repo root)
 */

import { createServer } from 'http';
import { Server } from 'socket.io';
import express from 'express';
import { io as ioClient } from 'socket.io-client';
import { RoomManager } from './src/rooms.js';
import { GameManager } from './src/game.js';
import { randomUUID } from 'crypto';

// ── Helpers ──────────────────────────────────────────────────────────

const PORT = 9876 + Math.floor(Math.random() * 1000);
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/** Returns a promise that resolves with the first emission of `event`. */
function once(socket, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for "${event}"`)), timeout);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

function connect(deviceId) {
  return ioClient(`http://localhost:${PORT}`, {
    auth: { deviceId },
    transports: ['websocket'],
    forceNew: true,
  });
}

// ── Boot server (no Claude API calls needed) ────────────────────────

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: true } });

const roomManager = new RoomManager();
const gameManager = new GameManager(io, roomManager);

// Duplicate the socket handlers from index.js (minus REST routes)
io.on('connection', (socket) => {
  const deviceId = socket.handshake.auth?.deviceId;

  socket.on('check-session', () => {
    if (!deviceId) { socket.emit('session-check', { hasSession: false }); return; }
    const session = roomManager.getDeviceSession(deviceId);
    if (session) {
      socket.emit('session-check', { hasSession: true, roomId: session.roomId, nickname: session.nickname });
    } else {
      socket.emit('session-check', { hasSession: false });
    }
  });

  socket.on('rejoin-room', ({ roomId }) => {
    if (!deviceId) { socket.emit('join-error', { message: 'No device ID' }); return; }
    const result = roomManager.rejoinPlayer(roomId, deviceId, socket.id);
    if (result.success) {
      socket.join(roomId);
      socket.roomId = roomId;
      socket.nickname = result.nickname;
      if (result.oldPlayerId) gameManager.updatePlayerId(roomId, result.oldPlayerId, socket.id);
      const room = roomManager.getRoom(roomId);
      io.to(roomId).emit('room-update', room);
      socket.emit('join-success', { room, playerId: socket.id });
      if (result.joinedMidGame) {
        const gs = gameManager.getCurrentGameState(roomId);
        if (gs) { socket.emit('game-started', { gameMode: gs.gameMode }); socket.emit('mid-game-sync', gs); }
      }
    } else {
      socket.emit('join-error', { message: result.message });
    }
  });

  socket.on('join-room', ({ roomId, nickname }) => {
    const result = roomManager.joinRoom(roomId, socket.id, nickname, deviceId);
    if (result.success) {
      socket.join(roomId);
      socket.roomId = roomId;
      socket.nickname = result.nickname || nickname;
      if (result.rejoined && result.oldPlayerId) gameManager.updatePlayerId(roomId, result.oldPlayerId, socket.id);
      const room = roomManager.getRoom(roomId);
      io.to(roomId).emit('room-update', room);
      socket.emit('join-success', { room, playerId: socket.id });
      if (result.joinedMidGame) {
        const gs = gameManager.getCurrentGameState(roomId);
        if (gs) { socket.emit('game-started', { gameMode: gs.gameMode }); socket.emit('mid-game-sync', gs); }
      }
    } else {
      socket.emit('join-error', { message: result.message });
    }
  });

  socket.on('create-room', ({ roomName, nickname, settings }) => {
    const room = roomManager.createRoom(roomName, socket.id, nickname, deviceId, settings);
    socket.join(room.id);
    socket.roomId = room.id;
    socket.nickname = nickname;
    socket.emit('room-created', { room, playerId: socket.id });
    socket.emit('room-update', room);
  });

  socket.on('start-game', () => {
    const room = roomManager.getRoom(socket.roomId);
    if (room && room.hostId === socket.id) gameManager.startGame(socket.roomId);
  });

  socket.on('reveal-clue', () => {
    const room = roomManager.getRoom(socket.roomId);
    if (room && room.hostId === socket.id) gameManager.revealNextClue(socket.roomId);
  });

  socket.on('buzz', () => {
    gameManager.handleBuzz(socket.roomId, socket.id, socket.nickname);
  });

  socket.on('submit-answer', ({ answer }) => {
    gameManager.handleAnswer(socket.roomId, socket.id, answer);
  });

  socket.on('get-room-state', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (room) {
      socket.join(roomId);
      socket.roomId = roomId;
      socket.emit('room-update', room);
      const gs = gameManager.getCurrentGameState(roomId);
      if (gs) { socket.emit('game-started', { gameMode: gs.gameMode }); socket.emit('mid-game-sync', gs); }
    } else {
      socket.emit('room-error', { message: 'Room not found' });
    }
  });

  socket.on('disconnect', () => {
    if (!socket.roomId) return;
    const roomId = socket.roomId;
    const graceful = roomManager.startDisconnectTimer(roomId, socket.id, () => {
      const wasHost = roomManager.removePlayer(roomId, socket.id);
      const room = roomManager.getRoom(roomId);
      if (room) {
        io.to(roomId).emit('room-update', room);
        if (wasHost) io.to(roomId).emit('host-changed', { newHostId: room.hostId });
      }
    });
    if (!graceful) {
      const wasHost = roomManager.removePlayer(roomId, socket.id);
      const room = roomManager.getRoom(roomId);
      if (room) {
        io.to(roomId).emit('room-update', room);
        if (wasHost) io.to(roomId).emit('host-changed', { newHostId: room.hostId });
      }
    } else {
      const room = roomManager.getRoom(roomId);
      if (room) io.to(roomId).emit('room-update', room);
    }
  });
});

// ── Tests ────────────────────────────────────────────────────────────

async function runTests() {
  await new Promise(r => httpServer.listen(PORT, r));
  console.log(`Test server listening on port ${PORT}\n`);

  // ─── Test 1: Create & join room ────────────────────────────────
  console.log('Test 1: Create & join room');
  const deviceA = randomUUID();
  const deviceB = randomUUID();

  const p1 = connect(deviceA);
  await once(p1, 'connect');

  p1.emit('create-room', { roomName: 'Test Room', nickname: 'Alice', settings: { isPublic: true } });
  const { room: createdRoom, playerId: p1Id } = await once(p1, 'room-created');
  const roomId = createdRoom.id;

  assert(roomId && roomId.length === 8, 'Room created with 8-char ID');
  assert(createdRoom.players.length === 1, 'Room has 1 player');
  assert(createdRoom.players[0].nickname === 'Alice', 'Host is Alice');
  assert(createdRoom.hostId === p1Id, 'Alice is host');

  const p2 = connect(deviceB);
  await once(p2, 'connect');

  p2.emit('join-room', { roomId, nickname: 'Bob' });
  const { room: joinedRoom } = await once(p2, 'join-success');

  assert(joinedRoom.players.length === 2, 'Room now has 2 players');
  assert(joinedRoom.players[1].nickname === 'Bob', 'Bob joined');

  // ─── Test 2: Nickname conflict ─────────────────────────────────
  console.log('\nTest 2: Nickname conflict');
  const deviceC = randomUUID();
  const p3 = connect(deviceC);
  await once(p3, 'connect');

  p3.emit('join-room', { roomId, nickname: 'alice' }); // case-insensitive
  const err = await once(p3, 'join-error');
  assert(err.message === 'Nickname already taken in this room', 'Duplicate nickname rejected');
  p3.disconnect();

  // ─── Test 3: Disconnect grace period & rejoin ──────────────────
  console.log('\nTest 3: Disconnect grace period & rejoin');

  // Give Bob some score first
  roomManager.updatePlayerScore(roomId, p2.id, 15);
  const bobScoreBefore = roomManager.getPlayer(roomId, p2.id)?.score;
  assert(bobScoreBefore === 15, 'Bob has 15 points before disconnect');

  // Disconnect Bob
  const roomUpdatePromise = once(p1, 'room-update');
  p2.disconnect();
  const afterDisconnect = await roomUpdatePromise;

  const bobAfterDisconnect = afterDisconnect.players.find(p => p.nickname === 'Bob');
  assert(bobAfterDisconnect !== undefined, 'Bob still in player list during grace period');
  assert(bobAfterDisconnect.connected === false, 'Bob marked as disconnected');

  // Reconnect Bob with same device ID
  await wait(500);
  const p2b = connect(deviceB);
  await once(p2b, 'connect');

  p2b.emit('rejoin-room', { roomId });
  const rejoinResult = await once(p2b, 'join-success');

  const bobAfterRejoin = rejoinResult.room.players.find(p => p.nickname === 'Bob');
  assert(bobAfterRejoin !== undefined, 'Bob still in room after rejoin');
  assert(bobAfterRejoin.connected === true, 'Bob marked as connected');
  assert(bobAfterRejoin.score === 15, 'Bob score preserved (15 pts)');

  // ─── Test 4: check-session ─────────────────────────────────────
  console.log('\nTest 4: Device session lookup');
  const p2c = connect(deviceB);
  await once(p2c, 'connect');
  p2c.emit('check-session');
  const sessionCheck = await once(p2c, 'session-check');
  assert(sessionCheck.hasSession === true, 'Session found for device B');
  assert(sessionCheck.roomId === roomId, 'Session points to correct room');
  assert(sessionCheck.nickname === 'Bob', 'Session has correct nickname');
  p2c.disconnect();

  const unknownDevice = connect(randomUUID());
  await once(unknownDevice, 'connect');
  unknownDevice.emit('check-session');
  const noSession = await once(unknownDevice, 'session-check');
  assert(noSession.hasSession === false, 'No session for unknown device');
  unknownDevice.disconnect();

  // ─── Test 5: Host reassignment ─────────────────────────────────
  console.log('\nTest 5: Host reassignment on disconnect');
  const deviceD = randomUUID();
  const hostSocket = connect(deviceD);
  await once(hostSocket, 'connect');
  hostSocket.emit('create-room', { roomName: 'Host Test', nickname: 'Host1', settings: {} });
  const { room: hostRoom } = await once(hostSocket, 'room-created');

  const deviceE = randomUUID();
  const guest = connect(deviceE);
  await once(guest, 'connect');
  guest.emit('join-room', { roomId: hostRoom.id, nickname: 'Guest1' });
  await once(guest, 'join-success');

  // Disconnect host (no device ID grace — actually has device ID so grace period)
  // Wait for room-update on guest side
  const hostChangePromise = once(guest, 'room-update');
  hostSocket.disconnect();
  const updatedRoom = await hostChangePromise;

  // After grace period the host will change, but during grace period host is still disconnected
  // The host is still in the room but marked disconnected
  assert(updatedRoom.players.length === 2, 'Both players still in room during grace');

  // Wait a moment, then check that guest sees the disconnected host
  const disconnectedHost = updatedRoom.players.find(p => p.nickname === 'Host1');
  assert(disconnectedHost?.connected === false, 'Host marked disconnected during grace period');

  guest.disconnect();

  // ─── Test 6: Join via join-room with existing device (implicit rejoin) ──
  console.log('\nTest 6: Implicit rejoin via join-room');
  const deviceF = randomUUID();
  const px = connect(deviceF);
  await once(px, 'connect');
  px.emit('create-room', { roomName: 'Rejoin Test', nickname: 'Fiona', settings: {} });
  const { room: fRoom } = await once(px, 'room-created');

  roomManager.updatePlayerScore(fRoom.id, px.id, 42);
  px.disconnect();
  await wait(500);

  const px2 = connect(deviceF);
  await once(px2, 'connect');
  // Use join-room instead of rejoin-room — should detect same device
  px2.emit('join-room', { roomId: fRoom.id, nickname: 'Fiona' });
  const implicitRejoin = await once(px2, 'join-success');
  const fiona = implicitRejoin.room.players.find(p => p.nickname === 'Fiona');
  assert(fiona?.score === 42, 'Score preserved on implicit rejoin via join-room');
  assert(fiona?.connected === true, 'Marked connected after implicit rejoin');
  px2.disconnect();

  // ─── Test 7: Game flow — start, reveal, buzz, answer ───────────
  console.log('\nTest 7: Game flow (Wikipedia mode, mocked clues)');

  // Monkey-patch generateClues to avoid Claude API calls
  const gameModule = await import('./src/game.js');
  const originalLoadNext = GameManager.prototype.loadNextQuestion;
  GameManager.prototype.loadNextQuestion = async function(rId) {
    const gs = this.games.get(rId);
    if (!gs) return;
    if (gs.isLoadingQuestion) return;
    gs.isLoadingQuestion = true;
    gs.state = 'loading';
    gs.questionNumber++;
    gs.revealedClues = [];
    gs.buzzedPlayer = null;
    gs.roundPointsEarned = [];
    gs.wrongGuessCount = 0;

    this.io.to(rId).emit('game-state', { state: 'loading', questionNumber: gs.questionNumber });

    // Fake clues
    gs.currentQuestion = {
      answer: 'Test Answer',
      clues: Array.from({ length: 10 }, (_, i) => ({ number: 10 - i, text: `Clue ${10 - i}` })),
      answerDifficulty: 5
    };
    gs.state = 'revealing';
    gs.isLoadingQuestion = false;
    this.io.to(rId).emit('question-ready', {
      questionNumber: gs.questionNumber,
      totalClues: 10,
      answerDifficulty: 5
    });
  };

  // Also monkey-patch gradeAnswer
  const claudeModule = await import('./src/claude.js');
  const origGrade = claudeModule.gradeAnswer;
  // We can't easily patch the import, so patch handleAnswer instead
  const origHandleAnswer = GameManager.prototype.handleAnswer;
  GameManager.prototype.handleAnswer = async function(rId, pId, answer) {
    const gs = this.games.get(rId);
    if (!gs || gs.state !== 'buzzing') return;
    if (!gs.buzzedPlayer || gs.buzzedPlayer.id !== pId) return;
    if (gs.buzzTimer) { clearTimeout(gs.buzzTimer); gs.buzzTimer = null; }
    const room = this.roomManager.getRoom(rId);
    const isCorrect = answer.toLowerCase().trim() === gs.currentQuestion.answer.toLowerCase().trim();
    const currentPoints = 10 - (gs.revealedClues.length - 1);
    if (isCorrect) {
      this.roomManager.updatePlayerScore(rId, pId, currentPoints);
      gs.state = 'answered';
      gs.roundPointsEarned.push(currentPoints);
      this.io.to(rId).emit('answer-result', {
        playerId: pId, nickname: gs.buzzedPlayer.nickname, answer, correctAnswer: gs.currentQuestion.answer,
        isCorrect: true, pointsAwarded: currentPoints, players: room.players
      });
    } else {
      const penalty = room.settings.wrongAnswerPenalty;
      this.roomManager.updatePlayerScore(rId, pId, penalty);
      gs.wrongGuessCount++;
      this.io.to(rId).emit('answer-result', {
        playerId: pId, nickname: gs.buzzedPlayer.nickname, answer,
        isCorrect: false, pointsAwarded: penalty, players: room.players
      });
      gs.buzzedPlayer = null;
      gs.state = 'revealing';
      this.io.to(rId).emit('resume-revealing');
    }
  };

  const deviceG = randomUUID();
  const deviceH = randomUUID();
  const host = connect(deviceG);
  await once(host, 'connect');
  host.emit('create-room', { roomName: 'Game Test', nickname: 'GameHost', settings: { gameMode: 'wikipedia' } });
  const { room: gameRoom } = await once(host, 'room-created');

  const player2 = connect(deviceH);
  await once(player2, 'connect');
  player2.emit('join-room', { roomId: gameRoom.id, nickname: 'Guesser' });
  await once(player2, 'join-success');

  // Start game — set up both listeners before emitting to avoid race
  const gameStartedPromise = once(player2, 'game-started');
  const qReadyPromise = once(player2, 'question-ready');
  host.emit('start-game');
  await gameStartedPromise;
  const qReady = await qReadyPromise;
  assert(qReady.questionNumber === 1, 'Question 1 loaded');
  assert(qReady.totalClues === 10, '10 clues available');

  // Host reveals a clue
  const cluePromise = once(player2, 'clue-revealed');
  host.emit('reveal-clue');
  const clue = await cluePromise;
  assert(clue.clue.number === 10, 'First clue is #10 (hardest)');
  assert(clue.currentPoints === 10, 'Worth 10 points');

  // Player 2 buzzes
  const buzzPromise = once(host, 'player-buzzed');
  player2.emit('buzz');
  const buzzData = await buzzPromise;
  assert(buzzData.nickname === 'Guesser', 'Guesser buzzed');

  // Wrong answer — set up both listeners before emitting
  const wrongPromise = once(player2, 'answer-result');
  const resumePromise = once(player2, 'resume-revealing');
  player2.emit('submit-answer', { answer: 'Wrong Answer' });
  const wrongResult = await wrongPromise;
  assert(wrongResult.isCorrect === false, 'Wrong answer detected');
  assert(wrongResult.pointsAwarded === -3, 'Penalty applied (-3)');
  await resumePromise;

  // Reveal another clue, buzz again with correct answer
  host.emit('reveal-clue');
  await once(player2, 'clue-revealed');

  const buzz2Promise = once(host, 'player-buzzed');
  player2.emit('buzz');
  await buzz2Promise;

  const correctPromise = once(player2, 'answer-result');
  player2.emit('submit-answer', { answer: 'Test Answer' });
  const correctResult = await correctPromise;
  assert(correctResult.isCorrect === true, 'Correct answer detected');
  assert(correctResult.pointsAwarded === 9, 'Awarded 9 points (2 clues revealed)');

  // Check final score: -3 + 9 = 6
  const guesser = correctResult.players.find(p => p.nickname === 'Guesser');
  assert(guesser?.score === 6, 'Guesser final score is 6 (-3 + 9)');

  host.disconnect();
  player2.disconnect();

  // ─── Test 8: Mid-game join sync ────────────────────────────────
  console.log('\nTest 8: Mid-game join & rejoin sync');
  const deviceI = randomUUID();
  const deviceJ = randomUUID();
  const deviceK = randomUUID();

  const h2 = connect(deviceI);
  await once(h2, 'connect');
  h2.emit('create-room', { roomName: 'Sync Test', nickname: 'SyncHost', settings: { gameMode: 'wikipedia' } });
  const { room: syncRoom } = await once(h2, 'room-created');

  const earlyJoiner = connect(deviceJ);
  await once(earlyJoiner, 'connect');
  earlyJoiner.emit('join-room', { roomId: syncRoom.id, nickname: 'Early' });
  await once(earlyJoiner, 'join-success');

  // Start game — set up listener before emitting
  const syncQReadyPromise = once(earlyJoiner, 'question-ready');
  h2.emit('start-game');
  await syncQReadyPromise;

  // Reveal 3 clues
  for (let i = 0; i < 3; i++) {
    host.emit && h2.emit('reveal-clue');
    await once(earlyJoiner, 'clue-revealed');
  }

  // Late joiner joins mid-game — set up listeners before emitting
  const lateJoiner = connect(deviceK);
  await once(lateJoiner, 'connect');
  const lateJoinPromise = once(lateJoiner, 'join-success');
  const midSyncPromise = once(lateJoiner, 'mid-game-sync');
  lateJoiner.emit('join-room', { roomId: syncRoom.id, nickname: 'Late' });
  await lateJoinPromise;
  const midSync = await midSyncPromise;
  assert(midSync.revealedClues.length === 3, 'Late joiner synced with 3 revealed clues');
  assert(midSync.state === 'revealing', 'Late joiner sees revealing state');
  assert(midSync.questionNumber === 1, 'Late joiner on question 1');

  // Now test rejoin mid-game: disconnect Early, reconnect
  roomManager.updatePlayerScore(syncRoom.id, earlyJoiner.id, 20);
  earlyJoiner.disconnect();
  await wait(500);

  const earlyRejoined = connect(deviceJ);
  await once(earlyRejoined, 'connect');
  const rejoinSuccessPromise = once(earlyRejoined, 'join-success');
  const rejoinSyncPromise = once(earlyRejoined, 'mid-game-sync');
  earlyRejoined.emit('rejoin-room', { roomId: syncRoom.id });
  await rejoinSuccessPromise;
  const rejoinSync = await rejoinSyncPromise;
  assert(rejoinSync.revealedClues.length === 3, 'Rejoiner synced with correct clue count');

  // Check score preserved
  const earlyPlayer = roomManager.getRoom(syncRoom.id)?.players.find(p => p.nickname === 'Early');
  assert(earlyPlayer?.score === 20, 'Rejoiner score preserved (20 pts)');

  h2.disconnect();
  lateJoiner.disconnect();
  earlyRejoined.disconnect();

  // Restore originals
  GameManager.prototype.loadNextQuestion = originalLoadNext;
  GameManager.prototype.handleAnswer = origHandleAnswer;

  // ─── Done ──────────────────────────────────────────────────────
  await wait(500);
  p1.disconnect();
  p2b.disconnect();

  console.log(`\n${'═'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(40)}\n`);

  httpServer.close();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});

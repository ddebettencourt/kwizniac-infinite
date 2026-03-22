import { v4 as uuidv4 } from 'uuid';

const DISCONNECT_GRACE_PERIOD = 60000; // 60 seconds to rejoin

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.disconnectTimers = new Map(); // `${roomId}:${deviceId}` -> timeout
    // deviceId -> { roomId, nickname } for quick lookup on reconnect
    this.deviceSessions = new Map();
  }

  createRoom(name, hostId, hostNickname, deviceId, settings = {}) {
    const roomId = uuidv4().slice(0, 8).toUpperCase();
    const room = {
      id: roomId,
      name: name || `Room ${roomId}`,
      hostId,
      players: [{
        id: hostId,
        nickname: hostNickname,
        deviceId,
        score: 0,
        isHost: true,
        connected: true
      }],
      settings: {
        wrongAnswerPenalty: settings.wrongAnswerPenalty ?? -3,
        isPublic: settings.isPublic ?? true,
        gameMode: settings.gameMode ?? 'wikipedia',
        ...settings
      },
      state: 'lobby',
      createdAt: Date.now()
    };

    this.rooms.set(roomId, room);

    if (deviceId) {
      this.deviceSessions.set(deviceId, { roomId, nickname: hostNickname });
    }

    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  getPublicRooms() {
    const publicRooms = [];
    for (const room of this.rooms.values()) {
      if (room.settings.isPublic && room.state !== 'finished') {
        publicRooms.push({
          id: room.id,
          name: room.name,
          playerCount: room.players.filter(p => p.connected).length,
          hostNickname: room.players.find(p => p.isHost)?.nickname || 'Unknown',
          inProgress: room.state === 'playing'
        });
      }
    }
    return publicRooms;
  }

  joinRoom(roomId, playerId, nickname, deviceId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, message: 'Room not found' };
    }

    if (room.state === 'finished') {
      return { success: false, message: 'Game has already ended' };
    }

    // Check if this device is already in the room (rejoin case)
    if (deviceId) {
      const existing = room.players.find(p => p.deviceId === deviceId);
      if (existing) {
        return this.rejoinPlayer(roomId, deviceId, playerId);
      }
    }

    // Check if nickname is taken in this room (only by connected players)
    if (room.players.some(p => p.nickname.toLowerCase() === nickname.toLowerCase() && p.connected)) {
      return { success: false, message: 'Nickname already taken in this room' };
    }

    const joinedMidGame = room.state === 'playing';

    room.players.push({
      id: playerId,
      nickname,
      deviceId,
      score: 0,
      isHost: false,
      connected: true
    });

    if (deviceId) {
      this.deviceSessions.set(deviceId, { roomId, nickname });
    }

    return { success: true, joinedMidGame };
  }

  // Rejoin an existing player with a new socket ID
  rejoinPlayer(roomId, deviceId, newPlayerId) {
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, message: 'Room not found' };

    const player = room.players.find(p => p.deviceId === deviceId);
    if (!player) return { success: false, message: 'Player not found' };

    const oldPlayerId = player.id;
    player.id = newPlayerId;
    player.connected = true;

    // Cancel any pending disconnect timer
    const timerKey = `${roomId}:${deviceId}`;
    const timer = this.disconnectTimers.get(timerKey);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(timerKey);
    }

    // If this player was host, restore host
    if (room.hostId === oldPlayerId) {
      room.hostId = newPlayerId;
    }

    const joinedMidGame = room.state === 'playing';
    console.log(`[${roomId}] Player "${player.nickname}" rejoined (${oldPlayerId} -> ${newPlayerId}), score: ${player.score}`);

    return { success: true, rejoined: true, joinedMidGame, oldPlayerId, nickname: player.nickname };
  }

  // Find a player's active session by device ID
  getDeviceSession(deviceId) {
    const session = this.deviceSessions.get(deviceId);
    if (!session) return null;

    const room = this.rooms.get(session.roomId);
    if (!room) {
      this.deviceSessions.delete(deviceId);
      return null;
    }

    const player = room.players.find(p => p.deviceId === deviceId);
    if (!player) {
      this.deviceSessions.delete(deviceId);
      return null;
    }

    return { roomId: session.roomId, nickname: session.nickname, player };
  }

  // Start graceful disconnect - player has a grace period to rejoin
  startDisconnectTimer(roomId, playerId, onExpire) {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const player = room.players.find(p => p.id === playerId);
    if (!player) return false;

    player.connected = false;
    const deviceId = player.deviceId;

    if (deviceId) {
      const timerKey = `${roomId}:${deviceId}`;
      // Clear any existing timer
      const existing = this.disconnectTimers.get(timerKey);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(() => {
        this.disconnectTimers.delete(timerKey);
        onExpire();
      }, DISCONNECT_GRACE_PERIOD);

      this.disconnectTimers.set(timerKey, timer);
      console.log(`[${roomId}] Player "${player.nickname}" disconnected, ${DISCONNECT_GRACE_PERIOD / 1000}s grace period started`);
      return true;
    }

    // No device ID - remove immediately
    return false;
  }

  removePlayer(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const player = room.players.find(p => p.id === playerId);
    const wasHost = room.hostId === playerId;

    // Clean up device session
    if (player?.deviceId) {
      this.deviceSessions.delete(player.deviceId);
      const timerKey = `${roomId}:${player.deviceId}`;
      const timer = this.disconnectTimers.get(timerKey);
      if (timer) {
        clearTimeout(timer);
        this.disconnectTimers.delete(timerKey);
      }
    }

    room.players = room.players.filter(p => p.id !== playerId);

    // If room is empty, delete it
    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      return wasHost;
    }

    // If host left, assign new host (prefer connected players)
    if (wasHost && room.players.length > 0) {
      const newHost = room.players.find(p => p.connected) || room.players[0];
      room.hostId = newHost.id;
      newHost.isHost = true;
    }

    return wasHost;
  }

  updateSettings(roomId, settings) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.settings = { ...room.settings, ...settings };
    }
  }

  updateRoomState(roomId, state) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.state = state;
    }
  }

  updatePlayerScore(roomId, playerId, scoreChange) {
    const room = this.rooms.get(roomId);
    if (room) {
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        player.score += scoreChange;
      }
    }
  }

  getPlayer(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (room) {
      return room.players.find(p => p.id === playerId);
    }
    return null;
  }
}

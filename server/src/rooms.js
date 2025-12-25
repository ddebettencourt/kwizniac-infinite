import { v4 as uuidv4 } from 'uuid';

export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(name, hostId, hostNickname, settings = {}) {
    const roomId = uuidv4().slice(0, 8).toUpperCase();
    const room = {
      id: roomId,
      name: name || `Room ${roomId}`,
      hostId,
      players: [{
        id: hostId,
        nickname: hostNickname,
        score: 0,
        isHost: true
      }],
      settings: {
        wrongAnswerPenalty: settings.wrongAnswerPenalty ?? -3,
        isPublic: settings.isPublic ?? true,
        gameMode: settings.gameMode ?? 'wikipedia', // 'wikipedia' or 'custom'
        ...settings
      },
      state: 'lobby', // lobby, playing, finished
      createdAt: Date.now()
    };

    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  getPublicRooms() {
    const publicRooms = [];
    for (const room of this.rooms.values()) {
      if (room.settings.isPublic && room.state === 'lobby') {
        publicRooms.push({
          id: room.id,
          name: room.name,
          playerCount: room.players.length,
          hostNickname: room.players.find(p => p.isHost)?.nickname || 'Unknown'
        });
      }
    }
    return publicRooms;
  }

  joinRoom(roomId, playerId, nickname) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, message: 'Room not found' };
    }

    if (room.state === 'finished') {
      return { success: false, message: 'Game has already ended' };
    }

    // Check if nickname is taken in this room
    if (room.players.some(p => p.nickname.toLowerCase() === nickname.toLowerCase())) {
      return { success: false, message: 'Nickname already taken in this room' };
    }

    const joinedMidGame = room.state === 'playing';

    room.players.push({
      id: playerId,
      nickname,
      score: 0,
      isHost: false
    });

    return { success: true, joinedMidGame };
  }

  removePlayer(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const wasHost = room.hostId === playerId;
    room.players = room.players.filter(p => p.id !== playerId);

    // If room is empty, delete it
    if (room.players.length === 0) {
      this.rooms.delete(roomId);
      return wasHost;
    }

    // If host left, assign new host
    if (wasHost && room.players.length > 0) {
      room.hostId = room.players[0].id;
      room.players[0].isHost = true;
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

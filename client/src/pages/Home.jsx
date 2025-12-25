import { useState, useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { SocketContext, PlayerContext } from '../App'

export default function Home() {
  const socket = useContext(SocketContext)
  const { player, setPlayer } = useContext(PlayerContext)
  const navigate = useNavigate()

  const [nickname, setNickname] = useState('')
  const [rooms, setRooms] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [joinRoomId, setJoinRoomId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  // Fetch public rooms
  useEffect(() => {
    fetchRooms()
    const interval = setInterval(fetchRooms, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchRooms = async () => {
    try {
      const res = await fetch('/api/rooms')
      const data = await res.json()
      setRooms(data)
      setLoading(false)
    } catch (err) {
      console.error('Failed to fetch rooms:', err)
      setLoading(false)
    }
  }

  // Socket event listeners
  useEffect(() => {
    if (!socket) return

    socket.on('room-created', ({ room, playerId }) => {
      setPlayer({ id: playerId, nickname })
      navigate(`/room/${room.id}`)
    })

    socket.on('join-success', ({ room, playerId }) => {
      setPlayer({ id: playerId, nickname })
      navigate(`/room/${room.id}`)
    })

    socket.on('join-error', ({ message }) => {
      setError(message)
    })

    socket.on('rooms-updated', (updatedRooms) => {
      setRooms(updatedRooms)
    })

    return () => {
      socket.off('room-created')
      socket.off('join-success')
      socket.off('join-error')
      socket.off('rooms-updated')
    }
  }, [socket, nickname, navigate, setPlayer])

  const handleCreateRoom = () => {
    if (!nickname.trim()) {
      setError('Please enter a nickname')
      return
    }
    if (!roomName.trim()) {
      setError('Please enter a room name')
      return
    }
    setError('')
    socket.emit('create-room', {
      roomName: roomName.trim(),
      nickname: nickname.trim(),
      settings: { isPublic: true }
    })
  }

  const handleJoinRoom = (roomId) => {
    if (!nickname.trim()) {
      setError('Please enter a nickname first')
      return
    }
    setError('')
    socket.emit('join-room', {
      roomId,
      nickname: nickname.trim()
    })
  }

  const handleJoinByCode = () => {
    if (!joinRoomId.trim()) {
      setError('Please enter a room code')
      return
    }
    handleJoinRoom(joinRoomId.trim().toUpperCase())
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="text-center mb-12"
      >
        <h1 className="font-display text-6xl md:text-8xl font-black text-gold-400 text-glow-strong tracking-tight">
          KWIZNIAC
        </h1>
        <div className="decoration-line w-64 mx-auto my-4" />
        <p className="font-display text-2xl md:text-3xl text-gold-600 tracking-widest uppercase">
          Infinite
        </p>
        <p className="text-cream/60 mt-4 font-body text-lg">
          Quiz Bowl-style trivia with AI-generated clues
        </p>
      </motion.div>

      {/* Main Content */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="w-full max-w-2xl"
      >
        {/* Nickname Input */}
        <div className="card-retro p-6 mb-6">
          <label className="block font-display text-gold-400 text-lg mb-3">
            Your Nickname
          </label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Enter your nickname..."
            className="input-retro w-full px-4 py-3 rounded-lg text-lg"
            maxLength={20}
          />
        </div>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-burgundy-900/50 border border-burgundy-500 text-cream px-4 py-3 rounded-lg mb-6"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Create or Join Room */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Create Room */}
          <div className="card-retro p-6">
            <h2 className="font-display text-xl text-gold-400 mb-4">Create Room</h2>
            {!showCreate ? (
              <button
                onClick={() => setShowCreate(true)}
                className="btn-gold w-full py-3 px-6 rounded-lg text-lg"
              >
                Create New Room
              </button>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <input
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Room name..."
                  className="input-retro w-full px-4 py-3 rounded-lg mb-3"
                  maxLength={30}
                />
                <div className="flex gap-3">
                  <button
                    onClick={handleCreateRoom}
                    className="btn-gold flex-1 py-3 px-4 rounded-lg"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setShowCreate(false)}
                    className="px-4 py-3 rounded-lg border border-gold-700/30 text-gold-400 hover:bg-gold-900/20"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </div>

          {/* Join by Code */}
          <div className="card-retro p-6">
            <h2 className="font-display text-xl text-gold-400 mb-4">Join by Code</h2>
            <input
              type="text"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
              placeholder="Enter room code..."
              className="input-retro w-full px-4 py-3 rounded-lg mb-3 font-mono uppercase tracking-widest"
              maxLength={8}
            />
            <button
              onClick={handleJoinByCode}
              className="btn-gold w-full py-3 px-6 rounded-lg"
            >
              Join Room
            </button>
          </div>
        </div>

        {/* Public Rooms */}
        <div className="card-retro p-6">
          <h2 className="font-display text-xl text-gold-400 mb-4">Public Rooms</h2>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="spinner w-8 h-8" />
            </div>
          ) : rooms.length === 0 ? (
            <p className="text-cream/50 text-center py-8">
              No public rooms available. Create one!
            </p>
          ) : (
            <div className="space-y-3">
              {rooms.map((room, index) => (
                <motion.div
                  key={room.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  onClick={() => handleJoinRoom(room.id)}
                  className="room-card flex items-center justify-between"
                >
                  <div>
                    <h3 className="font-display text-lg text-cream">{room.name}</h3>
                    <p className="text-cream/50 text-sm">
                      Host: {room.hostNickname} · {room.playerCount} player{room.playerCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-gold-500 text-sm">{room.id}</span>
                    <span className="text-gold-400">→</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* Footer */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="mt-12 text-cream/30 text-sm"
      >
        Powered by Claude AI
      </motion.p>
    </div>
  )
}

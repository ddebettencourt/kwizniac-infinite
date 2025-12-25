import { useState, useEffect, useContext } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { SocketContext, PlayerContext } from '../App'
import Lobby from '../components/Lobby'
import GameView from '../components/GameView'

export default function Room() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const socket = useContext(SocketContext)
  const { player } = useContext(PlayerContext)

  const [room, setRoom] = useState(null)
  const [gameState, setGameState] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [kicked, setKicked] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!socket) return

    // If player hasn't joined through home page, redirect
    if (!player.id) {
      navigate('/')
      return
    }

    // Request current room state immediately
    const requestRoomState = () => {
      socket.emit('get-room-state', { roomId })
    }

    // Request immediately and also when socket reconnects
    if (socket.connected) {
      requestRoomState()
    }
    socket.on('connect', requestRoomState)

    // Room updates
    socket.on('room-update', (updatedRoom) => {
      setRoom(updatedRoom)
      // Check if game is in progress
      if (updatedRoom.state === 'playing') {
        setIsPlaying(true)
      }
    })

    // Room error (e.g., room not found)
    socket.on('room-error', ({ message }) => {
      setError(message)
      setTimeout(() => navigate('/'), 2000)
    })

    // Game started
    socket.on('game-started', () => {
      setIsPlaying(true)
      setGameState({ state: 'loading' })
    })

    // Game state updates
    socket.on('game-state', (state) => {
      setGameState(state)
    })

    // Host changed
    socket.on('host-changed', ({ newHostId }) => {
      setRoom(prev => prev ? { ...prev, hostId: newHostId } : null)
    })

    // Kicked from room
    socket.on('kicked', () => {
      setKicked(true)
      setTimeout(() => navigate('/'), 2000)
    })

    return () => {
      socket.off('connect', requestRoomState)
      socket.off('room-update')
      socket.off('room-error')
      socket.off('game-started')
      socket.off('game-state')
      socket.off('host-changed')
      socket.off('kicked')
    }
  }, [socket, player.id, roomId, navigate])

  if (kicked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="card-retro p-8 text-center"
        >
          <h2 className="font-display text-2xl text-burgundy-400 mb-4">
            You have been kicked
          </h2>
          <p className="text-cream/60">Redirecting to home...</p>
        </motion.div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="card-retro p-8 text-center"
        >
          <h2 className="font-display text-2xl text-burgundy-400 mb-4">
            {error}
          </h2>
          <p className="text-cream/60">Redirecting to home...</p>
        </motion.div>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="spinner w-12 h-12 mx-auto mb-4" />
          <p className="text-gold-400 font-display">Loading room...</p>
        </div>
      </div>
    )
  }

  const isHost = player.id === room.hostId

  return (
    <div className="min-h-screen">
      <AnimatePresence mode="wait">
        {!isPlaying ? (
          <Lobby
            key="lobby"
            room={room}
            isHost={isHost}
            playerId={player.id}
          />
        ) : (
          <GameView
            key="game"
            room={room}
            isHost={isHost}
            playerId={player.id}
            gameState={gameState}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

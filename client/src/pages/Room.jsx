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
  const { player, setPlayer } = useContext(PlayerContext)

  const [room, setRoom] = useState(null)
  const [gameState, setGameState] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [kicked, setKicked] = useState(false)
  const [error, setError] = useState(null)
  const [attemptingRejoin, setAttemptingRejoin] = useState(false)

  useEffect(() => {
    if (!socket) return

    // If player hasn't joined through home page, try to rejoin via device ID
    if (!player.id) {
      setAttemptingRejoin(true)

      const handleJoinSuccess = ({ room: joinedRoom, playerId }) => {
        setPlayer(prev => ({ id: playerId, nickname: prev.nickname || joinedRoom.players.find(p => p.id === playerId)?.nickname || '' }))
        setAttemptingRejoin(false)
      }

      const handleJoinError = () => {
        setAttemptingRejoin(false)
        navigate('/')
      }

      const handleSessionCheck = ({ hasSession, roomId: sessionRoomId, nickname }) => {
        if (hasSession && sessionRoomId === roomId) {
          // We have an active session in this room - rejoin
          if (nickname) {
            setPlayer(prev => ({ ...prev, nickname }))
          }
          socket.emit('rejoin-room', { roomId })
        } else {
          // No session - check if we have a nickname to join fresh
          const savedNickname = sessionStorage.getItem('kwizniac_nickname')
          if (savedNickname) {
            socket.emit('join-room', { roomId, nickname: savedNickname })
          } else {
            setAttemptingRejoin(false)
            navigate('/')
          }
        }
      }

      socket.on('join-success', handleJoinSuccess)
      socket.on('join-error', handleJoinError)
      socket.on('session-check', handleSessionCheck)

      // Check for active session
      if (socket.connected) {
        socket.emit('check-session')
      } else {
        socket.on('connect', () => socket.emit('check-session'))
      }

      return () => {
        socket.off('join-success', handleJoinSuccess)
        socket.off('join-error', handleJoinError)
        socket.off('session-check', handleSessionCheck)
      }
    }

    // Normal flow - player already has an ID
    // Request room state on mount (not on reconnect — the rejoin effect handles that)
    if (socket.connected) {
      socket.emit('get-room-state', { roomId })
    }

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
      sessionStorage.removeItem('kwizniac_room_id')
      setTimeout(() => navigate('/'), 2000)
    })

    // Store room ID for potential rejoin
    sessionStorage.setItem('kwizniac_room_id', roomId)

    return () => {
      socket.off('room-update')
      socket.off('room-error')
      socket.off('game-started')
      socket.off('game-state')
      socket.off('host-changed')
      socket.off('kicked')
    }
  }, [socket, player.id, roomId, navigate, setPlayer])

  // Handle socket reconnection - rejoin the room with new socket ID
  useEffect(() => {
    if (!socket || !player.id) return

    const handleReconnect = () => {
      console.log('Socket reconnected, rejoining room...')
      socket.emit('rejoin-room', { roomId })
    }

    // Socket.io v4 emits 'connect' on reconnect
    socket.on('connect', handleReconnect)

    socket.on('join-success', ({ room: joinedRoom, playerId }) => {
      setPlayer(prev => ({ ...prev, id: playerId }))
      setRoom(joinedRoom)
      // After rejoin, request full game state
      socket.emit('get-room-state', { roomId })
    })

    return () => {
      socket.off('connect', handleReconnect)
      socket.off('join-success')
    }
  }, [socket, player.id, roomId, setPlayer])

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

  if (!room || attemptingRejoin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="spinner w-12 h-12 mx-auto mb-4" />
          <p className="text-gold-400 font-display">
            {attemptingRejoin ? 'Reconnecting...' : 'Loading room...'}
          </p>
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

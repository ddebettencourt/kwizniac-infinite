import { useState, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { SocketContext } from '../App'

export default function Lobby({ room, isHost, playerId }) {
  const socket = useContext(SocketContext)
  const navigate = useNavigate()
  const [showSettings, setShowSettings] = useState(false)
  const [penalty, setPenalty] = useState(room.settings.wrongAnswerPenalty)
  const [gameMode, setGameMode] = useState(room.settings.gameMode || 'wikipedia')

  const handleStartGame = () => {
    socket.emit('start-game')
  }

  const handleKickPlayer = (kickPlayerId) => {
    socket.emit('kick-player', { playerId: kickPlayerId })
  }

  const handleUpdateSettings = () => {
    socket.emit('update-settings', {
      settings: { wrongAnswerPenalty: penalty, gameMode }
    })
    setShowSettings(false)
  }

  const handleLeave = () => {
    navigate('/')
  }

  const copyRoomCode = () => {
    navigator.clipboard.writeText(room.id)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen p-8"
    >
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <motion.h1
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="font-display text-4xl md:text-5xl text-gold-400 text-glow mb-2"
          >
            {room.name}
          </motion.h1>
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex items-center justify-center gap-3"
          >
            <span className="text-cream/50">Room Code:</span>
            <button
              onClick={copyRoomCode}
              className="font-mono text-xl text-gold-500 hover:text-gold-400 transition-colors flex items-center gap-2"
            >
              {room.id}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </motion.div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Players List */}
          <motion.div
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="md:col-span-2 card-retro p-6"
          >
            <h2 className="font-display text-xl text-gold-400 mb-4">
              Players ({room.players.length})
            </h2>
            <div className="space-y-3">
              {room.players.map((player, index) => (
                <motion.div
                  key={player.id}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="player-item"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gold-600/20 flex items-center justify-center font-display text-gold-400">
                      {player.nickname.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className="text-cream font-medium">{player.nickname}</span>
                      {player.isHost && (
                        <span className="ml-2 text-xs font-mono text-gold-500 uppercase tracking-wider">
                          Host
                        </span>
                      )}
                      {player.id === playerId && (
                        <span className="ml-2 text-xs font-mono text-cream/50 uppercase tracking-wider">
                          (You)
                        </span>
                      )}
                    </div>
                  </div>
                  {isHost && !player.isHost && (
                    <button
                      onClick={() => handleKickPlayer(player.id)}
                      className="text-burgundy-400 hover:text-burgundy-300 text-sm"
                    >
                      Kick
                    </button>
                  )}
                </motion.div>
              ))}
            </div>

            {room.players.length < 2 && (
              <p className="text-cream/50 text-center mt-6 py-4 border-t border-gold-900/30">
                Waiting for more players to join...
              </p>
            )}
          </motion.div>

          {/* Actions Panel */}
          <motion.div
            initial={{ x: 30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="space-y-4"
          >
            {/* Settings Card */}
            <div className="card-retro p-6">
              <h2 className="font-display text-xl text-gold-400 mb-4">Settings</h2>

              {!showSettings ? (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-cream/60">Game Mode</span>
                    <span className="font-mono text-gold-400 capitalize">{room.settings.gameMode || 'wikipedia'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-cream/60">Wrong Answer Penalty</span>
                    <span className="font-mono text-burgundy-400">{room.settings.wrongAnswerPenalty} pts</span>
                  </div>
                  {isHost && (
                    <button
                      onClick={() => setShowSettings(true)}
                      className="w-full py-2 px-4 rounded-lg border border-gold-700/30 text-gold-400 hover:bg-gold-900/20 text-sm"
                    >
                      Edit Settings
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-cream/60 mb-2">
                      Game Mode
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setGameMode('wikipedia')}
                        className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                          gameMode === 'wikipedia'
                            ? 'bg-gold-600 text-charcoal'
                            : 'border border-gold-700/30 text-gold-400 hover:bg-gold-900/20'
                        }`}
                      >
                        Wikipedia
                      </button>
                      <button
                        onClick={() => setGameMode('custom')}
                        className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                          gameMode === 'custom'
                            ? 'bg-gold-600 text-charcoal'
                            : 'border border-gold-700/30 text-gold-400 hover:bg-gold-900/20'
                        }`}
                      >
                        Custom
                      </button>
                    </div>
                    <p className="text-xs text-cream/40 mt-2">
                      {gameMode === 'wikipedia'
                        ? 'AI picks random topics from Wikipedia'
                        : 'Players take turns picking the answer'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm text-cream/60 mb-2">
                      Wrong Answer Penalty
                    </label>
                    <input
                      type="number"
                      value={penalty}
                      onChange={(e) => setPenalty(parseInt(e.target.value) || 0)}
                      className="input-retro w-full px-3 py-2 rounded-lg text-sm"
                      min="-10"
                      max="0"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleUpdateSettings}
                      className="flex-1 py-2 px-4 rounded-lg bg-gold-600 text-charcoal font-medium text-sm"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setShowSettings(false)}
                      className="py-2 px-4 rounded-lg border border-gold-700/30 text-gold-400 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="card-retro p-6 space-y-3">
              {isHost ? (
                <button
                  onClick={handleStartGame}
                  disabled={room.players.length < 1}
                  className="btn-gold w-full py-4 rounded-lg text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Start Game
                </button>
              ) : (
                <div className="text-center py-4">
                  <div className="spinner w-6 h-6 mx-auto mb-2" />
                  <p className="text-cream/60 text-sm">Waiting for host to start...</p>
                </div>
              )}

              <button
                onClick={handleLeave}
                className="w-full py-3 rounded-lg border border-burgundy-700/30 text-burgundy-400 hover:bg-burgundy-900/20"
              >
                Leave Room
              </button>
            </div>

            {/* How to Play */}
            <div className="card-retro p-6">
              <h2 className="font-display text-lg text-gold-400 mb-3">How to Play</h2>
              {(room.settings.gameMode || 'wikipedia') === 'wikipedia' ? (
                <ul className="space-y-2 text-sm text-cream/70">
                  <li className="flex gap-2">
                    <span className="text-gold-500">1.</span>
                    <span>10 clues revealed from hardest to easiest</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-gold-500">2.</span>
                    <span>Buzz when you think you know the answer</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-gold-500">3.</span>
                    <span>15 seconds to type your answer</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-gold-500">4.</span>
                    <span>Earlier answers = more points!</span>
                  </li>
                </ul>
              ) : (
                <ul className="space-y-2 text-sm text-cream/70">
                  <li className="flex gap-2">
                    <span className="text-gold-500">1.</span>
                    <span>One player picks the answer each round</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-gold-500">2.</span>
                    <span>Others buzz and guess as clues are revealed</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-gold-500">3.</span>
                    <span>Picker scores based on how tricky their answer was</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-gold-500">4.</span>
                    <span>Pick something famous but hard to guess!</span>
                  </li>
                </ul>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}

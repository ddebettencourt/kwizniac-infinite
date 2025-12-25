import { useState, useEffect, useContext, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SocketContext } from '../App'

export default function GameView({ room, isHost, playerId }) {
  const socket = useContext(SocketContext)
  const answerInputRef = useRef(null)

  const [questionNumber, setQuestionNumber] = useState(0)
  const [clues, setClues] = useState([])
  const [currentPoints, setCurrentPoints] = useState(10)
  const [state, setState] = useState('loading') // loading, picking, revealing, buzzing, answered
  const [buzzedPlayer, setBuzzedPlayer] = useState(null)
  const [timerEnd, setTimerEnd] = useState(null)
  const [timeLeft, setTimeLeft] = useState(15)
  const [answer, setAnswer] = useState('')
  const [lastResult, setLastResult] = useState(null)
  const [players, setPlayers] = useState(room.players)
  const [canBuzz, setCanBuzz] = useState(true)
  const [correctAnswer, setCorrectAnswer] = useState(null)
  const [answerDifficulty, setAnswerDifficulty] = useState(null)

  // Custom mode state
  const [gameMode, setGameMode] = useState(room.settings.gameMode || 'wikipedia')
  const [currentPicker, setCurrentPicker] = useState(null)
  const [pickerAnswer, setPickerAnswer] = useState('')
  const [pickerScoreInfo, setPickerScoreInfo] = useState(null)
  const [pickerError, setPickerError] = useState(null)
  const pickerInputRef = useRef(null)

  // Loading animation state
  const [loadingTime, setLoadingTime] = useState(0)
  const [funFactIndex, setFunFactIndex] = useState(0)
  const funFacts = [
    "Researching...",
    "Crafting clues...",
    "Almost there...",
    "Balancing difficulty..."
  ]

  // Socket event listeners
  useEffect(() => {
    if (!socket) return

    socket.on('game-started', ({ gameMode: mode }) => {
      setGameMode(mode || 'wikipedia')
    })

    socket.on('mid-game-sync', (gameState) => {
      setGameMode(gameState.gameMode || 'wikipedia')
      setQuestionNumber(gameState.questionNumber)
      setState(gameState.state)
      setClues(gameState.revealedClues || [])
      setCurrentPoints(gameState.currentPoints)
      setBuzzedPlayer(gameState.buzzedPlayer)
      setTimerEnd(gameState.answerTimerEnd)
      setPlayers(gameState.players)
      setAnswerDifficulty(gameState.answerDifficulty)
      if (gameState.picker) {
        setCurrentPicker(gameState.picker)
        if (gameState.picker.id === playerId) {
          setCanBuzz(false)
        }
      }
    })

    socket.on('game-state', ({ state: newState, questionNumber: qNum, picker }) => {
      if (newState === 'loading') {
        setState('loading')
        setQuestionNumber(qNum)
        setClues([])
        setCorrectAnswer(null)
        setPickerScoreInfo(null)
        if (picker) setCurrentPicker(picker)
      }
    })

    socket.on('picking-phase', ({ questionNumber: qNum, picker }) => {
      setState('picking')
      setQuestionNumber(qNum)
      setClues([])
      setCurrentPicker(picker)
      setPickerAnswer('')
      setPickerError(null)
      setPickerScoreInfo(null)
      setCorrectAnswer(null)
      setLastResult(null)
      if (picker.id === playerId) {
        setTimeout(() => pickerInputRef.current?.focus(), 100)
      }
    })

    socket.on('picker-error', ({ message }) => {
      setPickerError(message)
      setState('picking')
    })

    socket.on('picker-scored', ({ pickerId, pickerNickname, obscurity, avgPointsEarned, wrongGuessCount, pickerPoints, skipped, players: updatedPlayers }) => {
      setPickerScoreInfo({ pickerId, pickerNickname, obscurity, avgPointsEarned, wrongGuessCount, pickerPoints, skipped })
      setPlayers(updatedPlayers)
    })

    socket.on('question-ready', ({ questionNumber: qNum, answerDifficulty: diff, picker }) => {
      setQuestionNumber(qNum)
      setClues([])
      setCurrentPoints(10)
      setState('revealing')
      setBuzzedPlayer(null)
      setLastResult(null)
      const isPicker = picker && picker.id === playerId
      setCanBuzz(!isPicker)
      setCorrectAnswer(null)
      setAnswerDifficulty(diff)
      if (picker) setCurrentPicker(picker)
    })

    socket.on('clue-revealed', ({ clue, cluesRevealed, currentPoints: pts }) => {
      setClues(prev => [...prev, clue])
      setCurrentPoints(pts)
    })

    socket.on('player-buzzed', ({ playerId: buzzId, nickname, timerEnd: end }) => {
      setBuzzedPlayer({ id: buzzId, nickname })
      setTimerEnd(end)
      setTimeLeft(15)
      setState('buzzing')
      if (buzzId === playerId) {
        setTimeout(() => answerInputRef.current?.focus(), 100)
      }
    })

    socket.on('answer-result', ({ playerId: answerId, nickname, answer: ans, correctAnswer: correct, isCorrect, pointsAwarded, players: updatedPlayers }) => {
      setLastResult({ playerId: answerId, nickname, answer: ans, isCorrect, pointsAwarded })
      setPlayers(updatedPlayers)
      if (isCorrect) {
        setState('answered')
        setCorrectAnswer(correct)
      }
    })

    socket.on('answer-timeout', ({ playerId: timeoutId, nickname, pointsAwarded, players: updatedPlayers }) => {
      setLastResult({ playerId: timeoutId, nickname, isTimeout: true, pointsAwarded })
      setPlayers(updatedPlayers)
    })

    socket.on('resume-revealing', () => {
      setBuzzedPlayer(null)
      setState('revealing')
      setAnswer('')
      setCanBuzz(true)
    })

    socket.on('question-skipped', ({ correctAnswer: correct }) => {
      setCorrectAnswer(correct)
      setState('answered')
    })

    socket.on('room-update', (updatedRoom) => {
      setPlayers(updatedRoom.players)
    })

    return () => {
      socket.off('game-started')
      socket.off('mid-game-sync')
      socket.off('game-state')
      socket.off('picking-phase')
      socket.off('picker-error')
      socket.off('picker-scored')
      socket.off('question-ready')
      socket.off('clue-revealed')
      socket.off('player-buzzed')
      socket.off('answer-result')
      socket.off('answer-timeout')
      socket.off('resume-revealing')
      socket.off('question-skipped')
      socket.off('room-update')
    }
  }, [socket, playerId, lastResult])

  // Timer countdown
  useEffect(() => {
    if (state !== 'buzzing' || !timerEnd) return
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000))
      setTimeLeft(remaining)
    }, 100)
    return () => clearInterval(interval)
  }, [state, timerEnd])

  // Loading animation timer
  useEffect(() => {
    if (state !== 'loading') {
      setLoadingTime(0)
      setFunFactIndex(0)
      return
    }
    const timerInterval = setInterval(() => setLoadingTime(prev => prev + 1), 1000)
    const factInterval = setInterval(() => setFunFactIndex(prev => (prev + 1) % funFacts.length), 2500)
    return () => {
      clearInterval(timerInterval)
      clearInterval(factInterval)
    }
  }, [state, funFacts.length])

  const handleBuzz = () => {
    if (state !== 'revealing' || !canBuzz) return
    socket.emit('buzz')
  }

  const handleSubmitAnswer = (e) => {
    e.preventDefault()
    if (state !== 'buzzing' || buzzedPlayer?.id !== playerId || !answer.trim()) return
    socket.emit('submit-answer', { answer: answer.trim() })
    setAnswer('')
  }

  const handleRevealClue = () => socket.emit('reveal-clue')
  const handleNextQuestion = () => {
    socket.emit('next-question')
    setState('loading')
  }

  const handlePickerSubmit = (e) => {
    e.preventDefault()
    if (state !== 'picking' || currentPicker?.id !== playerId || !pickerAnswer.trim()) return
    setPickerError(null)
    socket.emit('submit-picker-answer', { answer: pickerAnswer.trim() })
    setState('loading')
  }

  const sortedPlayers = [...players].sort((a, b) => b.score - a.score)
  const myScore = players.find(p => p.id === playerId)?.score || 0

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-charcoal to-charcoal/95">
      {/* Compact Header - Always visible */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-gold-900/30 bg-charcoal/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-gold-400 font-display text-sm">Q{questionNumber}</span>
            {gameMode === 'custom' && currentPicker && state !== 'picking' && (
              <span className="text-xs text-cream/50">
                Picker: {currentPicker.id === playerId ? 'You' : currentPicker.nickname}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-cream/50 text-xs">{clues.length}/10</span>
            <div className="score-display px-3 py-1 rounded text-lg font-bold min-w-[50px] text-center">
              {currentPoints}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        {/* Loading State */}
        {state === 'loading' && clues.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full p-4">
            <div className="relative w-20 h-20 mb-4">
              <motion.div
                className="absolute inset-0 rounded-full border-4 border-gold-500/30"
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.2, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-mono text-2xl text-gold-400">{loadingTime}s</span>
              </div>
            </div>
            <p className="text-gold-400 font-display text-base">{funFacts[funFactIndex]}</p>
          </div>
        )}

        {/* Picking Phase */}
        {state === 'picking' && currentPicker && (
          <div className="flex flex-col items-center justify-center h-full p-4">
            {currentPicker.id === playerId ? (
              <div className="w-full max-w-sm">
                <p className="text-gold-400 font-display text-xl text-center mb-2">Your Turn!</p>
                <p className="text-cream/60 text-sm text-center mb-4">Pick something famous but tricky</p>
                <form onSubmit={handlePickerSubmit} className="space-y-3">
                  <input
                    ref={pickerInputRef}
                    type="text"
                    value={pickerAnswer}
                    onChange={(e) => setPickerAnswer(e.target.value)}
                    placeholder="Type your answer..."
                    className="input-retro w-full px-4 py-3 rounded-lg text-lg text-center"
                    autoComplete="off"
                  />
                  {pickerError && <p className="text-burgundy-400 text-sm text-center">{pickerError}</p>}
                  <button
                    type="submit"
                    disabled={pickerAnswer.trim().length < 2}
                    className="btn-gold w-full py-3 rounded-lg text-lg disabled:opacity-50"
                  >
                    Submit
                  </button>
                </form>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-gold-600/20 flex items-center justify-center font-display text-gold-400 text-xl mx-auto mb-3">
                  {currentPicker.nickname.charAt(0).toUpperCase()}
                </div>
                <p className="text-gold-400 font-display text-lg">{currentPicker.nickname} is picking...</p>
                <div className="spinner w-6 h-6 mx-auto mt-4" />
              </div>
            )}
          </div>
        )}

        {/* Clues List */}
        {(state === 'revealing' || state === 'buzzing' || state === 'answered') && (
          <div className="p-3 space-y-2">
            {clues.map((clue) => (
              <motion.div
                key={clue.number}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-2 p-2 rounded-lg bg-charcoal/50 border border-gold-900/20"
              >
                <span className="w-6 h-6 rounded-full bg-gold-600 text-charcoal flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {clue.number}
                </span>
                <p className="text-cream text-sm leading-snug">{clue.text}</p>
              </motion.div>
            ))}

            {/* Answer Revealed */}
            {correctAnswer && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-gold-600/20 border-2 border-gold-500 rounded-lg p-4 text-center mt-3"
              >
                <p className="text-gold-400 text-xs uppercase tracking-wider mb-1">Answer</p>
                <p className="font-display text-xl text-cream">{correctAnswer}</p>
              </motion.div>
            )}

            {/* Picker Score */}
            {pickerScoreInfo && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-3 rounded-lg bg-gold-600/10 border border-gold-700/30 text-center"
              >
                <p className="text-gold-400 text-sm mb-1">{pickerScoreInfo.pickerNickname}'s Picker Score</p>
                <p className="text-gold-500 font-mono text-lg">+{pickerScoreInfo.pickerPoints} pts</p>
              </motion.div>
            )}

            {/* Last Result Toast */}
            {lastResult && state !== 'answered' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`p-2 rounded-lg text-center text-sm ${
                  lastResult.isCorrect ? 'bg-green-900/50 text-green-300' : 'bg-burgundy-900/50 text-burgundy-300'
                }`}
              >
                {lastResult.isTimeout
                  ? `${lastResult.nickname} ran out of time!`
                  : lastResult.isCorrect
                  ? `${lastResult.nickname} got it! (+${lastResult.pointsAwarded})`
                  : `${lastResult.nickname}: "${lastResult.answer}" - Wrong!`}
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Action Area - Always visible */}
      <div className="flex-shrink-0 border-t border-gold-900/30 bg-charcoal p-3 pb-4">
        {/* Revealing - Show Buzz Button */}
        {state === 'revealing' && (
          <>
            {gameMode === 'custom' && currentPicker?.id === playerId ? (
              <div className="text-center py-2">
                <p className="text-cream/50 text-sm">You picked this one - watch them guess!</p>
              </div>
            ) : (
              <button
                onClick={handleBuzz}
                disabled={!canBuzz}
                className="btn-buzz w-full py-4 rounded-xl text-xl font-bold disabled:opacity-50"
              >
                {canBuzz ? 'BUZZ!' : 'Already Buzzed'}
              </button>
            )}
            {isHost && (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleRevealClue}
                  disabled={clues.length >= 10}
                  className="flex-1 btn-gold py-2 rounded-lg text-sm disabled:opacity-50"
                >
                  Next Clue
                </button>
                <button
                  onClick={handleNextQuestion}
                  className="flex-1 py-2 rounded-lg border border-gold-700/30 text-gold-400 text-sm"
                >
                  Skip
                </button>
              </div>
            )}
          </>
        )}

        {/* Buzzing - Show Timer and Input */}
        {state === 'buzzing' && buzzedPlayer && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-gold-400 text-sm">
                {buzzedPlayer.id === playerId ? 'You buzzed!' : `${buzzedPlayer.nickname} buzzed!`}
              </span>
              <span className="font-mono text-xl text-burgundy-400">{timeLeft}s</span>
            </div>
            <div className="h-2 bg-charcoal/50 rounded-full overflow-hidden mb-3">
              <motion.div
                className="h-full bg-gradient-to-r from-burgundy-500 to-burgundy-400"
                initial={{ width: '100%' }}
                animate={{ width: `${(timeLeft / 15) * 100}%` }}
              />
            </div>
            {buzzedPlayer.id === playerId ? (
              <form onSubmit={handleSubmitAnswer} className="flex gap-2">
                <input
                  ref={answerInputRef}
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Your answer..."
                  className="input-retro flex-1 px-3 py-3 rounded-lg"
                  autoComplete="off"
                />
                <button type="submit" className="btn-gold px-6 py-3 rounded-lg">
                  Go
                </button>
              </form>
            ) : (
              <div className="text-center py-2">
                <div className="spinner w-5 h-5 mx-auto" />
              </div>
            )}
          </div>
        )}

        {/* Answered - Show Result and Next */}
        {state === 'answered' && (
          <div>
            {lastResult?.isCorrect && (
              <p className="text-center text-gold-400 font-display text-lg mb-2">
                {lastResult.nickname} +{lastResult.pointsAwarded} pts!
              </p>
            )}
            {isHost ? (
              <button onClick={handleNextQuestion} className="btn-gold w-full py-3 rounded-lg text-lg">
                Next Question
              </button>
            ) : (
              <p className="text-center text-cream/50 text-sm py-2">Waiting for host...</p>
            )}
          </div>
        )}

        {/* Loading/Picking - Show Scoreboard */}
        {(state === 'loading' || state === 'picking') && (
          <div className="flex gap-2 overflow-x-auto py-1">
            {sortedPlayers.slice(0, 5).map((player, i) => (
              <div
                key={player.id}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs ${
                  player.id === playerId ? 'bg-gold-600/20 border border-gold-500' : 'bg-charcoal/50'
                }`}
              >
                <span className="text-cream/70">{i + 1}. {player.nickname.slice(0, 8)}</span>
                <span className="text-gold-400 ml-2 font-mono">{player.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

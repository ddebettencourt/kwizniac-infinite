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
    "Claude is researching your topic...",
    "Crafting the perfect clues...",
    "Making sure clue #10 is extra tricky...",
    "Double-checking all the facts...",
    "Balancing difficulty levels...",
    "Almost there...",
    "Adding the finishing touches...",
    "This one's going to be good!"
  ]

  // Socket event listeners
  useEffect(() => {
    if (!socket) return

    socket.on('game-started', ({ gameMode: mode }) => {
      console.log('game-started received, mode:', mode)
      setGameMode(mode || 'wikipedia')
    })

    // Handle mid-game sync for late joiners
    socket.on('mid-game-sync', (gameState) => {
      console.log('mid-game-sync received:', gameState)
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
        // In custom mode, picker can't buzz
        if (gameState.picker.id === playerId) {
          setCanBuzz(false)
        }
      }
    })

    socket.on('game-state', ({ state: newState, questionNumber: qNum, picker }) => {
      console.log('game-state received:', newState, qNum)
      if (newState === 'loading') {
        setState('loading')
        setQuestionNumber(qNum)
        setClues([])
        setCorrectAnswer(null)
        setPickerScoreInfo(null)
        if (picker) {
          setCurrentPicker(picker)
        }
      }
    })

    socket.on('picking-phase', ({ questionNumber: qNum, picker }) => {
      console.log('picking-phase received:', qNum, picker)
      setState('picking')
      setQuestionNumber(qNum)
      setClues([])
      setCurrentPicker(picker)
      setPickerAnswer('')
      setPickerError(null)
      setPickerScoreInfo(null)
      setCorrectAnswer(null)
      setLastResult(null)
      // Focus picker input if it's this player
      if (picker.id === playerId) {
        setTimeout(() => pickerInputRef.current?.focus(), 100)
      }
    })

    socket.on('picker-error', ({ message }) => {
      console.log('picker-error received:', message)
      setPickerError(message)
      setState('picking')
    })

    socket.on('picker-scored', ({ pickerId, pickerNickname, obscurity, avgPointsEarned, wrongGuessCount, pickerPoints, skipped, players: updatedPlayers }) => {
      console.log('picker-scored received:', pickerNickname, pickerPoints)
      setPickerScoreInfo({ pickerId, pickerNickname, obscurity, avgPointsEarned, wrongGuessCount, pickerPoints, skipped })
      setPlayers(updatedPlayers)
    })

    socket.on('question-ready', ({ questionNumber: qNum, answerDifficulty: diff, picker }) => {
      console.log('question-ready received:', qNum, 'difficulty:', diff, 'picker:', picker)
      setQuestionNumber(qNum)
      setClues([])
      setCurrentPoints(10)
      setState('revealing')
      setBuzzedPlayer(null)
      setLastResult(null)
      // In custom mode, picker can't buzz
      const isPicker = picker && picker.id === playerId
      setCanBuzz(!isPicker)
      setCorrectAnswer(null)
      setAnswerDifficulty(diff)
      if (picker) {
        setCurrentPicker(picker)
      }
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

      // Focus answer input if it's you
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
      // Allow players to buzz again (they'll keep losing points)
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

    const timerInterval = setInterval(() => {
      setLoadingTime(prev => prev + 1)
    }, 1000)

    const factInterval = setInterval(() => {
      setFunFactIndex(prev => (prev + 1) % funFacts.length)
    }, 3000)

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

  const handleRevealClue = () => {
    socket.emit('reveal-clue')
  }

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

  // Sort players by score
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen p-4 md:p-8"
    >
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
          <div>
            <h1 className="font-display text-xl sm:text-2xl md:text-3xl text-gold-400 text-glow">
              {room.name}
            </h1>
            <p className="text-cream/50 text-xs sm:text-sm font-mono">Question {questionNumber}</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            {/* Current Picker indicator (Custom Mode) */}
            {gameMode === 'custom' && currentPicker && state !== 'picking' && (
              <div className="text-center px-2 sm:px-3 py-1 sm:py-2 rounded-lg bg-gold-600/10 border border-gold-700/30">
                <div className="text-[10px] sm:text-xs text-cream/40 uppercase tracking-wider mb-0.5 sm:mb-1">Picker</div>
                <div className="text-gold-400 font-medium text-xs sm:text-sm">
                  {currentPicker.id === playerId ? 'You' : currentPicker.nickname}
                </div>
              </div>
            )}
            {answerDifficulty !== null && (
              <div className="text-center hidden sm:block">
                <div className="text-xs text-cream/40 uppercase tracking-wider mb-1">Obscurity</div>
                <div className="flex gap-0.5">
                  {[...Array(10)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-2 sm:w-2.5 h-3 sm:h-4 rounded-sm ${
                        i < answerDifficulty
                          ? answerDifficulty >= 8 ? 'bg-burgundy-500'
                            : answerDifficulty >= 5 ? 'bg-gold-500'
                            : 'bg-green-500'
                          : 'bg-charcoal/30'
                      }`}
                    />
                  ))}
                </div>
                <div className="text-xs text-cream/50 font-mono mt-1">
                  {answerDifficulty <= 2 ? 'Famous' : answerDifficulty <= 4 ? 'Well-known' : answerDifficulty <= 6 ? 'Moderate' : answerDifficulty <= 8 ? 'Obscure' : 'Very Obscure'}
                </div>
              </div>
            )}
            <div className="score-display px-4 py-2 rounded-lg text-center min-w-[80px]">
              <div className="text-xs text-gold-500/50 uppercase">Points</div>
              <div className="text-2xl font-bold">{currentPoints}</div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Main Game Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Clues */}
            <div className="card-retro p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-display text-xl text-gold-400">Clues</h2>
                <span className="font-mono text-sm text-cream/50">
                  {clues.length}/10 revealed
                </span>
              </div>

              <div className="space-y-3 min-h-[200px]">
                <AnimatePresence mode="popLayout">
                  {/* Picking Phase (Custom Mode) */}
                  {state === 'picking' && currentPicker && (
                    <motion.div
                      key="picking"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center py-8"
                    >
                      {currentPicker.id === playerId ? (
                        <div className="text-center w-full max-w-md">
                          <p className="text-gold-400 font-display text-2xl mb-2">Your Turn to Pick!</p>
                          <p className="text-cream/60 text-sm mb-6">
                            Choose something well-known but tricky to guess
                          </p>
                          <form onSubmit={handlePickerSubmit} className="space-y-4">
                            <input
                              ref={pickerInputRef}
                              type="text"
                              value={pickerAnswer}
                              onChange={(e) => setPickerAnswer(e.target.value)}
                              placeholder="Type your answer..."
                              className="input-retro w-full px-4 py-4 rounded-lg text-xl text-center"
                              autoComplete="off"
                              minLength={2}
                            />
                            {pickerError && (
                              <p className="text-burgundy-400 text-sm">{pickerError}</p>
                            )}
                            <button
                              type="submit"
                              disabled={pickerAnswer.trim().length < 2}
                              className="btn-gold w-full py-4 rounded-lg text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Submit Answer
                            </button>
                          </form>
                        </div>
                      ) : (
                        <div className="text-center">
                          <div className="w-16 h-16 rounded-full bg-gold-600/20 flex items-center justify-center font-display text-gold-400 text-2xl mx-auto mb-4">
                            {currentPicker.nickname.charAt(0).toUpperCase()}
                          </div>
                          <p className="text-gold-400 font-display text-xl mb-2">
                            {currentPicker.nickname} is picking...
                          </p>
                          <p className="text-cream/50 text-sm">Get ready to guess!</p>
                          <div className="spinner w-8 h-8 mx-auto mt-6" />
                        </div>
                      )}
                    </motion.div>
                  )}

                  {state === 'loading' && clues.length === 0 && (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex flex-col items-center justify-center py-8"
                    >
                      {/* Animated rings */}
                      <div className="relative w-32 h-32 mb-6">
                        <motion.div
                          className="absolute inset-0 rounded-full border-4 border-gold-500/20"
                          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.2, 0.5] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        />
                        <motion.div
                          className="absolute inset-2 rounded-full border-4 border-gold-500/30"
                          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.3, 0.6] }}
                          transition={{ duration: 2, repeat: Infinity, delay: 0.2 }}
                        />
                        <motion.div
                          className="absolute inset-4 rounded-full border-4 border-gold-500/40"
                          animate={{ scale: [1, 1.1, 1], opacity: [0.7, 0.4, 0.7] }}
                          transition={{ duration: 2, repeat: Infinity, delay: 0.4 }}
                        />
                        {/* Center timer */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center">
                            <motion.span
                              key={loadingTime}
                              initial={{ scale: 1.2, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              className="font-mono text-3xl text-gold-400 font-bold"
                            >
                              {loadingTime}s
                            </motion.span>
                          </div>
                        </div>
                      </div>

                      {/* Progress dots */}
                      <div className="flex gap-2 mb-4">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <motion.div
                            key={i}
                            className="w-2 h-2 rounded-full bg-gold-500"
                            animate={{
                              scale: [1, 1.5, 1],
                              opacity: [0.3, 1, 0.3]
                            }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              delay: i * 0.2
                            }}
                          />
                        ))}
                      </div>

                      {/* Rotating fun facts */}
                      <div className="h-12 flex items-center">
                        <AnimatePresence mode="wait">
                          <motion.p
                            key={funFactIndex}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="text-gold-400 font-display text-lg text-center"
                          >
                            {funFacts[funFactIndex]}
                          </motion.p>
                        </AnimatePresence>
                      </div>

                      <p className="text-cream/40 text-xs mt-4">Powered by Claude AI with web search</p>
                    </motion.div>
                  )}

                  {clues.map((clue, index) => (
                    <motion.div
                      key={clue.number}
                      initial={{ opacity: 0, x: -30 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.4 }}
                      className="clue-card p-4 rounded-lg"
                    >
                      <div className="flex gap-4 items-start">
                        <div className="points-badge w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0">
                          {clue.number}
                        </div>
                        <p className="text-cream text-lg leading-relaxed flex-1">
                          {clue.text}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* Answer Revealed */}
                <AnimatePresence>
                  {correctAnswer && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-gold-600/20 border-2 border-gold-500 rounded-lg p-6 text-center mt-6"
                    >
                      <p className="text-gold-400 text-sm uppercase tracking-wider mb-2">The Answer</p>
                      <p className="font-display text-3xl text-cream text-glow">{correctAnswer}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Host Controls */}
              {isHost && (
                <div className="flex gap-3 mt-6 pt-4 border-t border-gold-900/30">
                  <button
                    onClick={handleRevealClue}
                    disabled={state !== 'revealing' || clues.length >= 10}
                    className="btn-gold py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reveal Next Clue
                  </button>
                  <button
                    onClick={handleNextQuestion}
                    disabled={state === 'loading' || state === 'buzzing'}
                    className="py-3 px-6 rounded-lg border border-gold-700/30 text-gold-400 hover:bg-gold-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {state === 'answered' ? 'Next Question' : 'Skip Question'}
                  </button>
                </div>
              )}
            </div>

            {/* Buzz / Answer Area */}
            <div className="card-retro p-6">
              <AnimatePresence mode="wait">
                {/* Ready to Buzz */}
                {state === 'revealing' && (
                  <motion.div
                    key="buzz"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center"
                  >
                    {gameMode === 'custom' && currentPicker?.id === playerId ? (
                      <div className="py-6">
                        <p className="text-gold-400 font-display text-lg mb-2">You picked this answer!</p>
                        <p className="text-cream/50 text-sm">Watch others try to guess...</p>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={handleBuzz}
                          disabled={!canBuzz}
                          className="btn-buzz w-full sm:w-auto py-5 sm:py-6 px-8 sm:px-16 rounded-xl text-xl sm:text-2xl"
                        >
                          {canBuzz ? 'BUZZ!' : 'Already Answered'}
                        </button>
                        {!canBuzz && (
                          <p className="text-cream/50 mt-4 text-sm">
                            You can't buzz again on this question
                          </p>
                        )}
                      </>
                    )}
                  </motion.div>
                )}

                {/* Someone Buzzed */}
                {state === 'buzzing' && buzzedPlayer && (
                  <motion.div
                    key="answering"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="text-center mb-4">
                      <p className="text-gold-400 font-display text-xl">
                        {buzzedPlayer.id === playerId ? 'You buzzed!' : `${buzzedPlayer.nickname} buzzed!`}
                      </p>
                    </div>

                    {/* Timer Bar */}
                    <div className="h-3 bg-charcoal rounded-full overflow-hidden mb-6">
                      <motion.div
                        className="timer-bar h-full"
                        initial={{ width: '100%' }}
                        animate={{ width: `${(timeLeft / 15) * 100}%` }}
                        transition={{ duration: 0.1 }}
                      />
                    </div>
                    <div className="text-center mb-6">
                      <span className="font-mono text-4xl text-burgundy-400">{timeLeft}s</span>
                    </div>

                    {/* Answer Input (only for buzzed player) */}
                    {buzzedPlayer.id === playerId ? (
                      <form onSubmit={handleSubmitAnswer} className="flex gap-3">
                        <input
                          ref={answerInputRef}
                          type="text"
                          value={answer}
                          onChange={(e) => setAnswer(e.target.value)}
                          placeholder="Type your answer..."
                          className="input-retro flex-1 px-4 py-4 rounded-lg text-xl"
                          autoComplete="off"
                        />
                        <button
                          type="submit"
                          className="btn-gold py-4 px-8 rounded-lg text-lg"
                        >
                          Submit
                        </button>
                      </form>
                    ) : (
                      <div className="text-center py-4">
                        <div className="spinner w-8 h-8 mx-auto" />
                        <p className="text-cream/60 mt-2">Waiting for answer...</p>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Answer Result */}
                {state === 'answered' && (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-4"
                  >
                    {lastResult?.isCorrect ? (
                      <div>
                        <p className="text-3xl mb-2">🎉</p>
                        <p className="font-display text-2xl text-gold-400">
                          {lastResult.nickname} got it right!
                        </p>
                        <p className="text-gold-500 font-mono text-xl mt-2">
                          +{lastResult.pointsAwarded} points
                        </p>
                      </div>
                    ) : (
                      <p className="text-cream/60">
                        {isHost ? 'Click "Next Question" to continue' : 'Waiting for host...'}
                      </p>
                    )}

                    {/* Picker Score (Custom Mode) */}
                    {pickerScoreInfo && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-6 p-4 rounded-lg bg-gold-600/10 border border-gold-700/30"
                      >
                        <p className="text-gold-400 font-display text-lg mb-2">
                          {pickerScoreInfo.pickerNickname}'s Picker Score
                        </p>
                        {pickerScoreInfo.skipped ? (
                          <p className="text-cream/50 text-sm">Skipped - no points earned</p>
                        ) : (
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-center gap-4 text-cream/60">
                              <span>Obscurity: {pickerScoreInfo.obscurity}/10</span>
                              <span>Avg Points: {pickerScoreInfo.avgPointsEarned}</span>
                              <span>Wrong Guesses: {pickerScoreInfo.wrongGuessCount}</span>
                            </div>
                            <p className="text-gold-500 font-mono text-lg mt-2">
                              +{pickerScoreInfo.pickerPoints} points
                            </p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </motion.div>
                )}

                {/* Picking Phase (shown in buzz area too) */}
                {state === 'picking' && (
                  <motion.div
                    key="picking-buzz"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center py-8"
                  >
                    <p className="text-cream/50">
                      {currentPicker?.id === playerId
                        ? 'Enter your answer above!'
                        : `Waiting for ${currentPicker?.nickname} to pick...`}
                    </p>
                  </motion.div>
                )}

                {/* Loading */}
                {state === 'loading' && (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center py-8"
                  >
                    <div className="spinner w-8 h-8 mx-auto" />
                    <p className="text-cream/60 mt-4">Loading next question...</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Last Result Toast */}
            <AnimatePresence>
              {lastResult && state !== 'answered' && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className={`p-4 rounded-lg text-center ${
                    lastResult.isCorrect
                      ? 'bg-green-900/50 border border-green-500'
                      : 'bg-burgundy-900/50 border border-burgundy-500'
                  }`}
                >
                  {lastResult.isTimeout ? (
                    <p className="text-burgundy-300">
                      {lastResult.nickname} ran out of time! ({lastResult.pointsAwarded} pts)
                    </p>
                  ) : lastResult.isCorrect ? (
                    <p className="text-green-300">
                      {lastResult.nickname} answered correctly! (+{lastResult.pointsAwarded} pts)
                    </p>
                  ) : (
                    <p className="text-burgundy-300">
                      {lastResult.nickname} answered "{lastResult.answer}" - Wrong! ({lastResult.pointsAwarded} pts)
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Scoreboard */}
          <div className="lg:col-span-1 order-first lg:order-last">
            <div className="card-retro p-4 lg:p-6 lg:sticky lg:top-4">
              <h2 className="font-display text-lg lg:text-xl text-gold-400 mb-3 lg:mb-4">Scoreboard</h2>
              {/* Horizontal scroll on mobile, vertical list on desktop */}
              <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-2 px-2 lg:mx-0 lg:px-0">
                {sortedPlayers.map((player, index) => (
                  <motion.div
                    key={player.id}
                    layout
                    className={`player-item flex-shrink-0 lg:flex-shrink min-w-[140px] lg:min-w-0 ${
                      buzzedPlayer?.id === player.id ? 'buzzing' : ''
                    } ${gameMode === 'custom' && currentPicker?.id === player.id ? 'border-l-2 border-l-gold-500' : ''}`}
                  >
                    <div className="flex items-center gap-2 lg:gap-3">
                      <span className="w-5 h-5 lg:w-6 lg:h-6 rounded-full bg-gold-600/30 flex items-center justify-center text-[10px] lg:text-xs font-mono text-gold-400">
                        {index + 1}
                      </span>
                      <span className="text-cream text-xs lg:text-sm truncate max-w-[80px] lg:max-w-[100px]">
                        {player.nickname}
                        {player.isHost && (
                          <span className="text-gold-500 ml-1">★</span>
                        )}
                        {gameMode === 'custom' && currentPicker?.id === player.id && (
                          <span className="text-[10px] lg:text-xs text-gold-400 ml-1">(picker)</span>
                        )}
                      </span>
                    </div>
                    <motion.span
                      key={player.score}
                      initial={{ scale: 1.3 }}
                      animate={{ scale: 1 }}
                      className="score-display px-2 lg:px-3 py-0.5 lg:py-1 rounded text-xs lg:text-sm"
                    >
                      {player.score}
                    </motion.span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

import { getRandomTopic } from './wikipedia.js';
import { generateClues, gradeAnswer } from './claude.js';

export class GameManager {
  constructor(io, roomManager) {
    this.io = io;
    this.roomManager = roomManager;
    this.games = new Map(); // roomId -> gameState
  }

  async startGame(roomId) {
    const room = this.roomManager.getRoom(roomId);
    if (!room) return;

    this.roomManager.updateRoomState(roomId, 'playing');

    const isCustomMode = room.settings.gameMode === 'custom';

    // Initialize game state
    const gameState = {
      roomId,
      questionNumber: 0,
      currentQuestion: null,
      revealedClues: [],
      buzzedPlayer: null,
      buzzTimer: null,
      answerTimerEnd: null,
      state: 'loading', // loading, picking, revealing, buzzing, answered
      isLoadingQuestion: false,
      // Custom mode specific
      gameMode: room.settings.gameMode,
      pickerIndex: 0, // Index into players array for current picker
      currentPicker: null,
      roundPointsEarned: [], // Track points earned by guessers this round
      wrongGuessCount: 0 // Track wrong guesses this round
    };

    this.games.set(roomId, gameState);

    // Notify clients game is starting
    this.io.to(roomId).emit('game-started', {
      gameMode: room.settings.gameMode
    });

    if (isCustomMode) {
      // Start picking phase after a brief delay to let clients mount GameView
      setTimeout(() => {
        this.startPickingPhase(roomId);
      }, 500);
    } else {
      // Wikipedia mode - load first question
      await this.loadNextQuestion(roomId);
    }
  }

  // Custom Mode: Start the picking phase
  startPickingPhase(roomId) {
    const gameState = this.games.get(roomId);
    const room = this.roomManager.getRoom(roomId);
    if (!gameState || !room) return;

    gameState.questionNumber++;
    gameState.state = 'picking';
    gameState.revealedClues = [];
    gameState.buzzedPlayer = null;
    gameState.currentQuestion = null;
    gameState.roundPointsEarned = [];
    gameState.wrongGuessCount = 0;
    gameState.isLoadingQuestion = false;

    // Get current picker (rotate through players)
    const picker = room.players[gameState.pickerIndex % room.players.length];
    gameState.currentPicker = { id: picker.id, nickname: picker.nickname };

    console.log(`[${roomId}] Q${gameState.questionNumber}: Picker is ${picker.nickname}`);

    this.io.to(roomId).emit('picking-phase', {
      questionNumber: gameState.questionNumber,
      picker: gameState.currentPicker
    });
  }

  // Custom Mode: Handle picker submitting their answer
  async handlePickerSubmit(roomId, playerId, customAnswer) {
    const gameState = this.games.get(roomId);
    if (!gameState || gameState.state !== 'picking') return;
    if (!gameState.currentPicker || gameState.currentPicker.id !== playerId) return;

    if (!customAnswer || customAnswer.trim().length < 2) {
      return; // Invalid answer
    }

    gameState.isLoadingQuestion = true;
    gameState.state = 'loading';

    const questionNum = gameState.questionNumber;
    const topic = customAnswer.trim();

    console.log(`[${roomId}] Q${questionNum}: Picker chose "${topic}"`);

    this.io.to(roomId).emit('game-state', {
      state: 'loading',
      questionNumber: questionNum,
      picker: gameState.currentPicker
    });

    try {
      const cluesStart = Date.now();
      const { clues, answerDifficulty } = await generateClues(topic);
      console.log(`[${roomId}] Q${questionNum}: Generated ${clues.length} clues in ${Date.now() - cluesStart}ms (obscurity: ${answerDifficulty}/10)`);

      // Check if game still exists
      const currentState = this.games.get(roomId);
      if (!currentState || currentState.questionNumber !== questionNum) {
        console.log(`[${roomId}] Q${questionNum}: Stale question, discarding`);
        return;
      }

      gameState.currentQuestion = {
        answer: topic,
        clues: clues,
        answerDifficulty: answerDifficulty,
        pickedBy: gameState.currentPicker
      };

      gameState.state = 'revealing';
      gameState.isLoadingQuestion = false;

      this.io.to(roomId).emit('question-ready', {
        questionNumber: questionNum,
        totalClues: 10,
        answerDifficulty: answerDifficulty,
        picker: gameState.currentPicker
      });

      console.log(`[${roomId}] Q${questionNum}: Ready for play`);
    } catch (error) {
      console.error(`[${roomId}] Q${questionNum}: Error generating clues:`, error.message);
      gameState.isLoadingQuestion = false;
      gameState.state = 'picking';

      this.io.to(roomId).emit('picker-error', {
        message: 'Failed to generate clues for that answer. Try something else!'
      });
    }
  }

  // Wikipedia Mode: Load next question
  async loadNextQuestion(roomId) {
    const gameState = this.games.get(roomId);
    if (!gameState) return;

    // Prevent concurrent loading
    if (gameState.isLoadingQuestion) {
      console.log(`[${roomId}] Already loading a question, skipping duplicate call`);
      return;
    }

    gameState.isLoadingQuestion = true;
    gameState.state = 'loading';
    gameState.questionNumber++;
    gameState.revealedClues = [];
    gameState.buzzedPlayer = null;
    gameState.roundPointsEarned = [];
    gameState.wrongGuessCount = 0;

    const questionNum = gameState.questionNumber;
    console.log(`[${roomId}] Loading question #${questionNum}...`);

    this.io.to(roomId).emit('game-state', {
      state: 'loading',
      questionNumber: questionNum
    });

    try {
      // Get a random topic and generate clues
      const topicStart = Date.now();
      const topic = await getRandomTopic();
      console.log(`[${roomId}] Q${questionNum}: Selected topic "${topic}" in ${Date.now() - topicStart}ms`);

      const cluesStart = Date.now();
      const { clues, answerDifficulty } = await generateClues(topic);
      console.log(`[${roomId}] Q${questionNum}: Generated ${clues.length} clues in ${Date.now() - cluesStart}ms (obscurity: ${answerDifficulty}/10)`);

      // Check if game still exists and this is still the current question
      const currentState = this.games.get(roomId);
      if (!currentState || currentState.questionNumber !== questionNum) {
        console.log(`[${roomId}] Q${questionNum}: Stale question, discarding`);
        return;
      }

      gameState.currentQuestion = {
        answer: topic,
        clues: clues,
        answerDifficulty: answerDifficulty
      };

      gameState.state = 'revealing';
      gameState.isLoadingQuestion = false;

      this.io.to(roomId).emit('question-ready', {
        questionNumber: questionNum,
        totalClues: 10,
        answerDifficulty: answerDifficulty
      });

      console.log(`[${roomId}] Q${questionNum}: Ready for play`);
    } catch (error) {
      console.error(`[${roomId}] Q${questionNum}: Error loading question:`, error.message);
      gameState.isLoadingQuestion = false;

      this.io.to(roomId).emit('game-error', { message: 'Failed to generate question. Retrying...' });

      // Retry after a delay (only if still current question)
      setTimeout(() => {
        const currentState = this.games.get(roomId);
        if (currentState && currentState.questionNumber === questionNum && currentState.state === 'loading') {
          gameState.questionNumber--; // Decrement so it gets the same number on retry
          this.loadNextQuestion(roomId);
        }
      }, 3000);
    }
  }

  revealNextClue(roomId) {
    const gameState = this.games.get(roomId);
    if (!gameState || gameState.state !== 'revealing') return;

    const clueIndex = gameState.revealedClues.length;
    if (clueIndex >= 10) return;

    const clue = gameState.currentQuestion.clues[clueIndex];
    gameState.revealedClues.push(clue);

    this.io.to(roomId).emit('clue-revealed', {
      clue,
      cluesRevealed: gameState.revealedClues.length,
      currentPoints: 10 - clueIndex
    });
  }

  handleBuzz(roomId, playerId, nickname) {
    const gameState = this.games.get(roomId);
    if (!gameState || gameState.state !== 'revealing' || gameState.buzzedPlayer) return;

    // In custom mode, picker can't buzz
    if (gameState.gameMode === 'custom' && gameState.currentPicker?.id === playerId) {
      return;
    }

    gameState.state = 'buzzing';
    gameState.buzzedPlayer = { id: playerId, nickname };
    gameState.answerTimerEnd = Date.now() + 15000; // 15 seconds to answer

    this.io.to(roomId).emit('player-buzzed', {
      playerId,
      nickname,
      timerEnd: gameState.answerTimerEnd
    });

    // Start timer - auto-timeout if they don't answer
    gameState.buzzTimer = setTimeout(() => {
      this.handleAnswerTimeout(roomId);
    }, 15000);
  }

  async handleAnswer(roomId, playerId, answer) {
    const gameState = this.games.get(roomId);
    if (!gameState || gameState.state !== 'buzzing') return;
    if (!gameState.buzzedPlayer || gameState.buzzedPlayer.id !== playerId) return;

    // Clear the timer
    if (gameState.buzzTimer) {
      clearTimeout(gameState.buzzTimer);
      gameState.buzzTimer = null;
    }

    const room = this.roomManager.getRoom(roomId);
    const correctAnswer = gameState.currentQuestion.answer;
    const isCorrect = await gradeAnswer(correctAnswer, answer);
    const currentPoints = 10 - (gameState.revealedClues.length - 1);

    if (isCorrect) {
      // Award points to guesser
      this.roomManager.updatePlayerScore(roomId, playerId, currentPoints);
      gameState.state = 'answered';

      // Track points earned for custom mode scoring
      gameState.roundPointsEarned.push(currentPoints);

      this.io.to(roomId).emit('answer-result', {
        playerId,
        nickname: gameState.buzzedPlayer.nickname,
        answer,
        correctAnswer,
        isCorrect: true,
        pointsAwarded: currentPoints,
        players: room.players
      });

      // In custom mode, calculate and award picker points
      if (gameState.gameMode === 'custom') {
        this.awardPickerPoints(roomId);
      }
    } else {
      // Apply penalty
      const penalty = room.settings.wrongAnswerPenalty;
      this.roomManager.updatePlayerScore(roomId, playerId, penalty);
      gameState.wrongGuessCount++;

      this.io.to(roomId).emit('answer-result', {
        playerId,
        nickname: gameState.buzzedPlayer.nickname,
        answer,
        isCorrect: false,
        pointsAwarded: penalty,
        players: room.players
      });

      // Reset to revealing state so others can buzz
      gameState.buzzedPlayer = null;
      gameState.state = 'revealing';

      this.io.to(roomId).emit('resume-revealing');
    }
  }

  // Custom Mode: Calculate and award points to the picker
  awardPickerPoints(roomId) {
    const gameState = this.games.get(roomId);
    const room = this.roomManager.getRoom(roomId);
    if (!gameState || !room || !gameState.currentPicker) return;

    const obscurity = gameState.currentQuestion.answerDifficulty;
    const avgPointsEarned = gameState.roundPointsEarned.length > 0
      ? gameState.roundPointsEarned.reduce((a, b) => a + b, 0) / gameState.roundPointsEarned.length
      : 10; // If no one got it, treat as if they got max points (bad for picker)

    // Picker wants: low obscurity (well-known) but hard to guess quickly
    // Formula: (10 - obscurity) * (10 - avgPointsEarned) / 10
    // This gives 0-10 points for a well-known answer that people struggled with
    // Bonus for wrong guesses
    const baseScore = ((10 - obscurity) * (10 - avgPointsEarned)) / 10;
    const wrongGuessBonus = gameState.wrongGuessCount * 0.5; // 0.5 points per wrong guess
    const pickerPoints = Math.round(Math.max(0, baseScore + wrongGuessBonus));

    console.log(`[${roomId}] Picker score: obscurity=${obscurity}, avgPoints=${avgPointsEarned.toFixed(1)}, wrongGuesses=${gameState.wrongGuessCount}, total=${pickerPoints}`);

    this.roomManager.updatePlayerScore(roomId, gameState.currentPicker.id, pickerPoints);

    this.io.to(roomId).emit('picker-scored', {
      pickerId: gameState.currentPicker.id,
      pickerNickname: gameState.currentPicker.nickname,
      obscurity,
      avgPointsEarned: avgPointsEarned.toFixed(1),
      wrongGuessCount: gameState.wrongGuessCount,
      pickerPoints,
      players: room.players
    });
  }

  handleAnswerTimeout(roomId) {
    const gameState = this.games.get(roomId);
    if (!gameState || gameState.state !== 'buzzing') return;

    const room = this.roomManager.getRoom(roomId);
    const penalty = room.settings.wrongAnswerPenalty;

    // Apply penalty for timing out
    this.roomManager.updatePlayerScore(roomId, gameState.buzzedPlayer.id, penalty);
    gameState.wrongGuessCount++;

    this.io.to(roomId).emit('answer-timeout', {
      playerId: gameState.buzzedPlayer.id,
      nickname: gameState.buzzedPlayer.nickname,
      pointsAwarded: penalty,
      players: room.players
    });

    // Reset to revealing state
    gameState.buzzedPlayer = null;
    gameState.buzzTimer = null;
    gameState.state = 'revealing';

    this.io.to(roomId).emit('resume-revealing');
  }

  nextQuestion(roomId) {
    const gameState = this.games.get(roomId);
    if (!gameState) return;

    // Don't allow next question if already loading
    if (gameState.isLoadingQuestion) {
      console.log(`[${roomId}] Already loading, ignoring next-question`);
      return;
    }

    // If current question wasn't answered, reveal the answer first
    if (gameState.state === 'revealing' && gameState.currentQuestion) {
      this.io.to(roomId).emit('question-skipped', {
        correctAnswer: gameState.currentQuestion.answer
      });

      // In custom mode, picker gets 0 points if skipped (no one got it)
      if (gameState.gameMode === 'custom' && gameState.currentPicker) {
        this.io.to(roomId).emit('picker-scored', {
          pickerId: gameState.currentPicker.id,
          pickerNickname: gameState.currentPicker.nickname,
          obscurity: gameState.currentQuestion.answerDifficulty,
          avgPointsEarned: 'N/A',
          wrongGuessCount: gameState.wrongGuessCount,
          pickerPoints: 0,
          skipped: true,
          players: this.roomManager.getRoom(roomId).players
        });
      }
    }

    // Rotate picker for custom mode
    if (gameState.gameMode === 'custom') {
      gameState.pickerIndex++;
    }

    // Load next question after a small delay
    setTimeout(() => {
      if (gameState.gameMode === 'custom') {
        this.startPickingPhase(roomId);
      } else {
        this.loadNextQuestion(roomId);
      }
    }, 2000);
  }

  endGame(roomId) {
    const gameState = this.games.get(roomId);
    if (!gameState) return;

    if (gameState.buzzTimer) {
      clearTimeout(gameState.buzzTimer);
    }

    const room = this.roomManager.getRoom(roomId);
    this.roomManager.updateRoomState(roomId, 'finished');

    this.io.to(roomId).emit('game-ended', {
      players: room.players.sort((a, b) => b.score - a.score)
    });

    this.games.delete(roomId);
  }
}

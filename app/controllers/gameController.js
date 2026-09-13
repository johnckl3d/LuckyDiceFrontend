import {
  pingEngine,
  rollDice,
  startGame,
  submitHand,
  tallyHands,
} from "../services/apiService.js";
import { TIMER_SECONDS, aiDelay, wait } from "../utils/helpers.js";
import {
  applyAllowedPlacements,
  canDrag,
  currentPlayer,
  defaultPlayers,
  isHumanTurn,
  playerById,
  resetBoard,
  revertInvalidPlacements,
  standingValues,
  state,
  toggleReroll,
  toggleSelected,
  tryPlace,
} from "../models/gameModel.js";
import {
  bindGameView,
  getSeatCount,
  hideResult,
  initResultModal,
  renderBoard,
  renderPlayers,
  renderRanking,
  setEngineStatus,
  setRankingNote,
  setStatus,
  setTimerDisplay,
  showGameScreen,
  showResult,
} from "../views/gameView.js";

let timerId = null;
let gameReady = false;

function clearTimer() {
  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function startArrangeTimer() {
  clearTimer();
  state.secondsLeft = TIMER_SECONDS;
  setTimerDisplay(state.secondsLeft, TIMER_SECONDS);
  timerId = window.setInterval(async () => {
    state.secondsLeft -= 1;
    setTimerDisplay(state.secondsLeft, TIMER_SECONDS);
    if (state.secondsLeft <= 0) {
      clearTimer();
      await submitCurrentBoard();
    }
  }, 1000);
}

function onDieClick(index) {
  if (state.phase === "select-reroll" && isHumanTurn()) {
    toggleReroll(index);
    renderBoard();
    return;
  }

  if (!canDrag()) {
    return;
  }

  toggleSelected(index);
  renderBoard();
}

function onSlotClick(row) {
  if (!canDrag() || state.selected.size === 0) {
    return;
  }
  placeDice([...state.selected], row);
}

function onDragStart(index) {
  if (!state.selected.has(index)) {
    state.selected.clear();
    state.selected.add(index);
  }
}

function onDrop(index, row) {
  const moving = state.selected.size ? [...state.selected] : [index];
  if (!moving.includes(index)) {
    moving.push(index);
  }
  placeDice(moving, row);
}

function placeDice(indices, row) {
  const result = tryPlace(indices, row);
  if (result.invalidDrop) {
    setStatus("That drop is not allowed for this hand.");
  }
  renderBoard();
}

async function beginHumanRollRound1() {
  state.phase = "idle";
  renderBoard();
  await takeRoll([false, false, false, false, false]);
}

async function takeRoll(held) {
  const result = await rollDice({
    gameId: state.gameId,
    playerId: state.currentPlayerId,
    held,
  });

  state.values = result.values;
  state.placements = [2, 2, 2, 2, 2];
  state.allowedDrops = result.allowedDrops;
  state.lastHandName = result.handName;
  state.selected.clear();
  state.reroll = [false, false, false, false, false];

  if (result.instantWin) {
    await handleInstantWin(result);
    return result;
  }

  if (isHumanTurn()) {
    state.phase = "arrange";
    setStatus(
      `Round ${state.round} · Your turn · ${result.handName}. Drag a pair to row 3 (second pair to row 4), then submit.`
    );
    renderPlayers();
    renderBoard();
    startArrangeTimer();
  }

  return result;
}

async function handleInstantWin(result) {
  clearTimer();
  setTimerDisplay(null, TIMER_SECONDS);
  state.phase = "game-over";
  const winner = currentPlayer();
  state.ranking = [
    {
      playerId: winner.id,
      place: 1,
      handRank: result.handRank,
      handName: result.handName,
      values: result.values,
    },
  ];
  renderRanking();
  renderPlayers();
  renderBoard();
  setRankingNote("Sequence 1-2-3-4-5 wins the game immediately.");
  setStatus(`Instant win · ${winner.name} · sequence 1-2-3-4-5`);
  showResult("Instant win", `${winner.name}: sequence 1-2-3-4-5. That wins the game.`);
}

async function submitCurrentBoard() {
  if (state.phase !== "arrange") {
    return;
  }

  clearTimer();
  state.phase = "submitting";
  setTimerDisplay(0, TIMER_SECONDS);
  renderBoard();

  const response = await submitHand({
    gameId: state.gameId,
    playerId: state.currentPlayerId,
    values: state.values,
    placements: state.placements,
  });

  if (!response.accepted) {
    revertInvalidPlacements();
    state.phase = "arrange";
    setStatus(response.error || "Submit was rejected.");
    renderBoard();
    if (isHumanTurn()) {
      startArrangeTimer();
    }
    return;
  }

  state.lastHandName = response.handName;
  state.selected.clear();

  if (state.round === 1 && response.roundComplete) {
    await finishRound1();
    return;
  }

  if (state.round === 2 && response.roundComplete) {
    await finishRound2();
    return;
  }

  await startTurn(response.nextPlayerId);
}

async function finishRound1() {
  const tally = await tallyHands({ gameId: state.gameId, phase: "round1" });
  state.ranking = tally.ranking;
  state.round = 2;
  renderRanking();
  const next = playerById(tally.nextPlayerId);
  setRankingNote(`${next.name} ranked last and will reroll in round 2.`);
  setStatus(`Round 1 tally complete. ${next.name} is last and takes round 2.`);
  await startTurn(tally.nextPlayerId);
}

async function finishRound2() {
  const tally = await tallyHands({ gameId: state.gameId, phase: "round2" });
  state.ranking = tally.ranking;
  renderRanking();
  renderPlayers();

  if (tally.restart || tally.loserId) {
    const loser = playerById(tally.loserId);
    state.phase = "game-over";
    setRankingNote(`${loser.name} is still last and loses. Starting a new game.`);
    setStatus(`${loser.name} could not compete. Restarting…`);
    renderBoard();
    showResult(
      "Could not compete",
      `${loser.name} is still last after round 2. The game will restart.`
    );
    window.setTimeout(() => newGame(), 2000);
    return;
  }

  state.phase = "game-over";
  setRankingNote("The round-2 player is no longer last. No further rounds in this version.");
  setStatus("Round 2 complete. The acting player stayed in.");
  renderBoard();
  showResult(
    "Stayed in",
    "The round-2 player is no longer uniquely last. Play stops here until more rounds are added."
  );
}

async function startTurn(playerId) {
  state.currentPlayerId = playerId;
  resetBoard(state.round === 2 ? standingValues(playerId) : [1, 1, 1, 1, 1]);
  renderPlayers();
  clearTimer();
  setTimerDisplay(null, TIMER_SECONDS);

  const player = currentPlayer();
  if (player.kind === "ai") {
    await runAiTurn();
    return;
  }

  if (state.round === 2) {
    state.phase = "select-reroll";
    setStatus("Round 2 · Click any dice to reroll, then click Reroll selected.");
    renderBoard();
    return;
  }

  await beginHumanRollRound1();
}

async function runAiTurn() {
  state.phase = "waiting";
  renderBoard();
  setStatus(`Round ${state.round} · ${currentPlayer().name} is playing…`);

  await wait(aiDelay());

  let held = [false, false, false, false, false];
  if (state.round === 2) {
    const standing = evaluateHand(standingValues(state.currentPlayerId));
    const keep = new Set([...standing.allowedDrops.row3, ...standing.allowedDrops.row4]);
    held = state.values.map((_, index) => keep.has(index));
    if (keep.size === 0) {
      held = [false, false, false, false, false];
    }
  }

  const result = await takeRoll(held);
  if (state.phase === "game-over") {
    return;
  }

  applyAllowedPlacements();
  state.phase = "arrange";
  renderBoard();
  await wait(aiDelay());
  await submitCurrentBoard();
}

async function newGame() {
  clearTimer();
  hideResult();
  setTimerDisplay(null, TIMER_SECONDS);
  state.ranking = [];
  state.round = 1;
  state.phase = "idle";
  state.selected.clear();
  setRankingNote("After everyone submits round 1, the lowest hand rolls in round 2.");
  renderRanking();

  const started = await startGame(defaultPlayers(getSeatCount()));
  state.gameId = started.gameId;
  state.players = started.players;
  state.round = started.round;
  state.currentPlayerId = started.currentPlayerId;
  resetBoard();
  renderPlayers();
  await startTurn(state.currentPlayerId);
}

async function showEngineStatus() {
  const status = await pingEngine();
  if (status.ok) {
    setEngineStatus("Engine: connected");
  } else {
    setEngineStatus("Engine: unreachable");
  }
}

async function handleReroll() {
  if (state.phase !== "select-reroll") {
    return;
  }
  const held = state.reroll.map((mark) => !mark);
  await takeRoll(held);
}

export function leaveGame() {
  clearTimer();
  hideResult();
  showGameScreen(false);
}

export function enterGame() {
  if (!gameReady) {
    bindGameView({
      onDieClick,
      onSlotClick,
      onDragStart,
      onDrop,
      onSubmit: submitCurrentBoard,
      onReroll: handleReroll,
      onNewGame: newGame,
    });
    gameReady = true;
    initResultModal();
  }

  showGameScreen(true);
  showEngineStatus();
  newGame();
}

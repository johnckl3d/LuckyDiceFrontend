import {
  isSessionExpiredError,
  joinGame,
  pingEngine,
  rollDice,
  startGame,
  submitHand,
  subscribeGameNotifications,
  tallyHands,
} from "../services/apiService.js";
import { TIMER_SECONDS, aiDelay, wait } from "../utils/helpers.js";
import {
  applyAllowedPlacements,
  canDrag,
  currentPlayer,
  defaultPlayers,
  isHumanTurn,
  normalizePlayer,
  localPlayerId,
  playerById,
  playerMatches,
  resetBoard,
  revertInvalidPlacements,
  setOpeningRoll,
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
  renderOpponentBoards,
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

  const faces = parseDiceValues(result?.values ?? result?.dice);
  if (faces.length !== 5) {
    return result;
  }

  state.values = faces;
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
  state.openingRolls = {};
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

function applyStartedGame(started) {
  clearTimer();
  hideResult();
  setTimerDisplay(null, TIMER_SECONDS);
  state.ranking = [];
  state.round = started.round ?? 1;
  state.phase = "idle";
  state.selected.clear();
  state.openingRolls = {};
  setRankingNote("After everyone submits round 1, the lowest hand rolls in round 2.");
  renderRanking();

  state.gameId = started.gameId;
  state.players = (started.players ?? []).map(normalizePlayer);
  state.currentPlayerId = started.currentPlayerId;
  resetBoard();
  renderPlayers();
}

function pick(object, names) {
  for (const name of names) {
    if (object?.[name] != null) {
      return object[name];
    }
  }
  return undefined;
}

function parseJsonPayload(payload) {
  if (typeof payload !== "string") {
    return payload;
  }
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function parseDiceValues(raw) {
  if (Array.isArray(raw)) {
    return raw.map(Number).filter((value) => value >= 1 && value <= 6);
  }
  if (typeof raw === "string") {
    return raw
      .split(/[,\s]+/)
      .map(Number)
      .filter((value) => value >= 1 && value <= 6);
  }
  return [];
}

function normalizeOpeningRolled(payload) {
  const data = parseJsonPayload(payload);
  if (!data) {
    return [];
  }

  const items = Array.isArray(data.rolls)
    ? data.rolls
    : Array.isArray(data.Rolls)
      ? data.Rolls
      : [];

  return items
    .map((item) => {
      const fromDice = parseDiceValues(pick(item, ["dice", "Dice"]));
      const values = fromDice.length ? fromDice : parseDiceValues(pick(item, ["values", "Values"]));
      return {
        playerId: pick(item, ["playerId", "PlayerId", "id", "Id", "userId", "UserId"]),
        values,
        allowedDrops: pick(item, ["allowedDrops", "AllowedDrops"]) ?? { row3: [], row4: [] },
        handName: pick(item, ["handName", "HandName"]) ?? "",
        instantWin: Boolean(pick(item, ["instantWin", "InstantWin"])),
      };
    })
    .filter((item) => item.playerId && item.values.length);
}

export function applyOpeningRolled(payload) {
  const rolls = normalizeOpeningRolled(payload);
  if (!rolls.length) {
    return;
  }

  const selfId = localPlayerId();
  rolls.forEach((roll) => {
    const player = state.players.find((entry) => playerMatches(entry, roll.playerId));
    const playerId = player?.id ?? roll.playerId;
    setOpeningRoll(playerId, roll.values);
    if (String(playerId) !== String(roll.playerId)) {
      setOpeningRoll(roll.playerId, roll.values);
    }

    const isLocal =
      (selfId && String(playerId) === String(selfId)) ||
      (player && playerMatches(player, selfId));
    const phaseOk = state.phase === "idle" || state.phase === "waiting";
    if (isLocal) {
      state.values = roll.values.slice(0, 5);
      state.placements = roll.values.slice(0, 5).map(() => 2);
      state.allowedDrops = roll.allowedDrops;
      state.lastHandName = roll.handName;
      if (roll.instantWin) {
        handleInstantWin(roll);
      } else if (phaseOk || state.phase === "arrange") {
        state.phase = "arrange";
        setStatus(
          `Round ${state.round} · Your turn · ${roll.handName || "opening roll"}. Drag a pair to row 3 (second pair to row 4), then submit.`
        );
        startArrangeTimer();
      }
    }
  });

  renderOpponentBoards();
  renderBoard();
}

async function listenForGameNotifications() {
  try {
    await subscribeGameNotifications({
      onOpeningRolled: applyOpeningRolled,
    });
  } catch {
    // Engine status already covers connection errors.
  }
}

export async function enterGame(started) {
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
  await listenForGameNotifications();

  const gameId = started?.gameId ?? started?.GameId;
  if (!gameId) {
    if (started == null) {
      newGame();
    } else {
      setStatus("Could not join the table: missing gameId.");
    }
    return;
  }

  applyStartedGame({ ...started, gameId });
  try {
    await joinGame(gameId);
    setStatus("Game started. Waiting for opening roll…");
  } catch (error) {
    if (!isSessionExpiredError(error)) {
      setStatus(error.message || "Could not join the game.");
    }
  }
}

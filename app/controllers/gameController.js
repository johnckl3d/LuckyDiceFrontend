import {
  arrangeOpening,
  isSessionExpiredError,
  joinGame,
  openingTally,
  onGameOver,
  onRoundTally,
  pingEngine,
  rollDice,
  reroll1,
  reroll1Arrange,
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
  isLocalPlayer,
  isReroll1Arrange,
  normalizePlayer,
  localPlayerId,
  playerById,
  playerMatches,
  resetBoard,
  resetRerollSlots,
  rerollDiceFaces,
  revertInvalidPlacements,
  setOpeningArrangement,
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
  setStakeDisplay,
  setOpeningTallyOkBusy,
  setStatus,
  setTimerDisplay,
  showGameScreen,
  showResult,
} from "../views/gameView.js";

let timerId = null;
let gameReady = false;
let gamePhase = null;

function setGamePhase(eventName) {
  gamePhase = eventName;
  state.gamePhase = eventName;
}

function clearTimer() {
  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function turnDuration() {
  const seconds = Number(state.turnTime);
  return seconds > 0 ? seconds : TIMER_SECONDS;
}

function startArrangeTimer({ autoSubmit = true } = {}) {
  clearTimer();
  const total = turnDuration();
  state.secondsLeft = total;
  setTimerDisplay(state.secondsLeft, total);
  timerId = window.setInterval(async () => {
    state.secondsLeft -= 1;
    setTimerDisplay(state.secondsLeft, turnDuration());
    if (state.secondsLeft <= 0) {
      clearTimer();
      if (autoSubmit) {
        await handleSubmit();
      }
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

function onSlotClick(row, slotIndex) {
  if (!canDrag() || state.selected.size === 0) {
    return;
  }
  placeDice([...state.selected], row, slotIndex);
}

function onDragStart(index) {
  if (!state.selected.has(index)) {
    state.selected.clear();
    state.selected.add(index);
  }
}

function onDrop(index, row, slotIndex) {
  const moving = state.selected.size ? [...state.selected] : [index];
  if (!moving.includes(index)) {
    moving.push(index);
  }
  placeDice(moving, row, slotIndex);
}

function placeDice(indices, row, slotIndex) {
  const result = tryPlace(indices, row, slotIndex);
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
      `Round ${state.round} · Your turn · ${result.handName}. Drag a pair to set1 (second pair to set2), then submit.`
    );
    renderPlayers();
    renderBoard();
    startArrangeTimer();
  }

  return result;
}

async function handleInstantWin(result) {
  clearTimer();
  setTimerDisplay(null, turnDuration());
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

function diceRowsFromBoard() {
  const set1 = [];
  const set2 = [];
  const flux = [];
  state.values.forEach((face, index) => {
    const row = state.placements[index];
    const value = String(face);
    if (row === 3) {
      set1.push(value);
    } else if (row === 4) {
      set2.push(value);
    } else {
      flux.push(value);
    }
  });
  return { set1, set2, flux };
}

function openingArrangePayload(target) {
  const { set1, set2, flux } = diceRowsFromBoard();
  return { gameId: state.gameId, target, set1, set2, flux };
}

function boardDicePayload() {
  const { set1, set2, flux } = diceRowsFromBoard();
  return { gameId: state.gameId, set1, set2, flux };
}

function reroll1Payload() {
  const { set1, set2 } = diceRowsFromBoard();
  return {
    gameId: state.gameId,
    dice: {
      set1,
      set2,
      discarded: rerollDiceFaces(),
    },
  };
}

function restoreArrangeAfterReject(message) {
  revertInvalidPlacements();
  state.phase = "arrange";
  setStatus(message);
  renderBoard();
  if (isHumanTurn()) {
    startArrangeTimer();
  }
}

async function handleSubmit() {
  if (isReroll1Arrange()) {
    await submitReroll1Arrange();
    return;
  }
  await submitOpeningArrange();
}

async function submitReroll1Arrange() {
  if (!isReroll1Arrange() || !isLocalPlayer(state.loserId)) {
    return;
  }

  clearTimer();
  state.phase = "submitting";
  setTimerDisplay(0, turnDuration());
  renderBoard();

  let response;
  try {
    const payload = boardDicePayload();
    response = await reroll1Arrange(payload);
  } catch (error) {
    if (isSessionExpiredError(error)) {
      return;
    }
    restoreReroll1ArrangeAfterReject(error.message || "Submit was rejected.");
    return;
  }

  if (response && response.accepted === false) {
    restoreReroll1ArrangeAfterReject(response.error || "Submit was rejected.");
    return;
  }

  state.selected.clear();
  if (isReroll1Arrange() || state.gamePhase === "onReroll1Arrange") {
    return;
  }
  state.phase = "waiting";
  setStatus("Arrangement submitted. Waiting for other players…");
  renderBoard();
}

function restoreReroll1ArrangeAfterReject(message) {
  state.phase = "onReroll1Arrange";
  setStatus(message);
  renderBoard();
  if (isLocalPlayer(state.loserId)) {
    startArrangeTimer();
  }
}

async function submitChallenge1Reroll() {
  if (state.phase !== "challenge1-select" || !isLocalPlayer(state.loserId)) {
    return;
  }

  clearTimer();
  state.phase = "submitting";
  setTimerDisplay(0, turnDuration());
  renderBoard();

  let response;
  try {
    response = await reroll1(reroll1Payload());
  } catch (error) {
    if (isSessionExpiredError(error)) {
      return;
    }
    state.phase = "challenge1-select";
    setStatus(error.message || "Submit was rejected.");
    renderBoard();
    return;
  }

  if (response && response.accepted === false) {
    state.phase = "challenge1-select";
    setStatus(response.error || "Submit was rejected.");
    renderBoard();
    return;
  }

  state.selected.clear();
  state.showRerollBar = false;
  resetRerollSlots();
  if (isReroll1Arrange() || state.gamePhase === "onReroll1Arrange") {
    renderBoard();
    return;
  }
  state.phase = "waiting";
  setStatus("Reroll submitted. Waiting for other players…");
  renderBoard();
}

async function submitOpeningArrange() {
  if (state.phase !== "arrange" || state.round !== 1) {
    await submitCurrentBoard();
    return;
  }

  clearTimer();
  state.phase = "submitting";
  setTimerDisplay(0, turnDuration());
  renderBoard();

  let response;
  try {
    const payload = openingArrangePayload("openingArrange");
    response = await arrangeOpening(payload);
  } catch (error) {
    if (isSessionExpiredError(error)) {
      return;
    }
    restoreArrangeAfterReject(error.message || "Submit was rejected.");
    return;
  }

  if (response && response.accepted === false) {
    restoreArrangeAfterReject(response.error || "Submit was rejected.");
    return;
  }

  state.lastHandName = response?.handName ?? state.lastHandName;
  state.selected.clear();
  if (
    state.phase === "opening-tally" ||
    state.phase === "challenge1-wait" ||
    state.phase === "challenge1-select"
  ) {
    return;
  }
  state.phase = "waiting";
  setStatus("Arrangement submitted. Waiting for other players…");
  renderBoard();

  if (state.round === 1 && response?.roundComplete) {
    await finishRound1();
    return;
  }

  if (response?.nextPlayerId) {
    await startTurn(response.nextPlayerId);
  }
}

async function submitCurrentBoard() {
  if (state.phase !== "arrange") {
    return;
  }

  clearTimer();
  state.phase = "submitting";
  setTimerDisplay(0, turnDuration());
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
  setTimerDisplay(null, turnDuration());

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
  setTimerDisplay(null, turnDuration());
  state.ranking = [];
  state.round = 1;
  state.phase = "idle";
  setGamePhase(null);
  state.selected.clear();
  state.openingRolls = {};
  state.loserId = null;
  state.winnerId = null;
  state.awaitingOpeningTallyAck = false;
  state.turnTime = 0;
  state.stake = null;
  setStakeDisplay(null);
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
  state.awaitingOpeningTallyAck = false;
  setGamePhase(null);
  state.loserId = null;
  state.winnerId = null;
  renderBoard();
  showGameScreen(false);
}

function applyStartedGame(started) {
  const sameGame = started.gameId && String(state.gameId) === String(started.gameId);
  const preservedTurnTime = sameGame ? state.turnTime : 0;
  const preservedStake = sameGame ? state.stake : null;

  clearTimer();
  hideResult();
  setTimerDisplay(null, turnDuration());
  state.ranking = [];
  state.round = started.round ?? 1;
  state.phase = "idle";
  setGamePhase(null);
  state.selected.clear();
  state.openingRolls = {};
  state.loserId = null;
  state.winnerId = null;
  state.awaitingOpeningTallyAck = false;
  state.turnTime = preservedTurnTime;
  state.stake = preservedStake;
  setStakeDisplay(preservedStake);
  setRankingNote("After everyone submits round 1, the lowest hand rolls in round 2.");
  renderRanking();

  state.gameId = started.gameId;
  state.players = (started.players ?? []).map(normalizePlayer);
  state.currentPlayerId = started.currentPlayerId;
  resetBoard();
  renderPlayers();
  renderBoard();
  applyGameDetails(started);
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
  let data = payload;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (data && typeof data === "object" && Array.isArray(data.arguments) && data.arguments.length) {
    return parseJsonPayload(data.arguments[0]);
  }
  return data;
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

export function applyGameDetails(payload) {
  const data = parseJsonPayload(payload);
  if (!data || typeof data !== "object") {
    return;
  }

  const gameId = pick(data, ["gameId", "GameId"]);
  if (gameId && state.gameId && String(gameId) !== String(state.gameId)) {
    return;
  }
  if (gameId && !state.gameId) {
    state.gameId = gameId;
  }

  const turnTime = Number(pick(data, ["turnTime", "TurnTime"]));
  if (Number.isFinite(turnTime) && turnTime > 0) {
    state.turnTime = turnTime;
    if (timerId !== null && (state.phase === "arrange" || isReroll1Arrange())) {
      startArrangeTimer({ autoSubmit: isLocalPlayer(state.loserId) || isHumanTurn() });
    }
  }

  const stake = pick(data, ["stake", "Stake"]);
  if (stake != null) {
    state.stake = stake;
    setStakeDisplay(stake);
  }
}

function normalizeRowFaces(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map(String);
}

function normalizeOpeningTally(payload) {
  const data = parseJsonPayload(payload);
  if (!data || typeof data !== "object") {
    return null;
  }

  const tally = data.tally && typeof data.tally === "object" ? data.tally : {};
  const sourcePlayers = Array.isArray(data.players)
    ? data.players
    : Array.isArray(tally.ranking)
      ? tally.ranking
      : [];

  const players = sourcePlayers
    .map((item) => {
      const playerId = pick(item, ["playerId", "PlayerId", "id", "Id", "userId", "UserId"]);
      if (!playerId) {
        return null;
      }
      return {
        playerId,
        set1: normalizeRowFaces(pick(item, ["set1", "Set1", "row1", "Row1"])),
        set2: normalizeRowFaces(pick(item, ["set2", "Set2", "row2", "Row2"])),
        flux: normalizeRowFaces(pick(item, ["flux", "Flux", "unarranged", "Unarranged"])),
        values: pick(item, ["values", "Values"]),
      };
    })
    .filter(Boolean);

  return {
    gameId: pick(data, ["gameId", "GameId"]) ?? pick(tally, ["gameId", "GameId"]),
    phase: pick(data, ["phase", "Phase"]) ?? pick(tally, ["phase", "Phase"]),
    currentPlayerId:
      pick(data, ["currentPlayerId", "CurrentPlayerId"]) ??
      pick(tally, ["currentPlayerId", "CurrentPlayerId"]),
    loserId:
      pick(data, ["loserId", "LoserId", "loser", "Loser"]) ??
      pick(tally, ["loserId", "LoserId", "loser", "Loser"]),
    winnerId:
      pick(data, ["winnerId", "WinnerId", "winner", "Winner"]) ??
      pick(tally, ["winnerId", "WinnerId", "winner", "Winner"]),
    gameOver: pick(data, ["gameOver", "GameOver"]) ?? pick(tally, ["gameOver", "GameOver"]),
    ranking: Array.isArray(tally.ranking) ? tally.ranking : Array.isArray(data.ranking) ? data.ranking : [],
    nextPlayerId: pick(tally, ["nextPlayerId", "NextPlayerId"]) ?? pick(data, ["nextPlayerId", "NextPlayerId"]),
    players,
  };
}

function normalizeDiceRows(raw) {
  if (Array.isArray(raw)) {
    return { set1: [], set2: [], flux: [], values: raw };
  }
  if (!raw || typeof raw !== "object") {
    return { set1: [], set2: [], flux: [], values: null };
  }
  const nested = pick(raw, ["dices", "Dices", "dice", "Dice"]);
  const source = nested && typeof nested === "object" && !Array.isArray(nested) ? nested : raw;
  return {
    set1: normalizeRowFaces(pick(source, ["set1", "Set1", "row1", "Row1"])),
    set2: normalizeRowFaces(pick(source, ["set2", "Set2", "row2", "Row2"])),
    flux: normalizeRowFaces(
      pick(source, ["flux", "Flux", "unarranged", "Unarranged", "discarded", "Discarded"])
    ),
    values: pick(source, ["values", "Values"]),
  };
}

function normalizePlayersFromDices(dices) {
  if (!dices) {
    return [];
  }
  if (Array.isArray(dices)) {
    return dices
      .map((item) => {
        const playerId = pick(item, ["playerId", "PlayerId", "id", "Id", "userId", "UserId"]);
        if (!playerId) {
          return null;
        }
        return { playerId, ...normalizeDiceRows(item) };
      })
      .filter(Boolean);
  }
  if (typeof dices !== "object") {
    return [];
  }
  return Object.entries(dices)
    .map(([playerId, rows]) => {
      if (!playerId || /^(set1|set2|flux|row1|row2|unarranged|discarded|values)$/i.test(playerId)) {
        return null;
      }
      return { playerId, ...normalizeDiceRows(rows) };
    })
    .filter(Boolean);
}

function normalizeRoundTally(payload) {
  const tally = normalizeOpeningTally(payload);
  if (!tally) {
    return null;
  }

  const data = parseJsonPayload(payload);
  const dices = pick(data, ["dices", "Dices", "dice", "Dice"]);
  const fromDices = normalizePlayersFromDices(dices);
  if (fromDices.length) {
    tally.players = fromDices;
    return tally;
  }

  const sourcePlayers = Array.isArray(data?.players) ? data.players : [];
  if (sourcePlayers.length) {
    tally.players = sourcePlayers
      .map((item) => {
        const playerId = pick(item, ["playerId", "PlayerId", "id", "Id", "userId", "UserId"]);
        if (!playerId) {
          return null;
        }
        return { playerId, ...normalizeDiceRows(item) };
      })
      .filter(Boolean);
  }
  return tally;
}

function applyTallyArrangements(tally) {
  const selfId = localPlayerId();
  tally.players.forEach((entry) => {
    const player = state.players.find((item) => playerMatches(item, entry.playerId));
    const playerId = player?.id ?? entry.playerId;
    const hasRows = entry.set1.length || entry.set2.length || entry.flux.length;
    if (hasRows) {
      setOpeningArrangement(playerId, entry);
      if (String(playerId) !== String(entry.playerId)) {
        setOpeningArrangement(entry.playerId, entry);
      }
    } else {
      const faces = parseDiceValues(entry.values);
      if (faces.length) {
        setOpeningRoll(playerId, faces);
        if (String(playerId) !== String(entry.playerId)) {
          setOpeningRoll(entry.playerId, faces);
        }
      }
    }

    const isLocal =
      (selfId && String(playerId) === String(selfId)) ||
      (player && playerMatches(player, selfId));
    if (isLocal) {
      const roll = state.openingRolls[playerId] ?? state.openingRolls[entry.playerId];
      if (roll) {
        state.values = roll.values.slice();
        state.placements = roll.placements.slice();
      }
    }
  });
}

export function applyOpeningTally(payload) {
  setGamePhase("openingTally");
  const tally = normalizeOpeningTally(payload);
  if (!tally) {
    return;
  }

  const gameId = tally.gameId;
  if (gameId && state.gameId && String(gameId) !== String(state.gameId)) {
    return;
  }
  if (gameId && !state.gameId) {
    state.gameId = gameId;
  }

  clearTimer();
  setTimerDisplay(null, turnDuration());
  state.selected.clear();
  state.phase = "opening-tally";
  state.showRerollBar = false;
  state.showAckBar = true;
  resetRerollSlots();
  state.awaitingOpeningTallyAck = true;
  state.loserId = tally.loserId ?? null;
  state.winnerId = tally.winnerId ?? null;
  if (tally.ranking.length) {
    state.ranking = tally.ranking;
    renderRanking();
  }
  if (tally.phase != null) {
    const phase = Number(tally.phase);
    if (Number.isFinite(phase) && phase > 0) {
      state.round = phase;
    }
  }
  if (tally.currentPlayerId) {
    state.currentPlayerId = tally.currentPlayerId;
  }

  applyTallyArrangements(tally);

  const loser = playerById(state.loserId) ?? state.players.find((player) => playerMatches(player, state.loserId));
  const loserLabel = loser?.name ?? state.loserId ?? "unknown";
  setRankingNote(`${loserLabel} ranked last.`);
  setStatus(`Opening tally complete. Loser: ${state.loserId ?? loserLabel}. Confirm to continue.`);
  renderPlayers();
  renderOpponentBoards();
  renderBoard();
}

export function applyRoundTally(payload) {
  setGamePhase("onRoundTally");
  const tally = normalizeRoundTally(payload);
  if (!tally) {
    return;
  }

  const gameId = tally.gameId;
  if (gameId && state.gameId && String(gameId) !== String(state.gameId)) {
    return;
  }
  if (gameId && !state.gameId) {
    state.gameId = gameId;
  }

  clearTimer();
  setTimerDisplay(null, turnDuration());
  state.selected.clear();
  state.phase = "on-round-tally";
  state.showRerollBar = false;
  state.showAckBar = true;
  resetRerollSlots();
  state.awaitingOpeningTallyAck = true;
  state.loserId = tally.loserId ?? null;
  state.winnerId = tally.winnerId ?? null;
  if (tally.ranking.length) {
    state.ranking = tally.ranking;
    renderRanking();
  }
  if (tally.phase != null) {
    const phase = Number(tally.phase);
    if (Number.isFinite(phase) && phase > 0) {
      state.round = phase;
    }
  }
  if (tally.currentPlayerId) {
    state.currentPlayerId = tally.currentPlayerId;
  }

  applyTallyArrangements(tally);

  const loser = playerById(state.loserId) ?? state.players.find((player) => playerMatches(player, state.loserId));
  const loserLabel = loser?.name ?? state.loserId ?? "unknown";
  setRankingNote(`${loserLabel} ranked last.`);
  setStatus(`Round tally complete. Loser: ${state.loserId ?? loserLabel}. Confirm to continue.`);
  renderPlayers();
  renderOpponentBoards();
  renderBoard();
}

export function applyGameOver(payload) {
  setGamePhase("onGameOver");
  const tally = normalizeRoundTally(payload);
  if (!tally) {
    return;
  }

  const gameId = tally.gameId;
  if (gameId && state.gameId && String(gameId) !== String(state.gameId)) {
    return;
  }
  if (gameId && !state.gameId) {
    state.gameId = gameId;
  }

  clearTimer();
  setTimerDisplay(null, turnDuration());
  state.selected.clear();
  state.phase = "game-over";
  state.showRerollBar = false;
  state.showAckBar = true;
  resetRerollSlots();
  state.awaitingOpeningTallyAck = true;
  state.loserId = tally.loserId ?? null;
  state.winnerId = tally.winnerId ?? null;
  if (tally.ranking.length) {
    state.ranking = tally.ranking;
    renderRanking();
  }
  if (tally.phase != null) {
    const phase = Number(tally.phase);
    if (Number.isFinite(phase) && phase > 0) {
      state.round = phase;
    }
  }
  if (tally.currentPlayerId) {
    state.currentPlayerId = tally.currentPlayerId;
  }

  applyTallyArrangements(tally);

  const winner = playerById(state.winnerId) ?? state.players.find((player) => playerMatches(player, state.winnerId));
  const winnerLabel = winner?.name ?? state.winnerId ?? "unknown";
  setRankingNote(`${winnerLabel} won the game.`);
  setStatus(`Game over. Winner: ${state.winnerId ?? winnerLabel}. Confirm to continue.`);
  renderPlayers();
  renderOpponentBoards();
  renderBoard();
}

export function applyChallenge1Select(payload) {
  setGamePhase("onTurnAssigned");
  const tally = normalizeOpeningTally(payload);
  if (!tally) {
    return;
  }

  const gameId = tally.gameId;
  if (gameId && state.gameId && String(gameId) !== String(state.gameId)) {
    return;
  }
  if (gameId && !state.gameId) {
    state.gameId = gameId;
  }

  clearTimer();
  setTimerDisplay(null, turnDuration());
  state.selected.clear();
  state.awaitingOpeningTallyAck = false;
  state.loserId = tally.loserId ?? null;
  if (tally.ranking.length) {
    state.ranking = tally.ranking;
    renderRanking();
  }
  if (tally.phase != null) {
    const phase = Number(tally.phase);
    if (Number.isFinite(phase) && phase > 0) {
      state.round = phase;
    }
  }
  const nextId = tally.currentPlayerId ?? tally.nextPlayerId ?? tally.loserId;
  if (nextId) {
    state.currentPlayerId = nextId;
  }

  applyTallyArrangements(tally);

  const localIsLoser = isLocalPlayer(state.loserId);
  resetRerollSlots();
  state.showRerollBar = localIsLoser;
  state.showAckBar = false;
  state.phase = localIsLoser ? "challenge1-select" : "challenge1-wait";

  const loser = playerById(state.loserId) ?? state.players.find((player) => playerMatches(player, state.loserId));
  const loserLabel = loser?.name ?? state.loserId ?? "unknown";
  setRankingNote(`${loserLabel} ranked last.`);
  if (localIsLoser) {
    setStatus("Challenge 1 · Place dice to reroll, then submit.");
  } else {
    setStatus(`waiting for ${state.loserId ?? loserLabel} to reroll`);
  }
  renderPlayers();
  renderOpponentBoards();
  renderBoard();
}

function normalizeReRoll1(payload) {
  const data = parseJsonPayload(payload);
  if (!data || typeof data !== "object") {
    return null;
  }

  const dices = pick(data, ["dices", "Dices", "dice", "Dice"]) ?? {};
  return {
    gameId: pick(data, ["gameId", "GameId"]),
    phase: pick(data, ["phase", "Phase"]),
    loserId: pick(data, ["loserId", "LoserId", "loser", "Loser"]),
    set1: normalizeRowFaces(pick(dices, ["set1", "Set1", "row1", "Row1"])),
    set2: normalizeRowFaces(pick(dices, ["set2", "Set2", "row2", "Row2"])),
    flux: normalizeRowFaces(
      pick(dices, ["flux", "Flux", "reroll1", "Reroll1", "reRoll1", "ReRoll1", "unarranged", "Unarranged", "discarded", "Discarded"])
    ),
  };
}

export function applyChallenge1Reroll1(payload) {
  const data = normalizeReRoll1(payload);
  const phaseName = data?.phase ? String(data.phase) : "onReroll1Arrange";
  setGamePhase(phaseName);
  if (!data) {
    return;
  }

  const gameId = data.gameId;
  if (gameId && state.gameId && String(gameId) !== String(state.gameId)) {
    return;
  }
  if (gameId && !state.gameId) {
    state.gameId = gameId;
  }

  clearTimer();
  setTimerDisplay(null, turnDuration());
  state.selected.clear();
  state.awaitingOpeningTallyAck = false;
  if (data.loserId) {
    state.loserId = data.loserId;
  }
  resetRerollSlots();
  state.showRerollBar = false;
  state.showAckBar = false;

  const localIsLoser = isLocalPlayer(state.loserId);
  const loser = playerById(state.loserId) ?? state.players.find((player) => playerMatches(player, state.loserId));
  const loserLabel = loser?.name ?? state.loserId ?? "unknown";

  if (localIsLoser) {
    const rows = { set1: data.set1, set2: data.set2, flux: data.flux };
    const selfId = localPlayerId();
    setOpeningArrangement(selfId, rows);
    if (state.loserId && String(state.loserId) !== String(selfId)) {
      setOpeningArrangement(state.loserId, rows);
    }
    const roll = state.openingRolls[selfId] ?? state.openingRolls[state.loserId];
    if (roll) {
      state.values = roll.values.slice();
      state.placements = roll.placements.slice();
    }
    state.phase = "onReroll1Arrange";
    if (state.loserId) {
      state.currentPlayerId = state.loserId;
    }
    setStatus("Challenge 1 · Arrange your reroll, then submit.");
    startArrangeTimer();
  } else {
    state.phase = "challenge1-wait";
    setStatus(`waiting for ${state.loserId ?? loserLabel} to reroll`);
  }

  renderPlayers();
  renderOpponentBoards();
  renderBoard();
}

async function confirmOpeningTally() {
  if (gamePhase !== "openingTally") {
    return;
  }

  setOpeningTallyOkBusy(true);
  try {
    await openingTally({ ...boardDicePayload(), request: "1" });
    if (gamePhase !== "openingTally") {
      return;
    }
    state.awaitingOpeningTallyAck = false;
    state.showAckBar = false;
    state.phase = "waiting";
    setGamePhase("waiting");
    setStatus("Opening tally confirmed. Waiting for the next turn…");
    renderBoard();
  } catch (error) {
    setOpeningTallyOkBusy(false);
    if (!isSessionExpiredError(error)) {
      setStatus(error.message || "Could not confirm opening tally.");
    }
  }
}

async function confirmRoundTally() {
  if (gamePhase !== "onRoundTally") {
    return;
  }

  setOpeningTallyOkBusy(true);
  try {
    await onRoundTally({ gameId: state.gameId, request: "1" });
    if (gamePhase !== "onRoundTally") {
      return;
    }
    state.awaitingOpeningTallyAck = false;
    state.showAckBar = false;
    state.phase = "waiting";
    setGamePhase("waiting");
    setStatus("Round tally confirmed. Waiting for the next turn…");
    renderBoard();
  } catch (error) {
    setOpeningTallyOkBusy(false);
    if (!isSessionExpiredError(error)) {
      setStatus(error.message || "Could not confirm round tally.");
    }
  }
}

async function confirmGameOver() {
  if (gamePhase !== "onGameOver") {
    return;
  }

  setOpeningTallyOkBusy(true);
  try {
    await onGameOver({ gameId: state.gameId, request: "1" });
    if (gamePhase !== "onGameOver") {
      return;
    }
    state.awaitingOpeningTallyAck = false;
    state.showAckBar = false;
    setStatus(`Game over. Winner: ${state.winnerId ?? "unknown"}.`);
    renderBoard();
  } catch (error) {
    setOpeningTallyOkBusy(false);
    if (!isSessionExpiredError(error)) {
      setStatus(error.message || "Could not confirm game over.");
    }
  }
}

async function confirmAcknowledgement() {
  if (gamePhase === "onGameOver") {
    await confirmGameOver();
    return;
  }
  if (gamePhase === "onRoundTally") {
    await confirmRoundTally();
    return;
  }
  await confirmOpeningTally();
}

export function applyOpeningRolled(payload) {
  setGamePhase("openingRoll");
  const rolls = normalizeOpeningRolled(payload);
  if (!rolls.length) {
    return;
  }

  state.awaitingOpeningTallyAck = false;

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
          `Round ${state.round} · Your turn · ${roll.handName || "opening roll"}. Drag a pair to set1 (second pair to set2), then submit.`
        );
        startArrangeTimer();
      }
    }
  });

  renderOpponentBoards();
  renderBoard();
}

function applyNamedGamePhase(eventName) {
  return () => {
    setGamePhase(eventName);
  };
}

async function listenForGameNotifications() {
  try {
    await subscribeGameNotifications({
      onOpeningRolled: applyOpeningRolled,
      onOpeningTally: applyOpeningTally,
      onRoundTally: applyRoundTally,
      onGameOver: applyGameOver,
      onTurnAssigned: applyChallenge1Select,
      onChallenge1Reroll1: applyChallenge1Reroll1,
      onChallenge1RSelect2: applyNamedGamePhase("challenge1RSelect2"),
      onChallenge1Reroll2: applyNamedGamePhase("challenge1Reroll2"),
      onChallengeResolve: applyNamedGamePhase("challengeResolve"),
      onGameDetails: applyGameDetails,
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
      onSubmit: handleSubmit,
      onRerollSubmit: submitChallenge1Reroll,
      onReroll: handleReroll,
      onOpeningTallyOk: confirmOpeningTally,
      onAcknowledgementOk: confirmAcknowledgement,
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

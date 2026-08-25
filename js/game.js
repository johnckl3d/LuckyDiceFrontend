const TIMER_SECONDS = 15;
const AI_MIN_MS = 500;
const AI_MAX_MS = 1500;

const state = {
  gameId: null,
  players: [],
  round: 1,
  currentPlayerId: null,
  values: [1, 1, 1, 1, 1],
  placements: [2, 2, 2, 2, 2],
  allowedDrops: { row3: [], row4: [] },
  selected: new Set(),
  reroll: [false, false, false, false, false],
  phase: "idle",
  secondsLeft: 0,
  ranking: [],
  lastHandName: null,
};

let timerId = null;
let resultModal = null;

const els = {
  engineStatus: document.getElementById("engine-status"),
  turnStatus: document.getElementById("turn-status"),
  row2: document.getElementById("row-2"),
  row3: document.getElementById("row-3"),
  row4: document.getElementById("row-4"),
  submitBtn: document.getElementById("submit-btn"),
  rollBtn: document.getElementById("roll-btn"),
  newGameBtn: document.getElementById("new-game-btn"),
  seatCount: document.getElementById("seat-count"),
  playerList: document.getElementById("player-list"),
  rankingBody: document.querySelector("#ranking-table tbody"),
  rankingNote: document.getElementById("ranking-note"),
  timerLabel: document.getElementById("timer-label"),
  timerBar: document.getElementById("timer-bar"),
  resultTitle: document.getElementById("result-title"),
  resultBody: document.getElementById("result-body"),
  resultNewGameBtn: document.getElementById("result-new-game-btn"),
};

function defaultPlayers(seatCount) {
  const players = [{ id: "p-human", name: "You", kind: "human" }];
  for (let extra = 2; extra < seatCount; extra += 1) {
    players.push({ id: `p-${extra}`, name: `Player ${extra}`, kind: "human" });
  }
  players.push({ id: "p-ai", name: "House", kind: "ai" });
  return players;
}

function playerById(playerId) {
  return state.players.find((player) => player.id === playerId);
}

function currentPlayer() {
  return playerById(state.currentPlayerId);
}

function isHumanTurn() {
  return currentPlayer()?.kind === "human";
}

function clearTimer() {
  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function setTimerDisplay(seconds, total = TIMER_SECONDS) {
  if (seconds === null) {
    els.timerLabel.textContent = "—";
    els.timerBar.style.width = "0%";
    return;
  }

  els.timerLabel.textContent = `${seconds}s`;
  els.timerBar.style.width = `${Math.max(0, (seconds / total) * 100)}%`;
}

function setStatus(text) {
  els.turnStatus.textContent = text;
}

function renderPlayers() {
  els.playerList.innerHTML = "";
  state.players.forEach((player) => {
    const item = document.createElement("li");
    item.className = "list-group-item d-flex justify-content-between align-items-center";
    if (player.id === state.currentPlayerId && state.phase !== "game-over") {
      item.classList.add("list-group-item-warning");
    }

    const name = document.createElement("span");
    name.textContent = player.name;
    if (player.id === "p-human") {
      name.textContent += " (you)";
    }

    const badge = document.createElement("span");
    badge.className = player.kind === "ai" ? "badge text-bg-dark" : "badge text-bg-secondary";
    badge.textContent = player.kind === "ai" ? "AI" : "Human";

    item.append(name, badge);
    els.playerList.appendChild(item);
  });
}

function renderRanking() {
  if (!state.ranking.length) {
    els.rankingBody.innerHTML =
      '<tr><td colspan="4" class="text-muted">No tally yet</td></tr>';
    return;
  }

  const names = Object.fromEntries(state.players.map((player) => [player.id, player]));
  els.rankingBody.innerHTML = state.ranking
    .map((row) => {
      const player = names[row.playerId];
      const ai = player?.kind === "ai" ? ' <span class="badge text-bg-dark">AI</span>' : "";
      return `<tr>
        <td>${row.place}</td>
        <td>${player?.name ?? row.playerId}${ai}</td>
        <td>${row.handName}</td>
        <td class="font-monospace">${row.values.join(" · ")}</td>
      </tr>`;
    })
    .join("");
}

function createDie(index, value, options) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "die";
  button.draggable = Boolean(options.draggable);
  button.dataset.index = String(index);
  button.dataset.value = String(value);
  button.setAttribute("aria-label", `Die ${index + 1}, ${value}`);

  if (options.selected) {
    button.classList.add("is-selected");
  }
  if (options.reroll) {
    button.classList.add("is-reroll");
  }
  if (options.draggable) {
    button.classList.add("is-draggable");
  }

  for (let pip = 0; pip < 9; pip += 1) {
    const pipEl = document.createElement("span");
    pipEl.className = "pip";
    button.appendChild(pipEl);
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    onDieClick(index);
  });

  button.addEventListener("dragstart", (event) => onDragStart(event, index));
  button.addEventListener("dragend", onDragEnd);

  return button;
}

function createSlot(row, index) {
  const slot = document.createElement("div");
  slot.className = "die-slot";
  slot.dataset.row = String(row);
  slot.dataset.index = String(index);
  slot.addEventListener("dragover", onDragOver);
  slot.addEventListener("dragleave", onDragLeave);
  slot.addEventListener("drop", (event) => onDrop(event, row));
  slot.addEventListener("click", (event) => {
    if (event.target.closest(".die")) {
      return;
    }
    onSlotClick(row);
  });
  return slot;
}

function canDrag() {
  return state.phase === "arrange" && isHumanTurn();
}

function renderBoard() {
  const hosts = { 2: els.row2, 3: els.row3, 4: els.row4 };
  Object.values(hosts).forEach((row) => {
    row.innerHTML = "";
  });

  const showDice = state.phase === "arrange" || state.phase === "select-reroll";

  for (let row = 2; row <= 4; row += 1) {
    for (let index = 0; index < 5; index += 1) {
      const slot = createSlot(row, index);
      const occupied = showDice && state.placements[index] === row;
      if (occupied) {
        slot.appendChild(
          createDie(index, state.values[index], {
            selected: state.selected.has(index),
            reroll: state.phase === "select-reroll" && state.reroll[index],
            draggable: canDrag(),
          })
        );
      }
      hosts[row].appendChild(slot);
    }
  }

  const humanArrange = state.phase === "arrange" && isHumanTurn();
  els.submitBtn.disabled = !humanArrange;
  els.rollBtn.hidden = state.phase !== "select-reroll";
  els.rollBtn.disabled = state.phase !== "select-reroll" || !state.reroll.some(Boolean);
}

function resetBoard(values = [1, 1, 1, 1, 1]) {
  state.values = values.slice();
  state.placements = [2, 2, 2, 2, 2];
  state.allowedDrops = { row3: [], row4: [] };
  state.selected.clear();
  state.reroll = [false, false, false, false, false];
  state.lastHandName = null;
}

function applyAllowedPlacements() {
  state.placements = state.values.map((_, index) => {
    if (state.allowedDrops.row3.includes(index)) {
      return 3;
    }
    if (state.allowedDrops.row4.includes(index)) {
      return 4;
    }
    return 2;
  });
}

function onDieClick(index) {
  if (state.phase === "select-reroll" && isHumanTurn()) {
    state.reroll[index] = !state.reroll[index];
    renderBoard();
    return;
  }

  if (!canDrag()) {
    return;
  }

  if (state.selected.has(index)) {
    state.selected.delete(index);
  } else {
    state.selected.add(index);
  }
  renderBoard();
}

function onSlotClick(row) {
  if (!canDrag() || state.selected.size === 0) {
    return;
  }
  tryPlace([...state.selected], row);
}

function onDragStart(event, index) {
  if (!canDrag()) {
    event.preventDefault();
    return;
  }

  if (!state.selected.has(index)) {
    state.selected.clear();
    state.selected.add(index);
  }

  event.dataTransfer.setData("text/plain", String(index));
  event.dataTransfer.effectAllowed = "move";
  event.target.classList.add("is-dragging");
}

function onDragEnd(event) {
  event.target.classList.remove("is-dragging");
  document.querySelectorAll(".die-slot.is-over").forEach((slot) => {
    slot.classList.remove("is-over");
  });
}

function onDragOver(event) {
  if (!canDrag()) {
    return;
  }
  event.preventDefault();
  event.currentTarget.classList.add("is-over");
}

function onDragLeave(event) {
  event.currentTarget.classList.remove("is-over");
}

function onDrop(event, row) {
  event.preventDefault();
  event.currentTarget.classList.remove("is-over");
  if (!canDrag()) {
    return;
  }

  const raw = event.dataTransfer.getData("text/plain");
  const index = Number(raw);
  const moving = state.selected.size ? [...state.selected] : [index];
  if (!moving.includes(index)) {
    moving.push(index);
  }
  tryPlace(moving, row);
}

function tryPlace(indices, row) {
  const allowed =
    row === 3 ? state.allowedDrops.row3 : row === 4 ? state.allowedDrops.row4 : null;

  let moving = indices.slice();
  if (allowed && moving.length === 1 && allowed.includes(moving[0])) {
    moving = allowed.slice();
  }

  let changed = false;
  moving.forEach((index) => {
    if (row === 2) {
      state.placements[index] = 2;
      changed = true;
      return;
    }
    if (allowed && allowed.includes(index)) {
      state.placements[index] = row;
      changed = true;
    }
  });

  if (!changed && row !== 2) {
    setStatus("That drop is not allowed for this hand.");
  }

  state.selected.clear();
  renderBoard();
}

function startArrangeTimer() {
  clearTimer();
  state.secondsLeft = TIMER_SECONDS;
  setTimerDisplay(state.secondsLeft);
  timerId = window.setInterval(async () => {
    state.secondsLeft -= 1;
    setTimerDisplay(state.secondsLeft);
    if (state.secondsLeft <= 0) {
      clearTimer();
      await submitCurrentBoard();
    }
  }, 1000);
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
  setTimerDisplay(null);
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
  els.rankingNote.textContent = "Sequence 1-2-3-4-5 wins the game immediately.";
  setStatus(`Instant win · ${winner.name} · sequence 1-2-3-4-5`);
  showResult(
    "Instant win",
    `${winner.name}: sequence 1-2-3-4-5. That wins the game.`
  );
}

async function submitCurrentBoard() {
  if (state.phase !== "arrange") {
    return;
  }

  clearTimer();
  state.phase = "submitting";
  setTimerDisplay(0);
  els.submitBtn.disabled = true;

  const response = await submitHand({
    gameId: state.gameId,
    playerId: state.currentPlayerId,
    values: state.values,
    placements: state.placements,
  });

  if (!response.accepted) {
    state.placements = state.placements.map((row, index) => {
      if (row === 3 && !state.allowedDrops.row3.includes(index)) {
        return 2;
      }
      if (row === 4 && !state.allowedDrops.row4.includes(index)) {
        return 2;
      }
      return row;
    });
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
  els.rankingNote.textContent = `${next.name} ranked last and will reroll in round 2.`;
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
    els.rankingNote.textContent = `${loser.name} is still last and loses. Starting a new game.`;
    setStatus(`${loser.name} could not compete. Restarting…`);
    renderBoard();
    showResult("Could not compete", `${loser.name} is still last after round 2. The game will restart.`);
    window.setTimeout(() => newGame(), 2000);
    return;
  }

  state.phase = "game-over";
  els.rankingNote.textContent = "The round-2 player is no longer last. No further rounds in this version.";
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
  setTimerDisplay(null);

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

function standingValues(playerId) {
  const row = state.ranking.find((entry) => entry.playerId === playerId);
  return row?.values ? row.values.slice() : [1, 1, 1, 1, 1];
}

function aiDelay() {
  return AI_MIN_MS + Math.floor(Math.random() * (AI_MAX_MS - AI_MIN_MS + 1));
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

function showResult(title, body) {
  els.resultTitle.textContent = title;
  els.resultBody.textContent = body;
  resultModal.show();
}

async function newGame() {
  clearTimer();
  resultModal.hide();
  setTimerDisplay(null);
  state.ranking = [];
  state.round = 1;
  state.phase = "idle";
  state.selected.clear();
  els.rankingNote.textContent = "After everyone submits round 1, the lowest hand rolls in round 2.";
  renderRanking();

  const started = await startGame(defaultPlayers(Number(els.seatCount.value)));
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
  if (!USE_ENGINE) {
    els.engineStatus.textContent = "Engine: local mock";
  } else if (status.ok) {
    els.engineStatus.textContent = "Engine: connected";
  } else {
    els.engineStatus.textContent = "Engine: unreachable";
  }
}

els.submitBtn.addEventListener("click", () => submitCurrentBoard());
els.rollBtn.addEventListener("click", async () => {
  if (state.phase !== "select-reroll") {
    return;
  }
  const held = state.reroll.map((mark) => !mark);
  await takeRoll(held);
});
els.newGameBtn.addEventListener("click", () => newGame());
els.resultNewGameBtn.addEventListener("click", () => newGame());
els.seatCount.addEventListener("change", () => newGame());

document.querySelectorAll(".board-row-drop, [data-row='2']").forEach((rowEl) => {
  const row = Number(rowEl.dataset.row);
  rowEl.addEventListener("dragover", (event) => {
    if (!canDrag()) {
      return;
    }
    event.preventDefault();
  });
  rowEl.addEventListener("drop", (event) => {
    if (!event.target.closest(".die-slot")) {
      onDrop(event, row);
    }
  });
});

resultModal = new bootstrap.Modal(document.getElementById("result-modal"));
showEngineStatus();
newGame();

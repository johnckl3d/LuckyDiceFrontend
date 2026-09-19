import {
  canDrag,
  isHumanTurn,
  isLocalPlayer,
  isReroll1Arrange,
  localPlayerId,
  otherPlayers,
  playerMatches,
  state,
} from "../models/gameModel.js";

let resultModal = null;
let handlers = {};

const els = {
  engineStatus: document.getElementById("engine-status"),
  turnStatus: document.getElementById("turn-status"),
  flux: document.getElementById("flux"),
  set1: document.getElementById("set1"),
  set2: document.getElementById("set2"),
  opponentBoards: document.getElementById("opponent-boards"),
  actionBar: document.getElementById("actionBar"),
  actionBarLabel: document.getElementById("action-bar-label"),
  rerollActionBar: document.getElementById("rerollActionBar"),
  acknowledgementActionBar: document.getElementById("acknowledgementActionBar"),
  acknowledgementLoser: document.getElementById("acknowledgement-loser"),
  acknowledgementWinner: document.getElementById("acknowledgement-winner"),
  acknowledgementOkBtn: document.getElementById("acknowledgement-ok-btn"),
  waitingActionBar: document.getElementById("waitingActionBar"),
  waitingBarMessage: document.getElementById("waiting-bar-message"),
  rerollSlots: document.getElementById("reroll-slots"),
  rerollSubmitBtn: document.getElementById("reroll-submit-btn"),
  submitBtn: document.getElementById("submit-btn"),
  rollBtn: document.getElementById("roll-btn"),
  openingTallyActions: document.getElementById("opening-tally-actions"),
  openingTallyLoser: document.getElementById("opening-tally-loser"),
  openingTallyOkBtn: document.getElementById("opening-tally-ok-btn"),
  challengeWaitMessage: document.getElementById("challenge-wait-message"),
  boardActionsControls: document.getElementById("board-actions-controls"),
  newGameBtn: document.getElementById("new-game-btn"),
  seatCount: document.getElementById("seat-count"),
  playerList: document.getElementById("player-list"),
  rankingBody: document.querySelector("#ranking-table tbody"),
  rankingNote: document.getElementById("ranking-note"),
  timerLabel: document.getElementById("timer-label"),
  timerBar: document.getElementById("timer-bar"),
  stakeLabel: document.getElementById("stake-label"),
  resultTitle: document.getElementById("result-title"),
  resultBody: document.getElementById("result-body"),
  resultNewGameBtn: document.getElementById("result-new-game-btn"),
};

function createDie(index, value, options) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = options.compact ? "die die-compact" : "die";
  button.draggable = Boolean(options.draggable);
  button.dataset.index = String(index);
  button.dataset.value = String(value);
  button.setAttribute("aria-label", `Die ${index + 1}, ${value}`);
  button.disabled = options.interactive === false;

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

  if (options.interactive !== false) {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      handlers.onDieClick?.(index);
    });
    button.addEventListener("dragstart", (event) => onDragStart(event, index));
    button.addEventListener("dragend", onDragEnd);
  }

  return button;
}

function createSlot(row, index, options = {}) {
  const slot = document.createElement("div");
  slot.className = options.compact ? "die-slot die-slot-compact" : "die-slot";
  slot.dataset.row = String(row);
  slot.dataset.index = String(index);
  if (options.interactive === false) {
    return slot;
  }
  slot.addEventListener("dragover", onDragOver);
  slot.addEventListener("dragleave", onDragLeave);
  slot.addEventListener("drop", (event) => onDrop(event, row, index));
  slot.addEventListener("click", (event) => {
    if (event.target.closest(".die")) {
      return;
    }
    handlers.onSlotClick?.(row, index);
  });
  return slot;
}

function onDragStart(event, index) {
  if (!canDrag()) {
    event.preventDefault();
    return;
  }

  handlers.onDragStart?.(index);

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

function onDrop(event, row, slotIndex) {
  event.preventDefault();
  event.currentTarget.classList.remove("is-over");
  if (!canDrag()) {
    return;
  }

  const raw = event.dataTransfer.getData("text/plain");
  const index = Number(raw);
  const slot = Number.isInteger(slotIndex) ? slotIndex : Number(event.currentTarget.dataset.index);
  handlers.onDrop?.(index, row, Number.isFinite(slot) ? slot : undefined);
}

export function showGameScreen(visible = true) {
  document.getElementById("game-screen").hidden = !visible;
}

export function bindGameView(nextHandlers) {
  handlers = nextHandlers;

  els.submitBtn.addEventListener("click", () => handlers.onSubmit?.());
  els.rerollSubmitBtn?.addEventListener("click", () => handlers.onRerollSubmit?.());
  els.acknowledgementOkBtn?.addEventListener("click", () => {
    handlers.onAcknowledgementOk?.();
  });
  els.rollBtn.addEventListener("click", () => handlers.onReroll?.());
  els.openingTallyOkBtn?.addEventListener("click", () => {
    handlers.onOpeningTallyOk?.();
  });
  els.newGameBtn.addEventListener("click", () => handlers.onNewGame?.());
  els.resultNewGameBtn.addEventListener("click", () => handlers.onNewGame?.());
  els.seatCount.addEventListener("change", () => handlers.onNewGame?.());

  document.querySelectorAll(".board-row-drop, [data-row='2'], #reroll-slots").forEach((rowEl) => {
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
}

export function initResultModal() {
  if (!resultModal) {
    resultModal = new bootstrap.Modal(document.getElementById("result-modal"));
  }
}

export function setTimerDisplay(seconds, total) {
  if (seconds === null) {
    els.timerLabel.textContent = "—";
    els.timerBar.style.width = "0%";
    return;
  }

  els.timerLabel.textContent = `${seconds}s`;
  els.timerBar.style.width = `${Math.max(0, (seconds / total) * 100)}%`;
}

export function setStakeDisplay(stake) {
  if (stake == null || stake === "") {
    els.stakeLabel.textContent = "—";
    return;
  }

  const amount = Number(stake);
  els.stakeLabel.textContent = Number.isFinite(amount) ? amount.toFixed(2) : String(stake);
}

export function setStatus(text) {
  els.turnStatus.textContent = text;
}

export function setEngineStatus(text) {
  els.engineStatus.textContent = text;
}

export function setRankingNote(text) {
  els.rankingNote.textContent = text;
}

export function getSeatCount() {
  return Number(els.seatCount.value);
}

export function renderPlayers() {
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
  renderOpponentBoards();
}

function diceInRow(values, placements, row, packed) {
  const items = [];
  (values ?? []).forEach((value, index) => {
    if (placements?.[index] === row) {
      items.push({ index, value });
    }
  });
  if (!packed) {
    const aligned = Array.from({ length: 5 }, () => null);
    items.forEach((item) => {
      aligned[item.index] = item;
    });
    return aligned;
  }
  return Array.from({ length: 5 }, (_, slot) => items[slot] ?? null);
}

function appendRowSlots(host, row, roll, compact, packed = true) {
  host.innerHTML = "";
  const items = roll
    ? diceInRow(roll.values, roll.placements, row, packed)
    : Array.from({ length: 5 }, () => null);
  items.forEach((item, slotIndex) => {
    const slot = createSlot(row, slotIndex, { compact, interactive: false });
    if (item) {
      slot.appendChild(
        createDie(item.index, item.value, {
          compact,
          interactive: false,
        })
      );
    }
    host.appendChild(slot);
  });
}

function openingRollFor(player) {
  if (!player) {
    return null;
  }
  if (state.openingRolls[player.id]) {
    return state.openingRolls[player.id];
  }
  const match = Object.entries(state.openingRolls).find(([id]) => playerMatches(player, id));
  return match ? match[1] : null;
}

function createOpponentBoard(player) {
  const roll = openingRollFor(player);
  const card = document.createElement("section");
  card.className = "table-felt rounded-4 p-3 opponent-board";
  card.dataset.playerId = player.id;
  card.setAttribute("aria-label", `${player.name} table`);

  const title = document.createElement("div");
  title.className = "opponent-board-name";
  title.textContent = player.name;
  card.appendChild(title);

  [
    { row: 4, label: "set2" },
    { row: 3, label: "set1" },
    { row: 2, label: "flux" },
  ].forEach(({ row, label }) => {
    const boardRow = document.createElement("div");
    boardRow.className = "board-row mb-2";
    boardRow.dataset.row = String(row);

    const rowLabel = document.createElement("div");
    rowLabel.className = "board-row-label";
    rowLabel.textContent = label;

    const slots = document.createElement("div");
    slots.className = "dice-slots";
    slots.id = `${player.id}-${label}`;
    slots.setAttribute("aria-label", label);
    appendRowSlots(slots, row, roll, true, true);

    boardRow.append(rowLabel, slots);
    card.appendChild(boardRow);
  });

  return card;
}

export function renderOpponentBoards() {
  if (!els.opponentBoards) {
    return;
  }

  els.opponentBoards.innerHTML = "";
  const opponents = otherPlayers();
  els.opponentBoards.hidden = opponents.length === 0;
  opponents.forEach((player) => {
    els.opponentBoards.appendChild(createOpponentBoard(player));
  });
}

export function renderRanking() {
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

function isRerollBarVisible() {
  return Boolean(state.showRerollBar) || state.phase === "challenge1-select";
}

function isAckPhase() {
  return (
    state.gamePhase === "openingTally" ||
    state.gamePhase === "onRoundTally" ||
    state.gamePhase === "onGameOver"
  );
}

function isAckBarVisible() {
  return Boolean(state.showAckBar) || isAckPhase();
}

function isReroll1Phase() {
  const phase = String(state.gamePhase || "");
  return (
    phase === "challenge1Reroll1" ||
    phase === "reRoll1" ||
    phase === "onReroll1" ||
    phase === "onReroll1Arrange"
  );
}

function isWaitingBarVisible() {
  if (isLocalPlayer(state.loserId)) {
    return false;
  }
  return state.gamePhase === "onTurnAssigned" || isReroll1Phase();
}

export function renderOpeningTallyActions() {
  const tallying = state.gamePhase === "openingTally";
  const challengeWait = state.phase === "challenge1-wait";
  const rerollBar = isRerollBarVisible();
  const ackBar = isAckBarVisible();
  const waitingBar = isWaitingBarVisible() && !ackBar && !rerollBar;
  const swapped = rerollBar || ackBar || waitingBar;

  if (els.actionBar) {
    els.actionBar.hidden = swapped;
  }
  if (els.rerollActionBar) {
    els.rerollActionBar.hidden = !rerollBar;
  }
  if (els.acknowledgementActionBar) {
    els.acknowledgementActionBar.hidden = !ackBar;
  }
  if (els.waitingActionBar) {
    els.waitingActionBar.hidden = !waitingBar;
  }
  if (els.actionBarLabel) {
    els.actionBarLabel.textContent = rerollBar
      ? "reroll"
      : ackBar
        ? "acknowledgementBar"
        : waitingBar
          ? "waitingBar"
          : "actionBar";
  }
  if (els.openingTallyActions) {
    els.openingTallyActions.hidden = !tallying || swapped;
  }
  if (els.challengeWaitMessage) {
    els.challengeWaitMessage.hidden = true;
  }
  if (els.boardActionsControls) {
    els.boardActionsControls.hidden = tallying || challengeWait || swapped;
    els.boardActionsControls.classList.toggle("is-submit-end", isReroll1Arrange() && !swapped);
  }
  if (els.submitBtn) {
    els.submitBtn.hidden = tallying || challengeWait || swapped;
  }

  const loserId = state.loserId ?? "—";
  const winnerId = state.winnerId ?? "—";
  if (els.acknowledgementLoser) {
    els.acknowledgementLoser.textContent = ackBar ? loserId : "—";
  }
  if (els.acknowledgementWinner) {
    els.acknowledgementWinner.textContent = ackBar ? winnerId : "—";
  }
  if (els.waitingBarMessage) {
    els.waitingBarMessage.textContent = waitingBar
      ? `waiting for ${loserId} to reroll`
      : "waiting for — to reroll";
  }
  if (els.acknowledgementOkBtn) {
    els.acknowledgementOkBtn.disabled = !isAckPhase();
  }

  if (!tallying) {
    if (els.openingTallyLoser) {
      els.openingTallyLoser.textContent = "—";
    }
    if (els.openingTallyOkBtn) {
      els.openingTallyOkBtn.disabled = false;
    }
    return;
  }

  if (els.openingTallyLoser) {
    els.openingTallyLoser.textContent = loserId;
  }
}

export function setOpeningTallyOkBusy(busy) {
  if (els.openingTallyOkBtn) {
    els.openingTallyOkBtn.disabled = Boolean(busy);
  }
  if (els.acknowledgementOkBtn) {
    els.acknowledgementOkBtn.disabled = Boolean(busy);
  }
}

export function renderBoard() {
  const hosts = { 2: els.flux, 3: els.set1, 4: els.set2 };
  Object.values(hosts).forEach((row) => {
    row.innerHTML = "";
  });

  const interactive =
    state.phase === "arrange" ||
    state.phase === "select-reroll" ||
    state.phase === "challenge1-select" ||
    isReroll1Arrange();
  const selfId = localPlayerId();
  const selfPlayer = state.players.find((player) => player.id === selfId) ?? { id: selfId };
  const opening = openingRollFor(selfPlayer);
  const showDice =
    interactive ||
    state.phase === "submitting" ||
    state.phase === "opening-tally" ||
    state.phase === "on-round-tally" ||
    state.phase === "game-over" ||
    state.phase === "challenge1-wait" ||
    state.phase === "reroll1" ||
    Boolean(opening);
  const useLiveBoard =
    (interactive || state.phase === "submitting") && Array.isArray(state.values) && state.values.length === 5;
  const values = useLiveBoard ? state.values : opening?.values ?? state.values;
  const placements = useLiveBoard ? state.placements : opening?.placements ?? state.placements;
  const packed = !useLiveBoard;

  for (let row = 2; row <= 4; row += 1) {
    const items = showDice
      ? diceInRow(values, placements, row, packed)
      : Array.from({ length: 5 }, () => null);
    items.forEach((item, slotIndex) => {
      const slot = createSlot(row, slotIndex, { interactive });
      if (item) {
        slot.appendChild(
          createDie(item.index, item.value, {
            selected: interactive && state.selected.has(item.index),
            reroll: state.phase === "select-reroll" && state.reroll[item.index],
            draggable: canDrag(),
            interactive,
          })
        );
      }
      hosts[row].appendChild(slot);
    });
  }

  const canSubmit =
    state.phase !== "submitting" &&
    ((state.phase === "arrange" && isHumanTurn()) ||
      (state.phase === "challenge1-select" && isLocalPlayer(state.loserId)) ||
      (isReroll1Arrange() && isLocalPlayer(state.loserId)));
  els.submitBtn.disabled = !canSubmit;
  els.rollBtn.hidden = state.phase !== "select-reroll";
  els.rollBtn.disabled = state.phase !== "select-reroll" || !state.reroll.some(Boolean);

  const rerollInteractive = state.phase === "challenge1-select" && isLocalPlayer(state.loserId);
  if (els.rerollSlots) {
    els.rerollSlots.innerHTML = "";
    for (let slotIndex = 0; slotIndex < 5; slotIndex += 1) {
      const slot = createSlot(1, slotIndex, { interactive: rerollInteractive });
      const dieIndex = state.rerollSlots?.[slotIndex];
      if (dieIndex != null && state.values[dieIndex] != null) {
        slot.appendChild(
          createDie(dieIndex, state.values[dieIndex], {
            selected: rerollInteractive && state.selected.has(dieIndex),
            draggable: rerollInteractive && canDrag(),
            interactive: rerollInteractive,
          })
        );
      }
      els.rerollSlots.appendChild(slot);
    }
  }
  if (els.rerollSubmitBtn) {
    els.rerollSubmitBtn.disabled = !rerollInteractive;
  }

  renderOpeningTallyActions();
}

export function showResult(title, body) {
  els.resultTitle.textContent = title;
  els.resultBody.textContent = body;
  resultModal.show();
}

export function hideResult() {
  resultModal?.hide();
}

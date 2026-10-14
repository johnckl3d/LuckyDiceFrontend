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
let resultDismissOnly = false;
let lastTimer = { seconds: null, total: 0 };

const OPPONENT_COLORS = ["#2A8CFF", "#FFC400", "#3CDC8C"];

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
  resultActionBar: document.getElementById("resultActionBar"),
  resultLoser: document.getElementById("result-loser"),
  resultWinner: document.getElementById("result-winner"),
  resultLeaveTableBtn: document.getElementById("resultbar-leave-table-btn"),
  resultBarNewGameBtn: document.getElementById("resultbar-new-game-btn"),
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
  gameIdLabel: document.getElementById("game-id-label"),
  stakeLabel: document.getElementById("stake-label"),
  walletLabel: document.getElementById("game-wallet-balance"),
  topUpBtn: document.getElementById("game-topup-btn"),
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
  button.setAttribute("aria-label", `Die showing ${value}.`);
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
  els.resultLeaveTableBtn?.addEventListener("click", () => {
    handlers.onLeaveTable?.();
  });
  els.resultBarNewGameBtn?.addEventListener("click", () => {
    handlers.onResultNewGame?.();
  });
  els.rollBtn.addEventListener("click", () => handlers.onReroll?.());
  els.openingTallyOkBtn?.addEventListener("click", () => {
    handlers.onOpeningTallyOk?.();
  });
  els.newGameBtn.addEventListener("click", () => handlers.onNewGame?.());
  els.resultNewGameBtn.addEventListener("click", () => {
    if (resultDismissOnly) {
      hideResult();
      return;
    }
    handlers.onResultNewGame?.();
  });
  els.topUpBtn?.addEventListener("click", () => handlers.onTopUp?.());
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

function formatClock(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function paintTimers() {
  const { seconds, total } = lastTimer;
  const idle = seconds === null || seconds === undefined;
  if (els.timerBar) {
    els.timerBar.style.width = idle ? "0%" : `${Math.max(0, (seconds / total) * 100)}%`;
  }

  document.querySelectorAll("#game-screen .timer-pill").forEach((pill) => {
    pill.classList.remove("is-active");
    const value = pill.querySelector(".timer-pill-value");
    if (value) {
      value.textContent = "--:--";
    }
  });

  if (idle) {
    return;
  }

  const currentId = state.currentPlayerId;
  let pill = null;
  if (currentId && !isLocalPlayer(currentId)) {
    pill = [...document.querySelectorAll(".opponent-board")].find((card) => {
      if (String(card.dataset.playerId) === String(currentId)) {
        return true;
      }
      const player = state.players.find((item) => String(item.id) === String(card.dataset.playerId));
      return player ? playerMatches(player, currentId) : false;
    })?.querySelector(".timer-pill");
  }
  if (!pill) {
    pill = document.getElementById("local-timer-pill");
  }

  const text = formatClock(seconds);
  if (pill) {
    pill.classList.add("is-active");
    const value = pill.querySelector(".timer-pill-value");
    if (value) {
      value.textContent = text;
    }
    return;
  }
  if (els.timerLabel) {
    els.timerLabel.textContent = text;
  }
}

export function setTimerDisplay(seconds, total) {
  lastTimer = { seconds, total };
  paintTimers();
}

function formatMoney(value) {
  if (value == null || value === "") {
    return "—";
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return String(value);
  }
  return amount.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

export function setGameIdDisplay(gameId) {
  if (!els.gameIdLabel) {
    return;
  }
  els.gameIdLabel.textContent = gameId ? String(gameId) : "—";
}

export function setStakeDisplay(stake) {
  els.stakeLabel.textContent = formatMoney(stake);
}

export function setWalletDisplay(balance) {
  if (!els.walletLabel) {
    return;
  }
  els.walletLabel.textContent = formatMoney(balance);
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
  renderScreenMeta();
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

    const meta = document.createElement("span");
    meta.className = "d-flex align-items-center gap-2";

    if (player.wallet != null && player.wallet !== "") {
      const wallet = document.createElement("span");
      wallet.className = "font-monospace";
      wallet.dataset.playerWallet = String(player.id);
      wallet.textContent = formatMoney(player.wallet);
      meta.appendChild(wallet);
    }

    const badge = document.createElement("span");
    badge.className = player.kind === "ai" ? "badge text-bg-dark" : "badge text-bg-secondary";
    badge.textContent = player.kind === "ai" ? "AI" : "Human";
    meta.appendChild(badge);

    item.append(name, meta);
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

function initialOf(name) {
  const letter = String(name || "?").trim().charAt(0);
  return letter ? letter.toUpperCase() : "?";
}

function cardIsLoser(card) {
  if (!state.loserId) {
    return false;
  }
  const id = card.dataset.playerId;
  if (String(id) === String(state.loserId)) {
    return true;
  }
  const player = state.players.find((item) => String(item.id) === String(id));
  return player ? playerMatches(player, state.loserId) : false;
}

function renderLoserMarkers() {
  document.querySelectorAll(".opponent-board").forEach((card) => {
    const marker = card.querySelector(".loser-marker");
    if (marker) {
      marker.hidden = !cardIsLoser(card);
    }
  });
}

function renderScreenMeta() {
  const count = document.getElementById("player-count-label");
  const round = document.getElementById("round-label");
  if (count) {
    count.textContent = String(state.players.length);
  }
  if (round) {
    round.textContent = String(state.round || 1);
  }

  const self = state.players.find((player) => player.id === localPlayerId());
  const name = self?.name || "You";
  const nameEl = document.getElementById("local-player-name");
  const avatarEl = document.getElementById("local-avatar");
  if (nameEl) {
    if (/^\s*you\s*$/i.test(name) || /\(\s*you\s*\)/i.test(name)) {
      nameEl.textContent = name;
    } else {
      nameEl.textContent = `${name} (You)`;
    }
  }
  if (avatarEl) {
    avatarEl.textContent = initialOf(name);
  }
}

function createOpponentBoard(player, index) {
  const roll = openingRollFor(player);
  const color = OPPONENT_COLORS[index % OPPONENT_COLORS.length];
  const card = document.createElement("section");
  card.className = "opponent-board";
  card.dataset.playerId = player.id;
  card.style.background = `${color}22`;
  card.style.borderColor = color;
  card.style.setProperty("--player", color);
  card.setAttribute("aria-label", `${player.name} table`);

  const head = document.createElement("div");
  head.className = "card-head";

  const identity = document.createElement("div");
  identity.className = "card-identity";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = initialOf(player.name);

  const idText = document.createElement("div");
  idText.className = "card-id-text";
  const name = document.createElement("div");
  name.className = "card-name";
  name.textContent = player.name;
  const status = document.createElement("div");
  status.className = "card-status";
  status.textContent = "Waiting · [PTS]";
  idText.append(name, status);
  identity.append(avatar, idText);

  const pills = document.createElement("div");
  pills.className = "card-pills";
  const wallet = document.createElement("div");
  wallet.className = "wallet-pill";
  const walletAmount = document.createElement("span");
  walletAmount.dataset.playerWallet = String(player.id);
  walletAmount.textContent = formatMoney(player.wallet);
  const unit = document.createElement("span");
  unit.textContent = " [CURRENCY]";
  wallet.append(walletAmount, unit);

  const timer = document.createElement("div");
  timer.className = "timer-pill";
  const timerValue = document.createElement("span");
  timerValue.className = "timer-pill-value";
  timerValue.textContent = "--:--";
  timer.appendChild(timerValue);
  pills.append(wallet, timer);
  head.append(identity, pills);
  card.appendChild(head);

  const lanes = document.createElement("div");
  lanes.className = "lanes";
  [
    { row: 3, label: "KEEP1" },
    { row: 4, label: "KEEP2" },
    { row: 2, label: "FLUX" },
  ].forEach(({ row, label }) => {
    const boardRow = document.createElement("div");
    boardRow.className = "lane";

    const rowLabel = document.createElement("div");
    rowLabel.className = "lane-label";
    rowLabel.textContent = label;

    const slots = document.createElement("div");
    slots.className = "dice-slots";
    slots.id = `${player.id}-${label}`;
    slots.setAttribute("aria-label", label);
    appendRowSlots(slots, row, roll, true, true);

    boardRow.append(rowLabel, slots);
    lanes.appendChild(boardRow);
  });
  card.appendChild(lanes);

  const marker = document.createElement("div");
  marker.className = "loser-marker";
  marker.hidden = true;
  const tag = document.createElement("div");
  tag.className = "loser-tag";
  tag.textContent = "LOSER";
  const note = document.createElement("div");
  note.className = "loser-note";
  note.textContent = "Reroll required";
  const attempts = document.createElement("div");
  attempts.className = "loser-note-dim";
  attempts.textContent = "2 attempts max";
  marker.append(tag, note, attempts);
  card.appendChild(marker);

  return card;
}

export function renderOpponentBoards() {
  if (!els.opponentBoards) {
    return;
  }

  els.opponentBoards.innerHTML = "";
  const opponents = otherPlayers();
  els.opponentBoards.hidden = opponents.length === 0;
  opponents.forEach((player, index) => {
    els.opponentBoards.appendChild(createOpponentBoard(player, index));
  });
  renderLoserMarkers();
  paintTimers();
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
  return state.gamePhase === "openingTally" || state.gamePhase === "onRoundTally";
}

function isAckBarVisible() {
  return !isResultBarVisible() && (Boolean(state.showAckBar) || isAckPhase());
}

function isResultBarVisible() {
  return Boolean(state.showResultBar) || state.gamePhase === "onGameOver";
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
  const resultBar = isResultBarVisible();
  const ackBar = isAckBarVisible();
  const waitingBar = isWaitingBarVisible() && !ackBar && !rerollBar && !resultBar;
  const swapped = rerollBar || ackBar || waitingBar || resultBar;

  if (els.actionBar) {
    els.actionBar.hidden = swapped;
  }
  if (els.rerollActionBar) {
    els.rerollActionBar.hidden = !rerollBar;
  }
  if (els.acknowledgementActionBar) {
    els.acknowledgementActionBar.hidden = !ackBar;
  }
  if (els.resultActionBar) {
    els.resultActionBar.hidden = !resultBar;
  }
  if (els.waitingActionBar) {
    els.waitingActionBar.hidden = !waitingBar;
  }
  if (els.actionBarLabel) {
    els.actionBarLabel.textContent = rerollBar
      ? "reroll"
      : resultBar
        ? "resultBar"
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
  if (els.resultLoser) {
    els.resultLoser.textContent = resultBar ? loserId : "—";
  }
  if (els.resultWinner) {
    els.resultWinner.textContent = resultBar ? winnerId : "—";
  }
  const showResultActions = resultBar && Boolean(state.showResultBarActions);
  if (els.resultLeaveTableBtn) {
    els.resultLeaveTableBtn.hidden = !showResultActions;
  }
  if (els.resultBarNewGameBtn) {
    els.resultBarNewGameBtn.hidden = !showResultActions;
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
  renderScreenMeta();
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
    const rerollCount = (state.rerollSlots ?? []).filter(
      (dieIndex) => dieIndex != null && state.values[dieIndex] != null
    ).length;
    els.rerollSubmitBtn.textContent = `Reroll ${rerollCount} dice`;
    els.rerollSubmitBtn.disabled = !rerollInteractive;
  }

  renderLoserMarkers();
  renderOpeningTallyActions();
}

export function showResult(title, body, options = {}) {
  els.resultTitle.textContent = title;
  els.resultBody.textContent = body;
  resultDismissOnly = Boolean(options.dismissOnly);
  els.resultNewGameBtn.textContent = options.label ?? (resultDismissOnly ? "Ok" : "New game");
  resultModal.show();
}

export function hideResult() {
  resultModal?.hide();
}

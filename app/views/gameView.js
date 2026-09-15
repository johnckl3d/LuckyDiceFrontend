import { canDrag, isHumanTurn, otherPlayers, state } from "../models/gameModel.js";

let resultModal = null;
let handlers = {};

const els = {
  engineStatus: document.getElementById("engine-status"),
  turnStatus: document.getElementById("turn-status"),
  row2: document.getElementById("row-2"),
  row3: document.getElementById("row-3"),
  row4: document.getElementById("row-4"),
  opponentBoards: document.getElementById("opponent-boards"),
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
  slot.addEventListener("drop", (event) => onDrop(event, row));
  slot.addEventListener("click", (event) => {
    if (event.target.closest(".die")) {
      return;
    }
    handlers.onSlotClick?.(row);
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

function onDrop(event, row) {
  event.preventDefault();
  event.currentTarget.classList.remove("is-over");
  if (!canDrag()) {
    return;
  }

  const raw = event.dataTransfer.getData("text/plain");
  const index = Number(raw);
  handlers.onDrop?.(index, row);
}

export function showGameScreen(visible = true) {
  document.getElementById("game-screen").hidden = !visible;
}

export function bindGameView(nextHandlers) {
  handlers = nextHandlers;

  els.submitBtn.addEventListener("click", () => handlers.onSubmit?.());
  els.rollBtn.addEventListener("click", () => handlers.onReroll?.());
  els.newGameBtn.addEventListener("click", () => handlers.onNewGame?.());
  els.resultNewGameBtn.addEventListener("click", () => handlers.onNewGame?.());
  els.seatCount.addEventListener("change", () => handlers.onNewGame?.());

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

function appendRowSlots(host, row, roll, compact) {
  host.innerHTML = "";
  for (let index = 0; index < 5; index += 1) {
    const slot = createSlot(row, index, { compact, interactive: false });
    const occupied = roll && roll.placements[index] === row;
    if (occupied) {
      slot.appendChild(
        createDie(index, roll.values[index], {
          compact,
          interactive: false,
        })
      );
    }
    host.appendChild(slot);
  }
}

function createOpponentBoard(player) {
  const roll = state.openingRolls[player.id];
  const card = document.createElement("section");
  card.className = "table-felt rounded-4 p-3 opponent-board";
  card.dataset.playerId = player.id;
  card.setAttribute("aria-label", `${player.name} table`);

  const title = document.createElement("div");
  title.className = "opponent-board-name";
  title.textContent = player.name;
  card.appendChild(title);

  [
    { row: 4, label: "Row 4 · Second pair" },
    { row: 3, label: "Row 3 · Pair or better" },
    { row: 2, label: "Row 2 · Rolled dice" },
  ].forEach(({ row, label }) => {
    const boardRow = document.createElement("div");
    boardRow.className = "board-row mb-2";
    boardRow.dataset.row = String(row);

    const rowLabel = document.createElement("div");
    rowLabel.className = "board-row-label";
    rowLabel.textContent = label;

    const slots = document.createElement("div");
    slots.className = "dice-slots";
    appendRowSlots(slots, row, roll, true);

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

export function renderBoard() {
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

export function showResult(title, body) {
  els.resultTitle.textContent = title;
  els.resultBody.textContent = body;
  resultModal.show();
}

export function hideResult() {
  resultModal?.hide();
}

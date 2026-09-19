import { getSession } from "./loginModel.js";

export const state = {
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
  gamePhase: null,
  secondsLeft: 0,
  turnTime: 0,
  stake: null,
  ranking: [],
  lastHandName: null,
  openingRolls: {},
  loserId: null,
  awaitingOpeningTallyAck: false,
  showRerollBar: false,
  showAckBar: false,
  rerollSlots: [null, null, null, null, null],
};

export function normalizePlayer(player) {
  const aiFlag = Boolean(player.isAi ?? player.IsAi);
  const kindRaw = player.kind ?? player.Kind;
  const kind =
    typeof kindRaw === "string" && kindRaw
      ? kindRaw.toLowerCase()
      : aiFlag
        ? "ai"
        : "human";
  return {
    id: player.id ?? player.playerId ?? player.userId,
    name: player.name ?? player.playerName ?? player.playerId ?? player.id ?? (kind === "ai" ? "AI" : "Player"),
    kind,
  };
}

export function playerMatches(player, userId) {
  if (!player || userId == null || userId === "") {
    return false;
  }
  return [player.id, player.playerId, player.userId, player.name].some(
    (value) => String(value) === String(userId)
  );
}

export function localPlayerId() {
  const sessionId = getSession()?.userId;
  if (sessionId && state.players.some((player) => playerMatches(player, sessionId))) {
    const match = state.players.find((player) => playerMatches(player, sessionId));
    return match.id;
  }
  const human = state.players.find((player) => player.id === "p-human");
  return human?.id ?? sessionId ?? null;
}

export function otherPlayers() {
  const selfId = localPlayerId();
  return state.players.filter((player) => player.id !== selfId);
}

export function setOpeningRoll(playerId, values, placements) {
  if (!playerId) {
    return;
  }
  const faces = values.slice(0, 5);
  state.openingRolls[playerId] = {
    values: faces,
    placements: (Array.isArray(placements) ? placements : faces.map(() => 2)).slice(0, 5),
  };
}

export function setOpeningArrangement(playerId, rows) {
  if (!playerId) {
    return;
  }

  const values = [];
  const placements = [];
  const add = (faces, row) => {
    (Array.isArray(faces) ? faces : []).forEach((face) => {
      const value = Number(face);
      if (value >= 1 && value <= 6 && values.length < 5) {
        values.push(value);
        placements.push(row);
      }
    });
  };

  add(rows?.row1, 3);
  add(rows?.row2, 4);
  add(rows?.unarranged, 2);

  state.openingRolls[playerId] = { values, placements };
}

export function defaultPlayers(seatCount) {
  const players = [{ id: "p-human", name: "You", kind: "human" }];
  for (let extra = 2; extra < seatCount; extra += 1) {
    players.push({ id: `p-${extra}`, name: `Player ${extra}`, kind: "human" });
  }
  players.push({ id: "p-ai", name: "House", kind: "ai" });
  return players;
}

export function playerById(playerId) {
  return state.players.find((player) => player.id === playerId);
}

export function currentPlayer() {
  return playerById(state.currentPlayerId);
}

export function isHumanTurn() {
  return currentPlayer()?.kind === "human";
}

export function isLocalPlayer(playerId) {
  const selfId = localPlayerId();
  if (playerId == null || playerId === "" || !selfId) {
    return false;
  }
  if (String(selfId) === String(playerId)) {
    return true;
  }
  const self = state.players.find((player) => playerMatches(player, selfId));
  return playerMatches(self ?? { id: selfId }, playerId);
}

export function isReroll1Arrange() {
  return state.phase === "reroll1" || state.phase === "onReroll1Arrange";
}

export function canDrag() {
  if (state.phase === "challenge1-select" || isReroll1Arrange()) {
    return isLocalPlayer(state.loserId);
  }
  return state.phase === "arrange" && isHumanTurn();
}

export function resetRerollSlots() {
  state.rerollSlots = [null, null, null, null, null];
}

export function resetBoard(values = [1, 1, 1, 1, 1]) {
  state.values = values.slice();
  state.placements = [2, 2, 2, 2, 2];
  state.allowedDrops = { row3: [], row4: [] };
  state.selected.clear();
  state.reroll = [false, false, false, false, false];
  state.showRerollBar = false;
  state.showAckBar = false;
  resetRerollSlots();
  state.lastHandName = null;
}

export function rerollDiceFaces() {
  return state.rerollSlots
    .filter((index) => index != null)
    .map((index) => String(state.values[index]));
}

function clearRerollSlotForDie(index) {
  const slot = state.rerollSlots.indexOf(index);
  if (slot >= 0) {
    state.rerollSlots[slot] = null;
  }
}

function nextEmptyRerollSlot(from = 0) {
  for (let slot = from; slot < 5; slot += 1) {
    if (state.rerollSlots[slot] == null) {
      return slot;
    }
  }
  return state.rerollSlots.findIndex((value) => value == null);
}

function placeOnRerollSlots(indices, slotIndex) {
  let changed = false;
  const start = Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < 5 ? slotIndex : 0;

  indices.forEach((index, offset) => {
    if (index < 0 || index >= state.values.length) {
      return;
    }

    const target =
      offset === 0 && Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < 5
        ? slotIndex
        : nextEmptyRerollSlot(start);

    if (target < 0) {
      return;
    }

    const occupant = state.rerollSlots[target];
    if (occupant != null && occupant !== index) {
      state.placements[occupant] = 2;
      state.rerollSlots[target] = null;
    }

    clearRerollSlotForDie(index);
    state.rerollSlots[target] = index;
    state.placements[index] = 1;
    changed = true;
  });

  state.selected.clear();
  return { changed, invalidDrop: !changed };
}

export function applyAllowedPlacements() {
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

export function standingValues(playerId) {
  const row = state.ranking.find((entry) => entry.playerId === playerId);
  return row?.values ? row.values.slice() : [1, 1, 1, 1, 1];
}

export function toggleSelected(index) {
  if (state.selected.has(index)) {
    state.selected.delete(index);
  } else {
    state.selected.add(index);
  }
}

export function toggleReroll(index) {
  state.reroll[index] = !state.reroll[index];
}

export function tryPlace(indices, row, slotIndex) {
  if (state.phase === "challenge1-select" || isReroll1Arrange()) {
    if (state.phase === "challenge1-select" && row === 1) {
      return placeOnRerollSlots(indices, slotIndex);
    }

    let changed = false;
    indices.forEach((index) => {
      if (row === 2 || row === 3 || row === 4) {
        clearRerollSlotForDie(index);
        state.placements[index] = row;
        changed = true;
      }
    });
    state.selected.clear();
    return { changed, invalidDrop: !changed };
  }

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

  state.selected.clear();
  return { changed, invalidDrop: !changed && row !== 2 };
}

export function revertInvalidPlacements() {
  state.placements = state.placements.map((row, index) => {
    if (row === 3 && !state.allowedDrops.row3.includes(index)) {
      return 2;
    }
    if (row === 4 && !state.allowedDrops.row4.includes(index)) {
      return 2;
    }
    return row;
  });
}

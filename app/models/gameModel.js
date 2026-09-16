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
  secondsLeft: 0,
  ranking: [],
  lastHandName: null,
  openingRolls: {},
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
  const normalized = {
    id: player.id ?? player.playerId ?? player.userId,
    name: player.name ?? player.playerName ?? player.playerId ?? player.id ?? (kind === "ai" ? "AI" : "Player"),
    kind,
  };
  // #region agent log
  fetch('http://127.0.0.1:7763/ingest/0448d2d9-8835-4aeb-9ebf-675bd52a3444',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'dfdec0'},body:JSON.stringify({sessionId:'dfdec0',runId:'pre-fix',hypothesisId:'C',location:'gameModel.js:normalizePlayer',message:'normalizePlayer in/out',data:{inputKeys:player?Object.keys(player):[],input:{id:player?.id,playerId:player?.playerId,userId:player?.userId,name:player?.name,kind:player?.kind,Kind:player?.Kind,isAi:player?.isAi,IsAi:player?.IsAi,type:player?.type,Type:player?.Type},normalized},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  return normalized;
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

export function canDrag() {
  return state.phase === "arrange" && isHumanTurn();
}

export function resetBoard(values = [1, 1, 1, 1, 1]) {
  state.values = values.slice();
  state.placements = [2, 2, 2, 2, 2];
  state.allowedDrops = { row3: [], row4: [] };
  state.selected.clear();
  state.reroll = [false, false, false, false, false];
  state.lastHandName = null;
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

export function tryPlace(indices, row) {
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

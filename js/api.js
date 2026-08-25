/**
 * Engine client + local mock.
 * Set USE_ENGINE to true when a real server is listening at ENGINE_URL.
 */

const USE_ENGINE = false;
const ENGINE_URL = "http://localhost:8080";

const mockGames = new Map();
let gameSeq = 1;
let forcedRollQueue = [];

/** Test helper: queue exact next roll values (length 5, faces 1–6). */
function forceNextRoll(values) {
  forcedRollQueue.push(values.slice(0, 5));
}

async function post(path, body) {
  const response = await fetch(`${ENGINE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Engine ${path} failed: ${response.status}`);
  }

  return response.json();
}

async function pingEngine() {
  if (!USE_ENGINE) {
    return { ok: false, mode: "local" };
  }

  try {
    const response = await fetch(`${ENGINE_URL}/health`);
    return { ok: response.ok, mode: "engine" };
  } catch {
    return { ok: false, mode: "engine-unreachable" };
  }
}

async function startGame(players) {
  if (USE_ENGINE) {
    return post("/game/start", { players });
  }
  return mockStart(players);
}

async function rollDice(payload) {
  if (USE_ENGINE) {
    return post("/roll", payload);
  }
  return mockRoll(payload);
}

async function submitHand(payload) {
  if (USE_ENGINE) {
    return post("/submit", payload);
  }
  return mockSubmit(payload);
}

async function tallyHands(payload) {
  if (USE_ENGINE) {
    return post("/tally", payload);
  }
  return mockTally(payload);
}

function mockStart(players) {
  const gameId = `g-${String(gameSeq).padStart(3, "0")}`;
  gameSeq += 1;

  const game = {
    id: gameId,
    round: 1,
    currentPlayerId: players[0].id,
    players: players.map((player) => ({ ...player })),
    submissions: {},
    lastRoll: {},
    round2PlayerId: null,
  };

  mockGames.set(gameId, game);

  return {
    gameId,
    round: 1,
    currentPlayerId: game.currentPlayerId,
    players: game.players,
  };
}

function mockRoll({ gameId, playerId, held }) {
  const game = requireGame(gameId);
  const previous =
    game.lastRoll[playerId]?.values ||
    game.submissions[playerId]?.values ||
    [1, 1, 1, 1, 1];

  const queued = forcedRollQueue.shift();
  const values = previous.map((value, index) => {
    if (held[index]) {
      return value;
    }
    if (queued) {
      return queued[index];
    }
    return 1 + Math.floor(Math.random() * 6);
  });

  const evaluated = evaluateHand(values);
  game.lastRoll[playerId] = { values, evaluated };

  return {
    values,
    instantWin: evaluated.instantWin,
    handRank: evaluated.handRank,
    handName: evaluated.handName,
    allowedDrops: {
      row3: evaluated.allowedDrops.row3.slice(),
      row4: evaluated.allowedDrops.row4.slice(),
    },
    timerSeconds: 15,
  };
}

function mockSubmit({ gameId, playerId, values, placements }) {
  const game = requireGame(gameId);
  const roll = game.lastRoll[playerId];

  if (!roll || !sameValues(roll.values, values)) {
    return {
      accepted: false,
      error: "Values do not match the current roll",
      handRank: null,
      handName: null,
      roundComplete: false,
      nextPlayerId: playerId,
    };
  }

  const allowed = roll.evaluated.allowedDrops;
  for (let index = 0; index < values.length; index += 1) {
    const row = placements[index];
    if (row === 3 && !allowed.row3.includes(index)) {
      return rejectSubmit(game, playerId, "Illegal row 3 placement");
    }
    if (row === 4 && !allowed.row4.includes(index)) {
      return rejectSubmit(game, playerId, "Illegal row 4 placement");
    }
    if (row !== 2 && row !== 3 && row !== 4) {
      return rejectSubmit(game, playerId, "Placement must be row 2, 3, or 4");
    }
  }

  const evaluated = evaluateHand(values);
  game.submissions[playerId] = {
    values: values.slice(),
    placements: placements.slice(),
    handRank: evaluated.handRank,
    handName: evaluated.handName,
  };

  if (game.round === 2) {
    return {
      accepted: true,
      handRank: evaluated.handRank,
      handName: evaluated.handName,
      roundComplete: true,
      nextPlayerId: null,
    };
  }

  const nextPlayerId = nextUnsubmitted(game, playerId);
  return {
    accepted: true,
    handRank: evaluated.handRank,
    handName: evaluated.handName,
    roundComplete: nextPlayerId === null,
    nextPlayerId,
  };
}

function mockTally({ gameId, phase }) {
  const game = requireGame(gameId);
  const ranking = rankPlayers(game);

  if (phase === "round1") {
    const last = ranking[ranking.length - 1];
    game.round = 2;
    game.round2PlayerId = last.playerId;
    game.currentPlayerId = last.playerId;

    return {
      ranking,
      nextPlayerId: last.playerId,
      gameOver: false,
      winnerId: null,
      loserId: null,
    };
  }

  const actingId = game.round2PlayerId;
  const last = ranking[ranking.length - 1];
  const stillLast = last.playerId === actingId;

  if (stillLast) {
    return {
      ranking,
      nextPlayerId: null,
      gameOver: true,
      winnerId: null,
      loserId: actingId,
      restart: true,
    };
  }

  return {
    ranking,
    nextPlayerId: null,
    gameOver: false,
    winnerId: null,
    loserId: null,
    restart: false,
  };
}

function requireGame(gameId) {
  const game = mockGames.get(gameId);
  if (!game) {
    throw new Error(`Unknown game ${gameId}`);
  }
  return game;
}

function rejectSubmit(game, playerId, error) {
  return {
    accepted: false,
    error,
    handRank: game.lastRoll[playerId]?.evaluated.handRank ?? null,
    handName: game.lastRoll[playerId]?.evaluated.handName ?? null,
    roundComplete: false,
    nextPlayerId: playerId,
  };
}

function nextUnsubmitted(game, playerId) {
  const index = game.players.findIndex((player) => player.id === playerId);
  for (let offset = 1; offset <= game.players.length; offset += 1) {
    const player = game.players[(index + offset) % game.players.length];
    if (!game.submissions[player.id]) {
      return player.id;
    }
  }
  return null;
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function faceCounts(values) {
  const tally = [0, 0, 0, 0, 0, 0, 0];
  for (const value of values) {
    tally[value] += 1;
  }
  return tally;
}

function indicesOf(values, face) {
  const indices = [];
  values.forEach((value, index) => {
    if (value === face) {
      indices.push(index);
    }
  });
  return indices;
}

function isSequence12345(values) {
  return [...values].sort((a, b) => a - b).join(",") === "1,2,3,4,5";
}

function evaluateHand(values) {
  if (isSequence12345(values)) {
    return {
      handRank: 1,
      handName: "sequence 1-2-3-4-5",
      instantWin: true,
      allowedDrops: { row3: [], row4: [] },
      combo: [5, 4, 3, 2, 1],
      kickers: [],
    };
  }

  const tally = faceCounts(values);
  let quadsFace = 0;
  let tripleFace = 0;
  const pairFaces = [];

  for (let face = 6; face >= 1; face -= 1) {
    if (tally[face] >= 4) {
      quadsFace = face;
    } else if (tally[face] === 3) {
      tripleFace = face;
    } else if (tally[face] === 2) {
      pairFaces.push(face);
    }
  }

  if (quadsFace) {
    const row3 = indicesOf(values, quadsFace);
    return {
      handRank: 2,
      handName: "quads",
      instantWin: false,
      allowedDrops: { row3, row4: [] },
      combo: [quadsFace],
      kickers: leftoverFaces(values, row3),
    };
  }

  if (tripleFace) {
    const row3 = indicesOf(values, tripleFace);
    const pairFace = pairFaces[0] || 0;
    const row4 = pairFace ? indicesOf(values, pairFace) : [];
    return {
      handRank: 3,
      handName: "triples",
      instantWin: false,
      allowedDrops: { row3, row4 },
      combo: [tripleFace],
      kickers: leftoverFaces(values, row3),
    };
  }

  if (pairFaces.length >= 2) {
    const highPair = pairFaces[0];
    const lowPair = pairFaces[1];
    const row3 = indicesOf(values, highPair);
    const row4 = indicesOf(values, lowPair);
    return {
      handRank: 4,
      handName: "two pairs",
      instantWin: false,
      allowedDrops: { row3, row4 },
      combo: [highPair, lowPair],
      kickers: leftoverFaces(values, [...row3, ...row4]),
    };
  }

  if (pairFaces.length === 1) {
    const row3 = indicesOf(values, pairFaces[0]);
    return {
      handRank: 5,
      handName: "one pair",
      instantWin: false,
      allowedDrops: { row3, row4: [] },
      combo: [pairFaces[0]],
      kickers: leftoverFaces(values, row3),
    };
  }

  return {
    handRank: 6,
    handName: "no pair",
    instantWin: false,
    allowedDrops: { row3: [], row4: [] },
    combo: [],
    kickers: leftoverFaces(values, []),
  };
}

function leftoverFaces(values, usedIndices) {
  const used = new Set(usedIndices);
  return values
    .map((value, index) => (used.has(index) ? null : value))
    .filter((value) => value !== null)
    .sort((a, b) => b - a);
}

function compareHands(left, right) {
  if (left.handRank !== right.handRank) {
    return left.handRank - right.handRank;
  }

  const comboLength = Math.max(left.combo.length, right.combo.length);
  for (let index = 0; index < comboLength; index += 1) {
    const delta = (right.combo[index] || 0) - (left.combo[index] || 0);
    if (delta) {
      return delta;
    }
  }

  const kickerLength = Math.max(left.kickers.length, right.kickers.length);
  for (let index = 0; index < kickerLength; index += 1) {
    const delta = (right.kickers[index] || 0) - (left.kickers[index] || 0);
    if (delta) {
      return delta;
    }
  }

  return left.playerId.localeCompare(right.playerId);
}

function rankPlayers(game) {
  const rows = game.players.map((player) => {
    const submission = game.submissions[player.id];
    const evaluated = evaluateHand(submission.values);
    return {
      playerId: player.id,
      name: player.name,
      kind: player.kind,
      handRank: evaluated.handRank,
      handName: evaluated.handName,
      values: submission.values.slice(),
      combo: evaluated.combo,
      kickers: evaluated.kickers,
    };
  });

  rows.sort(compareHands);
  return rows.map((row, index) => ({
    playerId: row.playerId,
    place: index + 1,
    handRank: row.handRank,
    handName: row.handName,
    values: row.values,
  }));
}

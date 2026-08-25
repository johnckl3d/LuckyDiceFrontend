/**
 * Backend engine client.
 * Set USE_ENGINE to true and ENGINE_URL to your server when it is ready.
 *
 * Expected later contract (adjust to match the real engine):
 *   POST {ENGINE_URL}/roll
 *     body: { values: number[5], held: boolean[5] }
 *     resp: { values: number[5], rollsLeft: number }
 *   POST {ENGINE_URL}/score
 *     body: { values: number[5] }
 *     resp: { scores: Record<string, number> }
 */

const USE_ENGINE = false;
const ENGINE_URL = "http://localhost:8080";

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

async function rollDice(state) {
  if (USE_ENGINE) {
    return post("/roll", {
      values: state.values,
      held: state.held,
    });
  }

  const values = state.values.map((value, index) =>
    state.held[index] ? value : 1 + Math.floor(Math.random() * 6)
  );

  return {
    values,
    rollsLeft: Math.max(0, state.rollsLeft - 1),
  };
}

async function scoreDice(values) {
  if (USE_ENGINE) {
    return post("/score", { values });
  }

  return { scores: localScores(values) };
}

function counts(values) {
  const tally = [0, 0, 0, 0, 0, 0, 0];
  for (const value of values) {
    tally[value] += 1;
  }
  return tally;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function ofAKind(tally, n) {
  return tally.some((count) => count >= n);
}

function localScores(values) {
  const tally = counts(values);
  const total = sum(values);
  const upper = (face) => tally[face] * face;

  return {
    Ones: upper(1),
    Twos: upper(2),
    Threes: upper(3),
    Fours: upper(4),
    Fives: upper(5),
    Sixes: upper(6),
    "3 of a kind": ofAKind(tally, 3) ? total : 0,
    "4 of a kind": ofAKind(tally, 4) ? total : 0,
    "Full house": tally.includes(3) && tally.includes(2) ? 25 : 0,
    "Small straight": hasStraight(tally, 4) ? 30 : 0,
    "Large straight": hasStraight(tally, 5) ? 40 : 0,
    Yahtzee: ofAKind(tally, 5) ? 50 : 0,
    Chance: total,
  };
}

function hasStraight(tally, length) {
  let run = 0;
  for (let face = 1; face <= 6; face += 1) {
    if (tally[face] > 0) {
      run += 1;
      if (run >= length) {
        return true;
      }
    } else {
      run = 0;
    }
  }
  return false;
}

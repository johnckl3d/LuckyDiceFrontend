/**
 * Engine HTTP client.
 * The game engine lives in LuckyDiceAPI at ENGINE_URL.
 */

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
  try {
    const response = await fetch(`${ENGINE_URL}/health`);
    return { ok: response.ok, mode: "engine" };
  } catch {
    return { ok: false, mode: "engine-unreachable" };
  }
}

async function startGame(players) {
  return post("/game/start", { players });
}

async function rollDice(payload) {
  return post("/roll", payload);
}

async function submitHand(payload) {
  return post("/submit", payload);
}

async function tallyHands(payload) {
  return post("/tally", payload);
}

/**
 * Engine HTTP client.
 * The game engine lives in LuckyDiceAPI at ENGINE_URL.
 */

import { utcTimestampHeader } from "../utils/helpers.js";
import { getSession, setSession } from "../models/loginModel.js";

const ENGINE_URL = "http://localhost:8080";

function apiHeaders(includeJson = true) {
  const headers = {
    "X-Timestamp": utcTimestampHeader(),
  };
  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }
  const session = getSession();
  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }
  return headers;
}

async function readErrorMessage(response) {
  try {
    const payload = await response.json();
    if (payload?.error) {
      return payload.error;
    }
    if (payload?.requiredTimestamp) {
      return "Request timestamp was rejected. Check the device clock and try again.";
    }
  } catch {
    // Fall through to status text.
  }
  return `Engine request failed: ${response.status}`;
}

async function post(path, body) {
  const response = await fetch(`${ENGINE_URL}${path}`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json();
}

export async function login(userId, password) {
  const response = await fetch(`${ENGINE_URL}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Timestamp": utcTimestampHeader(),
    },
    body: JSON.stringify({ userId, password }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const tokens = await response.json();
  setSession({
    userId,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
  return getSession();
}

export async function pingEngine() {
  try {
    const response = await fetch(`${ENGINE_URL}/health`);
    return { ok: response.ok, mode: "engine" };
  } catch {
    return { ok: false, mode: "engine-unreachable" };
  }
}

export async function startGame(players) {
  return post("/game/start", { players });
}

export async function rollDice(payload) {
  return post("/roll", payload);
}

export async function submitHand(payload) {
  return post("/submit", payload);
}

export async function tallyHands(payload) {
  return post("/tally", payload);
}

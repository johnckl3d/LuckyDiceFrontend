/**
 * LuckyDiceAPI SignalR client.
 * Hubs: /hubs/auth, /hubs/game, /hubs/lobby
 */

import { getSession, setSession } from "../models/loginModel.js";

const ENGINE_URL = "http://localhost:8080";

const connections = {
  auth: null,
  game: null,
  lobby: null,
};

let lobbyToken = "";
let lobbyNotificationHandlers = null;

function signalRLib() {
  const lib = window.signalR;
  if (!lib) {
    throw new Error("SignalR client failed to load.");
  }
  return lib;
}

function hubError(error) {
  const raw = String(error?.message ?? error ?? "Socket request failed");
  const match = raw.match(/HubException:\s*([\s\S]+)$/i);
  if (match) {
    return new Error(match[1].trim());
  }
  if (/Status code '401'|Unauthorized/i.test(raw)) {
    return new Error("Session expired. Please log in again.");
  }
  if (/Failed to (start|fetch)|WebSocket failed|negotiate|ERR_CONNECTION/i.test(raw)) {
    return new Error("Could not reach the game engine.");
  }
  return new Error(raw);
}

function buildConnection(path, withAccessToken) {
  const { HubConnectionBuilder } = signalRLib();
  const options = {
    withCredentials: false,
    ...(withAccessToken
      ? {
          accessTokenFactory: () => getSession()?.accessToken ?? "",
        }
      : {}),
  };

  return new HubConnectionBuilder()
    .withUrl(`${ENGINE_URL}${path}`, options)
    .withAutomaticReconnect()
    .build();
}

function waitUntilConnected(connection) {
  const { HubConnectionState } = signalRLib();
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (connection.state === HubConnectionState.Connected) {
        window.clearInterval(timer);
        resolve();
        return;
      }
      if (Date.now() - started > 10000) {
        window.clearInterval(timer);
        reject(new Error("Could not reach the game engine."));
      }
    }, 50);
  });
}

async function stopConnection(key) {
  const connection = connections[key];
  if (!connection) {
    return;
  }
  try {
    await connection.stop();
  } catch {
    // Ignore shutdown errors.
  }
  connections[key] = null;
  if (key === "lobby") {
    lobbyToken = "";
  }
}

async function ensureConnection(key, path, withAccessToken = false) {
  const { HubConnectionState } = signalRLib();

  if (withAccessToken) {
    const token = getSession()?.accessToken ?? "";
    if (!token) {
      throw new Error("Unauthorized");
    }
    if (connections[key] && lobbyToken !== token) {
      await stopConnection(key);
    }
  }

  if (!connections[key]) {
    connections[key] = buildConnection(path, withAccessToken);
    if (withAccessToken) {
      lobbyToken = getSession()?.accessToken ?? "";
    }
    if (key === "lobby") {
      bindLobbyNotificationHandlers(connections[key]);
    }
  }

  const connection = connections[key];
  if (connection.state === HubConnectionState.Disconnected) {
    try {
      await connection.start();
    } catch (error) {
      throw hubError(error);
    }
  }

  if (connection.state !== HubConnectionState.Connected) {
    await waitUntilConnected(connection);
  }

  return connection;
}

async function invoke(key, path, method, args = [], withAccessToken = false) {
  const connection = await ensureConnection(key, path, withAccessToken);
  try {
    return await connection.invoke(method, ...args);
  } catch (error) {
    throw hubError(error);
  }
}

export async function login(userId, password) {
  const tokens = await invoke("auth", "/hubs/auth", "Login", [{ userId, password }]);
  setSession({
    userId,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
  return getSession();
}

export async function pingEngine() {
  try {
    await ensureConnection("auth", "/hubs/auth");
    return { ok: true, mode: "engine" };
  } catch {
    return { ok: false, mode: "engine-unreachable" };
  }
}

function bindLobbyNotificationHandlers(connection) {
  connection.off("lobbyUpdated");
  connection.off("gameReady");
  if (lobbyNotificationHandlers?.onUpdated) {
    connection.on("lobbyUpdated", lobbyNotificationHandlers.onUpdated);
  }
  if (lobbyNotificationHandlers?.onReady) {
    connection.on("gameReady", lobbyNotificationHandlers.onReady);
  }
}

export async function subscribeLobbyNotifications(handlers) {
  lobbyNotificationHandlers = handlers;
  const connection = await ensureConnection("lobby", "/hubs/lobby", true);
  bindLobbyNotificationHandlers(connection);
}

export async function listLobbyGames() {
  return invoke("lobby", "/hubs/lobby", "ListGames", [], true);
}

export async function createLobbyGame(payload) {
  return invoke("lobby", "/hubs/lobby", "CreateGame", [payload], true);
}

export async function startGame(players) {
  return invoke("game", "/hubs/game", "Start", [{ players }]);
}

export async function rollDice(payload) {
  return invoke("game", "/hubs/game", "Roll", [payload]);
}

export async function submitHand(payload) {
  return invoke("game", "/hubs/game", "Submit", [payload]);
}

export async function tallyHands(payload) {
  return invoke("game", "/hubs/game", "Tally", [payload]);
}

export async function disconnectSockets() {
  await Promise.all(["auth", "game", "lobby"].map((key) => stopConnection(key)));
}

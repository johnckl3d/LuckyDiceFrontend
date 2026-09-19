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
let gameNotificationHandlers = null;
let sessionExpiredHandler = null;
let sessionExpiredNotified = false;

export const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please login again.";

export function setSessionExpiredHandler(handler) {
  sessionExpiredHandler = handler;
}

export function resetSessionExpiredNotice() {
  sessionExpiredNotified = false;
}

export function isSessionExpiredError(error) {
  const message = String(error?.message ?? error ?? "");
  return (
    message === SESSION_EXPIRED_MESSAGE ||
    /Status code '401'|Unauthorized|Session expired/i.test(message)
  );
}

function isUnauthorizedMessage(raw) {
  return /Status code '401'|Unauthorized/i.test(raw);
}

function notifySessionExpired() {
  if (sessionExpiredNotified || !getSession()) {
    return;
  }
  sessionExpiredNotified = true;
  sessionExpiredHandler?.();
}

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
  const message = match ? match[1].trim() : raw;
  if (isUnauthorizedMessage(raw) || isUnauthorizedMessage(message)) {
    notifySessionExpired();
    return new Error(SESSION_EXPIRED_MESSAGE);
  }
  if (match) {
    return new Error(message);
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
      notifySessionExpired();
      throw new Error(SESSION_EXPIRED_MESSAGE);
    }
    if (connections[key] && lobbyToken !== token) {
      await stopConnection(key);
    }
  }

  if (!connections[key]) {
    connections[key] = buildConnection(path, withAccessToken);
    connections[key].onclose((error) => {
      if (error && isUnauthorizedMessage(String(error?.message ?? error))) {
        notifySessionExpired();
      }
    });
    if (withAccessToken) {
      lobbyToken = getSession()?.accessToken ?? "";
    }
    if (key === "lobby") {
      bindLobbyNotificationHandlers(connections[key]);
    }
    if (key === "game") {
      bindGameNotificationHandlers(connections[key]);
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
    // #region agent log
    if (/arrange|reroll|Reroll/i.test(String(method))) {
      const first = args?.[0];
      fetch('http://127.0.0.1:7763/ingest/0448d2d9-8835-4aeb-9ebf-675bd52a3444',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e24ed7'},body:JSON.stringify({sessionId:'e24ed7',runId:'pre-fix',hypothesisId:'A',location:'apiService.js:invoke',message:'hub invoke',data:{method,payloadTarget:first?.target ?? null,keys:first && typeof first === 'object' ? Object.keys(first) : []},timestamp:Date.now()})}).catch(()=>{});
    }
    // #endregion
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
  resetSessionExpiredNotice();
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
  connection.off("tableReady");
  connection.off("TableReady");
  connection.off("tableStarted");
  connection.off("TableStarted");
  connection.off("openingRolled");
  connection.off("OpeningRolled");
  if (lobbyNotificationHandlers?.onUpdated) {
    connection.on("lobbyUpdated", lobbyNotificationHandlers.onUpdated);
  }
  if (lobbyNotificationHandlers?.onReady) {
    connection.on("tableReady", lobbyNotificationHandlers.onReady);
    connection.on("TableReady", lobbyNotificationHandlers.onReady);
  }
  if (lobbyNotificationHandlers?.onStarted) {
    connection.on("tableStarted", lobbyNotificationHandlers.onStarted);
    connection.on("TableStarted", lobbyNotificationHandlers.onStarted);
  }
  if (lobbyNotificationHandlers?.onOpeningRolled) {
    connection.on("openingRolled", lobbyNotificationHandlers.onOpeningRolled);
    connection.on("OpeningRolled", lobbyNotificationHandlers.onOpeningRolled);
  }
}

function bindGameNotificationHandlers(connection) {
  connection.off("openingRolled");
  connection.off("OpeningRolled");
  connection.off("openingTally");
  connection.off("OpeningTally");
  connection.off("onTurnAssigned");
  connection.off("OnTurnAssigned");
  connection.off("challenge1Reroll1");
  connection.off("Challenge1Reroll1");
  connection.off("reroll1");
  connection.off("Reroll1");
  connection.off("onReroll1");
  connection.off("OnReroll1");
  connection.off("reRoll1");
  connection.off("ReRoll1");
  connection.off("challenge1RSelect2");
  connection.off("Challenge1RSelect2");
  connection.off("challenge1Reroll2");
  connection.off("Challenge1Reroll2");
  connection.off("challengeResolve");
  connection.off("ChallengeResolve");
  connection.off("gameDetails");
  connection.off("GameDetails");
  if (gameNotificationHandlers?.onOpeningRolled) {
    connection.on("openingRolled", gameNotificationHandlers.onOpeningRolled);
    connection.on("OpeningRolled", gameNotificationHandlers.onOpeningRolled);
  }
  if (gameNotificationHandlers?.onOpeningTally) {
    connection.on("openingTally", gameNotificationHandlers.onOpeningTally);
    connection.on("OpeningTally", gameNotificationHandlers.onOpeningTally);
  }
  if (gameNotificationHandlers?.onTurnAssigned) {
    connection.on("onTurnAssigned", gameNotificationHandlers.onTurnAssigned);
    connection.on("OnTurnAssigned", gameNotificationHandlers.onTurnAssigned);
  }
  if (gameNotificationHandlers?.onChallenge1Reroll1) {
    connection.on("challenge1Reroll1", gameNotificationHandlers.onChallenge1Reroll1);
    connection.on("Challenge1Reroll1", gameNotificationHandlers.onChallenge1Reroll1);
    connection.on("reroll1", gameNotificationHandlers.onChallenge1Reroll1);
    connection.on("Reroll1", gameNotificationHandlers.onChallenge1Reroll1);
    connection.on("onReroll1", gameNotificationHandlers.onChallenge1Reroll1);
    connection.on("OnReroll1", gameNotificationHandlers.onChallenge1Reroll1);
    connection.on("reRoll1", gameNotificationHandlers.onChallenge1Reroll1);
    connection.on("ReRoll1", gameNotificationHandlers.onChallenge1Reroll1);
  }
  if (gameNotificationHandlers?.onChallenge1RSelect2) {
    connection.on("challenge1RSelect2", gameNotificationHandlers.onChallenge1RSelect2);
    connection.on("Challenge1RSelect2", gameNotificationHandlers.onChallenge1RSelect2);
  }
  if (gameNotificationHandlers?.onChallenge1Reroll2) {
    connection.on("challenge1Reroll2", gameNotificationHandlers.onChallenge1Reroll2);
    connection.on("Challenge1Reroll2", gameNotificationHandlers.onChallenge1Reroll2);
  }
  if (gameNotificationHandlers?.onChallengeResolve) {
    connection.on("challengeResolve", gameNotificationHandlers.onChallengeResolve);
    connection.on("ChallengeResolve", gameNotificationHandlers.onChallengeResolve);
  }
  if (gameNotificationHandlers?.onGameDetails) {
    connection.on("gameDetails", gameNotificationHandlers.onGameDetails);
    connection.on("GameDetails", gameNotificationHandlers.onGameDetails);
  }
}

export async function subscribeLobbyNotifications(handlers) {
  lobbyNotificationHandlers = handlers;
  const connection = await ensureConnection("lobby", "/hubs/lobby", true);
  bindLobbyNotificationHandlers(connection);
}

export async function subscribeGameNotifications(handlers) {
  gameNotificationHandlers = handlers;
  const connection = await ensureConnection("game", "/hubs/game", true);
  bindGameNotificationHandlers(connection);
}

export async function listLobbyGames() {
  return invoke("lobby", "/hubs/lobby", "ListGames", [], true);
}

export async function createLobbyGame(payload) {
  return invoke("lobby", "/hubs/lobby", "CreateGame", [payload], true);
}

export async function sendPlayerResponse(gameId, response) {
  return invoke("lobby", "/hubs/lobby", "playerReady", [{ gameId, response }], true);
}

export async function leaveLobbyGame(gameId) {
  return invoke("lobby", "/hubs/lobby", "LeaveGame", [gameId], true);
}

export async function joinGame(gameId) {
  return invoke("game", "/hubs/game", "join", [{ gameId }], true);
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

function asStringArray(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function boardDicePayload(payload) {
  return {
    set1: asStringArray(payload?.set1),
    set2: asStringArray(payload?.set2),
    flux: asStringArray(payload?.flux),
  };
}

export async function arrangeOpening(payload) {
  return invoke("game", "/hubs/game", "openingArrange", [payload], true);
}

export async function reroll1Arrange(payload) {
  return invoke(
    "game",
    "/hubs/game",
    "reroll1Arrange",
    [
      {
        gameId: payload?.gameId,
        ...boardDicePayload(payload),
      },
    ],
    true
  );
}

export async function openingTally(payload) {
  return invoke(
    "game",
    "/hubs/game",
    "openingTally",
    [
      {
        gameId: payload?.gameId,
        request: payload?.request ?? "1",
        ...boardDicePayload(payload),
      },
    ],
    true
  );
}

export async function reroll1(payload) {
  const dice = payload?.dice ?? {};
  return invoke(
    "game",
    "/hubs/game",
    "reroll1",
    [
      {
        gameId: payload?.gameId,
        dice: {
          set1: asStringArray(dice.set1),
          set2: asStringArray(dice.set2),
          discarded: asStringArray(dice.discarded),
        },
      },
    ],
    true
  );
}

export async function tallyHands(payload) {
  return invoke("game", "/hubs/game", "Tally", [payload]);
}

export async function disconnectSockets() {
  await Promise.all(["auth", "game", "lobby"].map((key) => stopConnection(key)));
}

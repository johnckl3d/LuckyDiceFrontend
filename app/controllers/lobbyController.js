import {
  createLobbyGame,
  isSessionExpiredError,
  leaveLobbyGame,
  listLobbyGames,
  pingEngine,
  sendPlayerResponse,
  subscribeLobbyNotifications,
} from "../services/apiService.js";
import {
  bindLobbyView,
  hideLobby,
  hideSeatsFilledPopup,
  readCreateGameForm,
  renderLobbyGames,
  setCreateBusy,
  setReadyBusy,
  showLobby,
  showLobbyError,
  showSeatsFilledPopup,
  showReadyWaiting,
} from "../views/lobbyView.js";
import { setEngineStatus } from "../views/gameView.js";
import { enterGame, leaveGame, applyOpeningRolled } from "./gameController.js";

const POLL_MS = 8000;
let pollId = null;
let bound = false;
let lastReadyGameId = "";

async function refreshGames({ keepError = false } = {}) {
  try {
    const payload = await listLobbyGames();
    renderLobbyGames(payload.games ?? []);
    if (!keepError) {
      showLobbyError("");
    }
  } catch (error) {
    if (keepError || isSessionExpiredError(error)) {
      return;
    }
    renderLobbyGames([]);
    showLobbyError(
      error.message === "Failed to fetch" ? "Could not reach the game engine." : error.message
    );
  }
}

async function handleCreate() {
  const body = readCreateGameForm();
  if (body.playerCount < 2 || body.playerCount > 8) {
    showLobbyError("Players must be between 2 and 8.");
    return;
  }
  if (body.turnTime < 1) {
    showLobbyError("Turn time must be at least 1 second.");
    return;
  }
  if (body.stake < 0) {
    showLobbyError("Stake cannot be negative.");
    return;
  }

  setCreateBusy(true);
  showLobbyError("");
  try {
    await createLobbyGame(body);
    await refreshGames();
  } catch (error) {
    if (isSessionExpiredError(error)) {
      return;
    }
    showLobbyError(
      error.message === "Failed to fetch" ? "Could not reach the game engine." : error.message
    );
  } finally {
    setCreateBusy(false);
  }
}

function stopPolling() {
  if (pollId !== null) {
    window.clearInterval(pollId);
    pollId = null;
  }
}

function handlePracticeTable() {
  stopPolling();
  hideLobby();
  enterGame();
}

function handleLobbyUpdated() {
  refreshGames({ keepError: true });
}

const PLAYER_RESPONSE_START = 1;

function handleGameReady(game) {
  const gameId = game?.gameId ?? game?.GameId ?? "";
  if (gameId && gameId === lastReadyGameId) {
    return;
  }
  lastReadyGameId = gameId;
  showSeatsFilledPopup();
  refreshGames({ keepError: true });
}

async function handleReadyStart() {
  const gameId = lastReadyGameId;
  if (!gameId) {
    hideSeatsFilledPopup();
    return;
  }

  setReadyBusy(true);
  showLobbyError("");
  try {
    await sendPlayerResponse(gameId, PLAYER_RESPONSE_START);
    showReadyWaiting();
  } catch (error) {
    if (!isSessionExpiredError(error)) {
      showLobbyError(
        error.message === "Failed to fetch" ? "Could not reach the game engine." : error.message
      );
    }
    setReadyBusy(false);
  }
}

function readGameId(value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) {
      return "";
    }
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        return readGameId(JSON.parse(text));
      } catch {
        return text;
      }
    }
    return text;
  }
  if (Array.isArray(value)) {
    return readGameId(value[0]);
  }
  if (typeof value === "object") {
    const id = value.gameId ?? value.GameId;
    return id == null ? "" : String(id).trim();
  }
  return String(value).trim();
}

async function handleTableStarted(payload) {
  // #region agent log
  fetch('http://127.0.0.1:7763/ingest/0448d2d9-8835-4aeb-9ebf-675bd52a3444',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'dfdec0'},body:JSON.stringify({sessionId:'dfdec0',runId:'pre-fix',hypothesisId:'B',location:'lobbyController.js:handleTableStarted',message:'tableStarted payload',data:{payloadType:typeof payload,keys:payload&&typeof payload==='object'?Object.keys(payload):[],gameId:payload?.gameId??payload?.GameId,playerCount:(payload?.players??payload?.Players??[]).length,players:payload?.players??payload?.Players??null,rawPreview:typeof payload==='string'?payload.slice(0,400):null},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const gameId = readGameId(payload) || lastReadyGameId;
  hideSeatsFilledPopup();
  lastReadyGameId = "";
  stopPolling();
  hideLobby();
  if (!gameId) {
    showLobby();
    showLobbyError("Table started, but no gameId was provided.");
    return;
  }
  await enterGame(typeof payload === "object" && payload ? { ...payload, gameId } : { gameId });
}

async function handleReadyCancel() {
  const gameId = lastReadyGameId;
  setReadyBusy(true);
  showLobbyError("");
  try {
    if (gameId) {
      await leaveLobbyGame(gameId);
    }
  } catch (error) {
    if (!isSessionExpiredError(error)) {
      showLobbyError(
        error.message === "Failed to fetch" ? "Could not reach the game engine." : error.message
      );
    }
  } finally {
    lastReadyGameId = "";
    hideSeatsFilledPopup();
    showLobby();
    setReadyBusy(false);
  }
  await refreshGames({ keepError: true });
}

async function listenForLobbyNotifications() {
  try {
    await subscribeLobbyNotifications({
      onUpdated: handleLobbyUpdated,
      onReady: handleGameReady,
      onStarted: handleTableStarted,
      onOpeningRolled: applyOpeningRolled,
    });
  } catch {
    // List/create already surface engine errors.
  }
}

function startPolling() {
  stopPolling();
  pollId = window.setInterval(() => {
    refreshGames({ keepError: true });
  }, POLL_MS);
}

async function showEngineStatus() {
  const status = await pingEngine();
  setEngineStatus(status.ok ? "Engine: connected" : "Engine: unreachable");
}

export function initLobbyController() {
  if (bound) {
    return;
  }
  bindLobbyView({
    onCreate: handleCreate,
    onRefresh: refreshGames,
    onPracticeTable: handlePracticeTable,
    onBackToLobby: enterLobby,
    onReadyCancel: handleReadyCancel,
    onReadyStart: handleReadyStart,
  });
  bound = true;
}

export function enterLobby() {
  leaveGame();
  showLobby();
  showEngineStatus();
  listenForLobbyNotifications();
  refreshGames();
  startPolling();
}

export function leaveLobby() {
  stopPolling();
  hideSeatsFilledPopup();
  hideLobby();
  leaveGame();
}

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
  const gameId = game?.gameId ?? "";
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

function handleGameStarted(start) {
  hideSeatsFilledPopup();
  lastReadyGameId = "";
  stopPolling();
  hideLobby();
  enterGame(start);
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
      onStarted: handleGameStarted,
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

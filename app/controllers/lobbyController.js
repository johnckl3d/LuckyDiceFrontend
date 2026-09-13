import {
  createLobbyGame,
  listLobbyGames,
  pingEngine,
  subscribeLobbyNotifications,
} from "../services/apiService.js";
import {
  bindLobbyView,
  hideLobby,
  readCreateGameForm,
  renderLobbyGames,
  setCreateBusy,
  showLobby,
  showLobbyError,
  showSeatsFilledPopup,
} from "../views/lobbyView.js";
import { setEngineStatus } from "../views/gameView.js";
import { enterGame, leaveGame } from "./gameController.js";

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
    if (keepError) {
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

function handleGameReady(game) {
  const gameId = game?.gameId ?? "";
  if (gameId && gameId === lastReadyGameId) {
    return;
  }
  lastReadyGameId = gameId;
  showSeatsFilledPopup();
  refreshGames({ keepError: true });
}

async function listenForLobbyNotifications() {
  try {
    await subscribeLobbyNotifications({
      onUpdated: handleLobbyUpdated,
      onReady: handleGameReady,
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
  hideLobby();
  leaveGame();
}

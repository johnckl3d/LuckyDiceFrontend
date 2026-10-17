import {
  createLobbyGame,
  getWalletBalance,
  isSessionExpiredError,
  joinGame,
  topUpWallet,
  withdrawWallet,
  leaveLobbyGame,
  listLobbyGames,
  pingEngine,
  sendPlayerResponse,
  subscribeLobbyNotifications,
} from "../services/apiService.js";
import { localPlayerId } from "../models/gameModel.js";
import {
  bindLobbyView,
  hideLobby,
  hideSeatsFilledPopup,
  readCreateGameForm,
  renderLobbyGames,
  setJoinBusy,
  closeTopUpPage,
  hideTopUpPopup,
  hideTopUpWaiting,
  isTopUpPageOpen,
  readTopUpAmount,
  readWalletAction,
  renderWalletBalance,
  showTopUpPageStatus,
  setCreateBusy,
  setTopUpBusy,
  showTopUpError,
  showTopUpPopup,
  showTopUpWaiting,
  setReadyBusy,
  showLobby,
  showLobbyError,
  showSeatsFilledPopup,
  showReadyWaiting,
  showReadyNotice,
  readReadyBuyIn,
  whenTopUpHidden,
  whenTopUpWaitingHidden,
  whenTopUpWaitingShown,
} from "../views/lobbyView.js";
import { setEngineStatus, setWalletDisplay } from "../views/gameView.js";
import {
  enterGame,
  leaveGame,
  applyOpeningRolled,
  keepPendingJoin,
  resumePendingJoin,
} from "./gameController.js";
import {
  enterLeaderboard,
  initLeaderboardController,
  leaveLeaderboard,
} from "./leaderboardController.js";

const POLL_MS = 8000;
let pollId = null;
let bound = false;
let lastReadyGameId = "";
let listedGames = [];
let walletBalance = null;
let readyBuyIn = null;
let joinedFromBuyIn = "";
let createdTable = null;

const INSUFFICIENT_WALLET_CODE = 2;

function readBalance(payload) {
  const balance = payload?.balance ?? payload?.Balance;
  return balance == null ? null : balance;
}

function rememberBalance(balance) {
  walletBalance = balance == null || balance === "" ? null : balance;
  renderWalletBalance(walletBalance);
}

async function refreshBalance() {
  try {
    const payload = await getWalletBalance();
    rememberBalance(readBalance(payload));
  } catch (error) {
    if (isSessionExpiredError(error)) {
      return;
    }
    rememberBalance(null);
  }
}

async function handleTopUp() {
  const amount = readTopUpAmount();
  const withdraw = readWalletAction() === "withdraw";
  const fromPage = isTopUpPageOpen();
  if (!Number.isInteger(amount) || amount < 10 || amount > 1000) {
    showTopUpError("Enter an amount from RM 10 to RM 1,000.");
    return;
  }

  setTopUpBusy(true);
  showTopUpError("");
  if (fromPage) {
    showTopUpPageStatus("");
  }
  if (!withdraw && !fromPage) {
    keepPendingJoin();
    showTopUpWaiting();
    await whenTopUpHidden();
    await whenTopUpWaitingShown();
  }
  try {
    const payload = withdraw ? await withdrawWallet(amount) : await topUpWallet(amount);
    const balance = readBalance(payload);
    rememberBalance(balance);
    if (balance != null) {
      setWalletDisplay(balance);
    }
    const hidden = whenTopUpHidden();
    const waitingHidden = whenTopUpWaitingHidden();
    hideTopUpPopup();
    hideTopUpWaiting();
    await hidden;
    await waitingHidden;
    if (fromPage && !withdraw) {
      closeTopUpPage();
    }
    if (!withdraw && !fromPage) {
      await resumePendingJoin();
    }
  } catch (error) {
    hideTopUpWaiting();
    if (isSessionExpiredError(error)) {
      return;
    }
    const message =
      error.message === "Failed to fetch" ? "Could not reach the game engine." : error.message;
    if (!withdraw && !fromPage) {
      showTopUpPopup(message);
    } else {
      showTopUpError(message);
    }
  } finally {
    setTopUpBusy(false);
  }
}

async function refreshGames({ keepError = false } = {}) {
  try {
    const payload = await listLobbyGames();
    listedGames = payload.games ?? [];
    renderLobbyGames(listedGames);
    if (!keepError) {
      showLobbyError("");
    }
  } catch (error) {
    if (keepError || isSessionExpiredError(error)) {
      return;
    }
    listedGames = [];
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
  if (body.turnTime !== 30 && body.turnTime !== 300) {
    showLobbyError("Turn time must be 30 or 300 seconds.");
    return;
  }
  if (body.stake !== 10 && body.stake !== 30 && body.stake !== 50) {
    showLobbyError("Stake must be 10, 30, or 50.");
    return;
  }
  const balanceCap = readAmount(walletBalance);
  if (!Number.isInteger(body.stack) || body.stack < body.stake) {
    showLobbyError("Stack must be at least the stake.");
    return;
  }
  if (balanceCap != null && body.stack > balanceCap) {
    showLobbyError("Stack cannot be more than your balance.");
    return;
  }

  createdTable = {
    players: body.playerCount,
    turnTime: body.turnTime,
    stake: body.stake,
    stack: body.stack,
  };
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

async function handleJoin(gameId) {
  const game = listedGames.find(
    (item) => String(item?.gameId ?? item?.GameId ?? "") === String(gameId)
  );
  if (!game) {
    showLobbyError("That game is no longer in the lobby.");
    return;
  }
  const id = game.gameId ?? game.GameId;
  const stake = game.stake ?? game.Stake;
  setJoinBusy(id, true);
  showLobbyError("");
  try {
    await enterGame({ gameId: id, stake, bet: stake });
  } finally {
    setJoinBusy("", false);
  }
}

function stopPolling() {
  if (pollId !== null) {
    window.clearInterval(pollId);
    pollId = null;
  }
}

function handleOpenLeaderboard() {
  stopPolling();
  hideLobby();
  enterLeaderboard();
}

function handleLobbyUpdated() {
  refreshGames({ keepError: true });
}

const PLAYER_RESPONSE_START = 1;

function readAmount(value) {
  if (value == null || value === "") {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function buyInForReady(game) {
  const direct = readAmount(game?.bet ?? game?.Bet ?? game?.stake ?? game?.Stake);
  if (direct != null) {
    return direct;
  }
  const gameId = game?.gameId ?? game?.GameId ?? "";
  const listed = listedGames.find(
    (item) => String(item?.gameId ?? item?.GameId ?? "") === String(gameId)
  );
  return readAmount(listed?.bet ?? listed?.Bet ?? listed?.stake ?? listed?.Stake);
}

async function handleGameReady(game) {
  const gameId = game?.gameId ?? game?.GameId ?? "";
  if (gameId && gameId === lastReadyGameId) {
    return;
  }
  lastReadyGameId = gameId;
  readyBuyIn = null;
  joinedFromBuyIn = "";
  await refreshBalance();
  const readyMin = buyInForReady(game);
  showSeatsFilledPopup({ min: readyMin, balance: walletBalance });
  refreshGames({ keepError: true });
}

async function handleReadyStart() {
  const gameId = lastReadyGameId;
  if (!gameId) {
    hideSeatsFilledPopup();
    return;
  }

  readyBuyIn = readReadyBuyIn();
  setReadyBusy(true);
  showLobbyError("");
  showReadyNotice("");
  let joined = false;
  try {
    const result = await joinGame({
      gameId,
      playerId: localPlayerId(),
      bet: createdTable?.stake,
      stack: readyBuyIn,
    });
    const code = Number(result?.code ?? result?.Code);
    if (code === INSUFFICIENT_WALLET_CODE) {
      const message = Number.isFinite(readyBuyIn)
        ? `Not enough balance for the RM ${readyBuyIn} buy-in. Top up your wallet to join the game.`
        : "Not enough balance to buy in. Top up your wallet to join the game.";
      showReadyNotice(message);
      showLobbyError(message);
      setReadyBusy(false);
      return;
    }
    joined = true;
    joinedFromBuyIn = String(gameId);
    await sendPlayerResponse(gameId, PLAYER_RESPONSE_START);
    showReadyWaiting();
  } catch (error) {
    if (!joined) {
      joinedFromBuyIn = "";
    }
    if (!isSessionExpiredError(error)) {
      const message =
        error.message === "Failed to fetch" ? "Could not reach the game engine." : error.message;
      showReadyNotice(message);
      showLobbyError(message);
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

function readTableStarted(payload, gameId) {
  let data = payload;
  if (typeof data === "string") {
    const text = data.trim();
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    } else {
      data = null;
    }
  }
  if (Array.isArray(data)) {
    data = data[0];
  }
  if (data && typeof data === "object") {
    return { ...data, gameId };
  }
  return { gameId };
}

export function closeLobbyForGame() {
  stopPolling();
  hideSeatsFilledPopup();
  hideLobby();
  leaveLeaderboard();
}

async function handleTableStarted(payload) {
  const gameId = readGameId(payload) || lastReadyGameId;
  const started = readTableStarted(payload, gameId);
  const buyIn = readyBuyIn;
  readyBuyIn = null;
  joinedFromBuyIn = "";
  hideSeatsFilledPopup();
  lastReadyGameId = "";
  leaveLeaderboard();
  if (!gameId) {
    showLobby();
    showLobbyError("Table started, but no gameId was provided.");
    return;
  }
  if (buyIn != null && Number.isFinite(buyIn)) {
    started.bet = buyIn;
    started.stack = buyIn;
  }
  await enterGame(started, { skipJoin: true });
}

async function handleReadyCancel() {
  const gameId = lastReadyGameId;
  readyBuyIn = null;
  joinedFromBuyIn = "";
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
  initLeaderboardController();
  bindLobbyView({
    onCreate: handleCreate,
    onRefresh: refreshGames,
    onJoin: handleJoin,
    onLeaderboard: handleOpenLeaderboard,
    onBackToLobby: enterLobby,
    onReadyCancel: handleReadyCancel,
    onReadyStart: handleReadyStart,
    onTopUp: handleTopUp,
  });
  bound = true;
}

export function enterLobby() {
  leaveGame();
  leaveLeaderboard();
  showLobby();
  showEngineStatus();
  listenForLobbyNotifications();
  refreshBalance();
  refreshGames();
  startPolling();
}

export function leaveLobby() {
  stopPolling();
  hideSeatsFilledPopup();
  hideTopUpPopup();
  hideTopUpWaiting();
  hideLobby();
  leaveLeaderboard();
  leaveGame();
}

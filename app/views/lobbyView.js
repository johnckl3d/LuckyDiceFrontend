import { normalizeLobbyGame, playerNames, seatsFilled, statusLabel } from "../models/lobbyModel.js";

const els = {
  screen: document.getElementById("lobby-screen"),
  walletBalance: document.getElementById("wallet-balance"),
  topUpBtn: document.getElementById("topup-btn"),
  topUpModal: document.getElementById("wallet-topup-modal"),
  topUpTitle: document.getElementById("wallet-topup-title"),
  topUpForm: document.getElementById("wallet-topup-form"),
  walletAction: document.getElementById("wallet-action"),
  topUpAmount: document.getElementById("topup-amount"),
  topUpError: document.getElementById("topup-error"),
  topUpSubmitBtn: document.getElementById("topup-submit-btn"),
  topUpWaitingModal: document.getElementById("topup-waiting-modal"),
  form: document.getElementById("create-game-form"),
  playerCount: document.getElementById("create-player-count"),
  turnTime: document.getElementById("create-turn-time"),
  stake: document.getElementById("create-stake"),
  error: document.getElementById("lobby-error"),
  createBtn: document.getElementById("create-game-btn"),
  refreshBtn: document.getElementById("refresh-lobby-btn"),
  practiceBtn: document.getElementById("practice-table-btn"),
  leaderboardBtn: document.getElementById("leaderboard-btn"),
  gamesBody: document.getElementById("lobby-games-body"),
  lobbyNav: document.getElementById("lobby-nav-btn"),
  readyModal: document.getElementById("lobby-ready-modal"),
  readyTitle: document.getElementById("lobby-ready-title"),
  readyBody: document.getElementById("lobby-ready-body"),
  readyCancelBtn: document.getElementById("lobby-ready-cancel-btn"),
  readyStartBtn: document.getElementById("lobby-ready-start-btn"),
  readyCloseBtn: document.getElementById("lobby-ready-close-btn"),
};

const READY_COPY = {
  title: "Game ready",
  body: "All seats are filled. Buy in to start, or cancel to leave your seat.",
  waitingTitle: "Waiting",
  waitingBody: "Waiting other players...",
};

function readyBody(buyIn) {
  if (buyIn == null || buyIn === "") {
    return READY_COPY.body;
  }
  const amount = Number(buyIn);
  const label = Number.isFinite(amount) ? String(amount) : String(buyIn);
  return `All seats are filled. The buy-in is RM ${label}. Buy in to start, or cancel to leave your seat.`;
}

let readyModal = null;
let topUpModal = null;
let topUpWaitingModal = null;

function walletTopUpModal() {
  if (!topUpModal && els.topUpModal) {
    topUpModal = new bootstrap.Modal(els.topUpModal);
  }
  return topUpModal;
}

function walletTopUpWaitingModal() {
  if (!topUpWaitingModal && els.topUpWaitingModal) {
    topUpWaitingModal = new bootstrap.Modal(els.topUpWaitingModal, {
      backdrop: "static",
      keyboard: false,
    });
  }
  return topUpWaitingModal;
}

function lobbyReadyModal() {
  if (!readyModal && els.readyModal) {
    readyModal = new bootstrap.Modal(els.readyModal);
  }
  return readyModal;
}

export function showLobby() {
  els.screen.hidden = false;
  els.lobbyNav.hidden = true;
}

export function hideLobby() {
  els.screen.hidden = true;
  els.lobbyNav.hidden = false;
}

export function renderWalletBalance(balance) {
  els.walletBalance.textContent =
    balance == null || balance === "" ? "—" : String(balance);
}

function applyWalletAction() {
  const withdraw = readWalletAction() === "withdraw";
  els.topUpTitle.textContent = withdraw ? "Withdraw" : "Top up wallet";
  els.topUpSubmitBtn.textContent = withdraw ? "Withdraw" : "Top up";
}

export function readWalletAction() {
  return els.walletAction.value === "withdraw" ? "withdraw" : "topup";
}

export function showTopUpPopup(message = "") {
  if (els.topUpModal && els.topUpModal.parentElement !== document.body) {
    document.body.appendChild(els.topUpModal);
  }
  showTopUpError(message);
  setTopUpBusy(false);
  els.walletAction.value = "topup";
  applyWalletAction();
  els.topUpModal.addEventListener(
    "shown.bs.modal",
    () => {
      els.topUpAmount.focus();
    },
    { once: true }
  );
  walletTopUpModal()?.show();
}

export function hideTopUpPopup() {
  walletTopUpModal()?.hide();
  setTopUpBusy(false);
  showTopUpError("");
}

export function showTopUpWaiting() {
  if (els.topUpWaitingModal && els.topUpWaitingModal.parentElement !== document.body) {
    document.body.appendChild(els.topUpWaitingModal);
  }
  const open = () => walletTopUpWaitingModal()?.show();
  if (els.topUpModal?.classList.contains("show")) {
    els.topUpModal.addEventListener("hidden.bs.modal", open, { once: true });
    walletTopUpModal()?.hide();
    return;
  }
  open();
}

export function hideTopUpWaiting() {
  walletTopUpWaitingModal()?.hide();
}

export function whenTopUpWaitingHidden() {
  const modal = els.topUpWaitingModal;
  if (!modal || !modal.classList.contains("show")) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    modal.addEventListener("hidden.bs.modal", () => resolve(), { once: true });
  });
}

export function whenTopUpWaitingShown() {
  const modal = els.topUpWaitingModal;
  if (!modal || modal.classList.contains("show")) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    modal.addEventListener("shown.bs.modal", () => resolve(), { once: true });
  });
}

export function whenTopUpHidden() {
  const modal = els.topUpModal;
  if (!modal || !modal.classList.contains("show")) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    modal.addEventListener("hidden.bs.modal", () => resolve(), { once: true });
  });
}

export function readTopUpAmount() {
  return Number(els.topUpAmount.value);
}

export function showTopUpError(message) {
  els.topUpError.textContent = message;
  els.topUpError.classList.toggle("d-none", !message);
}

export function setTopUpBusy(busy) {
  els.topUpSubmitBtn.disabled = busy;
  els.topUpAmount.disabled = busy;
  els.walletAction.disabled = busy;
}

export function showLobbyError(message) {
  els.error.textContent = message;
  els.error.classList.toggle("d-none", !message);
}

export function setCreateBusy(busy) {
  els.createBtn.disabled = busy;
}

export function readCreateGameForm() {
  return {
    playerCount: Number(els.playerCount.value),
    turnTime: Number(els.turnTime.value),
    stake: Number(els.stake.value),
  };
}

export function renderLobbyGames(games) {
  const rows = games.map(normalizeLobbyGame);
  if (!rows.length) {
    els.gamesBody.innerHTML =
      '<tr><td colspan="7" class="text-muted">No waiting or in-progress games.</td></tr>';
    return;
  }

  els.gamesBody.innerHTML = rows
    .map((game) => {
      const label = game.displayId || game.gameId;
      const started = game.gameStartDateTime
        ? new Date(game.gameStartDateTime).toLocaleString()
        : "—";
      return `<tr>
        <td>
          <div class="fw-semibold">${label}</div>
          <div class="small text-muted">${started}</div>
        </td>
        <td>${statusLabel(game.gameStatus)}</td>
        <td>${seatsFilled(game)}</td>
        <td>${game.waitingDuration}s</td>
        <td>${game.turnTime}s</td>
        <td>${game.stake}</td>
        <td>${playerNames(game)}</td>
      </tr>`;
    })
    .join("");
}

function resetReadyPopup() {
  if (els.readyTitle) {
    els.readyTitle.textContent = READY_COPY.title;
  }
  if (els.readyBody) {
    els.readyBody.textContent = READY_COPY.body;
  }
  if (els.readyStartBtn) {
    els.readyStartBtn.hidden = false;
    els.readyStartBtn.textContent = "Buy in";
  }
  setReadyBusy(false);
}

export function showSeatsFilledPopup(buyIn) {
  resetReadyPopup();
  if (els.readyBody) {
    els.readyBody.textContent = readyBody(buyIn);
  }
  lobbyReadyModal()?.show();
}

export function hideSeatsFilledPopup() {
  lobbyReadyModal()?.hide();
  resetReadyPopup();
}

export function setReadyBusy(busy) {
  if (els.readyCancelBtn) {
    els.readyCancelBtn.disabled = busy;
  }
  if (els.readyStartBtn) {
    els.readyStartBtn.disabled = busy;
  }
}

export function showReadyWaiting() {
  if (els.readyTitle) {
    els.readyTitle.textContent = READY_COPY.waitingTitle;
  }
  if (els.readyBody) {
    els.readyBody.textContent = READY_COPY.waitingBody;
  }
  if (els.readyStartBtn) {
    els.readyStartBtn.hidden = true;
    els.readyStartBtn.disabled = true;
  }
  if (els.readyCancelBtn) {
    els.readyCancelBtn.disabled = false;
  }
}

export function bindLobbyView({
  onCreate,
  onRefresh,
  onPracticeTable,
  onLeaderboard,
  onBackToLobby,
  onReadyCancel,
  onReadyStart,
  onTopUp,
}) {
  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    onCreate();
  });
  els.topUpBtn.addEventListener("click", () => showTopUpPopup());
  els.walletAction.addEventListener("change", () => {
    showTopUpError("");
    applyWalletAction();
  });
  els.topUpForm.addEventListener("submit", (event) => {
    event.preventDefault();
    onTopUp();
  });
  els.refreshBtn.addEventListener("click", () => onRefresh());
  els.practiceBtn.addEventListener("click", () => onPracticeTable());
  els.leaderboardBtn.addEventListener("click", () => onLeaderboard());
  els.lobbyNav.addEventListener("click", () => onBackToLobby());
  els.readyCancelBtn?.addEventListener("click", () => onReadyCancel?.());
  els.readyCloseBtn?.addEventListener("click", () => onReadyCancel?.());
  els.readyStartBtn?.addEventListener("click", () => onReadyStart?.());
}

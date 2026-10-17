import { currency } from "../config.js";
import { getSession } from "../models/loginModel.js";
import { normalizeLobbyGame, seatsFilled } from "../models/lobbyModel.js";

const els = {
  screen: document.getElementById("lobby-screen"),
  walletBalance: document.getElementById("wallet-balance"),
  topUpBtn: document.getElementById("topup-btn"),
  topUpScreen: document.getElementById("topup-screen"),
  topUpBackBtn: document.getElementById("topup-back-btn"),
  topUpAmountDisplay: document.getElementById("topup-amount-display"),
  topUpMinus: document.getElementById("topup-minus"),
  topUpPlus: document.getElementById("topup-plus"),
  topUpChips: [...document.querySelectorAll("#topup-screen [data-amount]")],
  topUpSwipe: document.getElementById("topup-swipe"),
  topUpSwipeKnob: document.getElementById("topup-swipe-knob"),
  topUpModal: document.getElementById("wallet-topup-modal"),
  topUpTitle: document.getElementById("wallet-topup-title"),
  topUpForm: document.getElementById("wallet-topup-form"),
  walletAction: document.getElementById("wallet-action"),
  topUpAmount: document.getElementById("topup-amount"),
  topUpError: document.getElementById("topup-error"),
  topUpSubmitBtn: document.getElementById("topup-submit-btn"),
  topUpPageStatus: document.getElementById("topup-page-status"),
  topUpWaitingModal: document.getElementById("topup-waiting-modal"),
  form: document.getElementById("create-game-form"),
  playerCount: document.getElementById("create-player-count"),
  turnTime: document.getElementById("create-turn-time"),
  stake: document.getElementById("create-stake"),
  error: document.getElementById("lobby-error"),
  createBtn: document.getElementById("create-game-btn"),
  refreshBtn: document.getElementById("refresh-lobby-btn"),
  leaderboardBtn: document.getElementById("leaderboard-btn"),
  gamesBody: document.getElementById("lobby-games-body"),
  gear: document.getElementById("lobby-gear"),
  gearBtn: document.getElementById("lobby-gear-btn"),
  gearMenu: document.getElementById("lobby-gear-menu"),
  lobbyLogout: document.getElementById("lobby-logout-btn"),
  lobbyNav: document.getElementById("lobby-nav-btn"),
  readyModal: document.getElementById("lobby-ready-modal"),
  readyTitle: document.getElementById("lobby-ready-title"),
  readyBalance: document.getElementById("lobby-ready-balance"),
  readyControls: document.getElementById("lobby-ready-controls"),
  readyAmount: document.getElementById("lobby-ready-amount"),
  readyMin: document.getElementById("lobby-ready-min"),
  readyMax: document.getElementById("lobby-ready-max"),
  readySlider: document.getElementById("lobby-ready-slider"),
  readyBody: document.getElementById("lobby-ready-body"),
  readyCancelBtn: document.getElementById("lobby-ready-cancel-btn"),
  readyStartBtn: document.getElementById("lobby-ready-start-btn"),
  readyCloseBtn: document.getElementById("lobby-ready-close-btn"),
};

const READY_COPY = {
  title: "Join this table",
  waitingTitle: "Waiting",
  waitingBody: "Waiting other players...",
};

function readReadyAmount(value) {
  if (value == null || value === "") {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function moneyLabel(amount) {
  const value = readReadyAmount(amount);
  return value == null ? "—" : `${currency} ${value}`;
}

let knownWalletBalance = null;
let readyBalanceLabel = "Your balance: —";

function renderReadyAmount(amount) {
  if (els.readyAmount) {
    els.readyAmount.textContent = moneyLabel(amount);
  }
  const slider = els.readySlider;
  if (!slider) {
    return;
  }
  const min = Number(slider.min);
  const max = Number(slider.max);
  const current = Number(amount);
  const ratio =
    max > min && Number.isFinite(current) ? (current - min) / (max - min) : max === min ? 1 : 0;
  slider.style.setProperty("--ready-fill", `${Math.min(1, Math.max(0, ratio)) * 100}%`);
}

let readyModal = null;
let joiningGameId = "";
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
  if (els.readyModal && els.readyModal.parentElement !== document.body) {
    document.body.appendChild(els.readyModal);
  }
  if (!readyModal && els.readyModal) {
    readyModal = new bootstrap.Modal(els.readyModal);
  }
  return readyModal;
}

function setAppNavHidden(hidden) {
  document.getElementById("app-nav")?.classList.toggle("d-none", hidden);
}

function setGearOpen(open) {
  if (!els.gearMenu || !els.gearBtn) {
    return;
  }
  els.gearMenu.hidden = !open;
  els.gearBtn.setAttribute("aria-expanded", open ? "true" : "false");
}

export function showLobby() {
  els.screen.hidden = false;
  els.lobbyNav.hidden = true;
  setAppNavHidden(true);
}

export function hideLobby() {
  hideTopUpPage();
  els.screen.hidden = true;
  els.lobbyNav.hidden = false;
  setAppNavHidden(false);
  setGearOpen(false);
}

export function renderWalletBalance(balance) {
  knownWalletBalance = balance == null || balance === "" ? null : balance;
  els.walletBalance.textContent =
    knownWalletBalance == null ? "—" : String(knownWalletBalance);
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
  if (isTopUpPageOpen()) {
    showTopUpPageStatus(message, true);
  }
}

export function showTopUpPageStatus(message, isError = false) {
  const status = els.topUpPageStatus;
  if (!status) {
    return;
  }
  status.textContent = message || "";
  status.hidden = !message;
  status.classList.toggle("is-error", Boolean(isError && message));
}

export function isTopUpPageOpen() {
  return Boolean(els.topUpScreen && !els.topUpScreen.hidden);
}

export function setTopUpBusy(busy) {
  els.topUpSubmitBtn.disabled = busy;
  els.topUpAmount.disabled = busy;
  els.walletAction.disabled = busy;
  if (els.topUpSwipeKnob) {
    els.topUpSwipeKnob.disabled = busy;
  }
  els.topUpChips.forEach((chip) => {
    chip.disabled = busy;
  });
  if (busy) {
    if (els.topUpMinus) {
      els.topUpMinus.disabled = true;
    }
    if (els.topUpPlus) {
      els.topUpPlus.disabled = true;
    }
    return;
  }
  renderTopUpAmount(pageAmount());
}

export function showLobbyError(message) {
  els.error.textContent = message;
  els.error.classList.toggle("d-none", !message);
}

export function setCreateBusy(busy) {
  els.createBtn.disabled = busy;
}

export function readCreateGameForm() {
  const stake = Number(els.stake.value);
  return {
    playerCount: Number(els.playerCount.value),
    turnTime: Number(els.turnTime.value),
    stake,
    stack: stake,
  };
}

function canJoin(game) {
  if (!game.gameId) {
    return false;
  }
  const selfId = getSession()?.userId;
  if (!selfId) {
    return true;
  }
  return !(game.players ?? []).some(
    (player) => String(player.playerId ?? player.PlayerId ?? "") === String(selfId)
  );
}

export function setJoinBusy(gameId, busy) {
  joiningGameId = busy ? String(gameId) : "";
  els.gamesBody?.querySelectorAll("[data-join-game]").forEach((button) => {
    button.disabled = busy;
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const WATCH_ICON = `<svg class="lobby-eye" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><path d="M1.5 7s2.2-3.2 5.5-3.2S12.5 7 12.5 7s-2.2 3.2-5.5 3.2S1.5 7 1.5 7z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="7" cy="7" r="1.3" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;

export function renderLobbyGames(games) {
  const rows = games.map(normalizeLobbyGame);
  if (!rows.length) {
    els.gamesBody.innerHTML =
      '<p class="lobby-empty">No waiting or in-progress games.</p>';
    return;
  }

  els.gamesBody.innerHTML = rows
    .map((game) => {
      const label = escapeHtml(game.displayId || game.gameId);
      const waiting = game.gameStatus === 4;
      const joinable = canJoin(game);
      const seated = game.players?.length ?? 0;
      const gameId = escapeHtml(game.gameId);
      const action = joinable
        ? `<button type="button" class="lobby-pill lobby-pill-play" data-join-game="${gameId}"${joiningGameId ? " disabled" : ""}>Join</button>`
        : `<span class="lobby-pill ${waiting ? "lobby-pill-play" : "lobby-pill-watch"}">${waiting ? "Full" : `${WATCH_ICON}Watch`}</span>`;
      return `<article class="lobby-card">
        <div class="lobby-card-top">
          <span class="lobby-cards" aria-hidden="true"></span>
          <div class="lobby-card-copy">
            <div class="lobby-kicker">TABLE</div>
            <div class="lobby-name">${label}</div>
          </div>
          ${action}
        </div>
        <div class="lobby-meta">
          <div><span class="lobby-kicker">SEATS</span><strong>${escapeHtml(seatsFilled(game))}</strong></div>
          <div><span class="lobby-kicker">STAKE</span><strong>${escapeHtml(game.stake)}</strong></div>
          <div><span class="lobby-kicker">PLAYERS</span><strong>${escapeHtml(seated)}</strong></div>
        </div>
      </article>`;
    })
    .join("");
}

function setReadyMode(waiting) {
  if (els.readyTitle) {
    els.readyTitle.textContent = waiting ? READY_COPY.waitingTitle : READY_COPY.title;
  }
  if (els.readyControls) {
    els.readyControls.hidden = waiting;
  }
  if (els.readyBody) {
    els.readyBody.hidden = !waiting;
    if (waiting) {
      els.readyBody.textContent = READY_COPY.waitingBody;
    }
  }
  if (els.readyStartBtn) {
    els.readyStartBtn.hidden = waiting;
    els.readyStartBtn.textContent = "Buy in";
  }
  if (els.readyCancelBtn) {
    els.readyCancelBtn.disabled = false;
  }
  if (els.readyCloseBtn) {
    els.readyCloseBtn.disabled = false;
  }
  if (els.readySlider) {
    els.readySlider.disabled = waiting;
  }
}

function applyReadyRange(min, balance) {
  const floor = readReadyAmount(min) ?? 0;
  const wallet = readReadyAmount(balance);
  const ceiling = wallet == null || wallet < floor ? floor : wallet;
  if (els.readySlider) {
    els.readySlider.min = String(floor);
    els.readySlider.max = String(ceiling);
    els.readySlider.step = "1";
    els.readySlider.value = String(floor);
  }
  if (els.readyMin) {
    els.readyMin.textContent = moneyLabel(floor);
  }
  if (els.readyMax) {
    els.readyMax.textContent = moneyLabel(ceiling);
  }
  readyBalanceLabel =
    wallet == null ? "Your balance: —" : `Your balance: ${moneyLabel(wallet)}`;
  if (els.readyBalance) {
    els.readyBalance.textContent = readyBalanceLabel;
    els.readyBalance.classList.remove("is-alert");
  }
  renderReadyAmount(floor);
}

function resetReadyPopup() {
  setReadyMode(false);
  setReadyBusy(false);
}

export function showSeatsFilledPopup(options) {
  const source = options != null && typeof options === "object" ? options : { min: options };
  applyReadyRange(source.min, source.balance);
  resetReadyPopup();
  lobbyReadyModal()?.show();
}

export function readReadyBuyIn() {
  return readReadyAmount(els.readySlider?.value) ?? readReadyAmount(els.readySlider?.min) ?? 0;
}

export function showReadyNotice(message) {
  if (!els.readyBalance) {
    return;
  }
  els.readyBalance.textContent = message || readyBalanceLabel;
  els.readyBalance.classList.toggle("is-alert", Boolean(message));
}

export function hideSeatsFilledPopup() {
  lobbyReadyModal()?.hide();
  resetReadyPopup();
}

export function setReadyBusy(busy) {
  if (els.readyCancelBtn) {
    els.readyCancelBtn.disabled = busy;
  }
  if (els.readyCloseBtn) {
    els.readyCloseBtn.disabled = busy;
  }
  if (els.readyStartBtn && !els.readyStartBtn.hidden) {
    els.readyStartBtn.disabled = busy;
  }
  if (els.readySlider && !els.readyControls?.hidden) {
    els.readySlider.disabled = busy;
  }
}

export function showReadyWaiting() {
  setReadyMode(true);
}

const TOPUP_MIN = 10;
const TOPUP_MAX = 1000;
const TOPUP_STEP = 50;

let swipeOffset = 0;
let swipeDragging = false;

function pageAmount() {
  const amount = Number(els.topUpAmount.value);
  return Number.isInteger(amount) ? amount : TOPUP_STEP;
}

function applyTopUpCurrency() {
  const root = els.topUpScreen;
  if (!root) {
    return;
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node = walker.nextNode();
  while (node) {
    if (node.nodeValue.includes("[CURRENCY]")) {
      nodes.push(node);
    }
    node = walker.nextNode();
  }
  nodes.forEach((textNode) => {
    textNode.nodeValue = textNode.nodeValue.replaceAll("[CURRENCY]", currency);
  });
}

applyTopUpCurrency();

function renderTopUpAmount(amount) {
  if (els.topUpAmountDisplay) {
    els.topUpAmountDisplay.textContent = `${currency} ${amount}`;
  }
  els.topUpChips.forEach((chip) => {
    const selected = Number(chip.dataset.amount) === amount;
    chip.classList.toggle("is-selected", selected);
    chip.setAttribute("aria-pressed", selected ? "true" : "false");
  });
  if (els.topUpMinus) {
    els.topUpMinus.disabled = amount <= TOPUP_MIN;
  }
  if (els.topUpPlus) {
    els.topUpPlus.disabled = amount >= TOPUP_MAX;
  }
}

function writeTopUpAmount(amount) {
  const next = Math.min(TOPUP_MAX, Math.max(TOPUP_MIN, amount));
  els.topUpAmount.value = String(next);
  renderTopUpAmount(next);
}

function setSwipeOffset(offset, animate) {
  swipeOffset = offset;
  if (!els.topUpSwipeKnob) {
    return;
  }
  els.topUpSwipeKnob.style.transition = animate ? "transform 180ms ease" : "none";
  els.topUpSwipeKnob.style.transform = `translateX(${offset}px)`;
}

function resetSwipe() {
  swipeDragging = false;
  setSwipeOffset(0, true);
}

function swipeMax() {
  if (!els.topUpSwipe || !els.topUpSwipeKnob) {
    return 0;
  }
  return Math.max(0, els.topUpSwipe.clientWidth - els.topUpSwipeKnob.clientWidth - 16);
}

function showTopUpPage() {
  els.walletAction.value = "topup";
  applyWalletAction();
  renderTopUpAmount(pageAmount());
  showTopUpPageStatus("");
  resetSwipe();
  els.topUpScreen.hidden = false;
  els.screen.hidden = true;
}

function hideTopUpPage() {
  if (!els.topUpScreen) {
    return;
  }
  els.topUpScreen.hidden = true;
  resetSwipe();
}

function backFromTopUp() {
  hideTopUpPage();
  els.screen.hidden = false;
}

export function closeTopUpPage() {
  backFromTopUp();
}

function bindTopUpSwipe(onTopUp) {
  const knob = els.topUpSwipeKnob;
  if (!knob) {
    return;
  }
  let startX = 0;
  let origin = 0;

  knob.addEventListener("pointerdown", (event) => {
    if (knob.disabled || els.topUpSubmitBtn.disabled) {
      return;
    }
    swipeDragging = true;
    startX = event.clientX;
    origin = swipeOffset;
    try {
      knob.setPointerCapture(event.pointerId);
    } catch {
      // Capture is optional; the knob still follows the pointer.
    }
    setSwipeOffset(swipeOffset, false);
  });
  knob.addEventListener("pointermove", (event) => {
    if (!swipeDragging) {
      return;
    }
    const next = Math.min(swipeMax(), Math.max(0, origin + event.clientX - startX));
    setSwipeOffset(next, false);
  });
  const finishSwipe = () => {
    if (!swipeDragging) {
      return;
    }
    const completed = swipeOffset >= swipeMax() * 0.85 && swipeMax() > 0;
    resetSwipe();
    if (completed) {
      onTopUp?.();
    }
  };
  knob.addEventListener("pointerup", finishSwipe);
  knob.addEventListener("pointercancel", finishSwipe);
}

export function bindLobbyView({
  onCreate,
  onRefresh,
  onJoin,
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
  els.gearBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    setGearOpen(els.gearMenu.hidden);
  });
  document.addEventListener("click", (event) => {
    if (!els.gear?.contains(event.target)) {
      setGearOpen(false);
    }
  });
  els.lobbyLogout?.addEventListener("click", () => {
    document.getElementById("logout-btn")?.click();
  });
  els.topUpBtn.addEventListener("click", () => showTopUpPage());
  els.topUpBackBtn?.addEventListener("click", () => backFromTopUp());
  els.topUpMinus?.addEventListener("click", () => writeTopUpAmount(pageAmount() - TOPUP_STEP));
  els.topUpPlus?.addEventListener("click", () => writeTopUpAmount(pageAmount() + TOPUP_STEP));
  els.topUpChips.forEach((chip) => {
    chip.addEventListener("click", () => writeTopUpAmount(Number(chip.dataset.amount)));
  });
  bindTopUpSwipe(onTopUp);
  els.walletAction.addEventListener("change", () => {
    showTopUpError("");
    applyWalletAction();
  });
  els.topUpForm.addEventListener("submit", (event) => {
    event.preventDefault();
    onTopUp();
  });
  els.refreshBtn.addEventListener("click", () => {
    setGearOpen(false);
    onRefresh();
  });
  els.gamesBody?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-join-game]");
    if (!button || button.disabled) {
      return;
    }
    onJoin?.(button.dataset.joinGame);
  });
  els.leaderboardBtn.addEventListener("click", () => onLeaderboard());
  els.lobbyNav.addEventListener("click", () => onBackToLobby());
  els.readyCancelBtn?.addEventListener("click", () => onReadyCancel?.());
  els.readyCloseBtn?.addEventListener("click", () => onReadyCancel?.());
  els.readyStartBtn?.addEventListener("click", () => onReadyStart?.());
  els.readySlider?.addEventListener("input", () => {
    renderReadyAmount(els.readySlider.value);
  });
}

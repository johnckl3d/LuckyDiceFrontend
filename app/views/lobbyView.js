import { normalizeLobbyGame, playerNames, seatsFilled, statusLabel } from "../models/lobbyModel.js";

const els = {
  screen: document.getElementById("lobby-screen"),
  form: document.getElementById("create-game-form"),
  playerCount: document.getElementById("create-player-count"),
  turnTime: document.getElementById("create-turn-time"),
  stake: document.getElementById("create-stake"),
  error: document.getElementById("lobby-error"),
  createBtn: document.getElementById("create-game-btn"),
  refreshBtn: document.getElementById("refresh-lobby-btn"),
  practiceBtn: document.getElementById("practice-table-btn"),
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
  body: "All seats are filled. Start the game, or cancel to leave your seat.",
  waitingTitle: "Waiting",
  waitingBody: "Waiting other players...",
};

let readyModal = null;

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
  }
  setReadyBusy(false);
}

export function showSeatsFilledPopup() {
  resetReadyPopup();
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
  onBackToLobby,
  onReadyCancel,
  onReadyStart,
}) {
  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    onCreate();
  });
  els.refreshBtn.addEventListener("click", () => onRefresh());
  els.practiceBtn.addEventListener("click", () => onPracticeTable());
  els.lobbyNav.addEventListener("click", () => onBackToLobby());
  els.readyCancelBtn?.addEventListener("click", () => onReadyCancel?.());
  els.readyCloseBtn?.addEventListener("click", () => onReadyCancel?.());
  els.readyStartBtn?.addEventListener("click", () => onReadyStart?.());
}

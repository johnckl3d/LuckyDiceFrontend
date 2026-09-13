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

export function showSeatsFilledPopup() {
  lobbyReadyModal()?.show();
}

export function bindLobbyView({ onCreate, onRefresh, onPracticeTable, onBackToLobby }) {
  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    onCreate();
  });
  els.refreshBtn.addEventListener("click", () => onRefresh());
  els.practiceBtn.addEventListener("click", () => onPracticeTable());
  els.lobbyNav.addEventListener("click", () => onBackToLobby());
}

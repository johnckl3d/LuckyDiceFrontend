import { LEADERBOARD_MAX_PAGES, normalizeLeaderboard } from "../models/leaderboardModel.js";
import { getLeaderboard, isSessionExpiredError } from "../services/apiService.js";
import {
  bindLeaderboardView,
  clearLeaderboardResults,
  hideLeaderboard,
  renderLeaderboard,
  setLeaderboardLoading,
  showLeaderboard,
  showLeaderboardError,
} from "../views/leaderboardView.js";

let bound = false;
let requestSeq = 0;

function engineMessage(error) {
  return error.message === "Failed to fetch" ? "Could not reach the game engine." : error.message;
}

async function loadPage(page) {
  const nextPage = Math.min(LEADERBOARD_MAX_PAGES, Math.max(1, Number(page) || 1));
  const seq = ++requestSeq;
  setLeaderboardLoading(true);
  showLeaderboardError("");
  try {
    const payload = await getLeaderboard(nextPage);
    if (seq !== requestSeq) {
      return;
    }
    renderLeaderboard(normalizeLeaderboard(payload));
  } catch (error) {
    if (seq !== requestSeq) {
      return;
    }
    if (isSessionExpiredError(error)) {
      clearLeaderboardResults("Your session has expired. Please login again.");
      return;
    }
    showLeaderboardError(engineMessage(error));
    clearLeaderboardResults("Could not load the leaderboard.");
  } finally {
    if (seq === requestSeq) {
      setLeaderboardLoading(false);
    }
  }
}

export function initLeaderboardController() {
  if (bound) {
    return;
  }
  bindLeaderboardView({ onPage: loadPage });
  bound = true;
}

export function enterLeaderboard() {
  showLeaderboard();
  loadPage(1);
}

export function leaveLeaderboard() {
  requestSeq += 1;
  hideLeaderboard();
  showLeaderboardError("");
}

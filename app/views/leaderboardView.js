const els = {
  screen: document.getElementById("leaderboard-screen"),
  summary: document.getElementById("leaderboard-summary"),
  error: document.getElementById("leaderboard-error"),
  body: document.getElementById("leaderboard-body"),
  pages: document.getElementById("leaderboard-pages"),
};

export function showLeaderboard() {
  els.screen.hidden = false;
}

export function hideLeaderboard() {
  els.screen.hidden = true;
}

export function showLeaderboardError(message) {
  els.error.textContent = message;
  els.error.classList.toggle("d-none", !message);
}

export function setLeaderboardLoading(loading) {
  els.pages.querySelectorAll("button").forEach((button) => {
    const pageDisabled = button.closest(".page-item")?.classList.contains("disabled");
    button.disabled = loading || Boolean(pageDisabled);
  });
  if (loading) {
    els.summary.textContent = "";
    els.body.innerHTML = '<p class="lb-empty">Loading leaderboard…</p>';
  }
}

export function clearLeaderboardResults(message) {
  els.summary.textContent = "";
  els.pages.innerHTML = "";
  els.body.innerHTML = `<p class="lb-empty">${escapeHtml(message)}</p>`;
}

export function renderLeaderboard({ page, totalCount, players, pageCount }) {
  const countLabel = totalCount === 1 ? "1 player" : `${totalCount} players`;
  els.summary.textContent = pageCount
    ? `${countLabel} · page ${page} of ${pageCount}`
    : countLabel;

  if (!players.length) {
    els.body.innerHTML = '<p class="lb-empty">No ranked players yet.</p>';
  } else {
    const you = document.getElementById("signed-in-user")?.textContent?.trim() ?? "";
    els.body.innerHTML = players.map((player) => rowMarkup(player, player.userId === you)).join("");
  }

  renderPages(page, pageCount);
}

const STAR_PATH = "M12 1.4 14.9 8.1l7.1.3-5.6 4.5 1.9 6.9L12 16.1 5.7 19.8 7.6 12.9 2 8.4l7.1-.3z";

function rowMarkup(player, isYou) {
  const hue = avatarHue(player.userId);
  const name = isYou ? "You" : escapeHtml(player.userId);
  return `<article class="lb-row${isYou ? " lb-row-you" : ""}">
    ${rankBadge(player.rank)}
    <div class="lb-avatar" style="--lb-hue:${hue}" aria-hidden="true">${initial(player.userId)}</div>
    <div class="lb-name" title="${escapeHtml(player.userId)}">${name}</div>
    <div class="lb-score"><span>${formatScore(player.totalWins)}</span><span class="lb-coin" aria-hidden="true"></span></div>
  </article>`;
}

function rankBadge(rank) {
  if (rank >= 1 && rank <= 3) {
    const tone = rank === 1 ? "gold" : rank === 2 ? "silver" : "bronze";
    return `<span class="lb-medal lb-medal-${tone}"><svg viewBox="0 0 24 22" aria-hidden="true"><path d="${STAR_PATH}"></path></svg><span>${rank}</span></span>`;
  }
  return `<span class="lb-place">${rank}</span>`;
}

function avatarHue(userId) {
  const hues = [268, 210, 330, 152, 28, 190];
  const code = String(userId).charCodeAt(0) || 0;
  return hues[code % hues.length];
}

function initial(userId) {
  const char = String(userId).trim().charAt(0).toUpperCase();
  return escapeHtml(char || "?");
}

function formatScore(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function renderPages(page, pageCount) {
  if (pageCount <= 1) {
    els.pages.innerHTML = "";
    return;
  }

  const items = [
    pageButton(page - 1, "Previous", { disabled: page <= 1 }),
    ...Array.from({ length: pageCount }, (_, index) => {
      const number = index + 1;
      return pageButton(number, String(number), { active: number === page });
    }),
    pageButton(page + 1, "Next", { disabled: page >= pageCount }),
  ];
  els.pages.innerHTML = items.join("");
}

function pageButton(page, label, { active = false, disabled = false } = {}) {
  const classes = ["page-item"];
  if (active) {
    classes.push("active");
  }
  if (disabled) {
    classes.push("disabled");
  }
  const current = active ? ' aria-current="page"' : "";
  return `<li class="${classes.join(" ")}">
    <button type="button" class="page-link" data-page="${page}"${disabled ? " disabled" : ""}${current}>${label}</button>
  </li>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function bindLeaderboardView({ onPage }) {
  els.pages.addEventListener("click", (event) => {
    const button = event.target.closest("[data-page]");
    if (!button || button.disabled) {
      return;
    }
    onPage(Number(button.dataset.page));
  });
  document.getElementById("leaderboard-cancel")?.addEventListener("click", () => {
    document.getElementById("lobby-nav-btn")?.click();
  });
}

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
    els.body.innerHTML =
      '<tr><td colspan="3" class="text-muted">Loading leaderboard…</td></tr>';
  }
}

export function clearLeaderboardResults(message) {
  els.summary.textContent = "";
  els.pages.innerHTML = "";
  els.body.innerHTML = `<tr><td colspan="3" class="text-muted">${escapeHtml(message)}</td></tr>`;
}

export function renderLeaderboard({ page, totalCount, players, pageCount }) {
  const countLabel = totalCount === 1 ? "1 player" : `${totalCount} players`;
  els.summary.textContent = pageCount
    ? `${countLabel} · page ${page} of ${pageCount}`
    : countLabel;

  if (!players.length) {
    els.body.innerHTML =
      '<tr><td colspan="3" class="text-muted">No ranked players yet.</td></tr>';
  } else {
    els.body.innerHTML = players
      .map(
        (player) => `<tr>
          <td>${player.rank}</td>
          <td>${escapeHtml(player.userId)}</td>
          <td class="text-end">${player.totalWins}</td>
        </tr>`
      )
      .join("");
  }

  renderPages(page, pageCount);
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
}

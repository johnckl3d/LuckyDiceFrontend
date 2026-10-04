export const LEADERBOARD_MAX_PAGES = 10;

export function normalizeLeaderboard(payload) {
  const page = positiveInt(payload?.page ?? payload?.Page, 1);
  const pageSize = positiveInt(payload?.pageSize ?? payload?.PageSize, 10);
  const totalCount = nonNegativeInt(payload?.totalCount ?? payload?.TotalCount);
  const rawPlayers = payload?.players ?? payload?.Players ?? [];
  const players = (Array.isArray(rawPlayers) ? rawPlayers : []).map((player) => ({
    userId: String(player?.userId ?? player?.UserId ?? ""),
    totalWins: nonNegativeInt(player?.totalWins ?? player?.TotalWins),
    rank: nonNegativeInt(player?.rank ?? player?.Rank),
  }));
  const totalPages = pageSize > 0 ? Math.ceil(totalCount / pageSize) : 0;
  const pageCount = Math.min(LEADERBOARD_MAX_PAGES, totalPages);

  return { page, pageSize, totalCount, players, pageCount };
}

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function nonNegativeInt(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

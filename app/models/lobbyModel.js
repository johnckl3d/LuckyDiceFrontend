export const GAME_STATUS_LABELS = {
  0: "In progress",
  1: "Completed",
  2: "Abandoned",
  3: "Restart required",
  4: "Waiting",
};

export function statusLabel(gameStatus) {
  return GAME_STATUS_LABELS[gameStatus] ?? `Status ${gameStatus}`;
}

export function normalizeLobbyGame(game) {
  return {
    gameId: game.gameId,
    displayId: game.displayId,
    gameStatus: game.gameStatus ?? 0,
    playerCount: game.playerCount ?? 0,
    turnTime: game.turnTime ?? 0,
    waitingDuration: game.waitingDuration ?? 0,
    stake: game.stake ?? 0,
    players: game.players ?? [],
    gameStartDateTime: game.gameStartDateTime,
  };
}

export function playerNames(game) {
  return (game.players ?? []).map((player) => player.playerId).join(", ") || "—";
}

export function seatsFilled(game) {
  const seated = game.players?.length ?? 0;
  return `${seated} / ${game.playerCount}`;
}

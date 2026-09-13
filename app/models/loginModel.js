const SESSION_KEYS = {
  accessToken: "luckydice.accessToken",
  refreshToken: "luckydice.refreshToken",
  userId: "luckydice.userId",
};

export function getSession() {
  const accessToken = sessionStorage.getItem(SESSION_KEYS.accessToken);
  const refreshToken = sessionStorage.getItem(SESSION_KEYS.refreshToken);
  const userId = sessionStorage.getItem(SESSION_KEYS.userId);
  if (!accessToken || !userId) {
    return null;
  }
  return { accessToken, refreshToken, userId };
}

export function setSession(session) {
  sessionStorage.setItem(SESSION_KEYS.accessToken, session.accessToken);
  sessionStorage.setItem(SESSION_KEYS.refreshToken, session.refreshToken);
  sessionStorage.setItem(SESSION_KEYS.userId, session.userId);
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEYS.accessToken);
  sessionStorage.removeItem(SESSION_KEYS.refreshToken);
  sessionStorage.removeItem(SESSION_KEYS.userId);
}

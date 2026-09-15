import {
  disconnectSockets,
  isSessionExpiredError,
  login,
  setSessionExpiredHandler,
} from "../services/apiService.js";
import { clearSession, getSession } from "../models/loginModel.js";
import {
  bindLoginView,
  hideSessionExpiredPopup,
  readLoginForm,
  setLoginBusy,
  showApp,
  showLogin,
  showLoginError,
  showSessionExpiredPopup,
} from "../views/loginView.js";
import { enterLobby, initLobbyController, leaveLobby } from "./lobbyController.js";

async function handleLogin() {
  const { userId, password } = readLoginForm();
  if (!userId || !password) {
    showLoginError("Enter your user ID and password.");
    return;
  }

  setLoginBusy(true);
  showLoginError("");
  try {
    const session = await login(userId, password);
    showApp(session);
    enterLobby();
  } catch (error) {
    if (isSessionExpiredError(error)) {
      return;
    }
    showLoginError(
      error.message === "Failed to fetch" ? "Could not reach the game engine." : error.message
    );
  } finally {
    setLoginBusy(false);
  }
}

async function handleLogout() {
  leaveLobby();
  await disconnectSockets();
  clearSession();
  showLogin();
}

function handleSessionExpired() {
  leaveLobby();
  showSessionExpiredPopup();
}

async function handleSessionExpiredOk() {
  hideSessionExpiredPopup();
  await handleLogout();
}

export function initLoginController() {
  initLobbyController();
  setSessionExpiredHandler(handleSessionExpired);
  bindLoginView({
    onSubmit: handleLogin,
    onLogout: handleLogout,
    onSessionExpiredOk: handleSessionExpiredOk,
  });

  const existingSession = getSession();
  if (existingSession) {
    showApp(existingSession);
    enterLobby();
  } else {
    showLogin();
  }
}

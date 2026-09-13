import { disconnectSockets, login } from "../services/apiService.js";
import { clearSession, getSession } from "../models/loginModel.js";
import {
  bindLoginView,
  readLoginForm,
  setLoginBusy,
  showApp,
  showLogin,
  showLoginError,
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

export function initLoginController() {
  initLobbyController();
  bindLoginView({
    onSubmit: handleLogin,
    onLogout: handleLogout,
  });

  const existingSession = getSession();
  if (existingSession) {
    showApp(existingSession);
    enterLobby();
  } else {
    showLogin();
  }
}

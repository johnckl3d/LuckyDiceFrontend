import { login } from "../services/apiService.js";
import { clearSession, getSession } from "../models/loginModel.js";
import {
  bindLoginView,
  readLoginForm,
  setLoginBusy,
  showApp,
  showLogin,
  showLoginError,
} from "../views/loginView.js";
import { bootGame } from "./gameController.js";

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
    bootGame();
  } catch (error) {
    showLoginError(
      error.message === "Failed to fetch" ? "Could not reach the login API." : error.message
    );
  } finally {
    setLoginBusy(false);
  }
}

function handleLogout() {
  clearSession();
  showLogin();
}

export function initLoginController() {
  bindLoginView({
    onSubmit: handleLogin,
    onLogout: handleLogout,
  });

  const existingSession = getSession();
  if (existingSession) {
    showApp(existingSession);
    bootGame();
  } else {
    showLogin();
  }
}

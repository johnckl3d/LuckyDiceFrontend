import { register } from "../services/apiService.js";
import {
  bindRegisterView,
  readRegisterForm,
  setRegisterBusy,
  showRegisterError,
  showRegisterSuccess,
} from "../views/registerView.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function handleRegister() {
  const { userId, password, emailAddress } = readRegisterForm();
  if (!userId || !password || !emailAddress) {
    showRegisterSuccess("");
    showRegisterError("Enter a user ID, password, and email address.");
    return;
  }
  if (!EMAIL_PATTERN.test(emailAddress)) {
    showRegisterSuccess("");
    showRegisterError("Enter a valid email address.");
    return;
  }

  setRegisterBusy(true);
  showRegisterError("");
  showRegisterSuccess("");
  try {
    const created = await register(userId, password, emailAddress);
    const name = created?.userId || userId;
    showRegisterSuccess(`Account created for ${name}. You can sign in now.`);
  } catch (error) {
    showRegisterError(
      error.message === "Failed to fetch" ? "Could not reach the game engine." : error.message
    );
  } finally {
    setRegisterBusy(false);
  }
}

export function initRegisterController() {
  bindRegisterView({ onSubmit: handleRegister });
}

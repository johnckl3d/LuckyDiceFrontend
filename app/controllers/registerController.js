import { register } from "../services/apiService.js";
import {
  bindRegisterView,
  readRegisterForm,
  setRegisterBusy,
  showPasswordRules,
  showRegisterError,
  showRegisterSuccess,
} from "../views/registerView.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordRuleState(password, confirmPassword) {
  return {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    digit: /[0-9]/.test(password),
    match: password.length > 0 && password === confirmPassword,
  };
}

function passwordMeetsCharacterRules(state) {
  return state.length && state.upper && state.lower && state.digit;
}

function handlePasswordInput(password, confirmPassword) {
  showPasswordRules(passwordRuleState(password, confirmPassword));
}

async function handleRegister() {
  const { userId, password, confirmPassword, emailAddress } = readRegisterForm();
  const rules = passwordRuleState(password, confirmPassword);
  showPasswordRules(rules);
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
  if (!passwordMeetsCharacterRules(rules)) {
    showRegisterSuccess("");
    showRegisterError(
      "Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a digit."
    );
    return;
  }
  if (!rules.match) {
    showRegisterSuccess("");
    showRegisterError("Password confirmation must match the password.");
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
  bindRegisterView({ onSubmit: handleRegister, onPasswordInput: handlePasswordInput });
}

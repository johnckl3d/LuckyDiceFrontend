const loginEls = {
  screen: document.getElementById("login-screen"),
  app: document.getElementById("app-screen"),
  form: document.getElementById("login-form"),
  userId: document.getElementById("login-userid"),
  password: document.getElementById("login-password"),
  error: document.getElementById("login-error"),
  submit: document.getElementById("login-submit"),
  signedInUser: document.getElementById("signed-in-user"),
  logout: document.getElementById("logout-btn"),
};

export function showLoginError(message) {
  loginEls.error.textContent = message;
  loginEls.error.classList.toggle("d-none", !message);
}

export function setLoginBusy(busy) {
  loginEls.submit.disabled = busy;
}

export function readLoginForm() {
  return {
    userId: loginEls.userId.value.trim(),
    password: loginEls.password.value,
  };
}

export function showApp(session) {
  loginEls.screen.hidden = true;
  loginEls.app.hidden = false;
  loginEls.signedInUser.textContent = session.userId;
}

export function showLogin() {
  loginEls.app.hidden = true;
  loginEls.screen.hidden = false;
  loginEls.password.value = "";
  showLoginError("");
  loginEls.userId.focus();
}

export function bindLoginView({ onSubmit, onLogout }) {
  loginEls.form.addEventListener("submit", (event) => {
    event.preventDefault();
    onSubmit();
  });
  loginEls.logout.addEventListener("click", () => onLogout());
}

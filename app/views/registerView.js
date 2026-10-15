const registerEls = {
  form: document.getElementById("register-form"),
  userId: document.getElementById("register-userid"),
  password: document.getElementById("register-password"),
  confirmPassword: document.getElementById("register-confirm"),
  emailAddress: document.getElementById("register-email"),
  error: document.getElementById("register-error"),
  success: document.getElementById("register-success"),
  submit: document.getElementById("register-submit"),
  rules: {
    length: document.querySelector('[data-rule="length"]'),
    upper: document.querySelector('[data-rule="upper"]'),
    lower: document.querySelector('[data-rule="lower"]'),
    digit: document.querySelector('[data-rule="digit"]'),
    match: document.querySelector('[data-rule="match"]'),
  },
};

export function showRegisterError(message) {
  registerEls.error.textContent = message;
  registerEls.error.classList.toggle("d-none", !message);
}

export function showRegisterSuccess(message) {
  registerEls.success.textContent = message;
  registerEls.success.classList.toggle("d-none", !message);
  if (message) {
    registerEls.password.value = "";
    registerEls.confirmPassword.value = "";
    registerEls.password.dispatchEvent(new Event("input"));
  }
}

export function showPasswordRules(state) {
  for (const key of Object.keys(registerEls.rules)) {
    registerEls.rules[key].classList.toggle("is-met", Boolean(state[key]));
  }
}

export function setRegisterBusy(busy) {
  registerEls.submit.disabled = busy;
}

export function readRegisterForm() {
  return {
    userId: registerEls.userId.value.trim(),
    password: registerEls.password.value,
    confirmPassword: registerEls.confirmPassword.value,
    emailAddress: registerEls.emailAddress.value.trim(),
  };
}

export function bindRegisterView({ onSubmit, onPasswordInput }) {
  registerEls.form.addEventListener("submit", (event) => {
    event.preventDefault();
    onSubmit();
  });
  if (onPasswordInput) {
    const report = () => onPasswordInput(registerEls.password.value, registerEls.confirmPassword.value);
    registerEls.password.addEventListener("input", report);
    registerEls.confirmPassword.addEventListener("input", report);
    report();
  }
  registerEls.userId.focus();
}

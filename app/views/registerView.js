const registerEls = {
  form: document.getElementById("register-form"),
  userId: document.getElementById("register-userid"),
  password: document.getElementById("register-password"),
  emailAddress: document.getElementById("register-email"),
  error: document.getElementById("register-error"),
  success: document.getElementById("register-success"),
  submit: document.getElementById("register-submit"),
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
  }
}

export function setRegisterBusy(busy) {
  registerEls.submit.disabled = busy;
}

export function readRegisterForm() {
  return {
    userId: registerEls.userId.value.trim(),
    password: registerEls.password.value,
    emailAddress: registerEls.emailAddress.value.trim(),
  };
}

export function bindRegisterView({ onSubmit }) {
  registerEls.form.addEventListener("submit", (event) => {
    event.preventDefault();
    onSubmit();
  });
  registerEls.userId.focus();
}

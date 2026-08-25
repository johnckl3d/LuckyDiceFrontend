const DICE_COUNT = 5;
const MAX_ROLLS = 3;

const state = {
  values: Array(DICE_COUNT).fill(1),
  held: Array(DICE_COUNT).fill(false),
  rollsLeft: MAX_ROLLS,
  hasRolled: false,
};

const diceRow = document.getElementById("dice-row");
const rollBtn = document.getElementById("roll-btn");
const newGameBtn = document.getElementById("new-game-btn");
const rollsLeftEl = document.getElementById("rolls-left");
const heldCountEl = document.getElementById("held-count");
const valuesLabelEl = document.getElementById("values-label");
const turnStatusEl = document.getElementById("turn-status");
const scoreBody = document.querySelector("#score-table tbody");
const engineStatusEl = document.getElementById("engine-status");

function renderDice() {
  diceRow.innerHTML = "";

  state.values.forEach((value, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "die";
    button.dataset.index = String(index);
    button.dataset.value = String(value);
    button.setAttribute(
      "aria-label",
      `Die ${index + 1}, ${value}${state.held[index] ? ", held" : ""}`
    );

    if (state.held[index]) {
      button.classList.add("is-held");
    }

    for (let pip = 0; pip < 9; pip += 1) {
      const pipEl = document.createElement("span");
      pipEl.className = "pip";
      button.appendChild(pipEl);
    }

    button.addEventListener("click", () => toggleHold(index));
    diceRow.appendChild(button);
  });
}

function toggleHold(index) {
  if (!state.hasRolled || state.rollsLeft === 0) {
    return;
  }

  state.held[index] = !state.held[index];
  renderDice();
  renderHud();
}

function renderHud() {
  rollsLeftEl.textContent = String(state.rollsLeft);
  heldCountEl.textContent = String(state.held.filter(Boolean).length);
  valuesLabelEl.textContent = state.hasRolled ? state.values.join(" · ") : "—";
  rollBtn.disabled = state.rollsLeft === 0;

  if (!state.hasRolled) {
    turnStatusEl.textContent = "Click Roll to throw all five dice. Click a die to hold it.";
  } else if (state.rollsLeft > 0) {
    turnStatusEl.textContent = "Hold any dice you want to keep, then roll again.";
  } else {
    turnStatusEl.textContent = "No rolls left. Start a new game or send these values to the engine later.";
  }
}

async function renderScores() {
  if (!state.hasRolled) {
    scoreBody.innerHTML = "";
    return;
  }

  const { scores } = await scoreDice(state.values);
  scoreBody.innerHTML = Object.entries(scores)
    .map(
      ([name, points]) =>
        `<tr><td>${name}</td><td class="${points ? "fw-semibold" : "text-muted"}">${points}</td></tr>`
    )
    .join("");
}

function animateRoll() {
  diceRow.querySelectorAll(".die").forEach((die, index) => {
    if (!state.held[index]) {
      die.classList.add("is-rolling");
    }
  });
}

async function onRoll() {
  if (state.rollsLeft === 0) {
    return;
  }

  animateRoll();
  rollBtn.disabled = true;

  try {
    const result = await rollDice(state);
    state.values = result.values;
    state.rollsLeft = result.rollsLeft ?? state.rollsLeft - 1;
    state.hasRolled = true;
  } catch (error) {
    turnStatusEl.textContent = error.message;
    rollBtn.disabled = false;
    return;
  }

  renderDice();
  renderHud();
  await renderScores();
}

function newGame() {
  state.values = Array(DICE_COUNT).fill(1);
  state.held = Array(DICE_COUNT).fill(false);
  state.rollsLeft = MAX_ROLLS;
  state.hasRolled = false;
  renderDice();
  renderHud();
  renderScores();
}

async function showEngineStatus() {
  const status = await pingEngine();
  if (!USE_ENGINE) {
    engineStatusEl.textContent = "Engine: local fallback";
  } else if (status.ok) {
    engineStatusEl.textContent = "Engine: connected";
  } else {
    engineStatusEl.textContent = "Engine: unreachable";
  }
}

rollBtn.addEventListener("click", onRoll);
newGameBtn.addEventListener("click", newGame);

renderDice();
renderHud();
showEngineStatus();

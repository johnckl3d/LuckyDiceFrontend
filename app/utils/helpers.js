export const TIMER_SECONDS = 15;
export const AI_MIN_MS = 500;
export const AI_MAX_MS = 1500;

export function utcTimestampHeader() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function aiDelay() {
  return AI_MIN_MS + Math.floor(Math.random() * (AI_MAX_MS - AI_MIN_MS + 1));
}

/** Timed help and points for one multiplication question. */
export const HINT_AT_MS = 5000;
export const REVEAL_AT_MS = 10000;
export const FULL_REVEAL_AT_MS = 15000;
const FULL_POINTS_UNTIL_MS = 2000;

function boundedNumber(value, maximum) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.min(maximum, Math.max(0, value));
}

/**
 * Pure timer state: the app owns its clock and renders the returned state.
 * Timed reveal opacity grows from 0 at 10 seconds to 1 at 15 seconds.
 * `answerRevealed` applies the scoring cap for an immediate manual reveal;
 * the caller owns that reveal's display state. Help caps apply before the
 * 20-point penalty for each wrong attempt; every answer earns at least 10.
 * The first two seconds earn 100 points; after that points decline linearly
 * to 20 at 15 seconds, rounded up to the next whole point.
 * Invalid/negative input becomes zero; positive infinity clamps to the end.
 */
export function getPacing(elapsedMs, { hintUsed = false, misses = 0, answerRevealed = false } = {}) {
  const elapsed = boundedNumber(elapsedMs, FULL_REVEAL_AT_MS);
  // Five misses already exceed every possible score, so larger counts are
  // equivalent and cannot cause overflow during penalty calculation.
  const wrongAttempts = Math.floor(boundedNumber(misses, 5));
  const hintDue = elapsed >= HINT_AT_MS;
  const answerDue = elapsed >= REVEAL_AT_MS;
  const answerOpacity = Math.min(1, Math.max(0, (elapsed - REVEAL_AT_MS) / (FULL_REVEAL_AT_MS - REVEAL_AT_MS)));
  const fullyRevealed = elapsed >= FULL_REVEAL_AT_MS;

  const decay = Math.max(0, elapsed - FULL_POINTS_UNTIL_MS) / (FULL_REVEAL_AT_MS - FULL_POINTS_UNTIL_MS);
  let points = Math.ceil(100 - decay * 80);
  if (hintUsed || hintDue) points = Math.min(points, 60);
  if (answerDue) points = Math.min(points, 40);
  if (answerRevealed) points = Math.min(points, 20);
  points = Math.max(10, points - wrongAttempts * 20);

  return { hintDue, answerDue, answerOpacity, fullyRevealed, points };
}

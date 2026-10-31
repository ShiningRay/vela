/** Delay until the wall clock crosses into the next minute. */
export function msUntilNextMinute(now: Date = new Date()): number {
  return 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds());
}

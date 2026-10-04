/**
 * Parses flexible time input used by /event-vc:
 *  - Durations relative to `base`:   "30m", "2h", "1h30m", "in 1 day", "90 minutes"
 *  - Discord timestamps:             "<t:1767225600:F>"
 *  - Unix timestamps (sec or ms):    "1767225600", "1767225600000"
 *  - ISO 8601:                       "2026-10-05T18:00:00+05:30", "2026-10-05 18:00" (no offset = UTC)
 */

const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

const DURATION_TOKEN = /(\d+)\s*(weeks?|w|days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)/g;

function parseDuration(input: string): number | null {
  const text = input.replace(/^in\s+/, '');
  let total = 0;
  let matched = false;

  const leftover = text.replace(DURATION_TOKEN, (_, amount: string, unit: string) => {
    matched = true;
    total += parseInt(amount, 10) * UNIT_MS[unit[0]];
    return '';
  });

  // Reject partial matches like "2h tomorrow"
  if (!matched || leftover.replace(/[\s,]|and/g, '') !== '') return null;
  return total;
}

export function parseTimeInput(raw: string, base: Date = new Date()): Date | null {
  const input = raw.trim().toLowerCase();
  if (!input) return null;

  const discordTs = /^<t:(\d+)(?::[a-z])?>$/.exec(input);
  if (discordTs) return new Date(parseInt(discordTs[1], 10) * 1000);

  if (/^\d{9,13}$/.test(input)) {
    const n = parseInt(input, 10);
    return new Date(input.length <= 10 ? n * 1000 : n);
  }

  const durationMs = parseDuration(input);
  if (durationMs !== null) return new Date(base.getTime() + durationMs);

  // ISO without an explicit offset would otherwise use the host's local timezone; pin it to UTC
  let iso = raw.trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(iso)) iso += 'Z';
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

/** Discord dynamic timestamp markdown, rendered in each viewer's local timezone. */
export function discordTimestamp(date: Date, style: 'F' | 'R' | 'f' | 't' = 'F'): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

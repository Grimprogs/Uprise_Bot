/**
 * Phone number normalization & validation shared by the Discord bot and web API.
 *
 * Accepts common human input ("+91 98765-43210", "(415) 555 0132", "0044 20 7946 0958"),
 * strips formatting characters, and returns either an E.164 string ("+919876543210")
 * or a bare 10-15 digit string when no country code was supplied.
 */

// Both keys exist on both branches so access type-checks without strictNullChecks narrowing
export type PhoneValidationResult =
  | { ok: true; normalized: string; error?: undefined }
  | { ok: false; normalized?: undefined; error: string };

export const PHONE_FORMAT_HINT = 'Use 10-15 digits, ideally with your country code (e.g. +919876543210).';

export function normalizePhone(raw: string | null | undefined): PhoneValidationResult {
  const input = (raw || '').trim();
  if (!input) {
    return { ok: false, error: 'Phone number is required.' };
  }

  // Strip spaces, dashes, dots and parentheses that users commonly type
  let cleaned = input.replace(/[\s\-.()]/g, '');

  // International "00" prefix is equivalent to "+"
  if (cleaned.startsWith('00')) {
    cleaned = `+${cleaned.slice(2)}`;
  }

  const hasPlus = cleaned.startsWith('+');
  const digits = hasPlus ? cleaned.slice(1) : cleaned;

  if (!/^\d+$/.test(digits)) {
    return { ok: false, error: `Phone number may only contain digits and an optional leading "+". ${PHONE_FORMAT_HINT}` };
  }

  // E.164 caps numbers at 15 digits; anything under 10 cannot be a full mobile number
  if (digits.length < 10 || digits.length > 15) {
    return { ok: false, error: `Phone number must be 10-15 digits long (you entered ${digits.length}). ${PHONE_FORMAT_HINT}` };
  }

  // Country codes never start with 0
  if (hasPlus && digits.startsWith('0')) {
    return { ok: false, error: `Country code cannot start with 0. ${PHONE_FORMAT_HINT}` };
  }

  return { ok: true, normalized: hasPlus ? `+${digits}` : digits };
}

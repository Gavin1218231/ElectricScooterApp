// SQLite's datetime('now') returns UTC as "YYYY-MM-DD HH:MM:SS" (space
// separated, no zone). Appending "Z" to that shape is NOT required to parse by
// the ECMAScript spec — V8 accepts it but WebKit/iOS Safari returns Invalid
// Date, which silently froze the ride timer and blanked every date on iPhone.
// Normalize to a real ISO-8601 string before parsing.
export function parseServerDate(value) {
  if (typeof value !== 'string' || !value) return null;

  let s = value.trim();
  if (!s) return null;

  // "2026-07-28 12:00:00" -> "2026-07-28T12:00:00"
  if (!s.includes('T')) s = s.replace(' ', 'T');
  // Mark as UTC unless the server already supplied an offset.
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(s)) s += 'Z';

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Milliseconds since epoch, or null when unparseable.
export function parseServerTime(value) {
  const d = parseServerDate(value);
  return d ? d.getTime() : null;
}

// Formats a server timestamp, returning `fallback` when absent/unparseable.
export function formatServerDate(value, options, fallback = '') {
  const d = parseServerDate(value);
  return d ? d.toLocaleDateString('en-US', options) : fallback;
}

/**
 * Measurement values, handled the way tailors actually record them.
 *
 * Two physical shapes exist on a measuring book:
 *   • a single dimension  — "8.5" (bust 8½")
 *   • a PAIR of dimensions — "8/8" meaning 8 by 8 (e.g. short sleeve: length × width)
 *
 * The slash is therefore a PAIR SEPARATOR, never a fraction: "5/5" is five-by-five,
 * not 1. Decimals and vulgar glyphs (½) are how single values get their fractional
 * part, because a tape is graded in eighths.
 *
 * Storage contract: `MeasurementValue` = number | [number, number] — decimals only.
 * Everything human happens at these edges: `parseMeasurementInput` in,
 * `formatMeasurement` out, `formatMeasurementInput` for edit-field prefill.
 *
 * Ambiguous input ("8 1/2", "8/0", "abc") is REJECTED, not guessed: a silently-wrong
 * measurement is worse than a blocked one on a garment that must fit.
 */

export type MeasurementValue = number | [number, number];

const VULGAR_FRACTIONS: Record<string, number> = {
  "½": 0.5,
  "¼": 0.25,
  "¾": 0.75,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

const EIGHTH_LABELS: Record<string, string> = {
  "0.125": "⅛",
  "0.25": "¼",
  "0.375": "⅜",
  "0.5": "½",
  "0.625": "⅝",
  "0.75": "¾",
  "0.875": "⅞",
};

/** A usable single measurement: a finite number a tailor could have measured. */
function toSingle(raw: string): number | null {
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Parse one measurement entry.
 *   "8" · "8.5" · "8½"   → single number
 *   "8/8" · "8/5" · "5/5" → pair [8, 8] · [8, 5] · [5, 5] (slash = "by")
 * Returns null for anything it cannot honor — callers decide rejection UX.
 */
export function parseMeasurementInput(raw: string): MeasurementValue | null {
  const text = raw.trim();
  if (!text) return null;

  const slashParts = text.split("/");
  if (slashParts.length === 2) {
    const a = toSingle(slashParts[0] ?? "");
    const b = toSingle(slashParts[1] ?? "");
    return a !== null && b !== null ? [a, b] : null;
  }
  if (slashParts.length > 2) return null;

  // Vulgar-glyph fraction, bare or after a whole number ("8½", "½").
  const vulgarMatch = text.match(/^(\d+(?:\.\d+)?)?\s*([¼½¾⅛⅜⅝⅞])$/);
  if (vulgarMatch) {
    const whole = vulgarMatch[1] !== undefined ? Number(vulgarMatch[1]) : 0;
    const frac = VULGAR_FRACTIONS[vulgarMatch[2] as string];
    if (frac !== undefined && Number.isFinite(whole) && whole + frac > 0) {
      return whole + frac;
    }
    return null;
  }

  return toSingle(text);
}

/** Render a single decimal on the tape grid: 8.5 → "8½"; off-grid decimals print as-is. */
function formatSingle(value: number): string {
  const whole = Math.floor(value);
  const fractional = value - whole;
  const eighths = fractional * 8;
  const snapped = Math.round(eighths);

  // On the grid only if the eighth-count is (numerically) whole, not merely close.
  if (Math.abs(eighths - snapped) < 1e-6) {
    const fracLabel = EIGHTH_LABELS[String(snapped / 8)];
    if (fracLabel) return whole === 0 ? fracLabel : `${whole}${fracLabel}`;
  }
  return String(Number(value.toFixed(3)));
}

/**
 * Render a stored value the way it was measured: 8.5 → "8½", 8.375 → "8⅜",
 * [8, 8] → "8/8" — pairs print exactly as tailors write them, slash and all.
 * Null/undefined/zero render as "—".
 */
export function formatMeasurement(value: MeasurementValue | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) {
    const [a, b] = value;
    if (a === undefined || b === undefined || a <= 0 || b <= 0) return "—";
    return `${formatSingle(a)}/${formatSingle(b)}`;
  }
  if (!Number.isFinite(value) || value <= 0) return "—";
  return formatSingle(value);
}

/** What an edit field should contain when re-editing a value: "8.5" or "8/8". */
export function formatMeasurementInput(value: MeasurementValue | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    const [a, b] = value;
    if (a === undefined || b === undefined) return "";
    return `${a}/${b}`;
  }
  return String(value);
}

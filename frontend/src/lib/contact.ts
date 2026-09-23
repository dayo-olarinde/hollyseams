/**
 * Contact plumbing, shared by every screen that reaches a client.
 *
 * These lived on the job file first; the customers dossier reuses them, so the "missing country
 * code" fix from the payment-sheet saga holds everywhere instead of drifting per page.
 */

/**
 * A wa.me deep link needs the number in full international form, digits only — no `+`, no
 * leading zero. Nigerian numbers are commonly stored local-style (`0801…`, 11 digits), which
 * WhatsApp reports as "missing the country code". The rule: a leading 0 (local trunk prefix)
 * becomes the country code 234; anything already international passes through untouched.
 * `tel:` stays raw — the dialer applies the phone's own locale, so local format dials fine.
 */
export const waMe = (phone: string): string => {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return `https://wa.me/234${digits.slice(1)}`;
  return `https://wa.me/${digits}`;
};

/** True when the stored number has enough digits for WhatsApp to resolve. */
export const hasWhatsApp = (phone: string | null | undefined): boolean =>
  !!phone && phone.replace(/\D/g, "").length >= 7;

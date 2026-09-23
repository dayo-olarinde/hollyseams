/**
 * A payment intent's identity, isolated so the contract can be tested without a DOM.
 *
 * The idempotency contract, in one place:
 *
 *   **One opened sheet is one intent.** The key is minted the moment the sheet is composed and
 *   lives in component state — a retry after a network failure re-sends the *same* key, so the
 *   backend replays instead of double-charging; closing the sheet abandons the intent, and a
 *   fresh sheet is a fresh key (and a fresh payment). There is deliberately no time-window
 *   dedup: two genuine ₦32,000 payments on the same day are two intents, not a duplicate.
 *
 * `crypto.randomUUID` only exists in secure contexts (https, localhost) — the phone tests this
 * app over plain LAN http, where it is undefined and minted a crash instead of a key. The
 * fallback draws 128 random bits from `getRandomValues` and formats them as a v4 UUID: the
 * backend validates a UUID, so the format is part of the contract.
 */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;

  if (typeof c?.randomUUID === "function") {
    return c.randomUUID();
  }

  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  // Per RFC 4122 §4.4: version 4 in the high nibble of byte 6, variant 10xx in byte 8.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0"));
  return (
    `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-` +
    `${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`
  );
}

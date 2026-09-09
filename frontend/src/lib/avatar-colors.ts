/**
 * Shared name → colour mapping for avatars and status dots.
 *
 * One stable hash of the person's name picks a hue from the iOS palette, so
 * the same customer or subject always gets the same colour everywhere they
 * appear (balances avatars, client search, fitting chips, Latest-work dots).
 * Self subjects carry the customer's own name, so their dots and the
 * customer's avatar automatically match too.
 *
 * `avatarColor` returns the full hue (dots, glow, text); `avatarTint`
 * returns the same hue at ~15% alpha for soft avatar fills. Both work over
 * light and dark surfaces since the tint is translucent.
 */

/** iOS system hues (dark-mode variants — brighter, glow-friendly). */
export const AVATAR_COLORS = [
  "#0A84FF", // blue
  "#BF5AF2", // purple
  "#FF375F", // pink
  "#40CBE0", // teal
  "#FF9F0A", // orange
  "#30D158", // green
  "#5E5CE6", // indigo
] as const;

/** FNV-1a-ish hash → stable palette index for a name. */
export function avatarColor(name: string): string {
  const key = (name ?? "").trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

/** Same hue as a ~15% translucent fill (for avatar backgrounds). */
export function avatarTint(name: string): string {
  return tintOf(avatarColor(name));
}

/** Tint of an already-resolved hue (use when the colour is computed once). */
export function tintOf(color: string): string {
  return color + "26";
}

export const AVATAR_COLORS = [
  "#0A84FF",
  "#BF5AF2",
  "#FF375F",
  "#40CBE0",
  "#FF9F0A",
  "#30D158",
  "#5E5CE6",
] as const;

export function avatarColor(name: string): string {
  const key = (name ?? "").trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}

export function avatarTint(name: string): string {
  return tintOf(avatarColor(name));
}

export function tintOf(color: string): string {
  return color + "26";
}
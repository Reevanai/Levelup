// Shared between the API and the web client.

export type CategoryKey =
  | 'food' | 'shopping' | 'gaming' | 'transport' | 'entertainment'
  | 'subscriptions' | 'education' | 'other';

// Chart colours are a fixed, entity-bound order validated for colour-vision
// separation and contrast on the dark app surface. Do not reorder.
export const CATEGORIES: { key: CategoryKey; label: string; color: string; emoji: string }[] = [
  { key: 'food', label: 'Food & drinks', color: '#9085e9', emoji: '🍜' },
  { key: 'shopping', label: 'Shopping', color: '#199e70', emoji: '🛍️' },
  { key: 'gaming', label: 'Gaming', color: '#d95926', emoji: '🎮' },
  { key: 'transport', label: 'Transport', color: '#3987e5', emoji: '🚇' },
  { key: 'entertainment', label: 'Entertainment', color: '#c98500', emoji: '🎬' },
  { key: 'subscriptions', label: 'Subscriptions', color: '#d55181', emoji: '🔁' },
  { key: 'education', label: 'Education', color: '#008300', emoji: '📚' },
  { key: 'other', label: 'Other', color: '#e66767', emoji: '✨' },
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as [CategoryKey, ...CategoryKey[]];

export const CARD_DESIGNS = [
  { key: 'aurora', label: 'Aurora', bg: 'linear-gradient(155deg,#a3f06a 0%,#3fe0c5 38%,#39b8f5 70%,#3f8bf0 100%)', ink: '#06121a' },
  { key: 'nebula', label: 'Nebula', bg: 'linear-gradient(160deg,#e879f9 0%,#a855f7 45%,#6d28d9 100%)', ink: '#ffffff' },
  { key: 'sunset', label: 'Sunset', bg: 'linear-gradient(160deg,#ffc24b 0%,#ff8a3d 50%,#f9603f 100%)', ink: '#1a0c02' },
  { key: 'matrix', label: 'Matrix', bg: 'linear-gradient(160deg,#39ff9c 0%,#14c97a 50%,#0a7d54 100%)', ink: '#03150c' },
  { key: 'obsidian', label: 'Obsidian', bg: 'linear-gradient(160deg,#3a3a44 0%,#1c1c22 55%,#0c0c10 100%)', ink: '#f4f4f8' },
  { key: 'holo', label: 'Holo', bg: 'linear-gradient(150deg,#f472b6 0%,#a78bfa 25%,#38bdf8 50%,#39ff9c 75%,#facc15 100%)', ink: '#0b0b12' },
] as const;

export const LEVEL_TITLES = ['Rookie', 'Saver', 'Planner', 'Hustler', 'Strategist', 'Pro', 'Elite', 'Master', 'Legend'];

/** XP needed to *reach* a level (level 1 = 0 XP). */
export const xpForLevel = (level: number) => 50 * (level - 1) * (level + 2);

export function levelInfo(xp: number) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
    xp,
    floor,
    next,
    progress: (xp - floor) / (next - floor),
    toNext: next - xp,
  };
}

export const DISCLAIMER =
  'LevelUp is a technology prototype, not a bank. All balances, cards and payments here are simulated — no real money moves.';

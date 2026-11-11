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
  { key: 'nebula', label: 'Nebula', bg: 'linear-gradient(135deg,#2a1065 0%,#7c3aed 55%,#c084fc 100%)', ink: '#ffffff' },
  { key: 'matrix', label: 'Matrix', bg: 'linear-gradient(135deg,#03150c 0%,#0b5d37 55%,#39ff9c 130%)', ink: '#eafff3' },
  { key: 'obsidian', label: 'Obsidian', bg: 'linear-gradient(135deg,#050507 0%,#1b1b25 60%,#34344a 100%)', ink: '#f4f4f8' },
  { key: 'aurora', label: 'Aurora', bg: 'linear-gradient(120deg,#5b21b6 0%,#2563eb 50%,#22d3a6 100%)', ink: '#ffffff' },
  { key: 'sunset', label: 'Sunset', bg: 'linear-gradient(135deg,#4a044e 0%,#be185d 55%,#fb923c 100%)', ink: '#ffffff' },
  { key: 'holo', label: 'Holo', bg: 'linear-gradient(115deg,#7c3aed 0%,#22d3ee 28%,#39ff9c 50%,#facc15 72%,#f472b6 100%)', ink: '#0b0b12' },
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

import { readFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync(new URL('../data/content.json', import.meta.url), 'utf8'));

export const PLANS = raw.PLANS;
export const SHOP_IDS = new Set(raw.SHOPS.map((s) => s.id));
export const RANK_IDS = new Set(raw.RANKINGS.map((r) => r.id));

const memberRankCount = {};
for (const r of raw.RANKINGS) {
  if (r.access !== 'member') continue;
  for (const [shopId] of r.items) memberRankCount[shopId] = (memberRankCount[shopId] || 0) + 1;
}

export function contentFor(isMember) {
  return {
    scenes: raw.SCENES,
    plans: raw.PLANS,
    shops: raw.SHOPS.map((s) => ({ ...s, memberRankCount: memberRankCount[s.id] || 0 })),
    rankings: raw.RANKINGS.map((r) =>
      r.access === 'member' && !isMember
        ? { ...r, items: r.items.map((it, i) => (i === 0 ? it : null)) }
        : r
    ),
  };
}

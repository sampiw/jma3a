export const MOUL_CAST = [
  { name: "مول الطاكسي", emblem: "🚕", color: "#ff675f" },
  { name: "النكافة", emblem: "👑", color: "#39d59e" },
  { name: "مول أتاي", emblem: "🫖", color: "#ffbe50" },
  { name: "معلّق الدرب", emblem: "🎙️", color: "#75afff" },
  { name: "مول الخضرة", emblem: "🍊", color: "#ed85ce" },
  { name: "الميكانيسيان", emblem: "🔧", color: "#52d8dd" },
  { name: "مول الشعبي", emblem: "🪕", color: "#b09bff" },
  { name: "سمسار الحومة", emblem: "💼", color: "#edebaf" },
] as const;

export const MOUL_SITES = [
  { name: "قهوة الأطلس", price: 120 }, { name: "فرّان الحومة", price: 165 },
  { name: "حانوت البركة", price: 120 }, { name: "رياض الياسمين", price: 380 },
  { name: "قهوة النخلة", price: 120 }, { name: "دار الضريبة", price: 0 },
  { name: "قهوة البهجة", price: 120 }, { name: "فندق الباشا", price: 560 },
  { name: "قهوة الصفصاف", price: 120 }, { name: "سوق الزرابي", price: 230 },
  { name: "حانوت الساحة", price: 120 }, { name: "دار الزليج", price: 340 },
  { name: "قهوة باب السوق", price: 120 }, { name: "قباضة السوق", price: 0 },
  { name: "حانوت الأمل", price: 120 }, { name: "قصر المنصور", price: 620 },
] as const;
export const MOUL_STARTS = [0, 8, 4, 12, 2, 10, 6];
export const MOUL_DISTRICTS = ["باب القهوة", "درب النخيل", "سوق الزرابي", "باب القصر"];
export const MOUL_ROUNDS = 12;
export function rarity(price: number) {
  if (price === 0) return "القباضة";
  if (price >= 500) return "معلمة";
  return price >= 300 ? "ممتاز" : "ديال الحومة";
}
export function routeTile(position: number, steps: number, direction: 1 | -1) {
  return (position + direction * steps + MOUL_SITES.length) % MOUL_SITES.length;
}
export function upgradePrice(tile: number) { return Math.ceil(MOUL_SITES[tile].price / 2); }
export type MoulShot = {
  id: string; kind: "BUY" | "RENT" | "TAX" | "BUILD" | "PRIZE"; tile: number;
  amount: number; actor: string; recipient?: string; swapped?: number;
};
export type MoulTable = {
  cast: Record<string, number>;
  steps: number | null;
  bids: Record<string, number>;
  auctionEnd: number;
  history: MoulShot[];
  built: boolean;
};
type Holdings = Record<number, {ownerId: string | null; level: number}>;
export function districtCount(tile: number, owner: string, properties: Holdings) {
  const start = Math.floor(tile / 4) * 4;
  return MOUL_SITES.slice(start, start + 4).filter((_, i) => properties[start + i]?.ownerId === owner).length;
}
export function moulRent(tile: number, properties: Holdings) {
  const prop = properties[tile];
  const districtBonus = prop?.ownerId && districtCount(tile, prop.ownerId, properties) >= 2 ? 1.5 : 1;
  return Math.round(MOUL_SITES[tile].price * .24 * (1 + (prop?.level ?? 0)) * districtBonus);
}

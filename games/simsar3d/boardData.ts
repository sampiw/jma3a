import {
  SimsarColorGroup,
  SimsarPlayer,
  SimsarPropertyState,
  SimsarTileSpec,
} from "./types";

export const BOARD_TILE_COUNT = 24;
export const PASS_START_SALARY_DH = 250;
export const LAND_ON_START_BONUS_DH = 350;
export const JAIL_BAIL_DH = 100;
export const INITIAL_GARDIENNAGE_POT_DH = 120;

export const COLOR_GROUP_META: Record<
  SimsarColorGroup,
  { nameAr: string; hex: string; badgeBg: string }
> = {
  CHEFCHAOUEN_BLUE: {
    nameAr: "الجوهرة الزرقاء",
    hex: "#0ea5e9",
    badgeBg: "bg-sky-500",
  },
  SOUK_TERRACOTTA: {
    nameAr: "الحومة الشعبية",
    hex: "#f97316",
    badgeBg: "bg-orange-500",
  },
  CASA_EMERALD: {
    nameAr: "محور الأطلسي",
    hex: "#10b981",
    badgeBg: "bg-emerald-500",
  },
  MARRAKECH_GOLD: {
    nameAr: "شمس البهجة",
    hex: "#f59e0b",
    badgeBg: "bg-amber-500",
  },
  ROYAL_PURPLE: {
    nameAr: "الفخامة الملكية",
    hex: "#a855f7",
    badgeBg: "bg-purple-500",
  },
  UTILITY: {
    nameAr: "النقل والضو",
    hex: "#06b6d4",
    badgeBg: "bg-cyan-500",
  },
};

export const BUILDING_TIER_NAMES_AR: Record<0 | 1 | 2 | 3, string> = {
  0: "بقعة أرضية",
  1: "قهوة شعبية ☕",
  2: "رياض سياحي 🕌",
  3: "أوطيل 5 نجوم 👑",
};

/**
 * 24-Tile Rounded-Square Miniature Morocco Island
 * 4 Sides × 6 Steps:
 * - Tiles 0..5: South Corniche Edge (Front-Right -> Front-Left in portrait view!)
 * - Tiles 6..11: West Medina Edge (Front-Left -> Back-Left)
 * - Tiles 12..17: North Kasbah Edge (Back-Left -> Back-Right)
 * - Tiles 18..23: East Marina Edge (Back-Right -> Front-Right)
 */
export const SIMSAR_BOARD_TILES: SimsarTileSpec[] = [
  {
    index: 0,
    kind: "START",
    nameAr: "الانطلاق • المانضا",
    shortAr: "المانضا",
    emoji: "💰",
    colorHex: "#16a34a",
  },
  {
    index: 1,
    kind: "CITY",
    nameAr: "أصيلة الفنية",
    shortAr: "أصيلة",
    emoji: "🎨",
    group: "CHEFCHAOUEN_BLUE",
    colorHex: "#0ea5e9",
    price: 100,
    upgradeCost: 70,
    rents: [25, 70, 160, 310],
  },
  {
    index: 2,
    kind: "CITY",
    nameAr: "شفشاون الزرقاء",
    shortAr: "شفشاون",
    emoji: "🩵",
    group: "CHEFCHAOUEN_BLUE",
    colorHex: "#0ea5e9",
    price: 120,
    upgradeCost: 80,
    rents: [32, 85, 190, 360],
  },
  {
    index: 3,
    kind: "UTILITY",
    nameAr: "قطار البراق ONCF",
    shortAr: "البراق 🚄",
    emoji: "🚄",
    group: "UTILITY",
    colorHex: "#06b6d4",
    price: 150,
  },
  {
    index: 4,
    kind: "CITY",
    nameAr: "سويقة الدرب",
    shortAr: "السويقة",
    emoji: "🛒",
    group: "SOUK_TERRACOTTA",
    colorHex: "#f97316",
    price: 140,
    upgradeCost: 90,
    rents: [38, 100, 220, 420],
  },
  {
    index: 5,
    kind: "CITY",
    nameAr: "حمام البهجة البلدي",
    shortAr: "الحمام",
    emoji: "🪣",
    group: "SOUK_TERRACOTTA",
    colorHex: "#f97316",
    price: 160,
    upgradeCost: 100,
    rents: [45, 115, 250, 470],
  },
  {
    index: 6,
    kind: "JAIL",
    nameAr: "الفوريان • الكوميسارية",
    shortAr: "الفوريان",
    emoji: "🚨",
    colorHex: "#475569",
  },
  {
    index: 7,
    kind: "CITY",
    nameAr: "الرباط حسان",
    shortAr: "الرباط",
    emoji: "🏛️",
    group: "CASA_EMERALD",
    colorHex: "#10b981",
    price: 180,
    upgradeCost: 110,
    rents: [52, 135, 290, 540],
  },
  {
    index: 8,
    kind: "CITY",
    nameAr: "المعاريف كازا",
    shortAr: "المعاريف",
    emoji: "🛍️",
    group: "CASA_EMERALD",
    colorHex: "#10b981",
    price: 200,
    upgradeCost: 120,
    rents: [60, 150, 325, 600],
  },
  {
    index: 9,
    kind: "HAMZA",
    nameAr: "كارطة الهمزة!",
    shortAr: "الهمزة",
    emoji: "🃏",
    colorHex: "#eab308",
  },
  {
    index: 10,
    kind: "CITY",
    nameAr: "كورنيش عين الذئاب",
    shortAr: "عين الذئاب",
    emoji: "🌊",
    group: "CASA_EMERALD",
    colorHex: "#10b981",
    price: 220,
    upgradeCost: 130,
    rents: [68, 170, 360, 670],
  },
  {
    index: 11,
    kind: "CITY",
    nameAr: "مرزوكة الصحراء",
    shortAr: "مرزوكة",
    emoji: "🐪",
    group: "MARRAKECH_GOLD",
    colorHex: "#f59e0b",
    price: 240,
    upgradeCost: 140,
    rents: [75, 190, 400, 740],
  },
  {
    index: 12,
    kind: "JACKPOT",
    nameAr: "باركينغ الگارديناج",
    shortAr: "الگارديناج",
    emoji: "🦺",
    colorHex: "#eab308",
  },
  {
    index: 13,
    kind: "CITY",
    nameAr: "أكادير تاغزوت",
    shortAr: "أكادير",
    emoji: "🏄",
    group: "MARRAKECH_GOLD",
    colorHex: "#f59e0b",
    price: 260,
    upgradeCost: 150,
    rents: [84, 210, 440, 810],
  },
  {
    index: 14,
    kind: "HEIST",
    nameAr: "سطو السمسار الكبير!",
    shortAr: "سطو 🥷",
    emoji: "🥷",
    colorHex: "#e11d48",
  },
  {
    index: 15,
    kind: "UTILITY",
    nameAr: "لاراديما الماء والضو",
    shortAr: "الضو 💡",
    emoji: "💡",
    group: "UTILITY",
    colorHex: "#06b6d4",
    price: 150,
  },
  {
    index: 16,
    kind: "CITY",
    nameAr: "جامع الفنا مراكش",
    shortAr: "جامع الفنا",
    emoji: "🐍",
    group: "MARRAKECH_GOLD",
    colorHex: "#f59e0b",
    price: 280,
    upgradeCost: 160,
    rents: [92, 235, 490, 900],
  },
  {
    index: 17,
    kind: "CITY",
    nameAr: "مارينا طنجة",
    shortAr: "طنجة مارينا",
    emoji: "🛥️",
    group: "ROYAL_PURPLE",
    colorHex: "#a855f7",
    price: 320,
    upgradeCost: 185,
    rents: [110, 275, 570, 1040],
  },
  {
    index: 18,
    kind: "RADAR_TO_JAIL",
    nameAr: "رادار الجدارمية 180!",
    shortAr: "رادار 📸",
    emoji: "🚓",
    colorHex: "#dc2626",
  },
  {
    index: 19,
    kind: "CITY",
    nameAr: "إفران سويسرا المغرب",
    shortAr: "إفران",
    emoji: "🌲",
    group: "CHEFCHAOUEN_BLUE",
    colorHex: "#0ea5e9",
    price: 135,
    upgradeCost: 85,
    rents: [36, 95, 205, 390],
  },
  {
    index: 20,
    kind: "CITY",
    nameAr: "باب منصور مكناس",
    shortAr: "مكناس",
    emoji: "🏰",
    group: "SOUK_TERRACOTTA",
    colorHex: "#f97316",
    price: 170,
    upgradeCost: 105,
    rents: [48, 125, 265, 500],
  },
  {
    index: 21,
    kind: "HAMZA",
    nameAr: "كارطة الهمزة!",
    shortAr: "الهمزة",
    emoji: "🃏",
    colorHex: "#eab308",
  },
  {
    index: 22,
    kind: "TAX",
    nameAr: "مول الكارني والضريبة",
    shortAr: "الضريبة 📝",
    emoji: "📝",
    colorHex: "#f43f5e",
  },
  {
    index: 23,
    kind: "CITY",
    nameAr: "النخيل پالميراي VIP",
    shortAr: "پالميراي",
    emoji: "👑",
    group: "ROYAL_PURPLE",
    colorHex: "#a855f7",
    price: 360,
    upgradeCost: 200,
    rents: [130, 320, 660, 1200],
  },
];

export interface HamzaCardSpec {
  id: string;
  emoji: string;
  titleAr: string;
  descAr: string;
  kind:
    | "GAIN_CASH"
    | "PAY_POT"
    | "COLLECT_FROM_ALL"
    | "GAIN_SHIELD"
    | "TELEPORT_TILE"
    | "FREE_UPGRADE";
  amount?: number;
  targetTile?: number;
}

export const HAMZA_CARDS: HamzaCardSpec[] = [
  {
    id: "hz_bouskoura",
    emoji: "🏡",
    titleAr: "بقعة أرضية فبوسكورة!",
    descAr: "بعتي همزة عقارية بالربح السريع: ربح +220 DH!",
    kind: "GAIN_CASH",
    amount: 220,
  },
  {
    id: "hz_wedding",
    emoji: "🎺",
    titleAr: "عرس مغربي كبير!",
    descAr: "درتي العرس وكل لاعب فـ الطبلة يعطيك 50 DH غرامة!",
    kind: "COLLECT_FROM_ALL",
    amount: 50,
  },
  {
    id: "hz_shield",
    emoji: "🛡️",
    titleAr: "وساطة المعارف ودرع السمسار!",
    descAr: "ربحتي درع حماية 🛡️ كيصد سطو السمسار أو كينقص الكرا النص!",
    kind: "GAIN_SHIELD",
  },
  {
    id: "hz_jalia",
    emoji: "✈️",
    titleAr: "تحويلة الجالية بالعملة الصعبة!",
    descAr: "وصلاتك ماندة ديال الأورو من الخارج: +260 DH!",
    kind: "GAIN_CASH",
    amount: 260,
  },
  {
    id: "hz_sabon_tax",
    emoji: "🧾",
    titleAr: "فاتورة الضو والويفي تراكمات!",
    descAr: "خلصتي 110 DH مشات نيشان لباركينغ الگارديناج!",
    kind: "PAY_POT",
    amount: 110,
  },
  {
    id: "hz_teleport_jamaa",
    emoji: "🐍",
    titleAr: "سفرة VIP لجامع الفنا!",
    descAr: "طير نيشان لمراكش جامع الفنا (وإلى دزتي على المانضا خوذ +250 DH)!",
    kind: "TELEPORT_TILE",
    targetTile: 16,
  },
  {
    id: "hz_teleport_jackpot",
    emoji: "🦺",
    titleAr: "صاحبك الگاردين عيّط ليك!",
    descAr: "تقدم نيشان لباركينغ الگارديناج وجمع الحصالة كاملة!",
    kind: "TELEPORT_TILE",
    targetTile: 12,
  },
  {
    id: "hz_free_upgrade",
    emoji: "🏗️",
    titleAr: "رخصة البني بالمجان!",
    descAr: "عقار عشوائي من عقاراتك كيطلع درجة (قهوة/رياض/أوطيل) فابور! (+150 DH إلى ما عندكش عقار)",
    kind: "FREE_UPGRADE",
  },
  {
    id: "hz_constat",
    emoji: "🚕",
    titleAr: "تعاويض لاصيرانس!",
    descAr: "ربحتي الدوسي ديال الكونسطا وتخلصتي بـ +180 DH!",
    kind: "GAIN_CASH",
    amount: 180,
  },
  {
    id: "hz_radar_fine",
    emoji: "📸",
    titleAr: "فلاش رادار متنقل فـ الأوطوروت!",
    descAr: "خلصتي 90 DH غرامة مشات لحصالة الگارديناج!",
    kind: "PAY_POT",
    amount: 90,
  },
  {
    id: "hz_daret",
    emoji: "💰",
    titleAr: "جات النوبة ديالك فـ 'دارت'!",
    descAr: "كل واحد فالمجموعة كيدفع ليك 45 DH ديال القرعة!",
    kind: "COLLECT_FROM_ALL",
    amount: 45,
  },
  {
    id: "hz_start_jump",
    emoji: "🚀",
    titleAr: "نهار المانضا الكبير!",
    descAr: "رجع نيشان لخانة الانطلاق وخوذ +350 DH كاش!",
    kind: "TELEPORT_TILE",
    targetTile: 0,
  },
];

export function createInitialPropertiesState(): Record<number, SimsarPropertyState> {
  const map: Record<number, SimsarPropertyState> = {};
  for (const t of SIMSAR_BOARD_TILES) {
    if (t.kind === "CITY" || t.kind === "UTILITY") {
      map[t.index] = {
        ownerId: null,
        level: 0,
        isMortgaged: false,
      };
    }
  }
  return map;
}

export function getGroupTileIndices(group: SimsarColorGroup): number[] {
  return SIMSAR_BOARD_TILES.filter((t) => t.group === group).map((t) => t.index);
}

export function ownsFullColorSet(
  ownerId: string,
  group: SimsarColorGroup | undefined,
  properties: Record<number, SimsarPropertyState>
): boolean {
  if (!group) return false;
  const indices = getGroupTileIndices(group);
  return (
    indices.length > 0 &&
    indices.every(
      (idx) => properties[idx]?.ownerId === ownerId && !properties[idx]?.isMortgaged
    )
  );
}

export function computePropertyRent(
  tileIndex: number,
  properties: Record<number, SimsarPropertyState>,
  diceTotal = 7
): number {
  const tile = SIMSAR_BOARD_TILES[tileIndex];
  const prop = properties[tileIndex];
  if (!tile || !prop || !prop.ownerId || prop.isMortgaged) return 0;

  if (tile.kind === "UTILITY") {
    const utilIndices = getGroupTileIndices("UTILITY");
    const ownedCount = utilIndices.filter(
      (i) => properties[i]?.ownerId === prop.ownerId && !properties[i]?.isMortgaged
    ).length;
    return diceTotal * (ownedCount >= 2 ? 22 : 11);
  }

  if (tile.kind === "CITY" && tile.rents) {
    const baseRent = tile.rents[prop.level] ?? tile.rents[0];
    const hasMonopoly = ownsFullColorSet(prop.ownerId, tile.group, properties);
    // Owning full color set doubles unimproved lot rent and boosts upgraded buildings by +35%!
    if (!hasMonopoly) return baseRent;
    return prop.level === 0 ? baseRent * 2 : Math.round(baseRent * 1.35);
  }

  return 0;
}

export function computePlayerNetWorth(
  player: SimsarPlayer,
  properties: Record<number, SimsarPropertyState>
): number {
  if (player.isBankrupt) return 0;
  let total = Math.max(0, player.cash);
  for (const tile of SIMSAR_BOARD_TILES) {
    const p = properties[tile.index];
    if (!p || p.ownerId !== player.id) continue;
    const basePrice = tile.price || 0;
    const val = p.isMortgaged ? Math.round(basePrice * 0.5) : basePrice;
    const upgVal = p.level * (tile.upgradeCost || 0);
    total += val + upgVal;
  }
  return total;
}

/**
 * Computes 3D world coordinates (x, z, yaw, buildingOffset) for each of the 24 perimeter tiles
 * on a 25.2m × 25.2m rounded-square island (6 steps per side, spacing = 3.6m, halfSpan = 10.8m).
 *
 * Orientation for Portrait Camera at (+0, +27, +24):
 * - Tile 0 (START) is at (+10.8, +10.8) [Front-Right]
 * - Tile 6 (JAIL) is at (-10.8, +10.8) [Front-Left]
 * - Tile 12 (JACKPOT) is at (-10.8, -10.8) [Back-Left]
 * - Tile 18 (RADAR) is at (+10.8, -10.8) [Back-Right]
 */
export interface TileWorldTransform {
  x: number;
  z: number;
  forwardYaw: number; // direction token faces when walking along the board
  outwardNx: number; // outward normal for placing 3D Café/Riad/Hotel behind the road!
  outwardNz: number;
  isCorner: boolean;
}

const HALF_SPAN = 10.8;
const STEP_SIZE = (HALF_SPAN * 2) / 6; // 3.6m per tile

export function getTileWorldTransform(index: number): TileWorldTransform {
  const norm = ((index % BOARD_TILE_COUNT) + BOARD_TILE_COUNT) % BOARD_TILE_COUNT;
  const side = Math.floor(norm / 6); // 0: South, 1: West, 2: North, 3: East
  const offset = norm % 6;
  const isCorner = offset === 0;

  if (side === 0) {
    // South edge: (+10.8, +10.8) -> (-10.8, +10.8), moving -X
    return {
      x: HALF_SPAN - offset * STEP_SIZE,
      z: HALF_SPAN,
      forwardYaw: -Math.PI / 2,
      outwardNx: 0,
      outwardNz: 1,
      isCorner,
    };
  }
  if (side === 1) {
    // West edge: (-10.8, +10.8) -> (-10.8, -10.8), moving -Z
    return {
      x: -HALF_SPAN,
      z: HALF_SPAN - offset * STEP_SIZE,
      forwardYaw: Math.PI,
      outwardNx: -1,
      outwardNz: 0,
      isCorner,
    };
  }
  if (side === 2) {
    // North edge: (-10.8, -10.8) -> (+10.8, -10.8), moving +X
    return {
      x: -HALF_SPAN + offset * STEP_SIZE,
      z: -HALF_SPAN,
      forwardYaw: Math.PI / 2,
      outwardNx: 0,
      outwardNz: -1,
      isCorner,
    };
  }
  // East edge: (+10.8, -10.8) -> (+10.8, +10.8), moving +Z
  return {
    x: HALF_SPAN,
    z: -HALF_SPAN + offset * STEP_SIZE,
    forwardYaw: 0,
    outwardNx: 1,
    outwardNz: 0,
    isCorner,
  };
}

export const BODY_TYPES = [
  { id: 'balanced', name: '균형 잡힌 체형', width: 1 },
  { id: 'slim', name: '슬림한 체형', width: 0.88 },
  { id: 'broad', name: '튼튼한 체형', width: 1.13 },
] as const;
export const SKIN_TONES = [
  { id: 'sand', name: '밝은 모래빛', color: 0xe6bd98 },
  { id: 'honey', name: '따뜻한 꿀빛', color: 0xc9946d },
  { id: 'copper', name: '구릿빛', color: 0x9a6448 },
  { id: 'umber', name: '깊은 갈색', color: 0x684333 },
] as const;
export const HAIR_STYLES = [
  { id: 'short', name: '짧은 머리' },
  { id: 'bob', name: '단발머리' },
  { id: 'tied', name: '묶은 머리' },
] as const;
export const OUTFITS = [
  { id: 'ochre', name: '노을 탐험복', color: 0xbc754c, accent: 0xe5c58c, pants: 0x394f4d },
  { id: 'forest', name: '숲길 탐험복', color: 0x507061, accent: 0xd8b879, pants: 0x384445 },
  { id: 'tide', name: '바다 탐험복', color: 0x526d87, accent: 0xe0be93, pants: 0x3e454f },
  { id: 'berry', name: '산딸기 탐험복', color: 0x8e5964, accent: 0xd3c3a4, pants: 0x414451 },
] as const;
export const HATS = [
  { id: 'brim', name: '챙 모자' },
  { id: 'beanie', name: '니트 모자' },
  { id: 'none', name: '모자 없음' },
] as const;
export interface Appearance {
  body: (typeof BODY_TYPES)[number]['id'];
  skin: (typeof SKIN_TONES)[number]['id'];
  hair: (typeof HAIR_STYLES)[number]['id'];
  outfit: (typeof OUTFITS)[number]['id'];
  hat: (typeof HATS)[number]['id'];
}
export const DEFAULT_APPEARANCE: Appearance = {
  body: 'balanced',
  skin: 'honey',
  hair: 'short',
  outfit: 'ochre',
  hat: 'brim',
};
export const CHARACTER_PRESETS: { name: string; note: string; appearance: Appearance }[] = [
  { name: '길잡이', note: '노을빛 재킷과 챙 모자', appearance: { ...DEFAULT_APPEARANCE } },
  {
    name: '숲지기',
    note: '숲빛 재킷과 묶은 머리',
    appearance: { body: 'slim', skin: 'copper', hair: 'tied', outfit: 'forest', hat: 'none' },
  },
  {
    name: '항해자',
    note: '바다빛 재킷과 니트 모자',
    appearance: { body: 'broad', skin: 'sand', hair: 'bob', outfit: 'tide', hat: 'beanie' },
  },
];
export function isAppearance(value: unknown): value is Appearance {
  if (!value || typeof value !== 'object') return false;
  const a = value as Appearance;
  return (
    BODY_TYPES.some((v) => v.id === a.body) &&
    SKIN_TONES.some((v) => v.id === a.skin) &&
    HAIR_STYLES.some((v) => v.id === a.hair) &&
    OUTFITS.some((v) => v.id === a.outfit) &&
    HATS.some((v) => v.id === a.hat)
  );
}

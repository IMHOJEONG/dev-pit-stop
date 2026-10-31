import type { ResourceKind } from '../resources/catalog';
export type ExtraItemId = 'berry' | 'ironOre' | 'ancientCoin';
export type ItemId = ResourceKind | ExtraItemId;
export type ItemCategory = 'consumable' | 'material' | 'collectible';
export const EXTRA_ITEM_IDS = ['berry', 'ironOre', 'ancientCoin'] as const;
export const ITEM_IDS = ['wood', 'stone', 'crystal', ...EXTRA_ITEM_IDS] as const;
export const CATEGORY_NAMES: Record<ItemCategory, string> = {
  consumable: '소모품',
  material: '제작 재료',
  collectible: '수집품',
};
export interface ItemDefinition {
  name: string;
  category: ItemCategory;
  description: string;
  source: string;
  color: number;
  stamina?: number;
}
/** Stable IDs are shared by loot, backpack, effects and save data. */
export const ITEMS: Record<ItemId, ItemDefinition> = {
  wood: {
    name: '목재',
    category: 'material',
    description: '관측소를 고치고 바람 상승기를 만드는 데 쓰는 나무입니다.',
    source: '나무를 베면 얻을 수 있어요.',
    color: 0xad7e4e,
  },
  stone: {
    name: '돌',
    category: 'material',
    description: '관측소의 기초와 상승기 제작에 쓰이는 단단한 돌입니다.',
    source: '바위를 채굴하면 얻을 수 있어요.',
    color: 0x91a393,
  },
  crystal: {
    name: '수정',
    category: 'material',
    description: '섬의 신호 장치와 상승기에 힘을 더하는 수정입니다.',
    source: '수정을 채굴하면 얻을 수 있어요.',
    color: 0x80d5c4,
  },
  berry: {
    name: '산열매',
    category: 'consumable',
    description: '잠깐 쉬며 먹기 좋은 새콤한 열매. 스태미나를 25 회복합니다.',
    source: '나무를 채집하다가 발견할 수 있어요.',
    color: 0xbc5263,
    stamina: 25,
  },
  ironOre: {
    name: '철광석',
    category: 'material',
    description: '철 성분이 든 묵직한 광석. 새로운 제작을 위해 모아두는 재료입니다.',
    source: '바위를 채굴하다가 발견할 수 있어요.',
    color: 0x768a96,
  },
  ancientCoin: {
    name: '옛 동전',
    category: 'collectible',
    description: '이 섬의 오래된 문양이 새겨진 동전. 수집품으로 간직해 보세요.',
    source: '수정을 채굴하다가 발견할 수 있어요.',
    color: 0xe1b660,
  },
};
export function isItemId(value: unknown): value is ItemId {
  return typeof value === 'string' && Object.hasOwn(ITEMS, value);
}
export const emptyItems = (): Record<ExtraItemId, number> => ({
  berry: 0,
  ironOre: 0,
  ancientCoin: 0,
});

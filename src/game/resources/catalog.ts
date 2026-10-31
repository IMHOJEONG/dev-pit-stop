export type ResourceKind = 'wood' | 'stone' | 'crystal';
export type Inventory = Record<ResourceKind, number>;
export type Resource = { id: number; x: number; z: number; kind: ResourceKind; scale: number };
export const RESOURCE_NAMES: Record<ResourceKind, string> = {
  wood: '목재',
  stone: '돌',
  crystal: '수정',
};

export const RESOURCE_KINDS = ['wood', 'stone', 'crystal'] as const;
export const HARVEST_RULES = {
  wood: { hits: 3, duration: 1.15, tool: 'axe', action: '도끼질', label: '나무 베기' },
  stone: { hits: 3, duration: 0.8, tool: 'pickaxe', action: '곡괭이질', label: '돌 채굴' },
  crystal: { hits: 3, duration: 0.9, tool: 'pickaxe', action: '곡괭이질', label: '수정 채굴' },
} as const;
export const HARVEST_COOLDOWN = 0.5;
export const emptyInventory = (): Inventory => ({ wood: 0, stone: 0, crystal: 0 });

import type { Inventory, ResourceKind } from '../resources/catalog';
export const LAUNCH = { x: -35, z: 125 };
export const STATIONS = [
  { name: '바람의 언덕', en: 'WINDRIDGE', x: -65, z: 75, number: '01' },
  { name: '호수의 망루', en: 'LAKEWATCH', x: 180, z: -110, number: '02' },
  { name: '구름의 봉우리', en: 'CLOUDPEAK', x: -205, z: -235, number: '03' },
];
export const REPAIR_COST: Inventory = { wood: 3, stone: 2, crystal: 1 };
export function canRepair(inventory: Inventory): boolean {
  return (Object.keys(REPAIR_COST) as ResourceKind[]).every((k) => inventory[k] >= REPAIR_COST[k]);
}

export function spendRepairCost(inventory: Inventory): Inventory | null {
  if (!canRepair(inventory)) return null;
  return { wood: inventory.wood - 3, stone: inventory.stone - 2, crystal: inventory.crystal - 1 };
}

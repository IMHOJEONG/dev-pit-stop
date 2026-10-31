export const WORLD_PLACES = [
  {
    id: 'sunset-cove',
    name: '노을빛 해안 쉼터',
    en: 'SUNSET COVE',
    x: -305,
    z: 166,
    kind: 'shelter',
    radius: 20,
    description: '해안길 끝에서 파도와 섬의 서쪽 능선을 한눈에 담는 작은 쉼터.',
  },
  {
    id: 'forest-camp',
    name: '숲속 여행자의 야영지',
    en: 'TRAVELLER’S CAMP',
    x: -312,
    z: -105,
    kind: 'camp',
    radius: 20,
    description: '오래된 길을 따라가다 만나는 불빛. 다음 고개로 가기 전 쉬어 가던 자리.',
  },
  {
    id: 'old-arches',
    name: '잊힌 돌문',
    en: 'FORGOTTEN ARCHES',
    x: -114,
    z: -62,
    kind: 'ruins',
    radius: 18,
    description: '숲과 산길이 만나는 곳에 남은 돌문. 이 섬에도 오래전 길이 있었다.',
  },
  {
    id: 'mirror-deck',
    name: '거울 호수 전망대',
    en: 'MIRROR OVERLOOK',
    x: 81,
    z: 58,
    kind: 'deck',
    radius: 14,
    description: '호수 위로 뻗은 나무 데크. 건너편 망루와 긴 다리를 바라볼 수 있다.',
  },
  {
    id: 'meadow-mill',
    name: '바람개비 들판',
    en: 'MEADOW WINDMILL',
    x: 262,
    z: 180,
    kind: 'mill',
    radius: 22,
    description: '동쪽 능선길을 지키는 낡은 풍차. 바람을 따라 해안으로 이어지는 길이 보인다.',
  },
  {
    id: 'north-stones',
    name: '북쪽 별돌 유적',
    en: 'NORTHERN STONES',
    x: 40,
    z: -342,
    kind: 'stones',
    radius: 22,
    description: '별을 향해 세운 돌기둥. 멀리 구름 봉우리와 천공의 성소가 겹쳐 보인다.',
  },
] as const;
export type PlaceId = (typeof WORLD_PLACES)[number]['id'];

/** Solid footprint pieces, leaving entrances and walking lanes open. */
export function placeBlocked(x: number, z: number, clearance = 0.55) {
  return WORLD_PLACES.some((p) => {
    const dx = x - p.x,
      dz = z - p.z;
    if (Math.hypot(dx, dz) > 12) return false;
    if (p.kind === 'mill') return Math.hypot(dx, dz) < 3.7 + clearance;
    if (p.kind === 'ruins')
      return [-5, 0, 5].some(
        (offset) => Math.abs(dx - offset) < 0.8 + clearance && Math.abs(dz) < 0.9 + clearance,
      );
    if (p.kind === 'stones')
      return Array.from({ length: 7 }, (_, i) => (i / 7) * Math.PI * 2).some(
        (a) => Math.hypot(dx - Math.sin(a) * 6, dz - Math.cos(a) * 6) < 1 + clearance,
      );
    if (p.kind === 'deck')
      return (
        (Math.abs(dx) < 1.2 + clearance && Math.abs(dz + 1.3) < 0.325 + clearance) ||
        Math.hypot(dx, dz - 1.3) < 0.2 + clearance
      );
    if ([-3, 3].some((px) => [-2, 2].some((pz) => Math.hypot(dx - px, dz - pz) < 0.2 + clearance)))
      return true;
    if (Math.abs(dx) < 2 + clearance && Math.abs(dz - 1) < 0.5 + clearance) return true;
    return (
      p.kind === 'camp' &&
      (Math.hypot(dx + 5, dz + 3) < 2.5 + clearance ||
        (Math.abs(dx - 5) < 0.75 + clearance && Math.abs(dz) < 0.5 + clearance))
    );
  });
}

/** Travel destinations are actual points on the existing island, connected to its roads. */
export const WORLD_REGIONS = [
  {
    id: 'meadow',
    name: '바람 초원',
    en: 'WINDWARD MEADOW',
    x: 0,
    z: 195,
    range: 430,
    color: '#d4d8a0',
    description: '베이스캠프와 바람개비 들판. 완만한 길에서 버기 운전을 시작해 보세요.',
    route: '캠프 → 호수 남쪽길 → 동쪽 능선길',
  },
  {
    id: 'lake',
    name: '거울 호수',
    en: 'MIRROR LAKE',
    x: 125,
    z: 130,
    range: 520,
    color: '#a1d7cf',
    description: '긴 다리와 수변 전망대 너머로 호수의 망루가 이어집니다.',
    route: '호수 남쪽길 → 거울 호수 다리 → 망루 오름길',
  },
  {
    id: 'forest',
    name: '속삭이는 숲',
    en: 'WHISPERING WOODS',
    x: -102,
    z: -60,
    range: 450,
    color: '#9bbca0',
    description: '나무 사이의 옛길과 잊힌 돌문. 갈림길에서는 속도를 줄여 보세요.',
    route: '바람의 언덕 입구 → 속삭임 숲길',
  },
  {
    id: 'mountain',
    name: '구름 산맥',
    en: 'CLOUDPEAK RANGE',
    x: -229,
    z: -188,
    range: 380,
    color: '#c7d1dd',
    description: '구불구불한 고갯길과 높은 관측소. 계단 앞에 주차하고 걸어서 올라가세요.',
    route: '속삭임 숲길 → 구름 고갯길',
  },
  {
    id: 'coast',
    name: '코랄 해안',
    en: 'CORAL COAST',
    x: -305,
    z: 154,
    range: 420,
    color: '#e6c898',
    description: '서쪽 해안의 노을빛 쉼터와 여행자의 야영지. 바닷물에는 진입할 수 없어요.',
    route: '바람의 언덕 입구 → 서쪽 해안길',
  },
] as const;
export function navigationPoint(
  navigation: { kind: 'station' | 'place' | 'region'; index: number },
  stations: readonly { x: number; z: number; name: string }[],
  places: readonly { x: number; z: number; name: string }[],
) {
  return navigation.kind === 'station'
    ? stations[navigation.index]
    : navigation.kind === 'place'
      ? places[navigation.index]
      : WORLD_REGIONS[navigation.index];
}

import type { Inventory } from '../resources/catalog';
import { ISLANDS, LAUNCH, RUNES, SUMMIT, ridePosition } from './sky-world';
export interface SkySave {
  built: boolean;
  runes: number;
  complete: boolean;
  inSky: boolean;
}
export class SkyJourney {
  built = false;
  runes = 0;
  complete = false;
  inSky = false;
  ride: { elapsed: number; descending: boolean } | null = null;
  build(inventory: Inventory, repaired: number) {
    if (
      this.built ||
      repaired < 1 ||
      inventory.wood < 2 ||
      inventory.stone < 1 ||
      inventory.crystal < 1
    )
      return false;
    inventory.wood -= 2;
    inventory.stone--;
    inventory.crystal--;
    this.built = true;
    return true;
  }
  startRide() {
    if (!this.built || this.ride) return false;
    this.ride = { elapsed: 0, descending: this.inSky };
    return true;
  }
  advanceRide(dt: number) {
    if (!this.ride) return null;
    this.ride.elapsed += dt;
    const progress = Math.min(1, this.ride.elapsed / 8),
      position = ridePosition(progress, this.ride.descending);
    const done = progress === 1;
    if (done) {
      this.inSky = !this.ride.descending;
      this.ride = null;
    }
    return { position, done, progress };
  }
  activate(index: number) {
    if (!this.inSky || index !== this.runes || this.runes >= 3) return false;
    this.runes++;
    return true;
  }
  finish() {
    if (!this.inSky || this.runes !== 3 || this.complete) return false;
    this.complete = true;
    return true;
  }
  checkpoint() {
    return ISLANDS[Math.max(0, this.runes - 1)];
  }
  objective(repaired: number) {
    if (this.complete)
      return {
        title: '천공 신호 연결 완료',
        detail: '지상과 하늘의 모든 길을 자유롭게 탐험하세요',
        point: SUMMIT,
        step: 6,
      };
    if (repaired < 1)
      return {
        title: '첫 관측소 복구',
        detail: '목재 3 · 돌 2 · 수정 1을 모아 바람의 언덕으로',
        point: { x: -65, z: 75, y: 25 },
        step: 0,
      };
    if (!this.built)
      return {
        title: '바람 상승기 제작',
        detail: '상승장으로 이동 · 목재 2 · 돌 1 · 수정 1 필요',
        point: { ...LAUNCH, y: 30 },
        step: 1,
      };
    if (!this.inSky)
      return {
        title: '구름 위로 올라가기',
        detail: '상승기 위에서 E · 8초 동안 하늘로 상승',
        point: { ...LAUNCH, y: 30 },
        step: 2,
      };
    if (this.runes < 3)
      return {
        title: `${this.runes + 1}번째 바람 룬 활성화`,
        detail: `${RUNES[this.runes].name} · 끊어진 다리는 Space로 점프`,
        point: RUNES[this.runes],
        step: 3 + this.runes,
      };
    return {
      title: '천공의 성소 점화',
      detail: '마지막 섬의 별빛 제단에서 E · 최종 신호 연결',
      point: SUMMIT,
      step: 6,
    };
  }
  snapshot(): SkySave {
    return { built: this.built, runes: this.runes, complete: this.complete, inSky: this.inSky };
  }
  restore(data?: SkySave) {
    this.built = data?.built ?? false;
    this.runes = data?.runes ?? 0;
    this.complete = data?.complete ?? false;
    this.inSky = data?.inSky ?? false;
    this.ride = null;
  }
}

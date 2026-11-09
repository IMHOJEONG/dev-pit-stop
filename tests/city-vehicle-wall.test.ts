import { describe, expect, it } from 'vite-plus/test';
import { CITY_LAYOUT } from '../src/game/city/layout';
import { VehicleController } from '../src/game/vehicles/vehicle-controller';

const dt = 1 / 60;

describe('City View wall contact', () => {
  it.each([
    { side: -1, throttle: 1, x: 8, wallX: 14.5 },
    { side: 1, throttle: 1, x: 48, wallX: 41.5 },
    { side: -1, throttle: -1, x: 8, wallX: 14.5 },
    { side: 1, throttle: -1, x: 48, wallX: 41.5 },
  ])('steers away on side $side with throttle $throttle', ({ side, throttle, x, wallX }) => {
    const vehicle = new VehicleController([], new Set(), CITY_LAYOUT);
    vehicle.restore({ x, z: 28, heading: side * throttle * 0.35, riding: true });
    for (let frame = 0; frame < 240 && !vehicle.blocked; frame++)
      vehicle.update(dt, throttle, 0, false);
    expect(vehicle.blocked).toBe(true);
    const contactZ = vehicle.position.z;

    for (let frame = 0; frame < 70; frame++) {
      vehicle.update(dt, throttle, side, false);
      expect(vehicle.canOccupy(vehicle.position.x, vehicle.position.z)).toBe(true);
      if (vehicle.position.z >= 17 && vehicle.position.z <= 39) {
        const reach =
          2.2 * Math.abs(Math.cos(vehicle.heading)) + 2.85 * Math.abs(Math.sin(vehicle.heading));
        expect(side * (vehicle.position.x - wallX) + 1e-8).toBeGreaterThanOrEqual(reach);
      }
    }
    expect(-throttle * (vehicle.position.z - contactZ)).toBeGreaterThan(4);
    expect(-side * throttle * vehicle.heading).toBeGreaterThan(0.3);
    expect(vehicle.blocked).toBe(false);
  });

  it('allows a parallel pass near a wall and stops the bumper from backing into it', () => {
    const vehicle = new VehicleController([], new Set(), CITY_LAYOUT);
    expect(vehicle.canOccupy(12.2, 28, 0)).toBe(true);
    expect(vehicle.canOccupy(12.2, 28, Math.PI / 2)).toBe(false);
    vehicle.restore({ x: 12.2, z: 28, heading: 0, riding: true });
    for (let frame = 0; frame < 60; frame++) vehicle.update(dt, 1, 0, false);
    expect(vehicle.position.x).toBe(12.2);
    expect(vehicle.position.z).toBeLessThan(24);
    expect(vehicle.blocked).toBe(false);
  });

  it('restores a legacy diagonal parking pose just clear of the wall', () => {
    const vehicle = new VehicleController([], new Set(), CITY_LAYOUT);
    const saved = { x: 11.55, z: 28, heading: Math.PI / 4, riding: true };
    expect(CITY_LAYOUT.blocked(saved.x, saved.z, Math.hypot(1.65, 2.4))).toBe(false);
    expect(vehicle.canOccupy(saved.x, saved.z, saved.heading)).toBe(false);
    vehicle.restore(saved);
    expect(vehicle.riding).toBe(true);
    expect(vehicle.heading).toBe(saved.heading);
    expect(Math.hypot(vehicle.position.x - saved.x, vehicle.position.z - saved.z)).toBeLessThan(1);
    expect(vehicle.canOccupy(vehicle.position.x, vehicle.position.z)).toBe(true);
  });
});

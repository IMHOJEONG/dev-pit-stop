import { describe, expect, it } from 'vitest';
import { CITY_BUILDINGS, CITY_LAYOUT, CITY_SIZE, ROAD_AXES } from '../src/game/city/layout';
import { PlayerController } from '../src/game/player/player-controller';
import { VehicleController } from '../src/game/vehicles/vehicle-controller';

describe('City View play area', () => {
  it('keeps roads and the entry open and derives solid walls from each building', () => {
    const { spawn, garage, blocked } = CITY_LAYOUT;
    expect(blocked(spawn.x, spawn.z, 0.65)).toBe(false);
    const vehicle = new VehicleController([], new Set(), CITY_LAYOUT);
    expect(vehicle.canOccupy(garage.x, garage.z)).toBe(true);
    for (const axis of ROAD_AXES) {
      for (let along = -88; along <= 88; along++) {
        expect(vehicle.canOccupy(axis, along)).toBe(true);
        expect(vehicle.canOccupy(along, axis)).toBe(true);
      }
    }
    for (const building of CITY_BUILDINGS) {
      expect(blocked(building.x, building.z, 0.65)).toBe(true);
      expect(vehicle.canOccupy(building.x, building.z)).toBe(false);
    }
    expect(vehicle.canOccupy(CITY_SIZE / 2, 0)).toBe(false);
  });

  it('walks and jumps on the city floor and stops at a building', () => {
    const player = new PlayerController(
      [],
      new Set(),
      () => {},
      () => false,
      CITY_LAYOUT,
    );
    player.reset(28, 9);
    player.jump();
    for (let frame = 0; frame < 120; frame++) player.update(1 / 60, 0, -1, 0, false);
    expect(player.position.y).toBe(CITY_LAYOUT.height);
    expect(player.isGrounded).toBe(true);
    expect(player.position.z).toBeGreaterThan(12);
    expect(player.position.z).toBeLessThanOrEqual(13.35);
  });

  it('allows boarding, forward and reverse travel, and a safe exit', () => {
    const vehicle = new VehicleController([], new Set(), CITY_LAYOUT);
    const player = new PlayerController(
      [],
      new Set(),
      () => {},
      () => false,
      CITY_LAYOUT,
    );
    expect(vehicle.boardingApproach(player.position)).toEqual([]);
    expect(vehicle.board(player.position)).toBe(true);
    const startZ = vehicle.position.z;
    for (let frame = 0; frame < 90; frame++) vehicle.update(1 / 60, 1, 0, false);
    expect(vehicle.position.z).toBeLessThan(startZ - 5);
    for (let frame = 0; frame < 120; frame++) vehicle.update(1 / 60, -1, 0, false);
    expect(vehicle.speed).toBeLessThan(0);
    expect(vehicle.exit()).toBeNull();
    for (let frame = 0; frame < 60; frame++) vehicle.update(1 / 60, 0, 0, true);
    const exit = vehicle.exit();
    expect(exit).not.toBeNull();
    expect(CITY_LAYOUT.blocked(exit!.x, exit!.z, 0.65)).toBe(false);
  });
});

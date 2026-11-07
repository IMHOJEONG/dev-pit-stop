import { CITY_BUILDINGS, CITY_SIZE, CITY_SPACES, ROAD_AXES, ROAD_WIDTH } from './layout';
import type { CityLot } from './layout';

type Point = { x: number; z: number };

export function drawCityMap(canvas: HTMLCanvasElement, player: Point, vehicle: Point) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  const scale = (Math.min(width, height) - 32) / CITY_SIZE;
  const x = (world: number) => width / 2 + world * scale;
  const z = (world: number) => height / 2 + world * scale;
  const rect = (lot: CityLot, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(
      x(lot.x - lot.width / 2),
      z(lot.z - lot.depth / 2),
      lot.width * scale,
      lot.depth * scale,
    );
  };
  ctx.fillStyle = '#253943';
  ctx.fillRect(0, 0, width, height);
  rect({ x: 0, z: 0, width: CITY_SIZE, depth: CITY_SIZE }, '#8a8981');
  for (const axis of ROAD_AXES) {
    rect({ x: axis, z: 0, width: ROAD_WIDTH, depth: CITY_SIZE - 3 }, '#303c44');
    rect({ x: 0, z: axis, width: CITY_SIZE - 3, depth: ROAD_WIDTH }, '#303c44');
  }
  for (const building of CITY_BUILDINGS) rect(building, '#576367');
  for (const space of CITY_SPACES) {
    rect(space, space.x < 0 ? '#506b55' : '#735c49');
    ctx.fillStyle = '#fff0d5';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 15px system-ui';
    ctx.fillText(space.name, x(space.x), z(space.z));
  }
  ctx.fillStyle = '#ffcd79';
  ctx.fillRect(x(vehicle.x) - 6, z(vehicle.z) - 6, 12, 12);
  ctx.beginPath();
  ctx.arc(x(player.x), z(player.z), 5, 0, Math.PI * 2);
  ctx.fillStyle = '#c2ffed';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#1d3e38';
  ctx.stroke();
}

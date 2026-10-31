import { WORLD_REGIONS, navigationPoint } from '../world/regions';
import { WORLD_ROUTES, landSurface } from '../world/routes';
import { WORLD_PLACES } from '../world/places';
import { ISLANDS, LAUNCH } from '../sky/sky-world';
import * as THREE from 'three';
import { WORLD_SIZE, SPAWN } from '../world/terrain';
import { STATIONS } from '../world/landmarks';
import { terrainColor } from '../world/terrain-view';
import { clamp } from '../shared/math';
import type { ExpeditionState } from './expedition-state';
export interface MapOptions {
  layer?: 'ground' | 'sky';
  focus?: { x: number; z: number };
  range?: number;
  region?: number;
}
export class MapView {
  private mapBase = document.createElement('canvas');
  constructor(private expedition: ExpeditionState) {
    this.mapBase.width = this.mapBase.height = 512;
    const ctx = this.mapBase.getContext('2d')!,
      img = ctx.createImageData(512, 512);
    for (let y = 0; y < 512; y++)
      for (let x = 0; x < 512; x++) {
        const wx = (x / 512 - 0.5) * WORLD_SIZE,
          wz = (y / 512 - 0.5) * WORLD_SIZE,
          h = landSurface(wx, wz);
        const c = h < 0 ? new THREE.Color('#56857c') : terrainColor(wx, wz, h);
        const shade = clamp(1 + (h - landSurface(wx - 2, wz - 2)) * 0.05, 0.75, 1.14);
        c.multiplyScalar(shade).convertLinearToSRGB();
        const i = (y * 512 + x) * 4;
        img.data[i] = c.r * 255;
        img.data[i + 1] = c.g * 255;
        img.data[i + 2] = c.b * 255;
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
  }
  draw(
    canvas: HTMLCanvasElement,
    full: boolean,
    position: { x: number; z: number },
    yaw: number,
    options: MapOptions = {},
  ) {
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width,
      h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const skyLayer = options.layer ? options.layer === 'sky' : this.expedition.sky.inSky;
    if (skyLayer) {
      ctx.fillStyle = '#516a89';
      ctx.fillRect(0, 0, w, h);
      const minX = Math.min(...ISLANDS.map((i) => i.x - i.radius)),
        maxX = Math.max(...ISLANDS.map((i) => i.x + i.radius)),
        minZ = Math.min(...ISLANDS.map((i) => i.z - i.radius)),
        maxZ = Math.max(...ISLANDS.map((i) => i.z + i.radius));
      const scale = Math.min((w - 40) / (maxX - minX), (h - 40) / (maxZ - minZ));
      const px = (x: number) => (x - minX) * scale + (w - (maxX - minX) * scale) / 2,
        pz = (z: number) => (z - minZ) * scale + (h - (maxZ - minZ) * scale) / 2;
      ctx.strokeStyle = '#e8d79c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ISLANDS.forEach((island, i) => {
        if (i === 0) ctx.moveTo(px(island.x), pz(island.z));
        else ctx.lineTo(px(island.x), pz(island.z));
      });
      ctx.stroke();
      ISLANDS.forEach((island, i) => {
        ctx.fillStyle = i < this.expedition.sky.runes ? '#9de7c2' : '#a6b8ad';
        ctx.beginPath();
        ctx.arc(px(island.x), pz(island.z), island.radius * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f6e3ac';
        ctx.font = `${full ? 16 : 8}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(island.name, px(island.x), pz(island.z));
      });
      if (!this.expedition.sky.inSky) return;
      ctx.fillStyle = '#fff7d0';
      ctx.beginPath();
      ctx.arc(px(position.x), pz(position.z), 5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const verticalRange = full ? (options.range ?? WORLD_SIZE) : 390;
    const range = full ? (verticalRange * w) / h : 390;
    const centerX = full ? (options.focus?.x ?? 0) : position.x,
      centerZ = full ? (options.focus?.z ?? 0) : position.z;
    const px = (x: number) => ((x - centerX) / range) * w + w / 2;
    const pz = (z: number) => ((z - centerZ) / verticalRange) * h + h / 2;
    ctx.fillStyle = '#56857c';
    ctx.fillRect(0, 0, w, h);
    const sx = (centerX / WORLD_SIZE + 0.5) * 512 - (range / WORLD_SIZE) * 256;
    const sy = (centerZ / WORLD_SIZE + 0.5) * 512 - (verticalRange / WORLD_SIZE) * 256;
    ctx.drawImage(
      this.mapBase,
      sx,
      sy,
      (range / WORLD_SIZE) * 512,
      (verticalRange / WORLD_SIZE) * 512,
      0,
      0,
      w,
      h,
    );
    ctx.strokeStyle = '#f1f2d71a';
    ctx.lineWidth = 1;
    const grid = full ? 100 : 50;
    for (let i = -600; i <= 600; i += grid) {
      ctx.beginPath();
      ctx.moveTo(px(i), 0);
      ctx.lineTo(px(i), h);
      ctx.moveTo(0, pz(i));
      ctx.lineTo(w, pz(i));
      ctx.stroke();
    }
    if (full) {
      ctx.fillStyle = '#243e3a28';
      for (const key of this.expedition.visited) {
        const [x, z] = key.split(',').map(Number);
        ctx.fillRect(px(x * 20), pz(z * 20), (20 / range) * w, (20 / verticalRange) * h);
      }
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    for (const route of WORLD_ROUTES) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash(route.kind === 'trail' ? [3, 3] : []);
      ctx.strokeStyle = '#2c443a88';
      ctx.lineWidth = full ? 4 : 3;
      ctx.beginPath();
      route.points.forEach((p, i) =>
        i === 0 ? ctx.moveTo(px(p.x), pz(p.z)) : ctx.lineTo(px(p.x), pz(p.z)),
      );
      ctx.stroke();
      ctx.strokeStyle =
        route.kind === 'bridge' ? '#a9e2e2' : route.kind === 'trail' ? '#dbcb9c' : '#ead7a5';
      ctx.lineWidth = full ? 2.3 : 1.6;
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const place of WORLD_PLACES) {
      const discovered = this.expedition.discoveries.has(place.id),
        x = px(place.x),
        y = pz(place.z);
      if (x < 0 || x > w || y < 0 || y > h) continue;
      ctx.fillStyle = discovered ? '#a7ebcc' : '#ebd499';
      ctx.strokeStyle = '#294338';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, full ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (full) {
        ctx.fillStyle = '#263e31';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(discovered ? '◇' : '?', x, y + 3);
        if (discovered) {
          ctx.fillStyle = '#f2efd5';
          ctx.font = '13px sans-serif';
          ctx.fillText(place.name, x, y + 17);
        }
      }
    }
    const navigation = this.expedition.navigation;
    if (navigation) {
      const p = navigationPoint(navigation, STATIONS, WORLD_PLACES);
      ctx.strokeStyle = '#fff6c4';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(px(p.x), pz(p.z), full ? 12 : 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (full)
      for (const [i, region] of WORLD_REGIONS.entries()) {
        const x = px(region.x),
          y = pz(region.z);
        if (x < 0 || x > w || y < 0 || y > h) continue;
        ctx.font = 'bold 18px sans-serif';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#203c36';
        ctx.lineWidth = 4;
        ctx.strokeText(region.name, x, y + 35);
        ctx.fillStyle = region.color;
        ctx.fillText(region.name, x, y + 35);
        if (options.region === i) {
          ctx.strokeStyle = '#fff1b7';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, 18, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    const vehicle = this.expedition.vehicle;
    ctx.save();
    ctx.translate(px(vehicle.position.x), pz(vehicle.position.z));
    ctx.rotate(-vehicle.heading);
    ctx.fillStyle = '#f1c37b';
    ctx.strokeStyle = '#274638';
    ctx.lineWidth = 2;
    ctx.fillRect(-5, -7, 10, 14);
    ctx.strokeRect(-5, -7, 10, 14);
    ctx.restore();
    if (full) {
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#fff1c0';
      ctx.textAlign = 'left';
      ctx.fillText('탐험 버기', px(vehicle.position.x) + 10, pz(vehicle.position.z) - 7);
    }
    ctx.restore();
    STATIONS.forEach((s, i) => {
      const x = px(s.x),
        y = pz(s.z);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = this.expedition.repaired.has(i) ? '#9ae6c7' : '#f4d391';
      ctx.strokeStyle = '#284839';
      ctx.lineWidth = full ? 2 : 1;
      ctx.fillRect(-4, -4, 8, 8);
      ctx.strokeRect(-4, -4, 8, 8);
      ctx.restore();
      if (full) {
        ctx.fillStyle = '#eff1d9';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(s.name, x, y - 13);
      }
    });
    ctx.fillStyle = '#a3eaff';
    ctx.beginPath();
    ctx.arc(px(LAUNCH.x), pz(LAUNCH.z), 5, 0, Math.PI * 2);
    ctx.fill();
    if (full) {
      ctx.font = '14px sans-serif';
      ctx.fillText('↑ 하늘 상승장', px(LAUNCH.x) + 10, pz(LAUNCH.z));
    }
    ctx.fillStyle = '#f5eed1';
    ctx.beginPath();
    ctx.arc(px(SPAWN.x), pz(SPAWN.z), full ? 3 : 2, 0, Math.PI * 2);
    ctx.fill();
    if (this.expedition.sky.inSky) return;
    ctx.save();
    ctx.translate(px(position.x), pz(position.z));
    ctx.fillStyle = '#fff7cd';
    ctx.strokeStyle = '#315945';
    ctx.lineWidth = 2;
    ctx.rotate(-yaw);
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

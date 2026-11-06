import * as THREE from 'three';
import { expect, it } from 'vite-plus/test';
import { tileTerrainGeometry } from '../src/game/world/terrain-view';

it('keeps every terrain triangle and vertex attribute at partial tile borders', () => {
  const source = new THREE.PlaneGeometry(24, 24, 8, 8).rotateX(-Math.PI / 2);
  const positions = source.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    positions.setY(i, Math.sin(i / 7));
    colors.set([i / positions.count, 0.3, 0.7], i * 3);
  }
  source.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  source.computeVertexNormals();
  const tiles = tileTerrainGeometry(source, 8, 3);
  const triangles = (geometry: THREE.BufferGeometry) => {
    const index = geometry.index!;
    const attributes = Object.values(geometry.attributes);
    const result: string[] = [];
    for (let i = 0; i < index.count; i += 3) {
      const corners = [];
      for (let j = 0; j < 3; j++) {
        const vertex = index.getX(i + j);
        corners.push(
          attributes
            .map((a) =>
              Array.from(a.array.subarray(vertex * a.itemSize, (vertex + 1) * a.itemSize)).join(
                ',',
              ),
            )
            .join('/'),
        );
      }
      result.push(corners.join(';'));
    }
    return result;
  };
  expect(tiles).toHaveLength(9);
  expect(tiles.flatMap(triangles).sort()).toEqual(triangles(source).sort());
  expect(tiles.every((tile) => tile.boundingBox!.max.x - tile.boundingBox!.min.x <= 9)).toBe(true);
  for (const tile of tiles) tile.dispose();
  source.dispose();
});

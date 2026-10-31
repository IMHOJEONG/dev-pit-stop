import * as THREE from 'three';
import { terrainHeight } from '../world/terrain';
import { clamp } from '../shared/math';
import { MeshCameraCollision } from './mesh-camera-collision';
import { cameraClearance } from './camera-collision';
import type { Resource } from '../resources/catalog';
export class CameraController {
  yaw = 0.06;
  private pitch = 0.18;
  private zoom = 38;
  private meshCollision: MeshCameraCollision;
  private previousPlayerY: number;
  private cameraTarget = new THREE.Vector3();
  private cameraPosition = new THREE.Vector3();
  constructor(
    private camera: THREE.PerspectiveCamera,
    private resources: Resource[],
    private collected: Set<number>,
    position: THREE.Vector3,
    obstacles: THREE.Object3D[] = [],
  ) {
    this.meshCollision = new MeshCameraCollision(obstacles);
    this.previousPlayerY = position.y;
    this.cameraTarget.copy(position).add(new THREE.Vector3(0, 3.3, 0));
    this.update(position, 1);
  }
  rotate(dx: number, dy: number) {
    this.yaw -= dx * 0.005;
    this.pitch = clamp(this.pitch + dy * 0.004, 0.1, 1.1);
  }
  zoomBy(delta: number) {
    this.zoom = clamp(this.zoom + delta * 0.025, 12, 65);
  }
  update(player: THREE.Vector3, dt: number, riding = false) {
    const fov = THREE.MathUtils.lerp(this.camera.fov, riding ? 75 : 55, 1 - Math.exp(-dt * 8));
    if (Math.abs(fov - this.camera.fov) > 0.001) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const target = player.clone().add(new THREE.Vector3(0, riding ? 2.2 : 3.3, 0));
    if (riding) {
      // Carry the camera with the platform instead of lagging into the island.
      this.camera.position.y += player.y - this.previousPlayerY;
      this.cameraTarget.y = target.y;
    }
    this.previousPlayerY = player.y;
    this.cameraTarget.lerp(target, 1 - Math.exp(-dt * 9));
    this.cameraPosition.set(
      player.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.zoom,
      player.y + Math.sin(this.pitch) * this.zoom + 4,
      player.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.zoom,
    );
    this.cameraPosition.y = Math.max(
      this.cameraPosition.y,
      terrainHeight(this.cameraPosition.x, this.cameraPosition.z) + 3,
    );
    const padding = Math.max(
      0.65,
      this.camera.near *
        Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) *
        Math.hypot(1, this.camera.aspect) +
        0.2,
    );
    const clearance = Math.min(
      cameraClearance(target, this.cameraPosition, this.resources, this.collected),
      this.meshCollision.clearance(target, this.cameraPosition, padding),
    );
    this.cameraPosition.lerpVectors(target, this.cameraPosition, clearance);
    this.camera.position.lerp(this.cameraPosition, 1 - Math.exp(-dt * 8));
    // Smoothing can otherwise leave the actual camera on the far side of a wall.
    const safe = this.meshCollision.clearance(target, this.camera.position, padding);
    this.camera.position.lerpVectors(target, this.camera.position, safe);
    this.camera.lookAt(this.cameraTarget);
  }
}

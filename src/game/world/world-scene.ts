import { RouteView } from './route-view';
import { PlaceView } from './place-view';
import { SkyView } from '../sky/sky-view';
import * as THREE from 'three';
import type { Resource } from '../resources/catalog';
import { ResourceView } from '../resources/resource-view';
import { PlayerView } from '../player/player-view';
import { EnvironmentView } from './environment-view';
import { StructuresView } from './structures-view';
import { createTerrain, createGrass } from './terrain-view';
import { disposeScene } from '../shared/dispose';

/** Composes domain views; gameplay state lives outside Three.js. */
export class WorldScene {
  readonly sky: SkyView;
  readonly routes: RouteView;
  readonly places: PlaceView;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.3, 2400);
  readonly resources: ResourceView;
  readonly player: PlayerView;
  readonly structures: StructuresView;
  readonly environment: EnvironmentView;
  constructor(resources: Resource[]) {
    this.environment = new EnvironmentView(this.scene);
    createTerrain(this.scene);
    createGrass(this.scene);
    this.resources = new ResourceView(this.scene, resources);
    this.structures = new StructuresView(this.scene);
    this.routes = new RouteView(this.scene);
    this.places = new PlaceView(this.scene);
    this.player = new PlayerView(this.scene);
    this.sky = new SkyView(this.scene);
  }
  update(
    t: number,
    dt: number,
    time: number,
    position: THREE.Vector3,
    moving: boolean,
    speed: number,
    heading: number,
    elevated = false,
    grounded?: boolean,
    platformHeight?: number,
  ) {
    this.resources.update(t, dt);
    this.environment.update(t, dt, time, position);
    this.structures.update(t);
    this.places.update(t);
    if (moving) this.player.group.rotation.y = heading;
    this.player.update(t, position, moving, speed, elevated, { grounded, platformHeight });
  }
  dispose() {
    disposeScene(this.scene);
  }
}

import * as THREE from 'three';
export class GameRenderer {
  readonly renderer: THREE.WebGLRenderer;
  constructor(
    canvas: HTMLCanvasElement,
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.setQuality(true);
  }
  get highQuality() {
    return this.renderer.shadowMap.enabled;
  }
  setQuality(high: boolean) {
    this.renderer.shadowMap.enabled = high;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 1.7 : 1));
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh)
        for (const material of Array.isArray(obj.material) ? obj.material : [obj.material])
          material.needsUpdate = true;
    });
    this.resize();
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
  render() {
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.renderer.dispose();
  }
}

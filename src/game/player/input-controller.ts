import { $ } from '../ui/dom';
export type InputAction = 'pause' | 'map' | 'bag' | 'photo' | 'jump' | 'interact';
interface InputCallbacks {
  paused(): boolean;
  action(action: InputAction): void;
  rotate(dx: number, dy: number): void;
  zoom(delta: number): void;
}
export class InputController {
  private keys = new Set<string>();
  private abort = new AbortController();
  private dragging: { x: number; y: number } | null = null;
  constructor(canvas: HTMLCanvasElement, callbacks: InputCallbacks) {
    const signal = this.abort.signal;
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
        if (
          ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) &&
          document.activeElement === canvas
        )
          e.preventDefault();
        if (e.repeat) return;
        const actions: Record<string, InputAction> = {
          Escape: 'pause',
          KeyM: 'map',
          KeyB: 'bag',
          KeyH: 'photo',
          Space: 'jump',
          KeyE: 'interact',
        };
        if (e.code === 'Escape') e.preventDefault();
        const action = actions[e.code];
        if (action) callbacks.action(action);
        if (!callbacks.paused()) this.keys.add(e.code);
      },
      { signal },
    );
    window.addEventListener('keyup', (e) => this.keys.delete(e.code), { signal });
    window.addEventListener('blur', () => this.clear(), { signal });
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        if (e.button !== 0 && e.button !== 2) return;
        this.dragging = { x: e.clientX, y: e.clientY };
        canvas.setPointerCapture(e.pointerId);
        canvas.focus();
      },
      { signal },
    );
    canvas.addEventListener(
      'pointermove',
      (e) => {
        if (!this.dragging) return;
        callbacks.rotate(e.clientX - this.dragging.x, e.clientY - this.dragging.y);
        this.dragging = { x: e.clientX, y: e.clientY };
      },
      { signal },
    );
    for (const event of ['pointerup', 'pointercancel'])
      canvas.addEventListener(
        event,
        () => {
          this.dragging = null;
        },
        { signal },
      );
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        callbacks.zoom(e.deltaY);
      },
      { signal, passive: false },
    );
    $('touch-jump').addEventListener('pointerdown', () => callbacks.action('jump'), { signal });
    $('touch-interact').addEventListener('click', () => callbacks.action('interact'), { signal });
    document.querySelectorAll<HTMLButtonElement>('[data-key]').forEach((button) => {
      button.addEventListener(
        'pointerdown',
        (e) => {
          button.setPointerCapture(e.pointerId);
          if (!callbacks.paused()) this.keys.add(button.dataset.key!);
        },
        { signal },
      );
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
        button.addEventListener(event, () => this.keys.delete(button.dataset.key!), { signal });
    });
  }
  get axes() {
    return {
      forward:
        Number(this.keys.has('KeyW') || this.keys.has('ArrowUp')) -
        Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')),
      right:
        Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) -
        Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft')),
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
    };
  }
  clear() {
    this.keys.clear();
    this.dragging = null;
  }
  dispose() {
    this.abort.abort();
    this.clear();
  }
}

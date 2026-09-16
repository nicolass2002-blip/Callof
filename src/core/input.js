// Keyboard + mouse, pointer-lock aware. Supports QWERTY and AZERTY layouts
// by reading `event.code` (physical key) rather than the produced character.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();       // edge-triggered, cleared each frame
    this.mouse = { dx: 0, dy: 0, wheel: 0 };
    this.buttons = [false, false, false];
    this.clicked = [false, false, false];
    this.sensitivity = 1;
    this.locked = false;
    this.enabled = true;

    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || (e.code === 'Space' && this.locked)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.buttons = [false, false, false]; });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      e.preventDefault();
      if (e.button < 3) { this.buttons[e.button] = true; this.clicked[e.button] = true; }
    });
    addEventListener('mouseup', (e) => { if (e.button < 3) this.buttons[e.button] = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    });
    addEventListener('wheel', (e) => {
      if (!this.locked) return;
      e.preventDefault();
      this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: false });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.keys.clear(); this.buttons = [false, false, false]; }
      this.onLockChange?.(this.locked);
    });
  }

  lock() { this.canvas.requestPointerLock?.(); }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  /** true while any of the given physical keys is held */
  any(...codes) { return codes.some((c) => this.keys.has(c)); }
  anyHit(...codes) { return codes.some((c) => this.pressed.has(c)); }

  /** Movement intent in local space: x = strafe, y = forward. AZERTY friendly. */
  moveAxis() {
    const fwd = (this.any('KeyW', 'KeyZ', 'ArrowUp') ? 1 : 0) - (this.any('KeyS', 'ArrowDown') ? 1 : 0);
    const str = (this.any('KeyD', 'ArrowRight') ? 1 : 0) - (this.any('KeyA', 'KeyQ', 'ArrowLeft') ? 1 : 0);
    const len = Math.hypot(fwd, str) || 1;
    return { x: str / len, y: fwd / len, moving: fwd !== 0 || str !== 0 };
  }

  /** Consume accumulated mouse delta (radians). */
  look() {
    const s = 0.0018 * this.sensitivity;
    const out = { yaw: -this.mouse.dx * s, pitch: -this.mouse.dy * s };
    this.mouse.dx = this.mouse.dy = 0;
    return out;
  }

  endFrame() {
    this.pressed.clear();
    this.clicked = [false, false, false];
    this.mouse.wheel = 0;
  }
}

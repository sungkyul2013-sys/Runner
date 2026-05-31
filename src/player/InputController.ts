/** Discrete movement intents emitted by the input layer. */
export type Intent = 'left' | 'right' | 'jump' | 'slide' | 'confirm' | 'deploy';

export type IntentListener = (intent: Intent) => void;

/**
 * Unifies keyboard and touch/pointer input into discrete {@link Intent}s, so
 * the rest of the game never touches raw DOM events. Reusable across menus and
 * gameplay (the `confirm` intent doubles as menu-select / restart).
 *
 * - Keyboard: Arrow keys + WASD, plus Space/Enter for confirm.
 * - Touch/pointer: swipe gestures. Diagonal swipes resolve to their dominant
 *   axis, so a sloppy diagonal still reliably triggers a lane move or jump/slide
 *   (satisfies the "diagonal swipe" requirement). A short tap fires `confirm`.
 */
export class InputController {
  private readonly listeners = new Set<IntentListener>();
  private readonly target: HTMLElement;

  // Active swipe tracking.
  private swiping = false;
  private startX = 0;
  private startY = 0;
  private startT = 0;
  /** Timestamp of the last tap, for double-tap (→ deploy) detection. */
  private lastTapT = 0;
  private readonly doubleTapMs = 280;

  /** Minimum pointer travel (px) before a gesture counts as a swipe. */
  private readonly swipeThreshold = 28;
  /** Max duration (ms) for a near-stationary press to count as a tap. */
  private readonly tapMaxMs = 250;
  /** Max travel (px) for a press to still count as a tap. */
  private readonly tapMaxDist = 16;

  constructor(target: HTMLElement = document.body) {
    this.target = target;
    window.addEventListener('keydown', this.onKeyDown);
    this.target.addEventListener('pointerdown', this.onPointerDown);
    this.target.addEventListener('pointerup', this.onPointerUp);
    this.target.addEventListener('pointercancel', this.onPointerCancel);
  }

  onIntent(fn: IntentListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(intent: Intent): void {
    for (const fn of this.listeners) fn(intent);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.emit('left');
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.emit('right');
        break;
      case 'ArrowUp':
      case 'KeyW':
        this.emit('jump');
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.emit('slide');
        break;
      case 'KeyE':
      case 'ShiftLeft':
      case 'ShiftRight':
        this.emit('deploy');
        break;
      case 'Space':
      case 'Enter':
        // Space jumps during play but also confirms (restart). Emit both;
        // listeners act based on current game state.
        this.emit('confirm');
        this.emit('jump');
        e.preventDefault();
        break;
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.swiping = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.startT = performance.now();
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.swiping) return;
    this.swiping = false;

    const dx = e.clientX - this.startX;
    const dy = e.clientY - this.startY;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const dist = Math.hypot(dx, dy);
    const dt = performance.now() - this.startT;

    // Short, near-stationary press → tap. Two quick taps → deploy.
    if (dist < this.tapMaxDist && dt < this.tapMaxMs) {
      const now = performance.now();
      if (now - this.lastTapT < this.doubleTapMs) {
        this.emit('deploy');
        this.lastTapT = 0;
      } else {
        this.emit('confirm');
        this.lastTapT = now;
      }
      return;
    }

    if (dist < this.swipeThreshold) return;

    // Diagonal swipes resolve to the dominant axis.
    if (adx > ady) {
      this.emit(dx > 0 ? 'right' : 'left');
    } else {
      this.emit(dy > 0 ? 'slide' : 'jump');
    }
  };

  private onPointerCancel = (): void => {
    this.swiping = false;
  };

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('pointerdown', this.onPointerDown);
    this.target.removeEventListener('pointerup', this.onPointerUp);
    this.target.removeEventListener('pointercancel', this.onPointerCancel);
    this.listeners.clear();
  }
}

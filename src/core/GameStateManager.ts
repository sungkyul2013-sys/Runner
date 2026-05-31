/** High-level game states. Full menu flow arrives in Phase 5. */
export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAMEOVER = 'GAMEOVER',
}

export type StateListener = (next: GameState, prev: GameState) => void;

/**
 * Central, observable state machine. Subsystems subscribe to transitions
 * rather than polling, keeping gameplay logic decoupled from screen flow.
 */
export class GameStateManager {
  private _state: GameState;
  private readonly listeners = new Set<StateListener>();

  constructor(initial: GameState = GameState.MENU) {
    this._state = initial;
  }

  get state(): GameState {
    return this._state;
  }

  is(state: GameState): boolean {
    return this._state === state;
  }

  set(next: GameState): void {
    if (next === this._state) return;
    const prev = this._state;
    this._state = next;
    for (const fn of this.listeners) fn(next, prev);
  }

  onChange(fn: StateListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

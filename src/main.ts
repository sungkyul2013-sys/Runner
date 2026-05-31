import { Engine } from './core/Engine';
import { RunnerGame } from './core/RunnerGame';

/**
 * Entry point. Boots the engine and the gameplay orchestrator, then starts the
 * render loop. The game auto-starts in PLAYING for now; the full menu flow
 * (MENU → PLAYING → PAUSED → GAMEOVER) lands in Phase 5.
 */
const canvas = document.getElementById('game') as HTMLCanvasElement;
const engine = new Engine(canvas);

// The Game wires itself into the engine's update loop in its constructor.
new RunnerGame(engine);

engine.start();

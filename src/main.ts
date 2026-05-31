import { Engine } from './core/Engine';
import { RunnerGame } from './core/RunnerGame';
import { SaveManager } from './data/SaveManager';
import { ScreenManager } from './ui/ScreenManager';

/**
 * Entry point. Wires the engine, the persistent profile, the gameplay game and
 * the screen/flow layer, then starts the render loop. The game boots into the
 * MENU (attract mode); the ScreenManager drives MENU → PLAYING → PAUSED →
 * GAMEOVER transitions.
 */
const canvas = document.getElementById('game') as HTMLCanvasElement;
const engine = new Engine(canvas);

const save = new SaveManager();
const game = new RunnerGame(engine, save);
new ScreenManager(game, save);

engine.start();

import { AudioManager } from './audio/AudioManager';
import { Engine } from './core/Engine';
import { RunnerGame } from './core/RunnerGame';
import { SaveManager } from './data/SaveManager';
import { Loading } from './ui/Loading';
import { ScreenManager } from './ui/ScreenManager';
import { vignette } from './ui/uikit';

/**
 * Entry point. Wires the engine, persistent profile, synthesised audio, the
 * gameplay game and the screen/flow layer, then starts the render loop. Boots
 * into the MENU (attract mode); the ScreenManager drives all transitions.
 */
const loading = new Loading();

const canvas = document.getElementById('game') as HTMLCanvasElement;
const engine = new Engine(canvas);

const save = new SaveManager();
const audio = new AudioManager(save.data.settings.muted);
const game = new RunnerGame(engine, save, audio);
new ScreenManager(game, save, audio, engine);
vignette();

engine.start();

// Reveal the menu once a couple of frames have rendered (assets are procedural).
let frames = 0;
const off = engine.onUpdate(() => {
  if (++frames >= 3) {
    off();
    loading.done();
  }
});

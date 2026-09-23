import './kit/kit.css';
import './styles/game.css';
import './kit';
import { App } from './app';

const stage = document.getElementById('stage') as HTMLElement;
const canvas = document.getElementById('game') as HTMLCanvasElement;
const app = new App(stage, canvas);
app.boot();

// handy for debugging / automated smoke tests
(window as unknown as { tanky: App }).tanky = app;

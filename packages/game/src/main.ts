import '@fontsource/press-start-2p/400.css';
import './style.css';
import { App } from './app.ts';

const root = document.getElementById('app')!;
const params = new URLSearchParams(location.search);

if (params.has('gallery')) {
  // dev-only art gallery
  void import('./gallery.ts').then(({ gallery }) => gallery(root));
} else {
  new App(root).start();
}

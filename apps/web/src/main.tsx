import { render } from 'preact';
import { App } from './ui/App';
import './style.css';

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Missing #app element');
}
render(<App />, root);

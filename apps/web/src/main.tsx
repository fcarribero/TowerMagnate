import { render } from 'preact';
import { Root } from './ui/Root';
import './style.css';

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Missing #app element');
}
render(<Root />, root);

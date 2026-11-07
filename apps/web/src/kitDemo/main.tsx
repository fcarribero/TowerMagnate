import { render } from 'preact';
import { KitDemo } from './KitDemo';
import './kitDemo.css';

const root = document.getElementById('app');
if (root === null) {
  throw new Error('Missing #app element');
}
render(<KitDemo />, root);

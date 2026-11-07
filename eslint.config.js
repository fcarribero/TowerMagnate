import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['apps/web/**'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['packages/engine/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'The engine must use the seeded RNG stored in the state.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'The engine must derive time from the step number.',
        },
        {
          object: 'performance',
          property: 'now',
          message: 'The engine must derive time from the step number.',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'The engine uses its own calendar, not Date.' },
        { name: 'setTimeout', message: 'The engine advances only through steps.' },
        { name: 'setInterval', message: 'The engine advances only through steps.' },
        { name: 'fetch', message: 'The engine does no IO.' },
        { name: 'process', message: 'The engine does no IO.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['node:*'], message: 'The engine does no IO.' },
            {
              group: ['fs', 'path', 'net', 'http', 'https', 'crypto', 'os', 'child_process'],
              message: 'The engine does no IO.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/engine/**/*.test.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Engine tests must be reproducible; use the seeded RNG.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Use performance.now() to time engine tests.',
        },
      ],
    },
  },
  prettier,
);

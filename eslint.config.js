import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', '.wwebjs_auth/', '.wwebjs_cache/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/dashboard/public/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser, Chart: 'readonly' } },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
];

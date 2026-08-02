import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import-x';

export default tseslint.config(
  {
    ignores: [
      'android/**',
      'dist/**',
      'ios/**',
      'node_modules/**',
      '.expo/**',
      'artifacts/**',
      'artifacts-sanitized/**',
      '__tests__/**',
      '*.config.{js,ts,mjs}',
      'vitest.config.ts',
      'eslint.config.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat['recommended-latest'],
  {
    files: ['**/*.{js,cjs,mjs}'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { import: importPlugin },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
        node: { extensions: ['.ts', '.tsx', '.js'] },
      },
    },
    rules: {
      'import/no-cycle': ['error', { maxDepth: 5, ignoreExternal: true }],
      'import/no-self-import': 'error',
    },
  },
);

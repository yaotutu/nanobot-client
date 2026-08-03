import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import-x';

const restrictedLayerImports = (patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
});

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
      '*.config.{js,ts,mts,mjs}',
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
  {
    files: ['src/services/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}', 'src/types/**/*.{ts,tsx}'],
    rules: restrictedLayerImports([
      { group: ['@/app', '@/app/*'], message: 'Infrastructure layers cannot depend on Expo Router.' },
      { group: ['@/components', '@/components/*'], message: 'Infrastructure layers cannot depend on application components.' },
      { group: ['@/features', '@/features/*'], message: 'Infrastructure layers cannot depend on feature modules.' },
    ]),
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: restrictedLayerImports([
      { group: ['@/app', '@/app/*'], message: 'Features cannot depend on Expo Router.' },
      { group: ['@/components', '@/components/*'], message: 'Features cannot depend on application shell components.' },
    ]),
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    ignores: ['src/features/app/**/*.{ts,tsx}'],
    rules: restrictedLayerImports([
      { group: ['@/app', '@/app/*'], message: 'Features cannot depend on Expo Router.' },
      { group: ['@/components', '@/components/*'], message: 'Features cannot depend on application shell components.' },
      {
        group: [
          '@/features/settings/components/SettingsScreen',
          '@/features/capabilities/components/AppsScreen',
          '@/features/skills/components/SkillsScreen',
          '@/features/automations/components/AutomationsScreen',
          '@/features/sidebar/components/SidebarDrawer',
        ],
        message: 'Top-level feature screens must be composed by features/app.',
      },
    ]),
  },
  {
    files: ['__tests__/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-useless-assignment': 'off',
    },
  },
);

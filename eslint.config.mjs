import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import-x';

const restrictedLayerImports = (patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
});

const infrastructureLayerPatterns = [
  { group: ['@/app', '@/app/*'], message: 'Infrastructure layers cannot depend on Expo Router.' },
  { group: ['@/components', '@/components/*'], message: 'Infrastructure layers cannot depend on application components.' },
  { group: ['@/features', '@/features/*'], message: 'Infrastructure layers cannot depend on feature modules.' },
];

const featureLayerPatterns = [
  { group: ['@/app', '@/app/*'], message: 'Features cannot depend on Expo Router.' },
  { group: ['@/components', '@/components/*'], message: 'Features cannot depend on application shell components.' },
];

const nonAppFeaturePatterns = [
  ...featureLayerPatterns,
  {
    group: ['@/features/app', '@/features/app/*'],
    message: 'Only features/app may compose application-level feature dependencies.',
  },
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
];

const featureNames = [
  'auth',
  'automations',
  'capabilities',
  'channels',
  'chat',
  'connection',
  'security',
  'settings',
  'sidebar',
  'skills',
  'workspaces',
];

const privateCrossFeaturePatterns = (feature) => featureNames
  .filter((candidate) => candidate !== feature)
  .map((candidate) => ({
    group: [`@/features/${candidate}/*`],
    message: `Import ${candidate} through its public feature entrypoint (@/features/${candidate}).`,
  }));

const featureLogicPatterns = [
  {
    group: [
      '**/components',
      '**/components/**',
      '@/features/*/components',
      '@/features/*/components/*',
    ],
    message: 'Feature hooks and models cannot depend on presentation components.',
  },
];

const featureBoundaryConfigs = featureNames.flatMap((feature) => [
  {
    files: [`src/features/${feature}/**/*.{ts,tsx}`],
    rules: restrictedLayerImports([
      ...nonAppFeaturePatterns,
      ...privateCrossFeaturePatterns(feature),
    ]),
  },
  {
    files: [
      `src/features/${feature}/**/hooks/**/*.{ts,tsx}`,
      `src/features/${feature}/**/model/**/*.{ts,tsx}`,
    ],
    rules: restrictedLayerImports([
      ...nonAppFeaturePatterns,
      ...featureLogicPatterns,
      ...privateCrossFeaturePatterns(feature),
    ]),
  },
]);

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
    files: ['src/services/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}'],
    rules: restrictedLayerImports(infrastructureLayerPatterns),
  },
  {
    files: ['src/types/**/*.{ts,tsx}'],
    rules: restrictedLayerImports([
      ...infrastructureLayerPatterns,
      {
        group: ['@/ui', '@/ui/*'],
        message: 'Domain and API types cannot depend on UI presentation types.',
      },
    ]),
  },
  {
    files: ['src/features/app/**/*.{ts,tsx}'],
    rules: restrictedLayerImports([
      ...featureLayerPatterns,
      ...featureNames.map((feature) => ({
        group: [
          `@/features/${feature}/*`,
          // 大型首屏组件拥有独立的公开入口，避免 barrel 把无关 store、API 和弹窗带入启动依赖图。
          ...(feature === 'auth' ? ['!@/features/auth/screen'] : []),
          ...(feature === 'chat' ? ['!@/features/chat/screen'] : []),
        ],
        message: `Application composition must import ${feature} through its public feature entrypoint.`,
      })),
    ]),
  },
  {
    files: ['src/app/**/*.{ts,tsx}'],
    rules: restrictedLayerImports([
      {
        group: ['@/features/*', '!@/features/app'],
        message: 'Expo Router routes must compose the application through @/features/app.',
      },
    ]),
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    ignores: ['src/features/app/**/*.{ts,tsx}'],
    rules: restrictedLayerImports(nonAppFeaturePatterns),
  },
  {
    files: [
      'src/features/app/**/hooks/**/*.{ts,tsx}',
      'src/features/app/**/model/**/*.{ts,tsx}',
    ],
    rules: restrictedLayerImports([
      ...featureLayerPatterns,
      ...featureLogicPatterns,
    ]),
  },
  {
    files: [
      'src/features/**/hooks/**/*.{ts,tsx}',
      'src/features/**/model/**/*.{ts,tsx}',
    ],
    ignores: [
      'src/features/app/**/hooks/**/*.{ts,tsx}',
      'src/features/app/**/model/**/*.{ts,tsx}',
    ],
    rules: restrictedLayerImports([
      ...nonAppFeaturePatterns,
      ...featureLogicPatterns,
    ]),
  },
  ...featureBoundaryConfigs,
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

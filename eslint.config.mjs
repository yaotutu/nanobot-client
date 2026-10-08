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
      '@/features/sidebar/components/ConversationSheet',
    ],
    message: 'Top-level feature screens must be composed by features/app.',
  },
];

const featureNames = [
  'auth',
  'capabilities',
  'chat',
  'connection',
  'settings',
  'sidebar',
  'skills',
  'workspaces',
  'updates',
];

// app 是唯一的组合层，可以访问各 feature 的“轻量公开入口”。
// 不恢复大 barrel：这些入口按依赖图拆分，避免启动时引入无关 UI、API 或 store。
const appFeatureEntryPaths = {
  auth: ['@/features/auth/screen', '@/features/auth/state'],
  capabilities: ['@/features/capabilities/state'],
  chat: [
    '@/features/chat/commands',
    '@/features/chat/controller',
    '@/features/chat/model',
    '@/features/chat/screen',
    '@/features/chat/state',
    '@/features/chat/thread-lifecycle',
  ],
  connection: [
    '@/features/connection/recovery',
    '@/features/connection/state',
    '@/features/connection/transport',
  ],
  settings: ['@/features/settings'],
  sidebar: ['@/features/sidebar/state'],
  skills: ['@/features/skills/state'],
  updates: ['@/features/updates'],
  workspaces: ['@/features/workspaces/state'],
};

// 应用层只能深层导入上面声明的轻量入口，不能直接碰 store/hook/model 实现文件。
const appCrossFeaturePatterns = featureNames.map((feature) => ({
  group: [`@/features/${feature}/*`, ...(appFeatureEntryPaths[feature] ?? []).map((path) => `!${path}`)],
  message: `Application composition must use a declared public entrypoint for ${feature}.`,
}));

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
      ...appCrossFeaturePatterns,
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
      ...appCrossFeaturePatterns,
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

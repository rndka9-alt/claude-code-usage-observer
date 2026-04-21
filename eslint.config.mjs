import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts', 'scripts/*/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: [
          './packages/usage-observer-domain/tsconfig.json',
          './apps/ingest-api/tsconfig.json',
          './apps/worker/tsconfig.json',
          './scripts/statusline-sender/tsconfig.json',
        ],
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      '@typescript-eslint/consistent-type-assertions': ['error', {
        assertionStyle: 'never',
      }],
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
];

/* eslint-env node */

// Privacy guarantee, enforced statically. scripts/check-no-network.mjs also scans the
// built bundle, because a lint rule only covers source we wrote.
const NO_NETWORK = [
  { name: 'fetch', message: 'Tab Debt makes no network requests, ever. See PRIVACY.md.' },
  { name: 'XMLHttpRequest', message: 'Tab Debt makes no network requests, ever. See PRIVACY.md.' },
  { name: 'WebSocket', message: 'Tab Debt makes no network requests, ever. See PRIVACY.md.' },
];

// NOTE: no-restricted-globals is replaced wholesale by a later override, not merged, so
// core/'s override must repeat NO_NETWORK rather than rely on the base config.
const CORE_ONLY = [
  {
    name: 'chrome',
    message:
      'core/ must not touch chrome.* — that is what makes the 400-tab fixture possible. Take the data as an argument instead.',
  },
  { name: 'window', message: 'core/ must not touch the DOM. Take the data as an argument.' },
  { name: 'document', message: 'core/ must not touch the DOM. Take the data as an argument.' },
];

module.exports = {
  root: true,
  env: { browser: true, es2022: true, webextensions: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', 'node_modules', 'coverage', '*.cjs', 'scripts/**'],
  rules: {
    // No file over 300 lines. A file past this is doing two jobs.
    'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    eqeqeq: ['error', 'always'],
    'no-console': ['error', { allow: ['warn', 'error'] }],
    'no-restricted-globals': ['error', ...NO_NETWORK],
  },
  overrides: [
    {
      // THE architectural rule: core/ is Chrome-free and UI-free, so the whole domain is
      // testable without a browser. Violating this fails the build.
      files: ['src/core/**/*.ts'],
      rules: {
        'no-restricted-globals': ['error', ...NO_NETWORK, ...CORE_ONLY],
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '@/services/*',
                  '@/background/*',
                  '@/hooks/*',
                  '@/components/*',
                  '@/pages/*',
                  'preact*',
                ],
                message:
                  'core/ is pure domain logic: plain data in, plain data out. It must not reach into the Chrome adapter or the UI.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/test/**/*.ts'],
      rules: { 'max-lines': 'off', '@typescript-eslint/no-explicit-any': 'off' },
    },
  ],
};

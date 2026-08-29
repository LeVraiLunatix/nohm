import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

/**
 * Flat config for the whole workspace. Deliberately on the non-type-checked `recommended` tier:
 * it catches real mistakes (unused vars, floating regex, `no-fallthrough`, bad hook deps) without
 * the multi-minute project-graph pass or the wall of `no-unsafe-*` noise that type-checked linting
 * adds. Run with `npm run lint`.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'server/drizzle/**',
      'client/dev-dist/**',
      'src-tauri/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // `_`-prefixed args/caught errors are an intentional "unused on purpose" marker;
      // `ignoreRestSiblings` allows the `const { secret, ...rest } = obj` pattern used to strip
      // auth tokens out of an env object before it's handed to a subprocess.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      // The codebase uses a handful of deliberate `any` casts at untyped boundaries (RPC payloads,
      // third-party responses re-validated by zod right after). Keep it visible as a warning
      // rather than a build-breaking error.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Browser + React for the client.
  {
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // This codebase deliberately co-locates a component with its small helpers/constants
      // (see the section registry, the widget files, the i18n provider). That trips this rule
      // ~35 times for a dev-only Fast Refresh nicety and would bury the warnings that matter.
      'react-refresh/only-export-components': 'off',
    },
  },

  // Node context for the server, shared package, build scripts and config files.
  {
    files: [
      'server/**/*.ts',
      'shared/**/*.ts',
      '**/scripts/**/*.{ts,mjs,js}',
      '*.{js,mjs,ts}',
      'client/vite.config.ts',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Test files: vitest globals, and `any` is fine in fixtures/mocks.
  {
    files: ['**/*.test.{ts,tsx}', '**/*.integration.test.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);

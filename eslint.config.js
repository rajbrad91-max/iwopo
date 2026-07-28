import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * 🔍 Lint config — set up to catch BUGS, not to argue about style.
 *
 * This exists because /panel/bookings/35 rendered a blank page in production:
 * BookingDetail called fmtEventDate without importing it, so it threw on first
 * render and React unmounted the tree. Vite resolves modules but never checks
 * that every identifier is bound, so nothing failed until a real person opened
 * that one screen. `no-undef` catches exactly that before it ships.
 *
 * Formatting rules are deliberately absent. Quote style and semicolons have
 * never caused an outage here; undefined names and broken hooks have.
 */
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'backend/models/**',      // downloaded face-api model weights
      'backend/prisma/**',      // generated from the database
    ],
  },

  // ── backend: Node, ESM ──────────────────────────────────────────────
  {
    files: ['backend/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      // an unused name is usually a leftover from a rewrite; warn so it shows
      // up without failing a deploy over it
      // `const { secret, ...rest } = row` is how a field is EXCLUDED from an
      // object — the named variable is meant to be unused. Flagging it pushed
      // toward renaming correct code to please the linter.
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      // catch(e) {} is used deliberately all over this codebase to keep a
      // best-effort path from breaking a request, so an empty block is fine
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // ── frontend: browser, React, JSX ───────────────────────────────────
  {
    files: ['frontend/src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      // ⛔ the one that would have caught the blank bookings page
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^[A-Z_]', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // a hook called conditionally corrupts React's state between renders and
      // fails in ways that look like random data loss
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];

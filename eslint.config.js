import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'marketing/.next', 'marketing/out', '.claude']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // Serverless functions, build scripts and tooling configs run in Node.
    files: [
      'api/**/*.js',
      'scripts/**/*.js',
      'config/**/*.js',
      'marketing/**/*.{js,jsx}',
      '*.config.js',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Modules shared between the browser bundle and serverless functions,
    // plus tests (vitest runs in Node).
    files: ['src/**/*.js', '**/*.test.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
])

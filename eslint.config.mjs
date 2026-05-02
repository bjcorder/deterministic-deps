import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

const nodeGlobals = {
  Buffer: 'readonly',
  console: 'readonly',
  module: 'readonly',
  process: 'readonly',
  require: 'readonly',
  __dirname: 'readonly'
}

const jestGlobals = {
  describe: 'readonly',
  expect: 'readonly',
  it: 'readonly',
  jest: 'readonly'
}

export default [
  js.configs.recommended,
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**']
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json'
      },
      globals: nodeGlobals
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  {
    files: ['**/__tests__/**/*.ts'],
    languageOptions: {
      globals: {
        ...nodeGlobals,
        ...jestGlobals
      }
    }
  },
  {
    files: ['*.js'],
    languageOptions: {
      globals: nodeGlobals
    }
  }
]

/**
 * ESLint 配置。
 * 输入:
 * - Monorepo 下各包的 TypeScript 源文件
 * 输出:
 * - 当前仓库可稳定执行的 lint 规则集合
 * 预期行为:
 * - 先保证 TS lint 基础设施可运行，再逐步收紧规则
 */

import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import globals from 'globals'

const typescriptFiles = [
  'packages/*/src/**/*.ts',
  'packages/plugins/*/src/**/*.ts',
]

const testFiles = [
  'packages/*/src/**/*.spec.ts',
  'packages/*/src/**/*.test.ts',
  'packages/*/test/**/*.ts',
  'packages/plugins/*/src/**/*.spec.ts',
]

export default [
  {
    ignores: [
      'node_modules/**',
      'packages/*/dist/**',
      'packages/server/tmp/**',
      'packages/shared/src/**/*.js',
      'packages/shared/src/**/*.d.ts',
      'coverage/**',
      'tmp/**',
      'other/**',
      'docs/superpowers/**',
    ],
  },
  js.configs.recommended,
  {
    files: typescriptFiles,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: 'module',
        project: './tsconfig.base.json',
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2024,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-inferrable-types': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-undef': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      'require-yield': 'off',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
    },
  },
  {
    files: testFiles,
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
]

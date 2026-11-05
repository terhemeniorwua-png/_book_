import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globalIgnores } from 'eslint/config';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
];

const completeConfig = [
  globalIgnores([
    '.next/**',
    '.next-e2e/**',
    'node_modules/**',
    'out/**',
    'build/**',
    'test-results/**',
    'playwright-report/**',
    'next-env.d.ts',
  ]),
  ...eslintConfig,
];

export default completeConfig;

import { globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  globalIgnores(['dist/**', 'node_modules/**']),
  ...tseslint.configs.recommended,
);

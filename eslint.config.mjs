import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
	{ ignores: ['dist/**', 'node_modules/**'] },
	{
		files: ['**/*.mjs'],
		extends: [js.configs.recommended],
		languageOptions: { globals: globals.node },
	},
	{
		files: ['src/**/*.ts'],
		extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			'@typescript-eslint/consistent-type-imports': 'error',
			'@typescript-eslint/explicit-function-return-type': 'error',
			curly: 'error',
			eqeqeq: 'error',
		},
	},
	prettier,
);

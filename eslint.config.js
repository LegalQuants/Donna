import prettier from 'eslint-config-prettier';
import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	// The vendored lq-ai backend is a separate upstream monorepo — never lint it.
	// desktop/{out,dist} are electron-builder artifacts (ignored by desktop/.gitignore,
	// which the root includeIgnoreFile can't see — so ignore them explicitly here).
	{ ignores: ['vendor/', 'desktop/out/', 'desktop/dist/'] },
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',
			// Honor the `_`-prefix convention for intentionally-unused params/vars/catches.
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
			]
		}
	},
	{
		// CommonJS build helpers (electron-builder hooks) legitimately use require().
		files: ['**/*.cjs'],
		languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
		rules: { '@typescript-eslint/no-require-imports': 'off' }
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	{
		// Override or add rule settings here, such as:
		// 'svelte/button-has-type': 'error'
		rules: {
			// Never adopted: suppressed ad-hoc since scaffold (inline disables / baseline errors).
			// Formally disabled in docs-polish PR 2.
			'svelte/no-navigation-without-resolve': 'off',
			'svelte/prefer-svelte-reactivity': 'off'
		}
	},
	{
		// Tests routinely cast mocks/fixtures; `any` is acceptable there.
		// `@ts-nocheck` is also allowed: some test files suppress void-union return-type
		// errors that come from SvelteKit's `PageServerLoad` generic without breaking the
		// runtime assertions that vitest verifies.
		files: ['**/*.test.ts', '**/*.spec.ts', 'tests/**'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/ban-ts-comment': 'off'
		}
	}
);

// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// docker-compose.release.yml is a hand-maintained mirror (see its header comment)
// with no other test surface; these guards pin deploy-critical donna-web env so a
// re-sync against vendor/lq-ai cannot silently drop it. Vitest runs from the repo
// root, so process.cwd() resolves the top-level deploy files.
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');

describe('docker-compose.release.yml donna-web', () => {
	it('raises the adapter-node body-size limit (default 512K breaks KB uploads >0.5MB)', () => {
		const compose = read('docker-compose.release.yml');
		const donnaWeb = compose.slice(compose.indexOf('donna-web:'));
		expect(donnaWeb).toContain('BODY_SIZE_LIMIT: ${DONNA_WEB_BODY_SIZE_LIMIT:-512M}');
	});

	it('documents DONNA_WEB_BODY_SIZE_LIMIT in .env.example', () => {
		expect(read('.env.example')).toMatch(/^DONNA_WEB_BODY_SIZE_LIMIT=/m);
	});
});

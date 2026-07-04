import { describe, it, expect } from 'vitest';
import { generateSecrets, generateMasterKey, ensureMasterKey } from './secrets';

describe('generateSecrets', () => {
	it('mints all required release-stack secrets', () => {
		const s = generateSecrets();
		expect(Object.keys(s).sort()).toEqual([
			'JWT_SECRET',
			'LQ_AI_GATEWAY_KEY',
			'LQ_AI_GATEWAY_MASTER_KEY',
			'MINIO_ROOT_PASSWORD',
			'POSTGRES_PASSWORD',
			'S3_SECRET_KEY'
		]);
	});

	it('makes S3_SECRET_KEY equal to MINIO_ROOT_PASSWORD (the compose requires the pair to match)', () => {
		const s = generateSecrets();
		expect(s.S3_SECRET_KEY).toBe(s.MINIO_ROOT_PASSWORD);
	});

	it('produces strong base64url values for the env-safe secrets (JWT >= 43, minio >= 8, no padding)', () => {
		const s = generateSecrets();
		expect(s.JWT_SECRET.length).toBeGreaterThanOrEqual(43);
		expect(s.MINIO_ROOT_PASSWORD.length).toBeGreaterThanOrEqual(8);
		for (const v of [
			s.JWT_SECRET,
			s.LQ_AI_GATEWAY_KEY,
			s.MINIO_ROOT_PASSWORD,
			s.POSTGRES_PASSWORD,
			s.S3_SECRET_KEY
		]) {
			expect(v).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, env-safe (no =, +, /, quotes)
		}
	});

	it('is deterministic given an injected RNG (for reproducible tests)', () => {
		const rng = (n: number) => Buffer.alloc(n, 7);
		expect(generateSecrets(rng)).toEqual(generateSecrets(rng));
	});

	it('is overwhelmingly likely to differ between real calls', () => {
		expect(generateSecrets().JWT_SECRET).not.toBe(generateSecrets().JWT_SECRET);
	});
});

describe('generateMasterKey (Fernet format)', () => {
	it('is a urlsafe-base64 32-byte value: 44 chars, urlsafe alphabet, decodes to 32 bytes', () => {
		const k = generateMasterKey();
		expect(k).toHaveLength(44);
		expect(k).toMatch(/^[A-Za-z0-9_-]+=*$/); // urlsafe base64, `=` padding allowed
		expect(k).not.toMatch(/[+/]/); // never the non-urlsafe alphabet
		// Decodes to exactly 32 bytes (what Fernet requires).
		expect(Buffer.from(k.replace(/-/g, '+').replace(/_/g, '/'), 'base64')).toHaveLength(32);
	});

	it('differs between real calls', () => {
		expect(generateMasterKey()).not.toBe(generateMasterKey());
	});
});

describe('ensureMasterKey (existing-install migration)', () => {
	const base = {
		POSTGRES_PASSWORD: 'p',
		MINIO_ROOT_PASSWORD: 'm',
		S3_SECRET_KEY: 'm',
		LQ_AI_GATEWAY_KEY: 'g',
		JWT_SECRET: 'j'
	};

	it('backfills a missing master key without touching the other secrets', () => {
		// Simulate an old persisted config (no master key at runtime).
		const old = { ...base } as unknown as Parameters<typeof ensureMasterKey>[0];
		const out = ensureMasterKey(old);
		expect(out.LQ_AI_GATEWAY_MASTER_KEY).toHaveLength(44);
		expect(out.POSTGRES_PASSWORD).toBe('p');
		expect(out.MINIO_ROOT_PASSWORD).toBe('m');
		expect(out.LQ_AI_GATEWAY_KEY).toBe('g');
	});

	it('is idempotent when a key already exists', () => {
		const withKey = { ...base, LQ_AI_GATEWAY_MASTER_KEY: 'already-here' };
		expect(ensureMasterKey(withKey)).toBe(withKey);
	});
});

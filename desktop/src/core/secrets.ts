import { randomBytes } from 'node:crypto';

export interface GeneratedSecrets {
	POSTGRES_PASSWORD: string;
	MINIO_ROOT_PASSWORD: string;
	/** Must equal MINIO_ROOT_PASSWORD — the release compose pairs them. */
	S3_SECRET_KEY: string;
	LQ_AI_GATEWAY_KEY: string;
	JWT_SECRET: string;
	/**
	 * The gateway's Fernet master key (env `LQ_AI_GATEWAY_MASTER_KEY`). Encrypts
	 * runtime provider/tool keys at rest (ADR 0011). WITHOUT it the gateway
	 * disables runtime key storage, so setting a CourtListener/GovInfo research
	 * key — or an inference BYOK key — in-app fails with a 400. It is a
	 * urlsafe-base64 32-byte value (Fernet format), so unlike the base64url
	 * secrets above it may contain `=` padding — safe in a KEY=VALUE .env
	 * (parsers split on the first `=`).
	 */
	LQ_AI_GATEWAY_MASTER_KEY: string;
}

/** Injectable RNG so tests can be deterministic; defaults to crypto.randomBytes. */
export type Rng = (n: number) => Buffer;

const token = (bytes: number, rng: Rng): string => rng(bytes).toString('base64url');

/**
 * A Fernet-format master key: `urlsafe_b64encode(32 random bytes)` — matches the
 * gateway's `Fernet.generate_key()` exactly (44 chars, `-`/`_`, `=` padded).
 */
export function generateMasterKey(rng: Rng = randomBytes): string {
	return rng(32).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

export function generateSecrets(rng: Rng = randomBytes): GeneratedSecrets {
	const minio = token(18, rng); // 24 base64url chars, well over the 8-char minimum
	return {
		POSTGRES_PASSWORD: token(24, rng),
		MINIO_ROOT_PASSWORD: minio,
		S3_SECRET_KEY: minio,
		LQ_AI_GATEWAY_KEY: token(24, rng),
		JWT_SECRET: token(48, rng), // 64 base64url chars
		LQ_AI_GATEWAY_MASTER_KEY: generateMasterKey(rng)
	};
}

/**
 * Backfill the gateway master key on a config minted before it existed. Existing
 * desktop installs persisted a `.env`/config without `LQ_AI_GATEWAY_MASTER_KEY`;
 * on launch we run this so their in-app key-setting works after an app update —
 * without disturbing the other (volume-bound) secrets. Idempotent: a config that
 * already has a key is returned unchanged.
 */
export function ensureMasterKey(
	secrets: GeneratedSecrets,
	rng: Rng = randomBytes
): GeneratedSecrets {
	if (secrets.LQ_AI_GATEWAY_MASTER_KEY) return secrets;
	return { ...secrets, LQ_AI_GATEWAY_MASTER_KEY: generateMasterKey(rng) };
}

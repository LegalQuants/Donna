import { describe, it, expect } from 'vitest'
import { renderEnv, parseEnv } from './env'
import type { LauncherConfig } from './config'

const base: LauncherConfig = {
	secrets: {
		POSTGRES_PASSWORD: 'pg-secret',
		MINIO_ROOT_PASSWORD: 'minio-secret',
		S3_SECRET_KEY: 'minio-secret',
		LQ_AI_GATEWAY_KEY: 'gw-secret',
		JWT_SECRET: 'jwt-secret'
	},
	ports: {
		donnaWeb: 13002,
		api: 18000,
		gateway: 18001,
		postgres: 25432,
		redis: 26379,
		minioApi: 29000,
		minioConsole: 29001
	},
	imageTag: 'v0.1.0',
	inference: { mode: 'cloud', anthropicApiKey: 'sk-ant-123' },
	adminEmail: 'admin@example.com'
}

describe('renderEnv', () => {
	it('emits every required secret and the paired S3 key', () => {
		const env = parseEnv(renderEnv(base))
		expect(env.POSTGRES_PASSWORD).toBe('pg-secret')
		expect(env.MINIO_ROOT_PASSWORD).toBe('minio-secret')
		expect(env.S3_SECRET_KEY).toBe('minio-secret')
		expect(env.LQ_AI_GATEWAY_KEY).toBe('gw-secret')
		expect(env.JWT_SECRET).toBe('jwt-secret')
	})

	it('keeps ORIGIN in lockstep with the donna-web host port (adapter-node 403s otherwise)', () => {
		const env = parseEnv(renderEnv({ ...base, ports: { ...base.ports, donnaWeb: 14444 } }))
		expect(env.ORIGIN).toBe('http://localhost:14444')
		expect(env.DONNA_WEB_HOST_PORT).toBe('14444')
	})

	it('pins the image tag (never latent latest)', () => {
		expect(parseEnv(renderEnv(base)).DONNA_IMAGE_TAG).toBe('v0.1.0')
	})

	it('cloud inference writes the API key and leaves OLLAMA at the host default', () => {
		const env = parseEnv(renderEnv(base))
		expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-123')
		expect(env.OLLAMA_BASE_URL).toBe('http://host.docker.internal:11434')
	})

	it('ollama inference omits cloud keys and points OLLAMA at the chosen URL', () => {
		const env = parseEnv(
			renderEnv({ ...base, inference: { mode: 'ollama', baseUrl: 'http://host.docker.internal:11434' } })
		)
		expect(env.ANTHROPIC_API_KEY ?? '').toBe('')
		expect(env.OLLAMA_BASE_URL).toBe('http://host.docker.internal:11434')
	})

	it('round-trips with no shell-unsafe unescaped characters in values', () => {
		const text = renderEnv(base)
		for (const line of text.split('\n')) {
			if (!line || line.startsWith('#')) continue
			expect(line).toMatch(/^[A-Z0-9_]+=/)
		}
	})
})

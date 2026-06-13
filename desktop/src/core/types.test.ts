import { describe, it, expect } from 'vitest'
import { EXPECTED_SERVICES, DEFAULT_PORTS } from './types'

describe('core constants', () => {
	it('lists all 8 release-stack services', () => {
		expect(EXPECTED_SERVICES).toEqual([
			'postgres',
			'redis',
			'minio',
			'gateway',
			'api',
			'ingest-worker',
			'arq-worker',
			'donna-web'
		])
	})

	it('defaults donna-web to the shifted port 13002', () => {
		expect(DEFAULT_PORTS.donnaWeb).toBe(13002)
	})
})

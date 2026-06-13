/** Names of every service in docker-compose.release.yml, in dependency-ish order. */
export const EXPECTED_SERVICES = [
	'postgres',
	'redis',
	'minio',
	'gateway',
	'api',
	'ingest-worker',
	'arq-worker',
	'donna-web'
] as const

export type ServiceName = (typeof EXPECTED_SERVICES)[number]

export interface PortConfig {
	donnaWeb: number
	api: number
	gateway: number
	postgres: number
	redis: number
	minioApi: number
	minioConsole: number
}

/** Shifted defaults matching .env.example so Donna coexists with a raw lq-ai dev stack. */
export const DEFAULT_PORTS: PortConfig = {
	donnaWeb: 13002,
	api: 18000,
	gateway: 18001,
	postgres: 25432,
	redis: 26379,
	minioApi: 29000,
	minioConsole: 29001
}

export type EngineStatus = 'absent' | 'present' | 'error'

export interface EngineProbe {
	status: EngineStatus
	version?: string
	message?: string
}

export type ServiceHealth =
	| 'healthy'
	| 'starting'
	| 'unhealthy'
	| 'running'
	| 'exited'
	| 'created'
	| 'unknown'

export interface ServiceStatus {
	name: string
	state: string
	health: ServiceHealth
}

export type LauncherState =
	| 'NO_ENGINE'
	| 'STACK_STARTING'
	| 'HEALTHY'
	| 'STOPPED'
	| 'FAILED'

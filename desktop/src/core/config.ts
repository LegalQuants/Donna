import type { GeneratedSecrets } from './secrets'
import type { PortConfig } from './types'

export type InferenceChoice =
	| { mode: 'cloud'; anthropicApiKey?: string; openaiApiKey?: string }
	| { mode: 'ollama'; baseUrl: string }

export interface LauncherConfig {
	secrets: GeneratedSecrets
	ports: PortConfig
	/** Pinned image release, e.g. "v0.1.0". Never "latest" by default. */
	imageTag: string
	inference: InferenceChoice
	adminEmail: string
}

/** First run = no persisted config blob exists yet. */
export function isFirstRun(persisted: LauncherConfig | null): boolean {
	return persisted === null
}

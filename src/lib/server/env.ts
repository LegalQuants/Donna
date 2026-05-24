import { env } from '$env/dynamic/private';
export const LQ_API = (): string => env.LQ_API_INTERNAL_URL ?? 'http://localhost:8000';

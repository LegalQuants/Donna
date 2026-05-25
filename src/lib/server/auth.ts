import { LQ_API } from './env';
import type { components } from '$lib/api/backend';

type LoginResponse = components['schemas']['LoginResponse'];
type MfaChallenge = components['schemas']['MfaChallenge'];

async function post(path: string, body: unknown, token?: string): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  return fetch(`${LQ_API()}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

export type LoginResult =
  | { kind: 'ok'; data: LoginResponse }
  | { kind: 'mfa'; data: MfaChallenge }
  | { kind: 'invalid' };

export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await post('/api/v1/auth/login', { email, password });
  if (res.status === 200) return { kind: 'ok', data: await res.json() };
  if (res.status === 423) return { kind: 'mfa', data: await res.json() };
  return { kind: 'invalid' };
}

export async function verifyMfa(mfa_token: string, code: string): Promise<LoginResult> {
  const res = await post('/api/v1/auth/mfa/verify', { mfa_token, code });
  if (res.status === 200) return { kind: 'ok', data: await res.json() };
  return { kind: 'invalid' };
}

export async function changePassword(token: string, current_password: string, new_password: string): Promise<boolean> {
  const res = await post('/api/v1/auth/change-password', { current_password, new_password }, token);
  return res.status === 204;
}

export async function logout(token: string | undefined): Promise<void> {
  if (token) await post('/api/v1/auth/logout', {}, token).catch(() => {});
}

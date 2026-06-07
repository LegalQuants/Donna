export default async function globalSetup() {
	const base = process.env.DONNA_BASE_URL ?? 'http://localhost:3000';
	if (!process.env.DONNA_E2E_EMAIL || !process.env.DONNA_E2E_PASSWORD) {
		throw new Error(
			'Set DONNA_E2E_EMAIL and DONNA_E2E_PASSWORD (a bootstrapped lq-ai account) to run e2e.'
		);
	}
	const res = await fetch(`${base}/login`).catch(() => null);
	if (!res || !res.ok) {
		throw new Error(`Donna web not reachable at ${base}. Run: docker compose up -d --build`);
	}
}

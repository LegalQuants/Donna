// Notarize the signed .app via notarytool when Apple creds are in the env (CI).
// No-op locally so `npm run dist` works unsigned for smoke tests.
const { notarize } = require('@electron/notarize')

exports.default = async function notarizing(context) {
	if (context.electronPlatformName !== 'darwin') return
	const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env
	if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
		console.log('Skipping notarization — Apple creds not set.')
		return
	}
	const appName = context.packager.appInfo.productFilename
	await notarize({
		appBundleId: 'ai.lq.donna.desktop',
		appPath: `${context.appOutDir}/${appName}.app`,
		appleId: APPLE_ID,
		appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
		teamId: APPLE_TEAM_ID
	})
}

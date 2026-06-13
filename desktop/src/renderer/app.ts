import { renderWizard } from './wizard'
import { renderPanel } from './panel'
import type { DonnaBridge } from '../preload'

declare global {
	interface Window {
		donna: DonnaBridge
	}
}

const root = document.getElementById('root')!

async function main(): Promise<void> {
	const firstRun = await window.donna.isFirstRun()
	if (firstRun) renderWizard(root, () => renderPanel(root))
	else renderPanel(root)
}

main()

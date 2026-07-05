import type { InstallMarketplaceSkill, InstallStatus } from '../install-item';
import { InstallListRenderer } from '../../../shared/install-list-renderer';
import { removeSkillFromCollections, setSkillCollection } from '../../../shared/skill-store';

interface VsCodeApi {
	postMessage(message: unknown): void;
}

interface FlameElements {
	status: HTMLElement;
	list: HTMLElement;
}

const installStatuses = new Map<string, InstallStatus>();

let vscodeApi: VsCodeApi | undefined;
let elements: FlameElements | undefined;
let renderer: InstallListRenderer | undefined;
let flameSkills: InstallMarketplaceSkill[] = [];
let hasInitialized = false;
let hasRequested = false;

export function initTrendingFlamePanel(api: VsCodeApi): void {
	if (hasInitialized) {
		return;
	}

	vscodeApi = api;

	const status = document.getElementById('trending-flame-status');
	const list = document.getElementById('trending-flame-list');
	if (!status || !list) {
		return;
	}

	elements = { status, list };
	renderer = new InstallListRenderer({
		status,
		list,
		getStatus: id => installStatuses.get(id) ?? 'idle',
		variant: 'flame',
	});

	list.addEventListener('click', event => {
		const target = event.target as HTMLElement | null;
		const button = target?.closest<HTMLButtonElement>('.install-btn[data-install-id]');
		if (button) {
			if (button.disabled || !button.dataset.installId) {
				return;
			}

			const id = button.dataset.installId;
			installStatuses.set(id, 'installing');
			renderer?.updateItem(id);
			vscodeApi?.postMessage({ type: 'installSkill.install', id });
			return;
		}

		// Clicking the skill row anywhere but the Install button opens the skill's README.
		const item = target?.closest<HTMLElement>('.install-item');
		if (item) {
			const id = item.dataset.installId;
			const skill = id ? flameSkills.find(s => s.id === id) : undefined;
			if (skill) {
				vscodeApi?.postMessage({ type: 'flameSkill.viewDetail', id: skill.id, skillId: skill.skillId, name: skill.name, source: skill.source });
			}
		}
	});

	window.addEventListener('message', event => {
		const message = event.data;
		if (!message || typeof message !== 'object' || !('type' in message)) {
			return;
		}

		if (message.type === 'flameSkills.update' && Array.isArray(message.skills)) {
			flameSkills = message.skills;
			setSkillCollection('flame', flameSkills);
			renderFlameSkills(Boolean(message.isLoading), typeof message.error === 'string' ? message.error : null);
		}

		if (message.type === 'installSkill.status' && typeof message.id === 'string' && typeof message.status === 'string') {
			if (message.status === 'installing') {
				installStatuses.set(message.id, 'installing');
			} else {
				installStatuses.delete(message.id);
			}
			if (message.status === 'installed') {
				flameSkills = flameSkills.filter(skill => skill.id !== message.id);
				removeSkillFromCollections(message.id);
				renderer?.removeItem(message.id);
			} else {
				renderer?.updateItem(message.id);
			}
		}
	});

	hasInitialized = true;
}

export function showTrendingFlamePanel(): void {
	if (!hasRequested) {
		hasRequested = true;
		renderFlameSkills(true, null);
		vscodeApi?.postMessage({ type: 'flameSkills.request' });
	}
}

function renderFlameSkills(isLoading: boolean, error: string | null): void {
	if (!renderer) {
		return;
	}

	renderer.setItems(flameSkills, {
		isLoading,
		error: error ? `Failed to load flame skills: ${error}` : null,
		loadingMessage: 'Loading flame skills...',
		emptyMessage: 'No flame skills to install.',
	});
}

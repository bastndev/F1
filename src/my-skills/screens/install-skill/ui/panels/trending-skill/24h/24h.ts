import { resolveInstallButtonAction, type InstallMarketplaceSkill, type InstallStatus } from '../install-item';
import { InstallListRenderer } from '../../../shared/install-list-renderer';
import { removeSkillFromCollections, setSkillCollection } from '../../../shared/skill-store';

interface VsCodeApi {
	postMessage(message: unknown): void;
}

interface Trending24hElements {
	status: HTMLElement;
	list: HTMLElement;
}

const installStatuses = new Map<string, InstallStatus>();

let vscodeApi: VsCodeApi | undefined;
let elements: Trending24hElements | undefined;
let renderer: InstallListRenderer | undefined;
let trending24hSkills: InstallMarketplaceSkill[] = [];
let hasInitialized = false;
let hasRequested = false;

export function initTrending24hPanel(api: VsCodeApi): void {
	if (hasInitialized) {
		return;
	}

	vscodeApi = api;

	const status = document.getElementById('trending-24h-status');
	const list = document.getElementById('trending-24h-list');
	if (!status || !list) {
		return;
	}

	elements = { status, list };
	renderer = new InstallListRenderer({
		status,
		list,
		getStatus: id => installStatuses.get(id) ?? 'idle',
	});

	list.addEventListener('click', event => {
		const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.install-btn[data-install-id]');
		resolveInstallButtonAction(button, {
			onInstall: id => {
				installStatuses.set(id, 'installing');
				renderer?.updateItem(id);
				vscodeApi?.postMessage({ type: 'installSkill.install', id });
			},
			onCancel: id => {
				installStatuses.set(id, 'cancelling');
				renderer?.updateItem(id);
				vscodeApi?.postMessage({ type: 'installSkill.cancel', id });
			},
		});
	});

	window.addEventListener('message', event => {
		const message = event.data;
		if (!message || typeof message !== 'object' || !('type' in message)) {
			return;
		}

		if (message.type === 'trending24h.update' && Array.isArray(message.skills)) {
			trending24hSkills = message.skills;
			setSkillCollection('trending24h', trending24hSkills);
			renderTrending24h(Boolean(message.isLoading), typeof message.error === 'string' ? message.error : null);
		}

		if (message.type === 'installSkill.status' && typeof message.id === 'string' && typeof message.status === 'string') {
			if (message.status === 'installing' || message.status === 'downloading') {
				installStatuses.set(message.id, message.status);
			} else {
				installStatuses.delete(message.id);
			}
			if (message.status === 'installed') {
				trending24hSkills = trending24hSkills.filter(skill => skill.id !== message.id);
				removeSkillFromCollections(message.id);
				renderer?.removeItem(message.id);
			} else {
				renderer?.updateItem(message.id);
			}
		}
	});

	hasInitialized = true;
}

export function showTrending24hPanel(): void {
	if (!hasRequested) {
		hasRequested = true;
		renderTrending24h(true, null);
		vscodeApi?.postMessage({ type: 'trending24h.request' });
	}
}

function renderTrending24h(isLoading: boolean, error: string | null): void {
	if (!renderer) {
		return;
	}

	renderer.setItems(trending24hSkills, {
		isLoading,
		error: error ? `Failed to load trending skills: ${error}` : null,
		loadingMessage: 'Loading trending skills...',
		emptyMessage: 'No trending skills found.',
	});
}

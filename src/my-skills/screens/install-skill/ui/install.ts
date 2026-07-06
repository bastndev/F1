import { InstallListRenderer } from './shared/install-list-renderer';
import { getSkillCollection, removeSkillFromCollections, setSkillCollection } from './shared/skill-store';
import { initRefine } from './refine/refine';
import { resolveInstallButtonAction, type InstallMarketplaceSkill, type InstallStatus } from './panels/trending-skill/install-item';

interface VsCodeApi {
	postMessage(message: unknown): void;
}

const installStatuses = new Map<string, InstallStatus>();
let allTimeHasMore = false;
let allTimeRenderer: InstallListRenderer | undefined;
let disposeRefine: (() => void) | undefined;

export function initInstallPanel(vscodeApi: VsCodeApi): () => void {
	const installSurface = document.querySelector<HTMLElement>('.install-surface');
	if (!installSurface) {
		return () => {};
	}

	disposeRefine?.();
	disposeRefine = initRefine({
		onSelectionChange: () => {
			// Refinement events are dispatched via custom event for other modules to consume.
		},
	});

	const filters = Array.from(installSurface.querySelectorAll<HTMLButtonElement>('.install-filter[data-filter]'));
	const panels  = Array.from(installSurface.querySelectorAll<HTMLElement>('.install-panel'));

	if (!filters.length || !panels.length) {
		return disposeInstallPanel;
	}

	const clearSearch = () => {
		const searchInput = document.getElementById('install-search-input') as HTMLInputElement | null;
		if (searchInput && searchInput.value !== '') {
			searchInput.value = '';
			searchInput.dispatchEvent(new Event('input', { bubbles: true }));
		}
	};

	const activateFilter = (btn: HTMLButtonElement) => {
		const target = btn.dataset.filter;
		if (!target) {
			return;
		}

		clearSearch();

		filters.forEach(filter => {
			const isActive = filter === btn;
			filter.classList.toggle('active', isActive);
			filter.setAttribute('aria-selected', String(isActive));
			filter.tabIndex = isActive ? 0 : -1;
		});

		panels.forEach(panel => {
			const isActive = panel.id === `install-panel-${target}`;
			panel.hidden = !isActive;
			panel.setAttribute('aria-hidden', String(!isActive));
		});
	};

	const focusFilter = (currentIndex: number, offset: number) => {
		const targetIndex = (currentIndex + offset + filters.length) % filters.length;
		filters[targetIndex].focus();
		activateFilter(filters[targetIndex]);
	};

	filters.forEach((btn, index) => {
		btn.tabIndex = btn.classList.contains('active') ? 0 : -1;

		btn.addEventListener('click', () => activateFilter(btn));
		btn.addEventListener('keydown', event => {
			if (event.key === 'ArrowRight') {
				event.preventDefault();
				focusFilter(index, 1);
			} else if (event.key === 'ArrowLeft') {
				event.preventDefault();
				focusFilter(index, -1);
			} else if (event.key === 'Home') {
				event.preventDefault();
				focusFilter(0, 0);
			} else if (event.key === 'End') {
				event.preventDefault();
				focusFilter(filters.length - 1, 0);
			}
		});
	});

	window.addEventListener('installSkills.openFlame', () => {
		const trendingFilter = filters.find(filter => filter.dataset.filter === 'trending');
		if (trendingFilter) {
			activateFilter(trendingFilter);
		}
	});

	const allStatus = document.getElementById('install-all-status');
	const allList = document.getElementById('install-all-list');
	if (allStatus && allList) {
		allTimeRenderer = new InstallListRenderer({
			status: allStatus,
			list: allList,
			getStatus: id => installStatuses.get(id) ?? 'idle',
			onLoadMore: () => {
				if (allTimeHasMore) {
					vscodeApi.postMessage({ type: 'installSkills.more.request' });
				}
			},
		});
	}

	allList?.addEventListener('click', event => {
		const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.install-btn[data-install-id]');
		resolveInstallButtonAction(button, {
			onInstall: id => {
				installStatuses.set(id, 'installing');
				allTimeRenderer?.updateItem(id);
				vscodeApi.postMessage({ type: 'installSkill.install', id });
			},
			onCancel: id => {
				installStatuses.set(id, 'cancelling');
				allTimeRenderer?.updateItem(id);
				vscodeApi.postMessage({ type: 'installSkill.cancel', id });
			},
		});
	});

	window.addEventListener('message', event => {
		const message = event.data;
		if (!message || typeof message !== 'object' || !('type' in message)) {
			return;
		}

		if (message.type === 'installSkills.update' && Array.isArray(message.skills)) {
			allTimeHasMore = Boolean(message.hasMore);
			setSkillCollection('allTime', message.skills);
			renderAllTimeSkills(Boolean(message.isLoading), typeof message.error === 'string' ? message.error : null);
		}

		if (message.type === 'installSkill.status' && typeof message.id === 'string' && typeof message.status === 'string') {
			if (message.status === 'installing') {
				installStatuses.set(message.id, 'installing');
			} else {
				installStatuses.delete(message.id);
			}
			if (message.status === 'installed') {
				removeSkillFromCollections(message.id);
				allTimeRenderer?.removeItem(message.id);
			} else {
				allTimeRenderer?.updateItem(message.id);
			}
		}
	});

	renderAllTimeSkills(true, null);
	vscodeApi.postMessage({ type: 'installSkills.request', refresh: true });

	return disposeInstallPanel;
}

function disposeInstallPanel(): void {
	disposeRefine?.();
	disposeRefine = undefined;
}

function renderAllTimeSkills(isLoading = false, error: string | null = null) {
	allTimeRenderer?.setItems(getSkillCollection('allTime'), {
		isLoading,
		error: error ? `Failed to load skills: ${error}` : null,
		loadingMessage: 'Loading skills...',
		emptyMessage: 'No skills found.',
		hasMore: allTimeHasMore,
	});
}

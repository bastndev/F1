import { InstallListRenderer } from '../shared/install-list-renderer';
import { mergeSkillResults, onSkillStoreUpdate, removeSkillFromCollections, searchCachedSkills } from '../shared/skill-store';
import { resolveInstallButtonAction, type InstallMarketplaceSkill, type InstallStatus } from '../panels/trending-skill/install-item';

interface VsCodeApi {
	postMessage(message: unknown): void;
}

interface SearchScope {
	kind: 'all' | 'trending' | 'official-owner' | 'official-sources';
	label: string;
	placeholder: string;
	emptyMessage: string;
	loadingMessage: string;
	remote: boolean;
	collectionKeys?: string[];
	collectionPrefix?: string;
}

const SEARCH_DEBOUNCE_MS = 240;
const SEARCH_RESULT_LIMIT = 120;
const REFINE_CHANGE_EVENT = 'install-refine:change';
const OFFICIAL_SOURCE_SEARCH_EVENT = 'install-search:official-sources';

const installStatuses = new Map<string, InstallStatus>();

let renderer: InstallListRenderer | undefined;
let vscodeApi: VsCodeApi | undefined;
let activeQuery = '';
let activeRemoteQuery = '';
let activeRequestId = 0;
let activeScope: SearchScope = createAllScope();
let pendingTimer: number | undefined;
let remoteSkills: InstallMarketplaceSkill[] = [];
let renderedSkills: InstallMarketplaceSkill[] = [];
let remoteError: string | null = null;
let isRemoteLoading = false;
let refineKeywords: string[] = [];
let refineLabels: string[] = [];

export function initSearchPanel(api: VsCodeApi): void {
	vscodeApi = api;

	const searchInput = document.getElementById('install-search-input') as HTMLInputElement | null;
	const searchPanel = document.getElementById('install-panel-search');
	const resultsContainer = document.getElementById('install-search-results');
	const status = document.getElementById('install-search-status');
	const emptyState = document.getElementById('install-search-empty');
	const countEl = document.getElementById('install-search-count');
	const clearButton = document.getElementById('install-search-clear') as HTMLButtonElement | null;

	if (!searchInput || !searchPanel || !resultsContainer || !status) {
		return;
	}

	renderer = new InstallListRenderer({
		status,
		list: resultsContainer,
		getStatus: id => installStatuses.get(id) ?? 'idle',
	});

	resultsContainer.addEventListener('click', event => {
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

		if (
			message.type === 'installSkills.search.update'
			&& typeof message.query === 'string'
			&& typeof message.requestId === 'number'
			&& Array.isArray(message.skills)
		) {
			if (message.requestId !== activeRequestId || message.query !== activeRemoteQuery) {
				return;
			}

			remoteSkills = message.skills;
			remoteError = typeof message.error === 'string' ? message.error : null;
			isRemoteLoading = Boolean(message.isLoading);
			renderSearch(countEl);
		}

		if (message.type === 'installSkill.status' && typeof message.id === 'string' && typeof message.status === 'string') {
			if (message.status === 'installing') {
				installStatuses.set(message.id, 'installing');
			} else {
				installStatuses.delete(message.id);
			}

			if (message.status === 'installed') {
				renderedSkills = renderedSkills.filter(skill => skill.id !== message.id);
				remoteSkills = remoteSkills.filter(skill => skill.id !== message.id);
				removeSkillFromCollections(message.id);
				renderer?.removeItem(message.id);
				updateCount(countEl);
			} else {
				renderer?.updateItem(message.id);
			}
		}
	});

	window.addEventListener(REFINE_CHANGE_EVENT, event => {
		if (event instanceof CustomEvent && Array.isArray(event.detail?.keywords)) {
			refineKeywords = event.detail.keywords;
			refineLabels = Array.isArray(event.detail?.labels)
				? event.detail.labels.filter((label: unknown): label is string => typeof label === 'string')
				: [];
			if (activeQuery) {
				startSearch(activeQuery, getCurrentSearchScope(), searchPanel, countEl);
			} else if (refineKeywords.length > 0) {
				const scope = getCurrentSearchScope();
				startSearch('', scope, searchPanel, countEl);
				showSearchPanel(searchPanel);
			} else {
				hideSearchPanel(searchPanel, countEl);
			}
		}
	});

	onSkillStoreUpdate(() => {
		if (activeQuery || refineKeywords.length > 0) {
			renderSearch(countEl);
		}
	});

	searchInput.addEventListener('input', event => {
		const query = (event.target as HTMLInputElement).value.trim();
		const scope = getCurrentSearchScope();
		updateClearButton(searchInput, clearButton);

		if (query.length > 0 || refineKeywords.length > 0) {
			startSearch(query, scope, searchPanel, countEl);
		} else {
			hideSearchPanel(searchPanel, countEl);
		}
	});

	clearButton?.addEventListener('click', event => {
		event.preventDefault();
		clearSearchInput(searchInput, searchPanel, countEl);
		searchInput.focus();
	});

	searchInput.addEventListener('keydown', event => {
		if (event.key === 'Escape') {
			clearSearchInput(searchInput, searchPanel, countEl);
		}
	});

	bindPlaceholderUpdates(searchInput);
	updateSearchPlaceholder(searchInput);
	updateClearButton(searchInput, clearButton);
	emptyState?.setAttribute('hidden', '');
}

let localSearchTimer: number | undefined;

function startSearch(
	query: string,
	scope: SearchScope,
	searchPanel: HTMLElement,
	countEl: HTMLElement | null,
): void {
	activeQuery = query;
	activeScope = scope;
	activeRequestId += 1;
	remoteSkills = [];
	remoteError = null;
	const combinedQuery = buildRefinedQuery(query);
	activeRemoteQuery = combinedQuery;
	isRemoteLoading = scope.remote && combinedQuery.length >= 2;

	if (pendingTimer !== undefined) {
		window.clearTimeout(pendingTimer);
		pendingTimer = undefined;
	}

	if (localSearchTimer !== undefined) {
		window.clearTimeout(localSearchTimer);
		localSearchTimer = undefined;
	}

	if (scope.kind === 'official-sources') {
		hideSearchPanel(searchPanel, countEl, false);
		dispatchOfficialSourceSearch(query);
		renderedSkills = [];
		return;
	}

	showSearchPanel(searchPanel);
	
	localSearchTimer = window.setTimeout(() => {
		localSearchTimer = undefined;
		renderSearch(countEl);
	}, 150);

	if (!scope.remote || combinedQuery.length < 2) {
		return;
	}

	const requestId = activeRequestId;
	pendingTimer = window.setTimeout(() => {
		pendingTimer = undefined;
		vscodeApi?.postMessage({
			type: 'installSkills.search.request',
			query: combinedQuery,
			requestId,
			limit: SEARCH_RESULT_LIMIT,
		});
	}, SEARCH_DEBOUNCE_MS);
}

function renderSearch(countEl: HTMLElement | null): void {
	if (!renderer) {
		return;
	}

	const cachedSkills = searchCachedSkills(activeRemoteQuery || activeQuery, 80, {
		keys: activeScope.collectionKeys,
		keyPrefix: activeScope.collectionPrefix,
	});

	let merged = mergeSkillResults(remoteSkills, cachedSkills, SEARCH_RESULT_LIMIT);

	if (refineKeywords.length > 0) {
		merged = rankByRefineKeywords(merged, refineKeywords);
	}

	renderedSkills = merged;
	const hasQuery = activeRemoteQuery.length >= 2 || refineKeywords.length > 0;
	const errorMessage = remoteError && renderedSkills.length === 0
		? `Search failed: ${remoteError}`
		: null;

	renderer.setItems(renderedSkills, {
		isLoading: isRemoteLoading,
		error: errorMessage,
		loadingMessage: activeScope.loadingMessage,
		emptyMessage: hasQuery ? activeScope.emptyMessage : 'Keep typing to search skills.',
	});
	updateCount(countEl);
}

function showSearchPanel(searchPanel: HTMLElement): void {
	const allPanels = document.querySelectorAll<HTMLElement>('.install-panel:not(#install-panel-search)');
	allPanels.forEach(panel => {
		panel.hidden = true;
		panel.setAttribute('aria-hidden', 'true');
	});

	searchPanel.hidden = false;
	searchPanel.setAttribute('aria-hidden', 'false');
}

function hideSearchPanel(searchPanel: HTMLElement, countEl: HTMLElement | null, clearOfficialSourceSearch = true): void {
	activeQuery = '';
	activeRemoteQuery = '';
	activeRequestId += 1;
	remoteSkills = [];
	renderedSkills = [];
	remoteError = null;
	isRemoteLoading = false;
	activeScope = getCurrentSearchScope();

	if (pendingTimer !== undefined) {
		window.clearTimeout(pendingTimer);
		pendingTimer = undefined;
	}

	searchPanel.hidden = true;
	searchPanel.setAttribute('aria-hidden', 'true');
	if (countEl) {
		countEl.hidden = true;
	}

	const activeFilter = document.querySelector<HTMLButtonElement>('.install-filter.active');
	if (activeFilter) {
		const target = activeFilter.dataset.filter;
		const activePanel = document.getElementById(`install-panel-${target}`);
		if (activePanel) {
			activePanel.hidden = false;
			activePanel.setAttribute('aria-hidden', 'false');
		}
	}

	if (clearOfficialSourceSearch) {
		dispatchOfficialSourceSearch('');
	}
}

function updateCount(countEl: HTMLElement | null): void {
	if (!countEl) {
		return;
	}

	if (activeQuery === '' && refineKeywords.length === 0) {
		countEl.hidden = true;
		return;
	}

	if (renderedSkills.length === 0 && isRemoteLoading) {
		const displayQuery = getDisplayQuery();
		countEl.textContent = `${activeScope.loadingMessage.replace(/\.\.\.$/, '')} "${displayQuery}"`;
		countEl.hidden = false;
		return;
	}

	if (renderedSkills.length === 0) {
		countEl.hidden = true;
		return;
	}

	const suffix = renderedSkills.length === 1 ? 'result' : 'results';
	const loadingSuffix = isRemoteLoading ? ' - searching marketplace' : '';
	const displayQuery = getDisplayQuery();
	const label = getDisplayScopeLabel();

	countEl.textContent = activeQuery || refineKeywords.length === 0
		? `${renderedSkills.length} ${suffix} in ${label} for "${displayQuery}"${loadingSuffix}`
		: `${renderedSkills.length} ${suffix} in ${label}${loadingSuffix}`;
	countEl.hidden = false;
}

function bindPlaceholderUpdates(searchInput: HTMLInputElement): void {
	document.querySelectorAll<HTMLButtonElement>('.install-filter[data-filter]').forEach(filter => {
		filter.addEventListener('click', () => window.setTimeout(() => updateSearchPlaceholder(searchInput), 0));
	});

	document.getElementById('install-filter-trending')?.addEventListener('click', () => {
		window.setTimeout(() => updateSearchPlaceholder(searchInput), 0);
	});

	const officialPanel = document.getElementById('install-panel-official');
	if (officialPanel) {
		new MutationObserver(() => updateSearchPlaceholder(searchInput)).observe(officialPanel, {
			attributes: true,
			attributeFilter: ['data-official-search-mode', 'data-official-display-name', 'data-official-owner', 'hidden', 'aria-hidden'],
		});
	}
}

function updateSearchPlaceholder(searchInput: HTMLInputElement): void {
	searchInput.placeholder = getCurrentSearchScope().placeholder;
}

function getCurrentSearchScope(): SearchScope {
	const activeFilter = document.querySelector<HTMLButtonElement>('.install-filter.active');
	const filter = activeFilter?.dataset.filter;

	if (filter === 'trending') {
		const mode = document.getElementById('install-filter-trending')?.dataset.trendingMode === 'flame' ? 'flame' : '24h';
		return {
			kind: 'trending',
			label: mode === 'flame' ? 'Flame' : 'Trending 24h',
			placeholder: mode === 'flame' ? 'Search flame picks...' : 'Search trending...',
			emptyMessage: mode === 'flame' ? 'No flame picks found for this query.' : 'No trending skills found for this query.',
			loadingMessage: mode === 'flame' ? 'Searching flame picks...' : 'Searching trending...',
			remote: false,
			collectionKeys: [mode === 'flame' ? 'flame' : 'trending24h'],
		};
	}

	if (filter === 'official') {
		const officialPanel = document.getElementById('install-panel-official');
		const owner = officialPanel?.dataset.officialOwner;
		const displayName = officialPanel?.dataset.officialDisplayName;
		if (officialPanel?.dataset.officialSearchMode === 'owner' && owner) {
			const label = displayName ? `${displayName} skills` : 'Official skills';
			return {
				kind: 'official-owner',
				label,
				placeholder: displayName ? `Search ${displayName} skills...` : 'Search official skills...',
				emptyMessage: 'No official skills found for this query.',
				loadingMessage: displayName ? `Searching ${displayName} skills...` : 'Searching official skills...',
				remote: false,
				collectionKeys: [`official:${owner}`],
			};
		}

		return {
			kind: 'official-sources',
			label: 'Official',
			placeholder: 'Search official...',
			emptyMessage: 'No official sources found.',
			loadingMessage: 'Searching official...',
			remote: false,
		};
	}

	return createAllScope();
}

function createAllScope(): SearchScope {
	return {
		kind: 'all',
		label: 'All Time',
		placeholder: 'Search all skills...',
		emptyMessage: 'No skills found for this query.',
		loadingMessage: 'Searching skills...',
		remote: true,
	};
}

function dispatchOfficialSourceSearch(query: string): void {
	window.dispatchEvent(new CustomEvent(OFFICIAL_SOURCE_SEARCH_EVENT, {
		detail: { query },
	}));
}

function clearSearchInput(
	searchInput: HTMLInputElement,
	searchPanel: HTMLElement,
	countEl: HTMLElement | null,
): void {
	searchInput.value = '';
	updateClearButton(searchInput, document.getElementById('install-search-clear') as HTMLButtonElement | null);
	if (refineKeywords.length > 0) {
		startSearch('', getCurrentSearchScope(), searchPanel, countEl);
		return;
	}

	hideSearchPanel(searchPanel, countEl);
}

function updateClearButton(searchInput: HTMLInputElement, clearButton: HTMLButtonElement | null): void {
	if (!clearButton) {
		return;
	}

	clearButton.hidden = searchInput.value.trim().length === 0;
}

function buildRefinedQuery(userQuery: string): string {
	const terms: string[] = [];
	const normalizedUserQuery = userQuery.trim();
	if (normalizedUserQuery) {
		terms.push(normalizedUserQuery);
	}

	for (const keyword of refineKeywords) {
		const normalizedKeyword = keyword.trim();
		if (!normalizedKeyword || terms.includes(normalizedKeyword)) {
			continue;
		}

		terms.push(normalizedKeyword);
		if (terms.length >= 10) {
			break;
		}
	}

	return terms.join(' ');
}

function getDisplayQuery(): string {
	if (activeQuery) {
		return activeQuery;
	}

	return getRefineLabelText() || activeRemoteQuery || refineKeywords.join(' ');
}

function getDisplayScopeLabel(): string {
	if (refineKeywords.length === 0) {
		return activeScope.label;
	}

	const refineText = getRefineLabelText();
	return refineText ? `refined ${refineText}` : 'refined skills';
}

function getRefineLabelText(): string {
	return refineLabels.length > 0 ? refineLabels.join(' + ') : '';
}

function rankByRefineKeywords(
	skills: InstallMarketplaceSkill[],
	keywords: string[],
): InstallMarketplaceSkill[] {
	if (keywords.length === 0) {
		return skills;
	}

	const lowerKeywords = keywords.map(kw => kw.toLowerCase());

	return skills
		.map(skill => ({
			skill,
			score: scoreByRefine(skill, lowerKeywords),
		}))
		.sort((a, b) => {
			if (b.score !== a.score) {
				return b.score - a.score;
			}

			return b.skill.installs - a.skill.installs;
		})
		.map(entry => entry.skill);
}

function scoreByRefine(skill: InstallMarketplaceSkill, keywords: string[]): number {
	const name = skill.name.toLowerCase();
	const skillId = skill.skillId.toLowerCase();
	const source = skill.source.toLowerCase();
	let score = 0;

	for (const kw of keywords) {
		if (name === kw || skillId === kw) {
			score += 90;
		} else if (name.startsWith(kw) || skillId.startsWith(kw)) {
			score += 55;
		} else if (name.includes(kw) || skillId.includes(kw)) {
			score += 30;
		} else if (source.includes(kw)) {
			score += 12;
		} else {
			const fullHaystack = `${name} ${skillId} ${source}`;
			const terms = kw.split(/[\s-]+/g);
			if (terms.every(term => fullHaystack.includes(term))) {
				score += 8;
			}
		}
	}

	return score;
}

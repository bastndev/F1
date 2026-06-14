import type { InstallMarketplaceSkill, InstallStatus } from '../trending-skill/install-item';
import { InstallListRenderer } from '../../shared/install-list-renderer';
import { removeSkillFromCollections, setSkillCollection } from '../../shared/skill-store';

interface VsCodeApi {
	postMessage(message: unknown): void;
}

interface OfficialSkillSource {
	id: string;
	owner: string;
	displayName: string;
	featuredRepo: string;
	repoCount: number;
	skillCount: number;
	totalInstalls: number | null;
}

interface OfficialElements {
	gridView: HTMLElement;
	listView: HTMLElement;
	grid: HTMLElement;
	gridStatus: HTMLElement;
	backButton: HTMLButtonElement;
	listLogo: HTMLImageElement;
	listInitials: HTMLElement;
	listTitle: HTMLElement;
	listMeta: HTMLElement;
	listStatus: HTMLElement;
	list: HTMLElement;
}

const LOGO_FILES = new Set([
	'anthropics',
	'openai',
	'github',
	'microsoft',
	'vercel',
	'cloudflare',
	'stripe',
	'figma',
	'supabase',
	'firebase',
	'flutter',
	'huggingface',
	'auth0',
	'prisma',
	'expo',
	'makenotion',
	'clerk',
	'posthog',
	'getsentry',
	'hashicorp',
	'datadog-labs',
	'clickhouse',
	'google-labs-code',
	'browserbase',
	'callstackincubator',
	'firecrawl',
	'neondatabase',
	'semgrep',
	'upstash',
]);

function ownerDisplayName(owner: string): string {
	const overrides: Record<string, string> = {
		'anthropics': 'Anthropic',
		'callstackincubator': 'Callstack',
		'clickhouse': 'ClickHouse',
		'datadog-labs': 'Datadog',
		'getsentry': 'Sentry',
		'github': 'GitHub',
		'google-labs-code': 'Google Labs',
		'hashicorp': 'HashiCorp',
		'huggingface': 'Hugging Face',
		'makenotion': 'Notion',
		'neondatabase': 'Neon',
	};

	if (overrides[owner]) {
		return overrides[owner];
	}

	return owner
		.split(/[-\s]+/)
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

const installStatuses = new Map<string, InstallStatus>();
const OFFICIAL_SOURCE_SEARCH_EVENT = 'install-search:official-sources';

let vscodeApi: VsCodeApi | undefined;
let elements: OfficialElements | undefined;
let selectedListRenderer: InstallListRenderer | undefined;
let baseImagesUri = '';
let sources: OfficialSkillSource[] = [];
let selectedSource: OfficialSkillSource | undefined;
let selectedSkills: InstallMarketplaceSkill[] = [];
let spotlightPending: MouseEvent | null = null;
let spotlightRafId: number | undefined;
let hasPlayedEntryAnimation = false;
let gridError: string | null = null;
let sourceSearchQuery = '';

export function initOfficialPanel(api: VsCodeApi): void {
	vscodeApi = api;

	const gridView = document.getElementById('official-grid-view');
	const listView = document.getElementById('official-list-view');
	const grid = document.getElementById('official-grid');
	const gridStatus = document.getElementById('official-grid-status');
	const backButton = document.getElementById('official-back-btn') as HTMLButtonElement | null;
	const listLogo = document.getElementById('official-list-logo') as HTMLImageElement | null;
	const listInitials = document.getElementById('official-list-initials');
	const listTitle = document.getElementById('official-list-title');
	const listMeta = document.getElementById('official-list-meta');
	const listStatus = document.getElementById('official-list-status');
	const list = document.getElementById('official-skill-list');

	if (!gridView || !listView || !grid || !gridStatus || !backButton || !listLogo || !listInitials || !listTitle || !listMeta || !listStatus || !list) {
		return;
	}

	baseImagesUri = grid.dataset.baseUri ?? '';
	elements = { gridView, listView, grid, gridStatus, backButton, listLogo, listInitials, listTitle, listMeta, listStatus, list };
	selectedListRenderer = new InstallListRenderer({
		status: listStatus,
		list,
		getStatus: id => installStatuses.get(id) ?? 'idle',
	});

	grid.addEventListener('click', event => {
		const card = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.official-card[data-owner]');
		if (!card || !card.dataset.owner) {
			return;
		}

		const source = sources.find(candidate => candidate.owner === card.dataset.owner);
		if (source) {
			clearInstallSearchInput();
			openOfficialSource(source);
		}
	});

	list.addEventListener('click', event => {
		const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.install-btn[data-install-id]');
		if (!button || button.disabled || !button.dataset.installId) {
			return;
		}

		const id = button.dataset.installId;
		installStatuses.set(id, 'installing');
		selectedListRenderer?.updateItem(id);
		vscodeApi?.postMessage({ type: 'installSkill.install', id });
	});

	backButton.addEventListener('click', showGrid);
	grid.addEventListener('mousemove', schedulePointerSpotlight);
	window.addEventListener(OFFICIAL_SOURCE_SEARCH_EVENT, event => {
		if (event instanceof CustomEvent && typeof event.detail?.query === 'string') {
			sourceSearchQuery = event.detail.query;
			filterOfficialSourceCards();
		}
	});

	window.addEventListener('message', event => {
		const message = event.data;
		if (!message || typeof message !== 'object' || !('type' in message)) {
			return;
		}

		if (message.type === 'officialSources.update' && Array.isArray(message.sources)) {
			sources = message.sources.filter(isVisibleSource);
			applySourceData(!message.isLoading, typeof message.error === 'string' ? message.error : null);
		}

		if (
			message.type === 'officialSkills.update'
			&& typeof message.owner === 'string'
			&& selectedSource?.owner === message.owner
			&& Array.isArray(message.skills)
		) {
			selectedSkills = message.skills;
			setSkillCollection(`official:${message.owner}`, selectedSkills);
			renderSelectedSkills(Boolean(message.isLoading), typeof message.error === 'string' ? message.error : null);
		}

		if (message.type === 'installSkill.status' && typeof message.id === 'string' && typeof message.status === 'string') {
			if (message.status === 'installing') {
				installStatuses.set(message.id, 'installing');
			} else {
				installStatuses.delete(message.id);
			}
			if (message.status === 'installed') {
				selectedSkills = selectedSkills.filter(skill => skill.id !== message.id);
				removeSkillFromCollections(message.id);
				selectedListRenderer?.removeItem(message.id);
			} else {
				selectedListRenderer?.updateItem(message.id);
			}
		}
	});

	createImmediateCards();
	setOfficialSearchState('sources');
	observeOfficialVisibility();
	vscodeApi.postMessage({ type: 'officialSources.request' });
}

function observeOfficialVisibility(): void {
	if (!elements) {
		return;
	}

	const officialPanel = document.getElementById('install-panel-official');
	if (!officialPanel) {
		return;
	}

	const maybePlayAnimation = () => {
		if (!hasPlayedEntryAnimation && !officialPanel.hidden && officialPanel.getAttribute('aria-hidden') !== 'true') {
			playEntryAnimation();
		}
	};

	new MutationObserver(maybePlayAnimation).observe(officialPanel, {
		attributes: true,
		attributeFilter: ['hidden', 'aria-hidden'],
	});

	maybePlayAnimation();
}

function createImmediateCards(): void {
	if (!elements) {
		return;
	}

	const owners = Array.from(LOGO_FILES);
	const cards = owners.map((owner, index) => createPlaceholderCard(owner, index));

	elements.grid.replaceChildren(...cards);
	elements.gridStatus.hidden = true;
	elements.grid.hidden = false;
}

function playEntryAnimation(): void {
	if (!elements) {
		return;
	}

	hasPlayedEntryAnimation = true;
	elements.grid.classList.remove('official-grid--animate');
	void elements.grid.offsetWidth;
	requestAnimationFrame(() => {
		elements?.grid.classList.add('official-grid--animate');
		window.setTimeout(() => {
			elements?.grid.classList.remove('official-grid--animate');
		}, 2800);
	});
}

function createPlaceholderCard(owner: string, index: number): HTMLButtonElement {
	const displayName = ownerDisplayName(owner);
	const card = document.createElement('button');
	card.className = 'official-card';
	card.type = 'button';
	card.dataset.owner = owner;
	card.title = displayName;
	card.ariaLabel = `${displayName}, official skills`;
	card.style.setProperty('--card-index', String(index));
	card.style.setProperty('--card-pair-index', String(Math.floor(index / 2)));
	card.style.setProperty('--card-lane-index', String(index % 2));

	const iconShell = document.createElement('span');
	iconShell.className = 'official-card-icon-shell';

	const img = document.createElement('img');
	img.className = 'official-card-icon';
	img.src = `${baseImagesUri}/${owner}.png`;
	img.alt = '';
	img.loading = 'lazy';
	img.addEventListener('error', () => {
		img.remove();
		iconShell.append(createInitials(displayName, 'official-card-initials'));
	}, { once: true });
	iconShell.append(img);

	const title = document.createElement('span');
	title.className = 'official-card-title';
	title.textContent = displayName;

	const meta = document.createElement('span');
	meta.className = 'official-card-meta official-card-meta--pending';
	meta.textContent = '\u2014';

	card.append(iconShell, title, meta);
	return card;
}

function applySourceData(hasData: boolean, error: string | null): void {
	if (!elements) {
		return;
	}

	gridError = !hasData && error ? error : null;
	if (!hasData && error) {
		elements.gridStatus.textContent = `Failed to load data: ${error}`;
		elements.gridStatus.hidden = false;
	}

	sources.forEach(source => {
		const card = elements!.grid.querySelector<HTMLButtonElement>(`.official-card[data-owner="${CSS.escape(source.owner)}"]`);
		if (!card) {
			return;
		}

		const meta = card.querySelector<HTMLElement>('.official-card-meta');
		if (!meta) {
			return;
		}

		meta.classList.remove('official-card-meta--pending');
		meta.textContent = `${source.skillCount} skills`;
		card.ariaLabel = `${source.displayName}, ${source.skillCount} official skills`;
		card.title = source.displayName;
	});

	filterOfficialSourceCards();
}

function openOfficialSource(source: OfficialSkillSource): void {
	if (!elements) {
		return;
	}

	selectedSource = source;
	selectedSkills = [];
	elements.listTitle.textContent = source.displayName;
	elements.listMeta.textContent = `${formatCount(source.repoCount)} repos - ${formatCount(source.skillCount)} skills`;
	elements.listInitials.textContent = initialsFor(source.displayName);
	elements.listLogo.hidden = true;
	elements.listLogo.removeAttribute('src');
	elements.listInitials.hidden = false;

	const logoFile = logoFileFor(source.owner);
	if (logoFile) {
		elements.listLogo.src = `${baseImagesUri}/${logoFile}`;
		elements.listLogo.hidden = false;
		elements.listInitials.hidden = true;
		elements.listLogo.onerror = () => {
			if (elements) {
				elements.listLogo.hidden = true;
				elements.listInitials.hidden = false;
			}
		};
	}

	elements.gridView.hidden = true;
	elements.gridView.classList.remove('active');
	elements.listView.hidden = false;
	elements.listView.classList.add('active');
	setOfficialSearchState('owner', source.displayName, source.owner);
	renderSelectedSkills(true, null);
	vscodeApi?.postMessage({ type: 'officialSkills.request', owner: source.owner });
}

function renderSelectedSkills(isLoading: boolean, error: string | null): void {
	if (!selectedListRenderer || !selectedSource) {
		return;
	}

	selectedListRenderer.setItems(selectedSkills, {
		isLoading,
		error: error ? `Failed to load official skills: ${error}` : null,
		loadingMessage: `Loading ${selectedSource.displayName} skills...`,
		emptyMessage: 'No installable official skills found.',
	});
}

function showGrid(): void {
	if (!elements) {
		return;
	}

	elements.listView.hidden = true;
	elements.listView.classList.remove('active');
	elements.gridView.hidden = false;
	elements.gridView.classList.add('active');
	selectedSource = undefined;
	selectedSkills = [];
	setOfficialSearchState('sources');
	filterOfficialSourceCards();
}

function filterOfficialSourceCards(): void {
	if (!elements) {
		return;
	}

	const query = sourceSearchQuery.trim().toLowerCase();
	const terms = query.split(/\s+/g).filter(Boolean);
	const cards = Array.from(elements.grid.querySelectorAll<HTMLButtonElement>('.official-card[data-owner]'));
	let visibleCount = 0;

	cards.forEach(card => {
		const owner = card.dataset.owner ?? '';
		const title = card.querySelector<HTMLElement>('.official-card-title')?.textContent ?? '';
		const meta = card.querySelector<HTMLElement>('.official-card-meta')?.textContent ?? '';
		const source = sources.find(candidate => candidate.owner === owner);
		const haystack = [
			owner,
			title,
			meta,
			source?.displayName ?? '',
			source?.featuredRepo ?? '',
		].join(' ').toLowerCase();
		const isVisible = terms.length === 0 || terms.every(term => haystack.includes(term));
		card.hidden = !isVisible;
		if (isVisible) {
			visibleCount += 1;
		}
	});

	if (gridError) {
		elements.gridStatus.textContent = `Failed to load data: ${gridError}`;
		elements.gridStatus.hidden = false;
		return;
	}

	if (terms.length > 0 && visibleCount === 0) {
		elements.gridStatus.textContent = 'No official sources found.';
		elements.gridStatus.hidden = false;
		return;
	}

	elements.gridStatus.hidden = true;
}

function setOfficialSearchState(mode: 'sources' | 'owner', displayName?: string, owner?: string): void {
	const officialPanel = document.getElementById('install-panel-official');
	if (!officialPanel) {
		return;
	}

	officialPanel.dataset.officialSearchMode = mode;
	if (displayName) {
		officialPanel.dataset.officialDisplayName = displayName;
	} else {
		delete officialPanel.dataset.officialDisplayName;
	}

	if (owner) {
		officialPanel.dataset.officialOwner = owner;
	} else {
		delete officialPanel.dataset.officialOwner;
	}
}

function clearInstallSearchInput(): void {
	const searchInput = document.getElementById('install-search-input') as HTMLInputElement | null;
	if (!searchInput || searchInput.value === '') {
		return;
	}

	searchInput.value = '';
	searchInput.dispatchEvent(new Event('input', { bubbles: true }));
}

function schedulePointerSpotlight(event: MouseEvent): void {
	spotlightPending = event;

	if (spotlightRafId !== undefined) {
		return;
	}

	spotlightRafId = requestAnimationFrame(() => {
		spotlightRafId = undefined;
		const ev = spotlightPending;
		spotlightPending = null;

		if (!ev || !elements || !window.matchMedia('(pointer: fine)').matches) {
			return;
		}

		elements.grid.querySelectorAll<HTMLElement>('.official-card').forEach(card => {
			const rect = card.getBoundingClientRect();
			card.style.setProperty('--mouse-x', `${ev.clientX - rect.left}px`);
			card.style.setProperty('--mouse-y', `${ev.clientY - rect.top}px`);
		});
	});
}

function logoFileFor(owner: string): string | undefined {
	return LOGO_FILES.has(owner) ? `${owner}.png` : undefined;
}

function isVisibleSource(source: OfficialSkillSource): boolean {
	return LOGO_FILES.has(source.owner);
}

function initialsFor(value: string): string {
	return value
		.split(/\s+/g)
		.filter(Boolean)
		.slice(0, 2)
		.map(part => part.charAt(0).toUpperCase())
		.join('');
}

function createInitials(value: string, className: string): HTMLSpanElement {
	const fallback = document.createElement('span');
	fallback.className = className;
	fallback.textContent = initialsFor(value);
	return fallback;
}

function formatCount(value: number): string {
	if (value >= 1000) {
		return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`;
	}

	return String(value);
}

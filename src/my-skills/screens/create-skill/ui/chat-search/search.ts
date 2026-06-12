type CreateSkillMode = 'create' | 'search';
type SearchResultKind = 'recommendations' | 'publisher';

interface CreateSkillSubmitDetail {
	mode: CreateSkillMode;
	query: string;
}

interface InstallMarketplaceSkill {
	id: string;
	skillId: string;
	name: string;
	installs: number;
	source: string;
}

interface RecommendedSkill {
	skill: InstallMarketplaceSkill;
	reasons: string[];
	score: number;
}

interface DetectedTechnology {
	id: string;
	name: string;
}

interface SearchUpdateDetail {
	type: 'createSkill.search.update';
	query: string;
	requestId: number;
	resultKind?: SearchResultKind;
	title?: string;
	kicker?: string;
	technologies: DetectedTechnology[];
	recommendations: RecommendedSkill[];
	isLoading: boolean;
	error: string | null;
}

const RECOMMENDATION_LIMIT = 5;
const SEARCH_RESULTS_TITLE = 'Best skills for your project...';
const SEARCH_RESULTS_KICKER = 'Recommended';

let activeRequestId = 0;
let installStatuses = new Map<string, 'idle' | 'installing'>();
let lastRecommendations: RecommendedSkill[] = [];
let lastResultKind: SearchResultKind = 'recommendations';
let lastTechnologies: DetectedTechnology[] = [];
let visibleResultOffset = 0;
let searchMetaContainer: HTMLElement | undefined;
let searchPageActions: HTMLElement | undefined;
let searchBackButton: HTMLButtonElement | undefined;
let searchMoreButton: HTMLButtonElement | undefined;

export function initSearchMode() {
	const emptyState = document.querySelector<HTMLElement>('[data-create-search-empty]');
	const results = document.querySelector<HTMLElement>('[data-create-search-results]');
	const kicker = document.querySelector<HTMLElement>('[data-create-search-kicker]');
	const title = document.querySelector<HTMLElement>('[data-create-search-title]');
	const techs = document.querySelector<HTMLElement>('[data-create-search-techs]');
	const status = document.querySelector<HTMLElement>('[data-create-search-status]');
	const list = document.querySelector<HTMLElement>('[data-create-search-list]');
	const pageActions = document.querySelector<HTMLElement>('[data-create-search-page-actions]');
	const backButton = document.querySelector<HTMLButtonElement>('[data-create-search-page-back]');
	const moreButton = document.querySelector<HTMLButtonElement>('[data-create-search-page-more]');

	if (!emptyState || !results || !kicker || !title || !techs || !status || !list || !pageActions || !backButton || !moreButton) {
		return;
	}
	searchMetaContainer = techs;
	searchPageActions = pageActions;
	searchBackButton = backButton;
	searchMoreButton = moreButton;

	window.addEventListener('createSkill.chat.submit', event => {
		if (!(event instanceof CustomEvent) || !isSubmitDetail(event.detail) || event.detail.mode !== 'search') {
			return;
		}

		activeRequestId += 1;
		const requestId = activeRequestId;
		showLoading(emptyState, results, kicker, title, techs, status, list);
		window.dispatchEvent(new CustomEvent('createSkill.search.request', {
			detail: {
				query: event.detail.query,
				requestId,
				limit: RECOMMENDATION_LIMIT,
			},
		}));
	});

	window.addEventListener('createSkill.search.update', event => {
		if (!(event instanceof CustomEvent) || !isSearchUpdate(event.detail)) {
			return;
		}

		const detail = event.detail;
		if (detail.requestId !== activeRequestId) {
			return;
		}

		if (detail.isLoading) {
			showLoading(emptyState, results, kicker, title, techs, status, list, detail.technologies);
			return;
		}

		lastRecommendations = detail.recommendations;
		lastResultKind = detail.resultKind ?? 'recommendations';
		renderResults(emptyState, results, kicker, title, techs, status, list, detail);
	});

	window.addEventListener('message', event => {
		const message = event.data;
		if (!message || typeof message !== 'object' || !('type' in message)) {
			return;
		}

		if (message.type === 'installSkill.status' && typeof message.id === 'string' && typeof message.status === 'string') {
			if (message.status === 'installing') {
				installStatuses.set(message.id, 'installing');
				updateInstallButton(list, message.id, true);
			} else {
				installStatuses.delete(message.id);

				if (message.status === 'installed') {
					lastRecommendations = lastRecommendations.filter(recommendation => recommendation.skill.id !== message.id);
					renderRecommendationList(list, status, true);
				} else {
					updateInstallButton(list, message.id, false);
				}
			}
		}
	});

	list.addEventListener('click', event => {
		const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-create-search-install-id]');
		if (!button || button.disabled || !button.dataset.createSearchInstallId) {
			return;
		}

		const id = button.dataset.createSearchInstallId;
		installStatuses.set(id, 'installing');
		renderRecommendationList(list, status, true);
		window.dispatchEvent(new CustomEvent('createSkill.install.request', {
			detail: { id },
		}));
	});

	moreButton.addEventListener('click', () => {
		if (lastResultKind !== 'publisher' || lastRecommendations.length <= RECOMMENDATION_LIMIT) {
			return;
		}

		const nextOffset = visibleResultOffset + RECOMMENDATION_LIMIT;
		if (nextOffset >= lastRecommendations.length) {
			return;
		}

		visibleResultOffset = nextOffset;
		renderRecommendationList(list, status, true);
	});

	backButton.addEventListener('click', () => {
		if (lastResultKind !== 'publisher' || visibleResultOffset <= 0) {
			return;
		}

		visibleResultOffset = Math.max(0, visibleResultOffset - RECOMMENDATION_LIMIT);
		renderRecommendationList(list, status, true);
	});
}

function showLoading(
	emptyState: HTMLElement,
	results: HTMLElement,
	kicker: HTMLElement,
	title: HTMLElement,
	techs: HTMLElement,
	status: HTMLElement,
	list: HTMLElement,
	technologies: DetectedTechnology[] = [],
) {
	window.dispatchEvent(new CustomEvent('createSkill.search.state', {
		detail: { hasCompletedSearch: false },
	}));
	emptyState.hidden = true;
	results.hidden = false;
	results.dataset.createSearchKind = 'recommendations';
	lastResultKind = 'recommendations';
	lastTechnologies = technologies;
	visibleResultOffset = 0;
	kicker.textContent = SEARCH_RESULTS_KICKER;
	title.textContent = SEARCH_RESULTS_TITLE;
	renderSearchMeta(techs);
	status.hidden = true;
	status.classList.remove('create-search-status--loading');
	status.textContent = '';
	list.replaceChildren();

	for (let i = 0; i < RECOMMENDATION_LIMIT; i++) {
		const skeleton = createSkeletonCard(i);
		skeleton.style.animationDelay = `${i * 80}ms`;
		list.append(skeleton);
	}
}

function renderResults(
	emptyState: HTMLElement,
	results: HTMLElement,
	kicker: HTMLElement,
	title: HTMLElement,
	techs: HTMLElement,
	status: HTMLElement,
	list: HTMLElement,
	detail: SearchUpdateDetail,
) {
	emptyState.hidden = true;
	results.hidden = false;
	results.dataset.createSearchKind = detail.resultKind ?? 'recommendations';
	lastTechnologies = detail.technologies;
	visibleResultOffset = 0;
	kicker.textContent = detail.kicker ?? SEARCH_RESULTS_KICKER;
	title.textContent = detail.title ?? SEARCH_RESULTS_TITLE;
	renderSearchMeta(techs);

	if (detail.error) {
		status.hidden = false;
		status.classList.remove('create-search-status--loading');
		status.textContent = '';

		const errorText = document.createElement('span');
		errorText.textContent = 'Search failed. Please try again.';

		const retryButton = document.createElement('button');
		retryButton.className = 'create-search-retry';
		retryButton.type = 'button';
		retryButton.textContent = 'Retry';
		retryButton.addEventListener('click', () => {
			activeRequestId += 1;
			showLoading(emptyState, results, kicker, title, techs, status, list);
			window.dispatchEvent(new CustomEvent('createSkill.search.request', {
				detail: {
					query: detail.query,
					requestId: activeRequestId,
					limit: RECOMMENDATION_LIMIT,
				},
			}));
		});

		status.append(errorText, retryButton);
		list.replaceChildren();
		renderSearchMeta(techs);
		return;
	}

	renderRecommendationList(list, status);
	window.dispatchEvent(new CustomEvent('createSkill.search.state', {
		detail: { hasCompletedSearch: true },
	}));
}

function renderSearchMeta(container = searchMetaContainer) {
	if (!container) {
		return;
	}

	container.replaceChildren();
	if (lastResultKind === 'publisher' && lastRecommendations.length > 0) {
		renderPublisherPagination(container);
		return;
	}

	renderTechs(container, lastTechnologies);
}

function renderTechs(container: HTMLElement, technologies: DetectedTechnology[]) {
	container.replaceChildren();
	for (const [index, technology] of technologies.slice(0, 3).entries()) {
		const chip = document.createElement('span');
		chip.className = 'create-search-tech';
		chip.textContent = technology.name;
		chip.style.animationDelay = `${index * 55}ms`;
		container.append(chip);
	}
}

function renderRecommendationList(list: HTMLElement, status: HTMLElement, skipAnimation = false) {
	list.replaceChildren();

	if (lastRecommendations.length === 0) {
		status.hidden = false;
		status.classList.remove('create-search-status--loading');
		status.textContent = 'No installable skills found yet. Try describing the workflow more specifically.';
		renderSearchMeta();
		return;
	}

	clampVisibleResultOffset();
	renderSearchMeta();
	status.hidden = true;
	status.classList.remove('create-search-status--loading');
	const fragment = document.createDocumentFragment();
	lastRecommendations.slice(visibleResultOffset, visibleResultOffset + RECOMMENDATION_LIMIT).forEach((recommendation, index) => {
		const card = createRecommendationCard(recommendation);
		if (!skipAnimation) {
			card.classList.add('create-search-card--enter');
			card.style.animationDelay = `${index * 65}ms`;
		}
		fragment.append(card);
	});
	list.append(fragment);

	if (!skipAnimation) {
		window.setTimeout(() => {
			list.querySelectorAll('.create-search-card--enter').forEach(card => {
				card.classList.remove('create-search-card--enter');
				(card as HTMLElement).style.animationDelay = '';
			});
		}, 620);
	}
}

function clampVisibleResultOffset(): void {
	if (lastResultKind !== 'publisher') {
		visibleResultOffset = 0;
		return;
	}

	if (visibleResultOffset < lastRecommendations.length) {
		return;
	}

	const lastPageIndex = Math.max(0, Math.ceil(lastRecommendations.length / RECOMMENDATION_LIMIT) - 1);
	visibleResultOffset = lastPageIndex * RECOMMENDATION_LIMIT;
}

function renderPublisherPagination(container: HTMLElement): void {
	if (!searchPageActions || !searchBackButton || !searchMoreButton) {
		return;
	}

	const firstResultNumber = visibleResultOffset + 1;
	const lastResultNumber = Math.min(lastRecommendations.length, visibleResultOffset + RECOMMENDATION_LIMIT);
	for (let index = firstResultNumber; index <= lastResultNumber; index++) {
		const indicator = document.createElement('span');
		indicator.className = 'create-search-page-indicator';
		indicator.textContent = String(index);
		indicator.style.setProperty('--search-page-alpha', String(getPageIndicatorAlpha(index, firstResultNumber, lastResultNumber)));
		container.append(indicator);
	}

	container.append(searchPageActions);
	const hasNextPage = visibleResultOffset + RECOMMENDATION_LIMIT < lastRecommendations.length;
	const hasPreviousPage = visibleResultOffset > 0;
	searchBackButton.hidden = !hasPreviousPage;
	searchMoreButton.hidden = !hasNextPage;
	searchPageActions.hidden = !hasNextPage && !hasPreviousPage;
	searchPageActions.dataset.createSearchPageState = getPageActionState(hasPreviousPage, hasNextPage);
	searchBackButton.textContent = hasNextPage ? '<' : 'Back';
	searchBackButton.ariaLabel = hasNextPage ? 'Show previous marketplace results' : 'Return to previous marketplace results';
	searchMoreButton.textContent = hasPreviousPage ? '>' : 'More';
	searchMoreButton.ariaLabel = hasPreviousPage ? 'Show more marketplace results' : 'Show more marketplace results';
}

function getPageIndicatorAlpha(index: number, firstResultNumber: number, lastResultNumber: number): number {
	const range = Math.max(1, lastResultNumber - firstResultNumber);
	const progress = (index - firstResultNumber) / range;
	return Number((0.34 + progress * 0.42).toFixed(2));
}

function getPageActionState(hasPreviousPage: boolean, hasNextPage: boolean): 'start' | 'middle' | 'end' | 'none' {
	if (hasPreviousPage && hasNextPage) {
		return 'middle';
	}

	if (hasNextPage) {
		return 'start';
	}

	if (hasPreviousPage) {
		return 'end';
	}

	return 'none';
}

function createRecommendationCard(recommendation: RecommendedSkill): HTMLElement {
	const { skill } = recommendation;
	const isInstalling = installStatuses.get(skill.id) === 'installing';

	const card = document.createElement('article');
	card.className = 'create-search-card';

	const icon = document.createElement('span');
	icon.className = 'create-search-card-icon';
	icon.setAttribute('aria-hidden', 'true');
	icon.append(createSvgIcon());

	const copy = document.createElement('div');
	copy.className = 'create-search-card-copy';

	const title = document.createElement('span');
	title.className = 'create-search-card-title';
	title.textContent = skill.name;

	const source = document.createElement('span');
	source.className = 'create-search-card-source';
	source.textContent = skill.source;

	const reason = document.createElement('span');
	reason.className = 'create-search-card-reason';
	reason.textContent = recommendation.reasons.length > 0
		? recommendation.reasons.slice(0, 2).join(' | ')
		: 'Recommended for this workspace';

	copy.append(title, source, reason);

	const button = document.createElement('button');
	button.className = isInstalling ? 'create-search-install create-search-install--busy' : 'create-search-install';
	button.type = 'button';
	button.dataset.createSearchInstallId = skill.id;
	button.disabled = isInstalling;
	button.textContent = isInstalling ? 'Installing' : 'Install';
	button.ariaLabel = `${button.textContent} ${skill.name}`;

	card.append(icon, copy, button);
	return card;
}

function createSkeletonCard(index: number): HTMLElement {
	const card = document.createElement('article');
	card.className = 'create-search-card create-search-card--skeleton';
	card.setAttribute('aria-hidden', 'true');
	card.style.setProperty('--skeleton-title-width', ['58%', '64%', '52%', '60%', '50%'][index] ?? '58%');
	card.style.setProperty('--skeleton-source-width', ['72%', '62%', '68%', '76%', '64%'][index] ?? '68%');
	card.style.setProperty('--skeleton-reason-width', ['82%', '74%', '80%', '70%', '78%'][index] ?? '78%');

	const icon = document.createElement('span');
	icon.className = 'create-search-card-icon';
	icon.setAttribute('aria-hidden', 'true');

	const copy = document.createElement('div');
	copy.className = 'create-search-card-copy';

	const title = document.createElement('span');
	title.className = 'skeleton-line skeleton-line--title';

	const source = document.createElement('span');
	source.className = 'skeleton-line skeleton-line--source';

	const reason = document.createElement('span');
	reason.className = 'skeleton-line skeleton-line--reason';

	copy.append(title, source, reason);

	const button = document.createElement('div');
	button.className = 'create-search-install create-search-install--skeleton';

	card.append(icon, copy, button);
	return card;
}

function updateInstallButton(list: HTMLElement, skillId: string, isInstalling: boolean): void {
	const button = list.querySelector<HTMLButtonElement>(
		`[data-create-search-install-id="${CSS.escape(skillId)}"]`
	);
	if (!button) {
		return;
	}

	button.disabled = isInstalling;
	button.textContent = isInstalling ? 'Installing' : 'Install';
	button.className = isInstalling
		? 'create-search-install create-search-install--busy'
		: 'create-search-install';
	const skillName = button.closest('.create-search-card')
		?.querySelector('.create-search-card-title')?.textContent ?? '';
	button.ariaLabel = `${button.textContent} ${skillName}`;
}

function isSubmitDetail(value: unknown): value is CreateSkillSubmitDetail {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const detail = value as { mode?: unknown; query?: unknown };
	return (detail.mode === 'create' || detail.mode === 'search') && typeof detail.query === 'string';
}

function isSearchUpdate(value: unknown): value is SearchUpdateDetail {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const detail = value as {
		type?: unknown;
		query?: unknown;
		requestId?: unknown;
		technologies?: unknown;
		recommendations?: unknown;
		resultKind?: unknown;
		title?: unknown;
		kicker?: unknown;
		isLoading?: unknown;
		error?: unknown;
	};

	return detail.type === 'createSkill.search.update'
		&& typeof detail.query === 'string'
		&& typeof detail.requestId === 'number'
		&& (detail.resultKind === undefined || detail.resultKind === 'recommendations' || detail.resultKind === 'publisher')
		&& (detail.title === undefined || typeof detail.title === 'string')
		&& (detail.kicker === undefined || typeof detail.kicker === 'string')
		&& Array.isArray(detail.technologies)
		&& Array.isArray(detail.recommendations)
		&& typeof detail.isLoading === 'boolean'
		&& (detail.error === null || typeof detail.error === 'string');
}

function createSvgIcon(): SVGElement {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 16 16');
	svg.setAttribute('focusable', 'false');

	const paths = [
		'M4 2.5h5.25L12 5.25v8.25H4z',
		'M9 2.75V5.5h2.75',
		'M6 8h4M6 10.25h3',
	];

	for (const d of paths) {
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', d);
		svg.append(path);
	}

	return svg;
}

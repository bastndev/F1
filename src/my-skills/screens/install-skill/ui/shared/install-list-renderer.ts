import { createInstallItem, type InstallMarketplaceSkill, type InstallStatus } from '../panels/trending-skill/install-item';

interface InstallListRendererOptions {
	list: HTMLElement;
	status: HTMLElement;
	getStatus(id: string): InstallStatus;
	onLoadMore?: () => void;
	batchSize?: number;
	variant?: 'default' | 'flame';
}

interface InstallListState {
	isLoading: boolean;
	error: string | null;
	loadingMessage: string;
	emptyMessage: string;
	hasMore: boolean;
}

const DEFAULT_BATCH_SIZE = 50;
const LOAD_MORE_DISTANCE_PX = 180;
const SKELETON_ROWS = 16;

export class InstallListRenderer {
	private readonly batchSize: number;
	private readonly variant: 'default' | 'flame';
	private skills: InstallMarketplaceSkill[] = [];
	private renderedCount = 0;
	private state: InstallListState = {
		isLoading: false,
		error: null,
		loadingMessage: 'Loading skills...',
		emptyMessage: 'No skills found.',
		hasMore: false,
	};
	private loadMoreRequested = false;

	constructor(private readonly options: InstallListRendererOptions) {
		this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
		this.variant = options.variant ?? 'default';
		this.options.list.addEventListener('scroll', () => this.handleScroll());
	}

	public setItems(skills: InstallMarketplaceSkill[], state: Partial<InstallListState> = {}): void {
		const previousSkills = this.skills;
		const previousRenderedCount = this.renderedCount;
		const preservedRenderedCount = hasSameRenderedPrefix(previousSkills, skills, previousRenderedCount)
			? previousRenderedCount
			: 0;
		const previousScrollTop = this.options.list.scrollTop;
		this.skills = skills;
		this.state = { ...this.state, ...state };
		this.loadMoreRequested = this.state.isLoading;

		if (this.state.isLoading && this.skills.length === 0) {
			this.showLoadingStatus(this.state.loadingMessage);
			return;
		}

		if (this.state.error && this.skills.length === 0) {
			this.showTextStatus(this.state.error);
			return;
		}

		if (this.skills.length === 0) {
			this.showTextStatus(this.state.emptyMessage);
			return;
		}

		this.options.status.hidden = true;
		this.options.status.replaceChildren();
		this.options.list.hidden = false;
		this.options.list.replaceChildren();
		this.renderedCount = 0;
		this.appendUntil(Math.max(this.batchSize, preservedRenderedCount));
		this.renderFooter();
		this.options.list.scrollTop = previousScrollTop;
		this.handleScroll();
	}

	public updateItem(id: string): void {
		const index = this.skills.findIndex(skill => skill.id === id);
		if (index < 0 || index >= this.renderedCount) {
			return;
		}

		const item = this.options.list.querySelector<HTMLElement>(`.install-item[data-install-id="${escapeCss(id)}"]`);
		if (!item) {
			return;
		}

		item.replaceWith(this.createItem(this.skills[index], index));
	}

	public removeItem(id: string): void {
		const nextSkills = this.skills.filter(skill => skill.id !== id);
		if (nextSkills.length === this.skills.length) {
			return;
		}

		this.setItems(nextSkills, this.state);
	}

	private handleScroll(): void {
		if (this.options.list.hidden || this.skills.length === 0) {
			return;
		}

		const distanceToEnd = this.options.list.scrollHeight - this.options.list.scrollTop - this.options.list.clientHeight;
		if (distanceToEnd > LOAD_MORE_DISTANCE_PX) {
			return;
		}

		if (this.renderedCount < this.skills.length) {
			this.appendNextBatch();
			this.renderFooter();
			return;
		}

		if (this.state.hasMore && !this.state.isLoading && !this.loadMoreRequested) {
			this.loadMoreRequested = true;
			this.options.onLoadMore?.();
		}
	}

	private appendNextBatch(): void {
		const nextCount = Math.min(this.renderedCount + this.batchSize, this.skills.length);
		if (nextCount <= this.renderedCount) {
			return;
		}

		const footer = this.options.list.querySelector('.install-list-footer');
		footer?.remove();

		const fragment = document.createDocumentFragment();
		for (let index = this.renderedCount; index < nextCount; index += 1) {
			fragment.append(this.createItem(this.skills[index], index));
		}

		this.options.list.append(fragment);
		this.renderedCount = nextCount;
	}

	private appendUntil(targetCount: number): void {
		while (this.renderedCount < Math.min(targetCount, this.skills.length)) {
			const previousCount = this.renderedCount;
			this.appendNextBatch();
			if (this.renderedCount === previousCount) {
				return;
			}
		}
	}

	private renderFooter(): void {
		this.options.list.querySelector('.install-list-footer')?.remove();

		if (this.renderedCount < this.skills.length) {
			return;
		}

		if (this.state.isLoading) {
			this.options.list.append(createInlineLoadingFooter());
			return;
		}

		if (this.state.hasMore) {
			const footer = document.createElement('li');
			footer.className = 'install-list-footer install-list-sentinel';
			footer.setAttribute('aria-hidden', 'true');
			this.options.list.append(footer);
		}
	}

	private createItem(skill: InstallMarketplaceSkill, index: number): HTMLLIElement {
		return createInstallItem(skill, index, this.options.getStatus(skill.id), { variant: this.variant });
	}

	private showLoadingStatus(message: string): void {
		this.options.status.hidden = false;
		this.options.status.classList.add('install-status--loading');
		this.options.status.replaceChildren(createLoadingStatus(message));
		this.options.list.hidden = true;
		this.options.list.replaceChildren();
		this.renderedCount = 0;
	}

	private showTextStatus(message: string): void {
		this.options.status.hidden = false;
		this.options.status.classList.remove('install-status--loading');
		this.options.status.textContent = message;
		this.options.list.hidden = true;
		this.options.list.replaceChildren();
		this.renderedCount = 0;
	}
}

function createLoadingStatus(message: string): DocumentFragment {
	const fragment = document.createDocumentFragment();
	const label = document.createElement('div');
	label.className = 'install-loading-label';
	label.textContent = message;

	const rows = document.createElement('div');
	rows.className = 'install-skeleton-list';
	rows.setAttribute('aria-hidden', 'true');

	for (let index = 0; index < SKELETON_ROWS; index += 1) {
		rows.append(createSkeletonRow(index));
	}

	fragment.append(label, rows);
	return fragment;
}

function createSkeletonRow(index: number): HTMLDivElement {
	const row = document.createElement('div');
	row.className = 'install-skeleton-row';
	row.style.setProperty('--skeleton-index', String(index));

	const rank = document.createElement('span');
	rank.className = 'install-skeleton-rank';

	const copy = document.createElement('span');
	copy.className = 'install-skeleton-copy';

	const name = document.createElement('span');
	name.className = 'install-skeleton-name';

	const source = document.createElement('span');
	source.className = 'install-skeleton-source';

	const meta = document.createElement('span');
	meta.className = 'install-skeleton-meta';

	copy.append(name, source);
	row.append(rank, copy, meta);
	return row;
}

function createInlineLoadingFooter(): HTMLLIElement {
	const footer = document.createElement('li');
	footer.className = 'install-list-footer install-list-loader';
	footer.setAttribute('aria-label', 'Loading more skills');

	for (let index = 0; index < 4; index += 1) {
		footer.append(createSkeletonRow(index));
	}

	return footer;
}

function hasSameRenderedPrefix(
	previousSkills: InstallMarketplaceSkill[],
	nextSkills: InstallMarketplaceSkill[],
	renderedCount: number,
): boolean {
	if (renderedCount === 0 || previousSkills.length === 0 || nextSkills.length === 0) {
		return false;
	}

	const comparableCount = Math.min(renderedCount, previousSkills.length, nextSkills.length);
	for (let index = 0; index < comparableCount; index += 1) {
		if (previousSkills[index].id !== nextSkills[index].id) {
			return false;
		}
	}

	return true;
}

function escapeCss(value: string): string {
	if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
		return CSS.escape(value);
	}

	return value.replace(/["\\]/g, '\\$&');
}

export interface InstallMarketplaceSkill {
	id: string;
	skillId: string;
	name: string;
	installs: number;
	source: string;
}

export type InstallStatus = 'idle' | 'installing' | 'downloading' | 'cancelling';

interface InstallItemOptions {
	variant?: 'default' | 'flame';
}

export function createInstallItem(
	skill: InstallMarketplaceSkill,
	index: number,
	status: InstallStatus,
	options: InstallItemOptions = {},
): HTMLLIElement {
	const isPrompting = status === 'installing';
	const isDownloading = status === 'downloading';
	const isCancelling = status === 'cancelling';
	const isBusy = isPrompting || isDownloading || isCancelling;
	const defaultLabel = isDownloading ? 'Installing' : (isBusy ? 'Cancel' : 'Install');
	const hoverLabel = isBusy ? 'Cancel' : 'Install';

	const item = document.createElement('li');
	item.className = [
		'install-item',
		isBusy ? 'install-item--busy' : '',
		options.variant === 'flame' ? 'install-item--flame' : '',
	].filter(Boolean).join(' ');
	item.dataset.installId = skill.id;

	const rank = document.createElement('span');
	rank.className = 'install-rank';
	rank.textContent = String(index + 1);

	const info = document.createElement('div');
	info.className = 'install-info';

	const name = document.createElement('span');
	name.className = 'install-name';
	name.textContent = skill.name;

	const source = document.createElement('span');
	source.className = 'install-source';
	source.textContent = skill.source;

	const meta = document.createElement('div');
	meta.className = 'install-meta';

	const downloads = document.createElement('span');
	if (options.variant === 'flame' && skill.installs <= 0) {
		downloads.className = 'install-downloads install-downloads--flame';
		downloads.title = 'Flame pick';
		downloads.append(createDownloadIcon(), createFlameMark());
	} else {
		downloads.className = 'install-downloads';
		downloads.append(createDownloadIcon(), document.createTextNode(formatInstalls(skill.installs)));
	}

	const button = document.createElement('button');
	button.className = [
		'install-btn',
		isBusy ? 'install-btn--busy' : '',
		(isPrompting || isCancelling) ? 'install-btn--cancel' : '',
		isDownloading ? 'install-btn--downloading' : '',
	].filter(Boolean).join(' ');
	button.type = 'button';
	button.dataset.installId = skill.id;
	button.dataset.installStatus = status;
	button.ariaLabel = isBusy ? `Cancel installation of ${skill.name}` : `Install ${skill.name}`;
	button.disabled = isCancelling;
	button.append(createButtonText(defaultLabel, 'install-btn-text'), createButtonText(hoverLabel, 'install-btn-hover-text'));

	info.append(name, source);
	meta.append(downloads, button);
	item.append(rank, info, meta);

	return item;
}

export function resolveInstallButtonAction(
	button: HTMLButtonElement | null | undefined,
	handlers: {
		onInstall: (id: string) => void;
		onCancel: (id: string) => void;
	},
): void {
	if (!button || button.disabled || !button.dataset.installId) {
		return;
	}

	const id = button.dataset.installId;
	const status = button.dataset.installStatus as InstallStatus;

	if (status === 'installing' || status === 'downloading') {
		handlers.onCancel(id);
		return;
	}

	if (status === 'cancelling') {
		return;
	}

	handlers.onInstall(id);
}

function createButtonText(label: string, className: string): HTMLSpanElement {
	const span = document.createElement('span');
	span.className = className;
	span.textContent = label;
	span.setAttribute('aria-hidden', 'true');
	return span;
}

function createFlameMark(): HTMLSpanElement {
	const mark = document.createElement('span');
	mark.className = 'install-flame-mark';
	mark.setAttribute('aria-label', 'Flame pick');
	mark.role = 'img';
	return mark;
}

function createDownloadIcon(): SVGSVGElement {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 16 16');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('focusable', 'false');

	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('d', 'M8 2v7M5 6.5L8 10l3-3.5M3 13h10');
	path.setAttribute('fill', 'none');
	path.setAttribute('stroke', 'currentColor');
	path.setAttribute('stroke-width', '1.35');
	path.setAttribute('stroke-linecap', 'round');
	path.setAttribute('stroke-linejoin', 'round');
	svg.append(path);

	return svg;
}

function formatInstalls(value: number): string {
	if (!Number.isFinite(value) || value <= 0) {
		return 'N/A';
	}

	if (value >= 1000000) {
		return `${(value / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
	}

	if (value >= 1000) {
		return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`;
	}

	return String(Math.round(value));
}

import { getSkillsTabTarget } from '../../shared/keymaps/skills';
import { initInstallPanel } from '../screens/install-skill/ui/install';
import { initOfficialPanel } from '../screens/install-skill/ui/panels/official-skill/official';
import { initTrendingPanel } from '../screens/install-skill/ui/panels/trending-skill/trending';
import { initSearchPanel } from '../screens/install-skill/ui/search-sh/search-sh';
import { initLocalPanel } from '../screens/local-skill/ui/local';

type WebviewState = {
	activeTab?: string;
};

type CreateRootFilesStatus = Record<string, boolean>;
type CreateInstructionRootFileName = 'AGENTS.md' | 'CLAUDE.md';

interface LocalSkill {
	id: string;
	kind: string;
}

export interface CreateSkillExistingFoldersDetail {
	agents: string[];
	claude: string[];
}

interface CreateSkillSearchRequestDetail {
	query: string;
	requestId: number;
	limit?: number;
}

interface CreateSkillDesignCreateDetail {
	selection: {
		colorId?: string;
		typographyId?: string;
		styleId?: string;
		skipColor?: boolean;
		skipTypography?: boolean;
		skipStyle?: boolean;
	};
	overwrite?: boolean;
}

interface CreateSkillRootFileCreateDetail {
	fileName: CreateInstructionRootFileName;
}

declare global {
	interface Window {
		mySkillsCreateRootFiles?: CreateRootFilesStatus;
	}
}

type VsCodeApi = {
	getState(): unknown;
	setState(state: WebviewState): void;
	postMessage(message: unknown): void;
};

declare function acquireVsCodeApi(): VsCodeApi;

const vscodeApi = acquireVsCodeApi();

// Reveal the shell only after window.load — guarantees all 14 external stylesheets applied, killing the FOUC. Paired with the inline opacity:0 guard in skills-webview-html.ts.
function revealShell(): void {
	document.documentElement.classList.add('msk-ready');
}
if (document.readyState === 'complete') {
	revealShell();
} else {
	window.addEventListener('load', revealShell, { once: true });
}

document.body.classList.add('is-initializing');

const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab'));
const panels = Array.from(document.querySelectorAll<HTMLElement>('.panel'));
const indicator = document.querySelector<HTMLElement>('.slider-indicator');
const createSupportButton = document.querySelector<HTMLButtonElement>('[data-create-support-button]');

function switchToTab(targetId: string, persistState = true): boolean {
	const tab = tabs.find(candidate => candidate.dataset.target === targetId);
	const hasPanel = panels.some(panel => panel.id === targetId);

	if (!tab || !hasPanel) {
		return false;
	}

	const index = tabs.indexOf(tab);

	tabs.forEach(currentTab => {
		const isSelected = currentTab === tab;
		currentTab.classList.toggle('active', isSelected);
		currentTab.setAttribute('aria-selected', String(isSelected));
		currentTab.tabIndex = isSelected ? 0 : -1;
	});

	if (indicator) {
		indicator.style.transform = `translateX(${index * 100}%)`;
	}

	panels.forEach(panel => {
		const isSelected = panel.id === targetId;
		panel.hidden = !isSelected;
		panel.classList.toggle('active', isSelected);
		panel.setAttribute('aria-hidden', String(!isSelected));
	});

	if (persistState) {
		vscodeApi.setState({ activeTab: targetId });
	}

	return true;
}

function focusRelativeTab(currentIndex: number, offset: number) {
	const targetIndex = (currentIndex + offset + tabs.length) % tabs.length;
	const target = tabs[targetIndex]?.dataset.target;

	if (target && switchToTab(target)) {
		tabs[targetIndex].focus();
	}
}

tabs.forEach((tab, index) => {
	tab.addEventListener('click', () => {
		const targetId = tab.dataset.target;

		if (targetId) {
			switchToTab(targetId);
		}
	});

	tab.addEventListener('keydown', event => {
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			focusRelativeTab(index, 1);
		} else if (event.key === 'ArrowLeft') {
			event.preventDefault();
			focusRelativeTab(index, -1);
		} else if (event.key === 'Home') {
			event.preventDefault();
			focusRelativeTab(0, 0);
		} else if (event.key === 'End') {
			event.preventDefault();
			focusRelativeTab(tabs.length - 1, 0);
		}
	});
});

document.addEventListener('keydown', event => {
	const target = getSkillsTabTarget(event);
	if (target) {
		event.preventDefault();
		event.stopPropagation();
		switchToTab(target);
	}
});

const fallbackTarget = tabs.find(tab => tab.classList.contains('active'))?.dataset.target ?? tabs[0]?.dataset.target;

if (fallbackTarget) {
	switchToTab(fallbackTarget, false);
}

requestAnimationFrame(() => {
	document.body.classList.remove('is-initializing');
});

window.addEventListener('message', event => {
	const message = event.data;
	if (!message || typeof message !== 'object' || !('type' in message)) {
		return;
	}
	if (message.type === 'switch-tab' && typeof message.target === 'string') {
		switchToTab(message.target);
	}
	if (message.type === 'createSkill.rootFiles.update' && message.files && typeof message.files === 'object') {
		window.mySkillsCreateRootFiles = message.files as CreateRootFilesStatus;
		window.dispatchEvent(new CustomEvent<CreateRootFilesStatus>('createSkill.rootFiles.update', {
			detail: window.mySkillsCreateRootFiles,
		}));
	}
	if (message.type === 'createSkill.rootFile.status') {
		window.dispatchEvent(new CustomEvent('createSkill.rootFile.status', {
			detail: message,
		}));
	}
	if (message.type === 'createSkill.search.update') {
		window.dispatchEvent(new CustomEvent('createSkill.search.update', {
			detail: message,
		}));
	}
	if (message.type === 'createSkill.design.status') {
		window.dispatchEvent(new CustomEvent('createSkill.design.status', {
			detail: message,
		}));
	}
	if (message.type === 'createSkill.design.returnToLocal') {
		switchToTab('local-panel');
		window.dispatchEvent(new CustomEvent('createSkill.design.reset'));
	}
	if (message.type === 'createSkillResult') {
		window.dispatchEvent(new CustomEvent('createSkillResult', {
			detail: message,
		}));
	}
	if (message.type === 'localSkills.update' && Array.isArray(message.skills)) {
		const skills = message.skills as LocalSkill[];
		const detail: CreateSkillExistingFoldersDetail = {
			agents: [],
			claude: [],
		};
		for (const skill of skills) {
			if (typeof skill.id !== 'string' || skill.kind !== 'folder') {
				continue;
			}
			if (skill.id.startsWith('.agents/skills/')) {
				const folderName = skill.id.slice('.agents/skills/'.length).split('/')[0];
				if (folderName) {
					detail.agents.push(folderName);
				}
			} else if (skill.id.startsWith('.claude/skills/')) {
				const folderName = skill.id.slice('.claude/skills/'.length).split('/')[0];
				if (folderName) {
					detail.claude.push(folderName);
				}
			}
		}
		window.dispatchEvent(new CustomEvent<CreateSkillExistingFoldersDetail>('createSkill.folders.sync', { detail }));
	}
});

window.addEventListener('createSkill.flow.complete', () => {
	switchToTab('local-panel');
});

window.addEventListener('createSkill.chat.typing', event => {
	if (!(event instanceof CustomEvent) || !event.detail?.query) {
		return;
	}

	vscodeApi.postMessage({
		type: 'createSkill.chat.typing',
		query: event.detail.query,
	});
});

window.addEventListener('createSkill.search.typing', event => {
	if (!(event instanceof CustomEvent) || !event.detail?.query) {
		return;
	}

	vscodeApi.postMessage({
		type: 'createSkill.search.typing',
		query: event.detail.query,
	});
});

window.addEventListener('createSkill.skillName.confirm', event => {
	if (!(event instanceof CustomEvent) || !event.detail?.name) {
		return;
	}

	vscodeApi.postMessage({
		type: 'createSkill.fast.nameConfirmed',
		name: event.detail.name,
	});
});

window.addEventListener('createSkill.category.selected', event => {
	if (!(event instanceof CustomEvent) || !event.detail?.categoryId) {
		return;
	}

	vscodeApi.postMessage({
		type: 'createSkill.fast.techsSelected',
		categories: [event.detail.categoryId, event.detail.subcategoryId].filter(Boolean),
	});
});

createSupportButton?.addEventListener('click', () => {
	vscodeApi.postMessage({ type: 'createSkill.openSupport' });
});

window.addEventListener('createSkill.rootFiles.request', () => {
	vscodeApi.postMessage({ type: 'createSkill.rootFiles.request' });
});

window.addEventListener('createSkill.rootFile.create', event => {
	if (!(event instanceof CustomEvent) || !isCreateSkillRootFileCreateDetail(event.detail)) {
		return;
	}

	vscodeApi.postMessage({
		type: 'createSkill.rootFile.create',
		fileName: event.detail.fileName,
	});
});

window.addEventListener('createSkill.search.request', event => {
	if (!(event instanceof CustomEvent) || !isCreateSkillSearchRequestDetail(event.detail)) {
		return;
	}

	vscodeApi.postMessage({
		type: 'createSkill.search.request',
		query: event.detail.query,
		requestId: event.detail.requestId,
		limit: event.detail.limit,
	});
});

window.addEventListener('createSkill.search.prefetch', () => {
	vscodeApi.postMessage({ type: 'createSkill.search.prefetch' });
});

window.addEventListener('createSkill.design.create', event => {
	if (!(event instanceof CustomEvent) || !isCreateSkillDesignCreateDetail(event.detail)) {
		return;
	}

	vscodeApi.postMessage({
		type: 'createSkill.design.create',
		selection: event.detail.selection,
		overwrite: event.detail.overwrite,
	});
});

window.addEventListener('createSkill.install.request', event => {
	if (!(event instanceof CustomEvent) || typeof event.detail?.id !== 'string') {
		return;
	}

	vscodeApi.postMessage({
		type: 'installSkill.install',
		id: event.detail.id,
	});
});

window.addEventListener('createSkill.chat.create', event => {
	if (!(event instanceof CustomEvent) || !event.detail) {
		return;
	}

	const detail = event.detail as { name?: unknown; query?: unknown; target?: unknown; template?: unknown };
	if (typeof detail.name === 'string' && typeof detail.query === 'string' && (detail.target === 'agents' || detail.target === 'claude') && typeof detail.template === 'string') {
		vscodeApi.postMessage({
			type: 'createSkill.chat.create',
			name: detail.name,
			query: detail.query,
			target: detail.target,
			template: detail.template,
		});
	}
});


function isCreateSkillSearchRequestDetail(value: unknown): value is CreateSkillSearchRequestDetail {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const detail = value as { query?: unknown; requestId?: unknown; limit?: unknown };
	return typeof detail.query === 'string'
		&& typeof detail.requestId === 'number'
		&& (detail.limit === undefined || typeof detail.limit === 'number');
}

function isCreateSkillRootFileCreateDetail(value: unknown): value is CreateSkillRootFileCreateDetail {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const detail = value as { fileName?: unknown };
	return detail.fileName === 'AGENTS.md' || detail.fileName === 'CLAUDE.md';
}

function isCreateSkillDesignCreateDetail(value: unknown): value is CreateSkillDesignCreateDetail {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const detail = value as { selection?: unknown; overwrite?: unknown };
	if (!detail.selection || typeof detail.selection !== 'object') {
		return false;
	}

	const selection = detail.selection as { colorId?: unknown; typographyId?: unknown; styleId?: unknown; skipColor?: unknown; skipTypography?: unknown; skipStyle?: unknown };
	return (selection.colorId === undefined || typeof selection.colorId === 'string')
		&& (selection.typographyId === undefined || typeof selection.typographyId === 'string')
		&& (selection.styleId === undefined || typeof selection.styleId === 'string')
		&& (selection.skipColor === undefined || typeof selection.skipColor === 'boolean')
		&& (selection.skipTypography === undefined || typeof selection.skipTypography === 'boolean')
		&& (selection.skipStyle === undefined || typeof selection.skipStyle === 'boolean')
		&& (detail.overwrite === undefined || typeof detail.overwrite === 'boolean');
}

// ── Init install filter tabs ──────────────────────────────────────────
const disposeInstallPanel = initInstallPanel(vscodeApi);
window.addEventListener('pagehide', disposeInstallPanel, { once: true });

// ── Init official skill panel ─────────────────────────────────────────
initOfficialPanel(vscodeApi);

// ── Init trending skill panel ─────────────────────────────────────────
initTrendingPanel(vscodeApi);

// ── Init search panel ───────────────────────────────────────────────
initSearchPanel(vscodeApi);

// ── Init local (installed) panel ─────────────────────────────────────
initLocalPanel(vscodeApi);

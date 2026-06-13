import type {
	LocalSkill,
	LocalSkillsSavedUpdateMessage,
	LocalSkillsUpdateMessage,
} from '../core/types';
import { ROOT_SKILL_FILES } from '../core/file-folder/file-skills';
import { DELETE_ICON, EDIT_ICON, ENABLE_ICON, FOLDER_ICON, SAVE_ICON } from '../assets/icons';

type SortMode = 'az' | 'za' | 'newest';
type ViewMode = 'workspace' | 'saved';

type VsCodeApi = {
	postMessage(message: unknown): void;
};

const ACTION_ICONS = {
	delete: DELETE_ICON,
	edit: EDIT_ICON,
	save: SAVE_ICON,
	enable: ENABLE_ICON,
} as const;

type LocalAction = keyof typeof ACTION_ICONS;

function escHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function getSkillMeta(skill: LocalSkill): string {
	if (skill.kind === 'folder') {
		const segments = skill.id.split('/');
		return segments.length > 1 ? segments.slice(0, -1).join('/') : skill.source;
	}

	return 'workspace root';
}

function renderActionButton(action: LocalAction, skill: LocalSkill): string {
	const label = action.charAt(0).toUpperCase() + action.slice(1);
	const className = action === 'delete'
		? 'local-item-action local-item-action--danger'
		: action === 'save'
			? 'local-item-action local-item-action--save'
			: action === 'enable'
				? 'local-item-action local-item-action--enable'
				: 'local-item-action';

	return `
		<button class="${className}" type="button" aria-label="${label} ${escHtml(skill.name)}" title="${label}" data-action="${action}" data-skill-id="${escHtml(skill.id)}">
			${ACTION_ICONS[action]}
		</button>
	`;
}

function renderSkillActions(skill: LocalSkill, mode: ViewMode, isInWorkspace: boolean): string {
	if (mode === 'saved') {
		const actions: string[] = [];
		actions.push(renderActionButton('delete', skill));
		if (!isInWorkspace) {
			actions.push(renderActionButton('enable', skill));
		}
		return actions.join('');
	}

	let actions: LocalAction[] = skill.kind === 'folder'
		? ['delete', 'edit', 'save']
		: skill.id === 'DESIGN.md'
			? ['delete', 'edit']
			: ['delete'];

	if (savedSkills.some(s => s.name === skill.name)) {
		actions = actions.filter(action => action !== 'save');
	}

	return actions.map(action => renderActionButton(action, skill)).join('');
}

function renderSkill(skill: LocalSkill, mode: ViewMode, isNew = false, isInWorkspace = false): string {
	const switchLabel = `${skill.enabled ? 'Disable' : 'Enable'} ${skill.name}`;
	const isFolder = skill.kind === 'folder';
	const meta = getSkillMeta(skill);
	const typeLabel = isFolder ? 'Folder' : 'File';
	const folderProviderClass = skill.id.startsWith('.claude/skills/')
		? 'local-item--claude'
		: skill.id.startsWith('.agents/skills/')
			? 'local-item--agents'
			: '';

	const switchHtml = mode === 'workspace'
		? `
			<label class="local-item-switch" aria-label="${escHtml(switchLabel)}">
				<input type="checkbox" role="switch" data-toggle-id="${escHtml(skill.id)}" ${skill.enabled ? 'checked' : ''}>
				<span class="local-item-switch-track" aria-hidden="true"></span>
			</label>
		`
		: '';

	return `
		<li class="local-item ${isFolder ? 'local-item--folder' : 'local-item--file'} ${folderProviderClass} ${skill.enabled ? '' : 'local-item--disabled'} ${isNew ? 'local-item--new' : ''} ${mode === 'saved' ? 'local-item--saved' : ''}" data-skill-id="${escHtml(skill.id)}" title="${escHtml(skill.id)}">
			<span class="local-item-badge ${isFolder ? 'local-item-badge--folder' : 'local-item-badge--file'}" aria-hidden="true">
				${isFolder ? FOLDER_ICON : skill.icon ?? ''}
			</span>
			<div class="local-item-info">
				<span class="local-item-name" title="${escHtml(skill.name)}">${escHtml(skill.name)}</span>
				<span class="local-item-meta" title="${escHtml(skill.id)}">
					<span class="local-item-kind">${typeLabel}</span>
					<span class="local-item-path">${escHtml(meta)}</span>
				</span>
			</div>
			<div class="local-item-actions">
				${renderSkillActions(skill, mode, isInWorkspace)}
				${switchHtml}
			</div>
		</li>
	`;
}

let skills: LocalSkill[] = [];
let savedSkills: LocalSkill[] = [];
let viewMode: ViewMode = 'workspace';
let sortMode: SortMode = 'newest';

const SORT_CYCLE: SortMode[] = ['newest', 'az', 'za'];
const SORT_LABELS: Record<SortMode, string> = { az: 'A–Z', za: 'Z–A', newest: 'New' };
const NEXT_SORT_LABELS: Record<SortMode, string> = { newest: 'A–Z', az: 'Z–A', za: 'New' };

function getRootFileOrder(skill: LocalSkill): number {
	return ROOT_SKILL_FILES.findIndex(fileName => fileName === skill.id);
}

function getProviderPriority(skill: LocalSkill): number {
	if (skill.id.startsWith('.claude/')) { return 0; }
	if (skill.id.startsWith('.agents/')) { return 1; }
	return 2;
}

function getSorted(list: LocalSkill[]): LocalSkill[] {
	return [...list].sort((a, b) => {
		if (a.kind !== b.kind) {
			return a.kind === 'file' ? -1 : 1;
		}

		if (a.kind === 'file') {
			return getRootFileOrder(a) - getRootFileOrder(b);
		}

		const providerDiff = getProviderPriority(a) - getProviderPriority(b);
		if (providerDiff !== 0) { return providerDiff; }

		if (sortMode === 'az')     { return a.name.localeCompare(b.name); }
		if (sortMode === 'za')     { return b.name.localeCompare(a.name); }
		return b.installedAt - a.installedAt;
	});
}

function renderStats(statTotal: HTMLElement, statActive: HTMLElement, statDisabled: HTMLElement): void {
	let activeCount = 0;
	for (const skill of skills) {
		if (skill.enabled) {
			activeCount++;
		}
	}

	statTotal.textContent = String(skills.length);
	statActive.textContent = String(activeCount);
	statDisabled.textContent = String(skills.length - activeCount);
}

function hasSameRenderedOrder(currentSorted: LocalSkill[], nextSorted: LocalSkill[]): boolean {
	if (currentSorted.length !== nextSorted.length) {
		return false;
	}

	for (let i = 0; i < currentSorted.length; i++) {
		if (currentSorted[i].id !== nextSorted[i].id) {
			return false;
		}
	}
	return true;
}

function syncRenderedSkillState(
	listEl: HTMLUListElement,
	statTotal: HTMLElement,
	statActive: HTMLElement,
	statDisabled: HTMLElement,
): void {
	for (const skill of skills) {
		const itemEl = listEl.querySelector<HTMLElement>(`[data-skill-id="${CSS.escape(skill.id)}"]`);
		const inputEl = itemEl?.querySelector<HTMLInputElement>('[data-toggle-id]');

		itemEl?.classList.toggle('local-item--disabled', !skill.enabled);
		if (inputEl) {
			inputEl.checked = skill.enabled;
			inputEl.closest('.local-item-switch')?.setAttribute('aria-label', `${skill.enabled ? 'Disable' : 'Enable'} ${skill.name}`);
		}
	}

	renderStats(statTotal, statActive, statDisabled);
}

function getWorkspaceSkillNames(): Set<string> {
	const names = new Set<string>();
	for (const skill of skills) {
		if (skill.kind === 'folder') {
			const parts = skill.id.split('/');
			names.add(parts[parts.length - 1]);
		}
	}
	return names;
}

function render(
	listEl:        HTMLUListElement,
	emptyEl:       HTMLElement,
	statTotal:     HTMLElement,
	statActive:    HTMLElement,
	statDisabled:  HTMLElement,
	newlyAddedIds = new Set<string>(),
	preSortedList?: LocalSkill[],
): void {
	const isSavedMode = viewMode === 'saved';
	const list = isSavedMode ? savedSkills : skills;
	const sorted = preSortedList ?? getSorted(list);

	if (!isSavedMode) {
		renderStats(statTotal, statActive, statDisabled);
	}

	if (list.length === 0) {
		listEl.innerHTML = '';
		listEl.hidden    = true;
		emptyEl.hidden   = false;
		return;
	}

	emptyEl.hidden = true;
	listEl.hidden        = false;

	const workspaceNames = isSavedMode ? getWorkspaceSkillNames() : new Set<string>();
	listEl.innerHTML = sorted.map(skill => renderSkill(skill, viewMode, newlyAddedIds.has(skill.id), workspaceNames.has(skill.name))).join('');
}

function updateSkillEnabled(
	id: string,
	enabled: boolean,
	itemEl: HTMLElement | null,
	inputEl: HTMLInputElement,
	statTotal: HTMLElement,
	statActive: HTMLElement,
	statDisabled: HTMLElement,
): void {
	const skill = skills.find(candidate => candidate.id === id);
	if (!skill) {
		inputEl.checked = !enabled;
		return;
	}

	skill.enabled = enabled;
	itemEl?.classList.toggle('local-item--disabled', !enabled);
	inputEl.closest('.local-item-switch')?.setAttribute('aria-label', `${enabled ? 'Disable' : 'Enable'} ${skill.name}`);
	renderStats(statTotal, statActive, statDisabled);
}

function isLocalSkillsUpdateMessage(value: unknown): value is LocalSkillsUpdateMessage {
	return Boolean(value)
		&& typeof value === 'object'
		&& (value as { type?: unknown }).type === 'localSkills.update'
		&& Array.isArray((value as { skills?: unknown }).skills);
}

function isLocalSkillsSavedUpdateMessage(value: unknown): value is LocalSkillsSavedUpdateMessage {
	return Boolean(value)
		&& typeof value === 'object'
		&& (value as { type?: unknown }).type === 'localSkills.saved.update'
		&& Array.isArray((value as { skills?: unknown }).skills);
}

function isLocalAction(value: string | undefined): value is LocalAction {
	return value === 'delete' || value === 'edit' || value === 'save' || value === 'enable';
}

function openDesignEditor(): void {
	const createTab = document.querySelector<HTMLButtonElement>('[data-target="create-panel"]');
	createTab?.click();
	window.dispatchEvent(new CustomEvent('createSkill.design.edit'));
}

function renderSectionTabs(
	workspaceName: string,
	workspaceTab: HTMLElement,
	savedTab: HTMLElement,
): void {
	workspaceTab.textContent = workspaceName;
	workspaceTab.classList.toggle('local-section-tab--active', viewMode === 'workspace');
	savedTab.classList.toggle('local-section-tab--active', viewMode === 'saved');
	savedTab.classList.toggle('local-section-tab--hidden', savedSkills.length === 0);
}

export function initLocalPanel(vscodeApi: VsCodeApi): void {
	const listEl        = document.getElementById('local-list')        as HTMLUListElement | null;
	const emptyEl       = document.getElementById('local-empty')       as HTMLElement | null;
	const statTotal     = document.getElementById('stat-total')        as HTMLElement | null;
	const statActive    = document.getElementById('stat-active')       as HTMLElement | null;
	const statDisabled  = document.getElementById('stat-disabled')     as HTMLElement | null;
	const sortBtn       = document.getElementById('local-sort-btn')    as HTMLButtonElement | null;
	const sortLabel     = document.getElementById('local-sort-label')  as HTMLElement | null;
	const gotoCreate    = document.getElementById('local-goto-create') as HTMLButtonElement | null;
	const gotoInstall   = document.getElementById('local-goto-install') as HTMLButtonElement | null;
	const workspaceTab  = document.getElementById('local-workspace-tab') as HTMLElement | null;
	const savedTab      = document.getElementById('local-saved-tab')     as HTMLElement | null;

	if (!listEl || !emptyEl || !statTotal || !statActive || !statDisabled) {
		return;
	}

	const workspaceName = workspaceTab?.textContent?.trim() ?? 'Workspace';

	if (workspaceTab && savedTab) {
		renderSectionTabs(workspaceName, workspaceTab, savedTab);
	}

	const rerender = () => {
		if (viewMode === 'saved' && savedSkills.length === 0) {
			viewMode = 'workspace';
			if (workspaceTab && savedTab) {
				renderSectionTabs(workspaceName, workspaceTab, savedTab);
			}
		}
		render(listEl, emptyEl, statTotal, statActive, statDisabled);
	};

	rerender();

	window.addEventListener('message', event => {
		if (isLocalSkillsUpdateMessage(event.data)) {
			const nextSkills = event.data.skills;
			const currentSorted = getSorted(skills);
			const nextSorted = getSorted(nextSkills);
			const canSyncStateOnly = viewMode === 'workspace'
				&& skills.length > 0
				&& nextSkills.length > 0
				&& hasSameRenderedOrder(currentSorted, nextSorted);

			const newlyAddedIds = new Set<string>();
			if (skills.length > 0) {
				const currentIds = new Set(skills.map(s => s.id));
				for (const skill of nextSkills) {
					if (!currentIds.has(skill.id)) {
						newlyAddedIds.add(skill.id);
					}
				}
			}

			skills = nextSkills;
			if (viewMode === 'workspace') {
				if (canSyncStateOnly) {
					syncRenderedSkillState(listEl, statTotal, statActive, statDisabled);
				} else {
					render(listEl, emptyEl, statTotal, statActive, statDisabled, newlyAddedIds, nextSorted);
				}
			}
			return;
		}

		if (isLocalSkillsSavedUpdateMessage(event.data)) {
			savedSkills = event.data.skills;
			if (viewMode === 'saved' && savedSkills.length === 0) {
				viewMode = 'workspace';
			}
			if (workspaceTab && savedTab) {
				renderSectionTabs(workspaceName, workspaceTab, savedTab);
			}
			rerender();
			return;
		}
	});

	vscodeApi.postMessage({ type: 'localSkills.request' });
	vscodeApi.postMessage({ type: 'localSkills.saved.request' });

	if (sortBtn && sortLabel) {
		sortBtn.addEventListener('click', () => {
			const idx  = SORT_CYCLE.indexOf(sortMode);
			sortMode   = SORT_CYCLE[(idx + 1) % SORT_CYCLE.length];
			sortLabel.textContent = NEXT_SORT_LABELS[sortMode];
			rerender();
		});
	}

	if (workspaceTab && savedTab) {
		workspaceTab.addEventListener('click', () => {
			viewMode = 'workspace';
			renderSectionTabs(workspaceName, workspaceTab, savedTab);
			rerender();
		});

		savedTab.addEventListener('click', () => {
			viewMode = 'saved';
			renderSectionTabs(workspaceName, workspaceTab, savedTab);
			rerender();
		});
	}

	listEl.addEventListener('animationend', event => {
		const target = event.target as HTMLElement;
		if (target.classList.contains('local-item--new')) {
			target.classList.remove('local-item--new');
		}
	});

	listEl.addEventListener('change', event => {
		if (viewMode !== 'workspace') {
			return;
		}

		const input = (event.target as Element).closest<HTMLInputElement>('[data-toggle-id]');
		if (!input) {
			return;
		}

		updateSkillEnabled(
			input.dataset.toggleId ?? '',
			input.checked,
			input.closest<HTMLElement>('.local-item'),
			input,
			statTotal,
			statActive,
			statDisabled,
		);
		vscodeApi.postMessage({
			type: 'localSkill.setEnabled',
			id: input.dataset.toggleId ?? '',
			enabled: input.checked,
		});
	});

	listEl.addEventListener('click', event => {
		const action = (event.target as Element).closest<HTMLButtonElement>('[data-action]');
		if (!action) {
			return;
		}

		const actionName = action.dataset.action;
		const skillId = action.dataset.skillId;
		if (!isLocalAction(actionName) || !skillId) {
			action.blur();
			return;
		}

		if (actionName === 'edit' && skillId === 'DESIGN.md') {
			openDesignEditor();
			action.blur();
			return;
		}

		if (actionName === 'edit') {
			vscodeApi.postMessage({ type: 'localSkill.open', id: skillId });
			action.blur();
			return;
		}

		if (actionName === 'save') {
			vscodeApi.postMessage({ type: 'localSkill.save', id: skillId });
			action.blur();
			return;
		}

		if (actionName === 'enable') {
			vscodeApi.postMessage({ type: 'localSkill.enableSaved', id: skillId });
			action.blur();
			return;
		}

		if (actionName === 'delete') {
			if (viewMode === 'saved') {
				vscodeApi.postMessage({ type: 'localSkill.deleteSaved', id: skillId });
			} else {
				vscodeApi.postMessage({ type: 'localSkill.delete', id: skillId });
			}
			action.blur();
			return;
		}

		action.blur();
	});

	if (gotoInstall) {
		gotoInstall.addEventListener('click', () => {
			const installTab = document.querySelector<HTMLButtonElement>('[data-target="install-panel"]');
			installTab?.click();
			window.dispatchEvent(new CustomEvent('installSkills.openFlame'));
		});
	}

	if (gotoCreate) {
		gotoCreate.addEventListener('click', () => {
			const createTab = document.querySelector<HTMLButtonElement>('[data-target="create-panel"]');
			createTab?.click();
		});
	}
}

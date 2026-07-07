import { initDesignMdMode } from '../../chat-create/design-md/design-md';
import { initCategorySelection } from '../../chat-create/category/category';
import { initNamePrompt } from '../../chat-create/modal/skill-modal';
import { initSearchMode } from '../../chat-search/search';
import { initCreateDock } from '../dock/chat-dock';
import { createCreateLoading } from './create-loading';
import { createSearchBloom } from './search-bloom';
import { emitSkillsEvent, onSkillsEvent } from '../../../../../view/events';
import type { CreateSkillMode, CreateSkillTarget } from '../types';
type CreateInstructionRootFileName = 'AGENTS.md' | 'CLAUDE.md';
type CreateRootFilesStatus = Record<string, boolean>;
type CreateFlowStep = 'description' | 'category' | 'done';

declare global {
	interface Window {
		mySkillsCreateRootFiles?: CreateRootFilesStatus;
	}
}

const createSurface = document.querySelector('[data-create-skill-surface]') as HTMLElement | null;
const modePanels = Array.from(document.querySelectorAll<HTMLElement>('[data-create-mode-panel]'));
const createRootFileButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-create-root-file]'));
const designBackButton = document.querySelector('[data-create-design-back]') as HTMLButtonElement | null;
const createFlowName = document.querySelector('[data-create-flow-name]') as HTMLElement | null;
const createFlowDescription = document.querySelector('[data-create-flow-description]') as HTMLElement | null;
const createFlowCategory = document.querySelector('[data-create-flow-category]') as HTMLElement | null;
const createFlowCards = Array.from(document.querySelectorAll<HTMLElement>('[data-create-flow-card]'));
const createFlowEditButtons = Array.from(document.querySelectorAll<HTMLElement>('.create-flow-edit'));
const templateButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-create-chat-template]'));
const templateToggleContainer = document.getElementById('template-toggle-container');

let isAutoSkipping = false;

templateButtons.forEach(btn => {
	btn.addEventListener('click', async () => {
		const template = btn.dataset.createChatTemplate as CreateSkillTemplate;
		if (template === 'ai' || isAutoSkipping) {
			return;
		}
		
		activeCreateTemplate = template;
		templateButtons.forEach(b => b.classList.toggle('is-active', b === btn));
		if (templateToggleContainer) {
			templateToggleContainer.classList.toggle('is-fast-active', template === 'fast');
		}

		if (template === 'base' && confirmedCreateSkillName) {
			isAutoSkipping = true;
			createDock.setInputDisabled(true);
			
			// Visual block to prevent further clicks while animating
			if (templateToggleContainer) {
				templateToggleContainer.style.opacity = '0.5';
				templateToggleContainer.style.pointerEvents = 'none';
			}

			// Phase 1: Category loading (Skip if already confirmed)
			if (!confirmedCreateCategory) {
				const categoryCard = createFlowCategory?.closest('.create-flow-card');
				if (categoryCard) {
					categoryCard.classList.add('is-loading');
				}
				await new Promise(resolve => setTimeout(resolve, 1000));
				
				// Category checkmark
				if (categoryCard) {
					categoryCard.classList.remove('is-loading');
				}
				confirmedCreateCategory = 'Base Template';
				activeCreateFlowStep = 'description';
				syncCreateFlowStatus();
				await new Promise(resolve => setTimeout(resolve, 500));
			}
			
			// Phase 2: Description loading
			const descriptionCard = createFlowDescription?.closest('.create-flow-card');
			if (descriptionCard) {
				descriptionCard.classList.add('is-loading');
			}
			await new Promise(resolve => setTimeout(resolve, 1000));
			
			// Description checkmark
			if (descriptionCard) {
				descriptionCard.classList.remove('is-loading');
			}
			confirmedCreateDescription = 'Skipped description';
			activeCreateFlowStep = 'done';
			syncCreateFlowStatus();
			await new Promise(resolve => setTimeout(resolve, 500));

			isAutoSkipping = false;
			if (templateToggleContainer) {
				templateToggleContainer.style.opacity = '';
				templateToggleContainer.style.pointerEvents = '';
			}

			// Phase 3: Trigger the creation process automatically
			pendingCreateTemplate = 'base';
			const name = confirmedCreateSkillName;
			if (name) {
				emitSkillsEvent('createSkill.chat.create', {
					name,
					query: '',
					target: activeCreateTarget ?? 'agents',
					template: 'base',
				});
			}
		}
	});
});

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const canTrackPointer = window.matchMedia('(pointer: fine)');
const createRootFileMinimumLoadingMs = 1200;

let activeMode: CreateSkillMode = 'create';
let activeCreateTarget: CreateSkillTarget | undefined;
let createChatState: 'idle' | 'cleaning' | 'open' = 'idle';
let createChatCleanTimer: number | undefined;
let hasCompletedSearch = false;
let didRequestSearchPrefetch = false;
let skipNextCreateChatOpen = false;
let confirmedCreateSkillName: string | undefined;
let activeCreateFlowStep: CreateFlowStep = 'category';
let confirmedCreateDescription: string | undefined;
let confirmedCreateCategory: string | undefined;
let activeCategoryLabel: string | null = null;
let currentCreateRootFilesStatus: CreateRootFilesStatus = window.mySkillsCreateRootFiles ?? {};

type CreateSkillTemplate = 'base' | 'fast' | 'ai';
let activeCreateTemplate: CreateSkillTemplate = 'fast';
let pendingCreateTemplate: CreateSkillTemplate | undefined;

const pendingCreateRootFiles = new Map<CreateInstructionRootFileName, {
	button: HTMLButtonElement;
	descriptionText?: string;
	startedAt: number;
}>();

const createDock = initCreateDock({
	getMode: () => activeMode,
	getTarget: () => activeCreateTarget,
	getCreatePlaceholder: getCreatePlaceholder,
	isCreateNameConfirmed: () => confirmedCreateSkillName !== undefined,
	isCreateDescriptionStep: () => activeCreateFlowStep === 'description',
	isCreateCategoryStep: () => activeCreateFlowStep === 'category',
	onBack: closeCreateChatScreen,
	onBeforeSubmit: mode => {
		if (mode === 'search') {
			searchBloom?.stopRepeating();
		}
	},
	onCreateSubmit: handleCreateFlowSubmit,
	onCreateChatOpen: openCreateChatScreen,
	onSearchInput: () => {
		hasCompletedSearch = false;
		requestCreateSearchPrefetch();
		searchBloom?.requestTypingBloom();
	},
	onToggleMode: toggleCreateSearchMode,
});

// Search-mode canvas wave — owns its RAF/canvas/visibility pause (search-bloom.ts).
const searchBloom = createSurface
	? createSearchBloom({
		surface: createSurface,
		hasInputValue: () => createDock.hasSearchInputValue(),
	})
	: undefined;

// Create-flow loading checklist — owns the step timers + screen DOM (create-loading.ts).
const createLoading = createCreateLoading({
	setInputDisabled: disabled => createDock.setInputDisabled(disabled),
	onComplete: () => completeCreateFlow(),
});

interface CreateRootFileStatusDetail {
	fileName: CreateInstructionRootFileName;
	status: 'writing' | 'created' | 'error';
	message?: string;
}

interface CreateSkillResultDetail {
	success: boolean;
	message?: string;
}

function openCreateChatScreen(target?: CreateSkillTarget, focusChat = false) {
	createDock.saveActiveValue(activeMode);
	activeMode = 'create';

	if (target) {
		activeCreateTarget = target;
	} else if (!activeCreateTarget) {
		activeCreateTarget = 'agents';
	}

	if (createChatState !== 'open') {
		if (createChatCleanTimer !== undefined) {
			window.clearTimeout(createChatCleanTimer);
		}

		if (confirmedCreateSkillName) {
			createChatState = 'open';
			syncMode();
			if (focusChat) {
				window.setTimeout(() => createDock.focusInput(), 0);
			}
			return;
		}

		// Phase 1: animate cards out
		createChatState = 'cleaning';
		createDock.setInputDisabled(true);
		syncMode();
		createChatCleanTimer = window.setTimeout(() => {
			createChatCleanTimer = undefined;
			createChatState = 'open';
			syncMode();

			// Phase 2: after cards are gone, open the name modal
			emitSkillsEvent('createSkill.namePrompt.open', { target: activeCreateTarget, template: activeCreateTemplate });
		}, 500);
	} else {
		if (confirmedCreateSkillName) {
			syncMode();
			if (focusChat) {
				window.setTimeout(() => createDock.focusInput(), 0);
			}
			return;
		}

		// Already in chat screen, but no name has been confirmed yet.
		if (skipNextCreateChatOpen) {
			skipNextCreateChatOpen = false;
			return;
		}
		emitSkillsEvent('createSkill.namePrompt.open', { target: activeCreateTarget, template: activeCreateTemplate });
		syncMode();
	}
}

function closeCreateChatScreen() {
	createDock.saveActiveValue(activeMode);
	createDock.clearValue('create');
	if (createChatCleanTimer !== undefined) {
		window.clearTimeout(createChatCleanTimer);
		createChatCleanTimer = undefined;
	}
	createLoading.cancel();
	createChatState = 'idle';
	activeCreateTarget = undefined;
	confirmedCreateSkillName = undefined;
	activeCreateFlowStep = 'category';
	confirmedCreateDescription = undefined;
	confirmedCreateCategory = undefined;
	activeCategoryLabel = null;
	
	setActiveCreateTemplate('fast');

	syncConfirmedCreateName();
	syncCreateFlowStatus();
	syncMode();
	emitSkillsEvent('createSkill.category.reset');
}

function setActiveCreateTemplate(template: CreateSkillTemplate): void {
	activeCreateTemplate = template;
	templateButtons.forEach(button => button.classList.toggle('is-active', button.dataset.createChatTemplate === template));
	templateToggleContainer?.classList.toggle('is-fast-active', template === 'fast');
}

function syncConfirmedCreateName() {
	if (createFlowName) {
		createFlowName.textContent = confirmedCreateSkillName ?? '—';
	}
}

function getCreatePlaceholder(target: CreateSkillTarget | undefined): string {
	if (activeCreateFlowStep === 'category') {
		return 'Category, topic, or workflow...';
	}

	if (target === 'claude') {
		return '.claude/skills/...';
	}

	return '.agents/skills/...';
}

function summarizeCreateFlowValue(value: string): string {
	return value.length > 42 ? `${value.slice(0, 39)}...` : value;
}

function syncCreateFlowStatus() {
	if (createFlowDescription) {
		createFlowDescription.textContent = confirmedCreateDescription
			? summarizeCreateFlowValue(confirmedCreateDescription)
			: 'Add context to your new skill';
	}

	if (createFlowCategory) {
		createFlowCategory.textContent = confirmedCreateCategory
			? summarizeCreateFlowValue(confirmedCreateCategory)
			: activeCategoryLabel
				? `Select your ${activeCategoryLabel.toLowerCase()} technology`
				: 'Select one technology';
	}

	createFlowCards.forEach(card => {
		const step = card.dataset.createFlowCard;
		const isName = step === 'name';
		const isDescription = step === 'description';
		const isCategory = step === 'category';

		card.classList.toggle('is-active', (isDescription && activeCreateFlowStep === 'description') || (isCategory && activeCreateFlowStep === 'category'));
		card.classList.toggle('is-done',
			(isName && Boolean(confirmedCreateSkillName))
			|| (isDescription && Boolean(confirmedCreateDescription))
			|| (isCategory && Boolean(confirmedCreateCategory)),
		);
	});

	// Show/hide category container
	const categoryContainer = document.querySelector('[data-create-category-container]');
	if (categoryContainer) {
		const isCategoryStep = activeCreateFlowStep === 'category' && confirmedCreateSkillName !== undefined;
		categoryContainer.classList.toggle('is-visible', isCategoryStep);
	}
}

function handleCreateFlowSubmit(query: string): boolean {
	const name = confirmedCreateSkillName;
	if (!name) {
		return false;
	}

	if (activeCreateFlowStep === 'category') {
		return true;
	}

	confirmedCreateDescription = query;
	syncCreateFlowStatus();

	const categoryPrefix = confirmedCreateCategory && confirmedCreateCategory !== 'others'
		? [activeCategoryLabel, confirmedCreateCategory].filter(Boolean).join(' - ')
		: '';
	const finalQuery = categoryPrefix ? `${categoryPrefix}\n\n${query}` : query;

	pendingCreateTemplate = activeCreateTemplate;
	emitSkillsEvent('createSkill.chat.create', {
		name,
		query: finalQuery,
		target: activeCreateTarget ?? 'agents',
		template: activeCreateTemplate,
	});

	// closeCreateChatScreen() is called by the loading screen handler after all steps complete

	return false;
}

function syncCreateRootFileButtons(files: CreateRootFilesStatus) {
	currentCreateRootFilesStatus = files;

	createRootFileButtons.forEach(button => {
		const fileName = button.dataset.createRootFile;
		const exists = fileName ? files[fileName] === true : false;
		const isPending = isCreateInstructionRootFileName(fileName) && pendingCreateRootFiles.has(fileName);

		if (isPending) {
			button.disabled = true;
			button.setAttribute('aria-disabled', 'true');
			button.title = `Creating ${fileName}...`;
			return;
		}

		button.disabled = exists;
		button.setAttribute('aria-disabled', String(exists));
		button.title = exists && fileName ? `${fileName} already exists in the workspace root` : '';
	});
}

function beginCreateRootFile(button: HTMLButtonElement, fileName: CreateInstructionRootFileName) {
	if (pendingCreateRootFiles.has(fileName)) {
		return;
	}

	const description = getCreateRootFileDescription(button);
	pendingCreateRootFiles.set(fileName, {
		button,
		descriptionText: description?.textContent ?? undefined,
		startedAt: performance.now(),
	});

	button.classList.add('is-creating');
	button.disabled = true;
	button.setAttribute('aria-disabled', 'true');
	button.title = `Creating ${fileName}...`;
	if (description) {
		description.textContent = 'Creating file...';
	}
}

function finishCreateRootFile(fileName: CreateInstructionRootFileName, status: CreateRootFileStatusDetail['status'], message?: string) {
	const pending = pendingCreateRootFiles.get(fileName);
	if (!pending) {
		return;
	}

	const delay = Math.max(0, createRootFileMinimumLoadingMs - (performance.now() - pending.startedAt));
	window.setTimeout(() => {
		pendingCreateRootFiles.delete(fileName);
		pending.button.classList.remove('is-creating');
		const description = getCreateRootFileDescription(pending.button);
		if (description && pending.descriptionText !== undefined) {
			description.textContent = pending.descriptionText;
		}

		if (status === 'created') {
			currentCreateRootFilesStatus = {
				...currentCreateRootFilesStatus,
				[fileName]: true,
			};
		}

		syncCreateRootFileButtons(currentCreateRootFilesStatus);
		if (status === 'error') {
			pending.button.title = message ?? `Could not create ${fileName}`;
		} else {
			emitSkillsEvent('createSkill.rootFiles.request');
		}
	}, delay);
}

function getCreateRootFileDescription(button: HTMLButtonElement): HTMLElement | null {
	return button.querySelector('.create-option-description');
}

function isCreateInstructionRootFileName(value: unknown): value is CreateInstructionRootFileName {
	return value === 'AGENTS.md' || value === 'CLAUDE.md';
}

function isCreateRootFileStatusDetail(value: unknown): value is CreateRootFileStatusDetail {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const detail = value as { fileName?: unknown; status?: unknown; message?: unknown };
	return isCreateInstructionRootFileName(detail.fileName)
		&& (detail.status === 'writing' || detail.status === 'created' || detail.status === 'error')
		&& (detail.message === undefined || typeof detail.message === 'string');
}

function syncMode() {
	if (activeMode !== 'search') {
		searchBloom?.stopRepeating();
	}

	if (activeMode !== 'create') {
		createChatState = 'idle';
		if (createChatCleanTimer !== undefined) {
			window.clearTimeout(createChatCleanTimer);
			createChatCleanTimer = undefined;
		}
	}

	createSurface?.classList.toggle('is-search-mode', activeMode === 'search');
	createSurface?.classList.toggle('is-design-mode', activeMode === 'design');
	createSurface?.classList.toggle('is-create-chat-cleaning', activeMode === 'create' && createChatState === 'cleaning');
	createSurface?.classList.toggle('is-create-chat-screen', activeMode === 'create' && createChatState === 'open');
	createDock.sync(activeMode, activeCreateTarget);

	modePanels.forEach(panel => {
		const isActive = panel.dataset.createModePanel === activeMode;
		panel.hidden = !isActive;
		panel.classList.toggle('is-active', isActive);
	});
}

function requestCreateSearchPrefetch() {
	if (didRequestSearchPrefetch) {
		return;
	}

	didRequestSearchPrefetch = true;
	emitSkillsEvent('createSkill.search.prefetch');
}

if (createSurface && canTrackPointer.matches && !prefersReducedMotion.matches) {
	let pointerFrame = 0;
	let pointerX = 0;
	let pointerY = 0;

	const clearPointerGlow = () => {
		if (pointerFrame) {
			cancelAnimationFrame(pointerFrame);
			pointerFrame = 0;
		}

		createSurface.classList.remove('is-pointer-active');
	};

	createSurface.addEventListener('pointermove', event => {
		const rect = createSurface.getBoundingClientRect();
		pointerX = event.clientX - rect.left;
		pointerY = event.clientY - rect.top;
		createSurface.classList.add('is-pointer-active');

		if (pointerFrame) {
			return;
		}

		pointerFrame = requestAnimationFrame(() => {
			createSurface.style.setProperty('--create-glow-x', `${pointerX}px`);
			createSurface.style.setProperty('--create-glow-y', `${pointerY}px`);
			pointerFrame = 0;
		});
	}, { passive: true });

	createSurface.addEventListener('pointerleave', clearPointerGlow, { passive: true });
	createSurface.addEventListener('pointercancel', clearPointerGlow, { passive: true });
}

if (createSurface && !prefersReducedMotion.matches) {
	createSurface.classList.add('is-welcome');
	window.setTimeout(() => createSurface.classList.remove('is-welcome'), 1400);
}

createRootFileButtons.forEach(button => {
	button.addEventListener('click', () => {
		const fileName = button.dataset.createRootFile;
		if (isCreateInstructionRootFileName(fileName)) {
			if (button.disabled || pendingCreateRootFiles.has(fileName)) {
				return;
			}

			beginCreateRootFile(button, fileName);
			emitSkillsEvent('createSkill.rootFile.create', { fileName });
			return;
		}

		if (fileName !== 'DESIGN.md') {
			return;
		}

		createDock.saveActiveValue(activeMode);
		createChatState = 'idle';
		activeMode = 'design';
		syncMode();
		emitSkillsEvent('createSkill.design.open');
	});
});

createFlowEditButtons.forEach(button => {
	button.addEventListener('click', () => {
		const card = button.closest('[data-create-flow-card]') as HTMLElement | null;
		const cardType = card?.dataset.createFlowCard;

		if (cardType === 'name' && confirmedCreateSkillName) {
			emitSkillsEvent('createSkill.namePrompt.open', {
				target: activeCreateTarget,
				initialValue: confirmedCreateSkillName,
				template: activeCreateTemplate,
			});
		} else if (cardType === 'category' && confirmedCreateCategory) {
			confirmedCreateCategory = undefined;
			activeCategoryLabel = null;
			activeCreateFlowStep = 'category';
			syncCreateFlowStatus();
			createDock.sync(activeMode, activeCreateTarget);
			emitSkillsEvent('createSkill.category.reset');
		} else if (cardType === 'description' && confirmedCreateDescription) {
			activeCreateFlowStep = 'description';
			syncCreateFlowStatus();
			createDock.sync(activeMode, activeCreateTarget);
			createDock.focusInput();
		}
	});
});

designBackButton?.addEventListener('click', () => {
	const wasHandled = !emitSkillsEvent('createSkill.design.back', undefined, { cancelable: true });
	if (wasHandled) {
		return;
	}

	createDock.saveActiveValue(activeMode);
	createChatState = 'idle';
	activeMode = 'create';
	syncMode();
});

onSkillsEvent('createSkill.design.reset', () => {
	createDock.saveActiveValue(activeMode);
	createChatState = 'idle';
	activeMode = 'create';
	syncMode();
});

onSkillsEvent('createSkill.namePrompt.open', () => {
	createSurface?.classList.add('is-name-prompt-open');
});

onSkillsEvent('createSkill.skillName.confirm', detail => {
	createSurface?.classList.remove('is-name-prompt-open');

	let selectedTemplate: CreateSkillTemplate = 'fast';
	if (detail && typeof detail === 'object') {
		if (typeof detail.name === 'string' && detail.name.trim()) {
			confirmedCreateSkillName = detail.name.trim();
		}
		if (detail.target === 'agents' || detail.target === 'claude') {
			activeCreateTarget = detail.target;
		}
		if (detail.template === 'base' || detail.template === 'fast') {
			selectedTemplate = detail.template;
		}
	}

	// Mirror the modal's choice onto the in-screen Base/Fast toggle.
	setActiveCreateTemplate(selectedTemplate);

	if (selectedTemplate === 'base') {
		// Base skips the guided flow entirely: create immediately, no redirect.
		createChatState = 'open';
		confirmedCreateCategory = 'Base Template';
		confirmedCreateDescription = 'Skipped description';
		activeCreateFlowStep = 'done';
		syncConfirmedCreateName();
		syncCreateFlowStatus();
		syncMode();
		createLoading.beginHostWait();
		pendingCreateTemplate = 'base';
		const name = confirmedCreateSkillName;
		if (name) {
			emitSkillsEvent('createSkill.chat.create', {
				name,
				query: '',
				target: activeCreateTarget ?? 'agents',
				template: 'base',
			});
		}
		return;
	}

	createChatState = 'open';
	syncConfirmedCreateName();
	syncCreateFlowStatus();
	syncMode();
	// Keep the chat screen open so the user can now type the skill description
	// Focus the chat input after a small delay for the modal close animation
	skipNextCreateChatOpen = true;
	createDock.setInputDisabled(false);
	window.setTimeout(() => {
		createDock.focusInput();
	}, 260);
});

onSkillsEvent('createSkill.namePrompt.cancel', () => {
	createSurface?.classList.remove('is-name-prompt-open');
	createDock.setInputDisabled(false);

	// If editing an existing name, just close the modal without resetting
	if (confirmedCreateSkillName) {
		return;
	}

	// User dismissed the name modal during initial creation → restore cards view
	closeCreateChatScreen();
});

onSkillsEvent('createSkill.design.edit', () => {
	createDock.saveActiveValue(activeMode);
	closeCreateChatScreen();
	activeMode = 'design';
	syncMode();
	emitSkillsEvent('createSkill.design.open', { overwrite: true });
});

function toggleCreateSearchMode() {
	const nextMode: CreateSkillMode = activeMode === 'create' ? 'search' : 'create';
	const shouldPlaySearchEnter = activeMode === 'create' && nextMode === 'search' && !hasCompletedSearch;

	createDock.saveActiveValue(activeMode);
	createChatState = 'idle';
	activeMode = nextMode;
	syncMode();

	if (shouldPlaySearchEnter) {
		void searchBloom?.playEnterTransition();
		createDock.focusInput();
	}

	if (nextMode === 'search') {
		requestCreateSearchPrefetch();
	}
}

initSearchMode();
initDesignMdMode();
initNamePrompt();
initCategorySelection();
syncConfirmedCreateName();
syncCreateFlowStatus();
syncMode();

// Handle top-level category selection to change flow text dynamically
onSkillsEvent('createSkill.category.mainSelected', detail => {
	if (!detail?.categoryLabel) {
		return;
	}

	activeCategoryLabel = detail.categoryLabel;
	syncCreateFlowStatus();
});

// Handle category selection
onSkillsEvent('createSkill.category.selected', detail => {
	if (!detail || typeof detail !== 'object') {
		return;
	}

	if (typeof detail.categoryId === 'string') {
		confirmedCreateCategory = typeof detail.subcategoryId === 'string'
			? `${detail.categoryId}/${detail.subcategoryId}`
			: detail.categoryId;
		activeCreateFlowStep = 'description';
		syncCreateFlowStatus();
		createDock.sync(activeMode, activeCreateTarget);
		createDock.setInputDisabled(false);
		window.setTimeout(() => createDock.focusInput(), 0);
	}
});

onSkillsEvent('createSkill.rootFiles.update', detail => {
	if (detail && typeof detail === 'object') {
		syncCreateRootFileButtons(detail);
	}
});

onSkillsEvent('createSkill.rootFile.status', eventDetail => {
	if (!isCreateRootFileStatusDetail(eventDetail)) {
		return;
	}

	const detail = eventDetail;
	const button = createRootFileButtons.find(candidate => candidate.dataset.createRootFile === detail.fileName);
	if (detail.status === 'writing') {
		if (button && !pendingCreateRootFiles.has(detail.fileName)) {
			beginCreateRootFile(button, detail.fileName);
		}
		return;
	}

	finishCreateRootFile(detail.fileName, detail.status, detail.message);
});

if (window.mySkillsCreateRootFiles) {
	syncCreateRootFileButtons(window.mySkillsCreateRootFiles);
}

emitSkillsEvent('createSkill.rootFiles.request');

onSkillsEvent('createSkill.search.state', detail => {
	if (typeof detail?.hasCompletedSearch === 'boolean') {
		hasCompletedSearch = detail.hasCompletedSearch;
	}
});

function completeCreateFlow(): void {
	emitSkillsEvent('createSkill.flow.complete');
	createLoading.resetScreen();
	closeCreateChatScreen();
}

function showCreateError(message: string | undefined): void {
	createLoading.cancel();
	createLoading.resetScreen();
	createDock.setInputDisabled(false);
	syncCreateFlowStatus();
	if (createFlowDescription) {
		createFlowDescription.textContent = message ?? 'Could not create this skill';
	}
}

onSkillsEvent('createSkill.chat.submit', detail => {
	if (!detail) {
		return;
	}

	if (detail.mode !== 'create') {
		return;
	}

	if ((pendingCreateTemplate ?? activeCreateTemplate) === 'fast') {
		createLoading.beginHostWait();
	}
});

onSkillsEvent('createSkillResult', detail => {
	if (!detail || typeof detail !== 'object') {
		return;
	}

	if (typeof detail.success !== 'boolean') {
		return;
	}

	const completedTemplate = pendingCreateTemplate ?? activeCreateTemplate;
	pendingCreateTemplate = undefined;

	if (detail.success) {
		if (completedTemplate === 'fast') {
			createLoading.startSuccessAnimation();
			return;
		}

		completeCreateFlow();
		return;
	}

	showCreateError(typeof detail.message === 'string' ? detail.message : undefined);
});

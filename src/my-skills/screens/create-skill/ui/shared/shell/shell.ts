import { initDesignMdMode } from '../../chat-create/design-md/design-md';
import { initCategorySelection } from '../../chat-create/category/category';
import { initNamePrompt } from '../../chat-create/modal/skill-modal';
import { initSearchMode } from '../../chat-search/search';
import { initCreateDock } from '../dock/chat-dock';
import type { CreateSkillChatSubmitDetail, CreateSkillMode, CreateSkillTarget } from '../types';
type CreateInstructionRootFileName = 'AGENTS.md' | 'CLAUDE.md';
type CreateRootFilesStatus = Record<string, boolean>;
type CreateFlowStep = 'description' | 'category' | 'done';
type SearchBloomDot = { x: number; y: number; normDist: number };
type SearchBloomDotGrid = { width: number; height: number; dots: SearchBloomDot[] };

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
			window.dispatchEvent(new CustomEvent('createSkill.chat.create', {
				detail: {
					name: confirmedCreateSkillName,
					query: '',
					target: activeCreateTarget ?? 'agents',
					template: 'base',
				}
			}));
		}
	});
});

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const canTrackPointer = window.matchMedia('(pointer: fine)');
const createRootFileMinimumLoadingMs = 1200;
const searchBloomDotSpacing = 12;
const searchBloomDotRadius = 1;
const searchBloomDurationMs = 1950;
const searchBloomBand = 0.28;

let activeMode: CreateSkillMode = 'create';
let activeCreateTarget: CreateSkillTarget | undefined;
let createChatState: 'idle' | 'cleaning' | 'open' = 'idle';
let createChatCleanTimer: number | undefined;
let bloomRaf: number | undefined;
let bloomCanvas: HTMLCanvasElement | undefined;
let bloomPromise: Promise<void> | undefined;
let resolveBloom: (() => void) | undefined;
let shouldRepeatSearchBloom = false;
let isSearchBloomLoopRunning = false;
let searchBloomDotGrid: SearchBloomDotGrid | undefined;
let hasCompletedSearch = false;
let didRequestSearchPrefetch = false;
let skipNextCreateChatOpen = false;
let confirmedCreateSkillName: string | undefined;
let activeCreateFlowStep: CreateFlowStep = 'category';
let confirmedCreateDescription: string | undefined;
let confirmedCreateCategory: string | undefined;
let activeCategoryLabel: string | null = null;
let currentCreateRootFilesStatus: CreateRootFilesStatus = window.mySkillsCreateRootFiles ?? {};
let isCreateLoadingActive = false;
let createLoadingStepTimer: number | undefined;

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
			shouldRepeatSearchBloom = false;
		}
	},
	onCreateSubmit: handleCreateFlowSubmit,
	onCreateChatOpen: openCreateChatScreen,
	onSearchInput: () => {
		hasCompletedSearch = false;
		requestCreateSearchPrefetch();
		requestSearchTypingBloom();
	},
	onToggleMode: toggleCreateSearchMode,
});

interface CreateRootFileCreateDetail {
	fileName: CreateInstructionRootFileName;
}

interface CreateRootFileStatusDetail {
	fileName: CreateInstructionRootFileName;
	status: 'writing' | 'created' | 'error';
	message?: string;
}

interface CreateSkillResultDetail {
	success: boolean;
	message?: string;
}

/** Returns the [r, g, b] of the search accent. */
function getSearchAccentRgb(): [number, number, number] {
	return [46, 160, 67]; // #2ea043
}

function stopBloom() {
	if (bloomRaf !== undefined) {
		cancelAnimationFrame(bloomRaf);
		bloomRaf = undefined;
	}

	bloomCanvas?.remove();
	bloomCanvas = undefined;
	resolveBloom?.();
	resolveBloom = undefined;
	bloomPromise = undefined;
}

function completeBloom() {
	bloomCanvas?.remove();
	bloomCanvas = undefined;
	bloomRaf = undefined;
	resolveBloom?.();
	resolveBloom = undefined;
	bloomPromise = undefined;
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
			window.dispatchEvent(new CustomEvent('createSkill.namePrompt.open', {
				detail: { target: activeCreateTarget },
			}));
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
		window.dispatchEvent(new CustomEvent('createSkill.namePrompt.open', {
			detail: { target: activeCreateTarget },
		}));
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
	if (createLoadingStepTimer !== undefined) {
		window.clearTimeout(createLoadingStepTimer);
		createLoadingStepTimer = undefined;
	}
	isCreateLoadingActive = false;
	createChatState = 'idle';
	activeCreateTarget = undefined;
	confirmedCreateSkillName = undefined;
	activeCreateFlowStep = 'category';
	confirmedCreateDescription = undefined;
	confirmedCreateCategory = undefined;
	activeCategoryLabel = null;
	
	activeCreateTemplate = 'fast';
	templateButtons.forEach(b => b.classList.toggle('is-active', b.dataset.createChatTemplate === 'fast'));
	if (templateToggleContainer) {
		templateToggleContainer.classList.add('is-fast-active');
	}

	syncConfirmedCreateName();
	syncCreateFlowStatus();
	syncMode();
	window.dispatchEvent(new CustomEvent('createSkill.category.reset'));
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
	if (!confirmedCreateSkillName) {
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
	window.dispatchEvent(new CustomEvent('createSkill.chat.create', {
		detail: {
			name: confirmedCreateSkillName,
			query: finalQuery,
			target: activeCreateTarget ?? 'agents',
			template: activeCreateTemplate,
		}
	}));

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
			window.dispatchEvent(new CustomEvent('createSkill.rootFiles.request'));
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
		shouldRepeatSearchBloom = false;
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

function hasSearchInputValue(): boolean {
	return createDock.hasSearchInputValue();
}

async function playSearchTypingBloomLoop() {
	if (isSearchBloomLoopRunning) {
		return;
	}

	isSearchBloomLoopRunning = true;
	try {
		while (shouldRepeatSearchBloom && hasSearchInputValue()) {
			if (bloomPromise) {
				await bloomPromise;
			} else {
				await playSearchEnterTransition();
			}
		}
	} finally {
		isSearchBloomLoopRunning = false;
	}
}

function requestSearchTypingBloom() {
	if (!hasSearchInputValue() || prefersReducedMotion.matches) {
		shouldRepeatSearchBloom = false;
		return;
	}

	shouldRepeatSearchBloom = true;

	void playSearchTypingBloomLoop();
}

function requestCreateSearchPrefetch() {
	if (didRequestSearchPrefetch) {
		return;
	}

	didRequestSearchPrefetch = true;
	window.dispatchEvent(new CustomEvent('createSkill.search.prefetch'));
}

function playSearchEnterTransition(): Promise<void> {
	if (!createSurface || prefersReducedMotion.matches) {
		return Promise.resolve();
	}

	stopBloom();
	bloomPromise = new Promise(resolve => {
		resolveBloom = resolve;
	});

	// Canvas covers the full surface, sits behind content (z-index 0)
	const canvas = document.createElement('canvas');
	canvas.className = 'create-search-bloom-canvas';
	canvas.style.cssText = [
		'position:absolute',
		'inset:0',
		'width:100%',
		'height:100%',
		'pointer-events:none',
		'z-index:0',
	].join(';');
	createSurface.appendChild(canvas);
	bloomCanvas = canvas;

	const W = createSurface.offsetWidth;
	const H = createSurface.offsetHeight;
	canvas.width = W;
	canvas.height = H;

	const ctx = canvas.getContext('2d');
	if (!ctx) {
		stopBloom();
		return Promise.resolve();
	}

	const [r, g, b] = getSearchAccentRgb();
	const dots = getSearchBloomDots(W, H);

	const startTime = performance.now();

	function frame(now: number) {
		const p = Math.min((now - startTime) / searchBloomDurationMs, 1);
		ctx!.clearRect(0, 0, W, H);

		// Wave front advances with a sqrt ease (fast start, slows near end)
		const waveFront = Math.pow(p, 0.5);
		const waveTrail = Math.max(0, waveFront - searchBloomBand);

		for (const d of dots) {
			const { normDist } = d;

			// Not yet reached by wave front → invisible
			if (waveFront < normDist) {
				continue;
			}

			let alpha: number;

			if (waveTrail < normDist) {
				// Inside the active wave band: peak at band center using a sine arch
				const bandPos = (waveFront - normDist) / searchBloomBand;
				alpha = Math.sin(bandPos * Math.PI) * 0.82;
			} else {
				// Behind the trail: fading echo
				const trailFade = (waveTrail - normDist) / (waveTrail + 0.001);
				alpha = 0.18 * (1 - Math.min(trailFade, 1));
			}

			// Global fade-out as animation progresses
			alpha *= (1 - p * 0.62);

			if (alpha < 0.01) {
				continue;
			}

			ctx!.beginPath();
			ctx!.arc(d.x, d.y, searchBloomDotRadius, 0, Math.PI * 2);
			ctx!.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
			ctx!.fill();
		}

		if (p < 1) {
			bloomRaf = requestAnimationFrame(frame);
		} else {
			completeBloom();
		}
	}

	bloomRaf = requestAnimationFrame(frame);
	return bloomPromise;
}

function getSearchBloomDots(width: number, height: number): SearchBloomDot[] {
	if (searchBloomDotGrid?.width === width && searchBloomDotGrid.height === height) {
		return searchBloomDotGrid.dots;
	}

	const originX = width / 2;
	const originY = height + 12;
	const maxDist = Math.hypot(width, height + 12);
	const offX = (width % searchBloomDotSpacing) / 2;
	const offY = (height % searchBloomDotSpacing) / 2;
	const dots: SearchBloomDot[] = [];

	for (let x = offX; x < width; x += searchBloomDotSpacing) {
		for (let y = offY; y < height; y += searchBloomDotSpacing) {
			dots.push({
				x,
				y,
				normDist: Math.hypot(x - originX, y - originY) / maxDist,
			});
		}
	}

	searchBloomDotGrid = { width, height, dots };
	return dots;
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

let isSurfaceVisible = true;
if (createSurface) {
	const observer = new IntersectionObserver((entries) => {
		for (const entry of entries) {
			isSurfaceVisible = entry.isIntersecting;
			if (!isSurfaceVisible) {
				if (bloomRaf !== undefined) {
					stopBloom();
				}
			} else if (shouldRepeatSearchBloom && hasSearchInputValue()) {
				requestSearchTypingBloom();
			}
		}
	});
	observer.observe(createSurface);
}

createRootFileButtons.forEach(button => {
	button.addEventListener('click', () => {
		const fileName = button.dataset.createRootFile;
		if (isCreateInstructionRootFileName(fileName)) {
			if (button.disabled || pendingCreateRootFiles.has(fileName)) {
				return;
			}

			beginCreateRootFile(button, fileName);
			window.dispatchEvent(new CustomEvent<CreateRootFileCreateDetail>('createSkill.rootFile.create', {
				detail: { fileName },
			}));
			return;
		}

		if (fileName !== 'DESIGN.md') {
			return;
		}

		createDock.saveActiveValue(activeMode);
		createChatState = 'idle';
		activeMode = 'design';
		syncMode();
		window.dispatchEvent(new CustomEvent('createSkill.design.open'));
	});
});

createFlowEditButtons.forEach(button => {
	button.addEventListener('click', () => {
		const card = button.closest('[data-create-flow-card]') as HTMLElement | null;
		const cardType = card?.dataset.createFlowCard;

		if (cardType === 'name' && confirmedCreateSkillName) {
			window.dispatchEvent(new CustomEvent('createSkill.namePrompt.open', {
				detail: {
					target: activeCreateTarget,
					initialValue: confirmedCreateSkillName,
				},
			}));
		} else if (cardType === 'category' && confirmedCreateCategory) {
			confirmedCreateCategory = undefined;
			activeCategoryLabel = null;
			activeCreateFlowStep = 'category';
			syncCreateFlowStatus();
			createDock.sync(activeMode, activeCreateTarget);
			window.dispatchEvent(new CustomEvent('createSkill.category.reset'));
		} else if (cardType === 'description' && confirmedCreateDescription) {
			activeCreateFlowStep = 'description';
			syncCreateFlowStatus();
			createDock.sync(activeMode, activeCreateTarget);
			createDock.focusInput();
		}
	});
});

designBackButton?.addEventListener('click', () => {
	const wasHandled = !window.dispatchEvent(new CustomEvent('createSkill.design.back', { cancelable: true }));
	if (wasHandled) {
		return;
	}

	createDock.saveActiveValue(activeMode);
	createChatState = 'idle';
	activeMode = 'create';
	syncMode();
});

window.addEventListener('createSkill.design.reset', () => {
	createDock.saveActiveValue(activeMode);
	createChatState = 'idle';
	activeMode = 'create';
	syncMode();
});

window.addEventListener('createSkill.namePrompt.open', () => {
	createSurface?.classList.add('is-name-prompt-open');
});

window.addEventListener('createSkill.skillName.confirm', event => {
	createSurface?.classList.remove('is-name-prompt-open');

	if (event instanceof CustomEvent && event.detail && typeof event.detail === 'object') {
		const detail = event.detail as { name?: unknown; target?: unknown };
		if (typeof detail.name === 'string' && detail.name.trim()) {
			confirmedCreateSkillName = detail.name.trim();
		}
		if (detail.target === 'agents' || detail.target === 'claude') {
			activeCreateTarget = detail.target;
		}
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

window.addEventListener('createSkill.namePrompt.cancel', () => {
	createSurface?.classList.remove('is-name-prompt-open');
	createDock.setInputDisabled(false);

	// If editing an existing name, just close the modal without resetting
	if (confirmedCreateSkillName) {
		return;
	}

	// User dismissed the name modal during initial creation → restore cards view
	closeCreateChatScreen();
});

window.addEventListener('createSkill.design.edit', () => {
	createDock.saveActiveValue(activeMode);
	closeCreateChatScreen();
	activeMode = 'design';
	syncMode();
	window.dispatchEvent(new CustomEvent('createSkill.design.open', {
		detail: { overwrite: true },
	}));
});

function toggleCreateSearchMode() {
	const nextMode: CreateSkillMode = activeMode === 'create' ? 'search' : 'create';
	const shouldPlaySearchEnter = activeMode === 'create' && nextMode === 'search' && !hasCompletedSearch;

	createDock.saveActiveValue(activeMode);
	createChatState = 'idle';
	activeMode = nextMode;
	syncMode();

	if (shouldPlaySearchEnter) {
		void playSearchEnterTransition();
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
window.addEventListener('createSkill.category.mainSelected', event => {
	if (!(event instanceof CustomEvent) || !event.detail) {
		return;
	}

	const detail = event.detail as { categoryId?: string; categoryLabel?: string };
	if (detail.categoryLabel) {
		activeCategoryLabel = detail.categoryLabel;
		syncCreateFlowStatus();
	}
});

// Handle category selection
window.addEventListener('createSkill.category.selected', event => {
	if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== 'object') {
		return;
	}

	const detail = event.detail as { categoryId?: unknown; subcategoryId?: unknown };
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

window.addEventListener('createSkill.rootFiles.update', event => {
	if (event instanceof CustomEvent && event.detail && typeof event.detail === 'object') {
		syncCreateRootFileButtons(event.detail as CreateRootFilesStatus);
	}
});

window.addEventListener('createSkill.rootFile.status', event => {
	if (!(event instanceof CustomEvent) || !isCreateRootFileStatusDetail(event.detail)) {
		return;
	}

	const detail = event.detail;
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

window.dispatchEvent(new CustomEvent('createSkill.rootFiles.request'));

window.addEventListener('createSkill.search.state', event => {
	if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== 'object') {
		return;
	}

	const detail = event.detail as { hasCompletedSearch?: unknown };
	if (typeof detail.hasCompletedSearch === 'boolean') {
		hasCompletedSearch = detail.hasCompletedSearch;
	}
});

function getCreateLoadingElements(): { loadingScreen: HTMLElement; steps: HTMLElement[] } | undefined {
	const loadingScreen = document.querySelector('[data-create-loading-screen]') as HTMLElement | null;
	if (!loadingScreen) {
		return undefined;
	}

	return {
		loadingScreen,
		steps: Array.from(loadingScreen.querySelectorAll<HTMLElement>('[data-loading-step]')),
	};
}

function resetCreateLoadingScreen(): void {
	const loading = getCreateLoadingElements();
	if (!loading) {
		return;
	}

	loading.loadingScreen.hidden = true;
	loading.steps.forEach(step => {
		step.classList.remove('is-active', 'is-done');
	});
}

function beginCreateHostWait(): void {
	createDock.setInputDisabled(true);
	if (createLoadingStepTimer !== undefined) {
		window.clearTimeout(createLoadingStepTimer);
		createLoadingStepTimer = undefined;
	}
	isCreateLoadingActive = false;

	const loading = getCreateLoadingElements();
	if (!loading) {
		return;
	}

	loading.loadingScreen.hidden = false;
	loading.steps.forEach(step => {
		step.classList.remove('is-active', 'is-done');
	});
	loading.steps[0]?.classList.add('is-active');
}

function finishCreateSuccessAnimation(): void {
	if (!isCreateLoadingActive) {
		return;
	}

	isCreateLoadingActive = false;
	if (createLoadingStepTimer !== undefined) {
		window.clearTimeout(createLoadingStepTimer);
		createLoadingStepTimer = undefined;
	}

	completeCreateFlow();
}

function completeCreateFlow(): void {
	window.dispatchEvent(new CustomEvent('createSkill.flow.complete'));
	resetCreateLoadingScreen();
	closeCreateChatScreen();
}

function showCreateError(message: string | undefined): void {
	if (createLoadingStepTimer !== undefined) {
		window.clearTimeout(createLoadingStepTimer);
		createLoadingStepTimer = undefined;
	}
	isCreateLoadingActive = false;
	resetCreateLoadingScreen();
	createDock.setInputDisabled(false);
	syncCreateFlowStatus();
	if (createFlowDescription) {
		createFlowDescription.textContent = message ?? 'Could not create this skill';
	}
}

function startCreateSuccessAnimation(): void {
	const loading = getCreateLoadingElements();
	if (!loading) {
		completeCreateFlow();
		return;
	}

	if (createLoadingStepTimer !== undefined) {
		window.clearTimeout(createLoadingStepTimer);
	}

	isCreateLoadingActive = true;
	createDock.setInputDisabled(true);
	const loadingScreen = loading.loadingScreen;
	const steps = loading.steps;
	loadingScreen.hidden = false;
	if (!steps.some(step => step.classList.contains('is-active') || step.classList.contains('is-done'))) {
		steps[0]?.classList.add('is-active');
	}

	let stepIndex = getNextCreateLoadingStepIndex(steps);

	function advanceStep() {
		if (stepIndex > 0) {
			const prevStep = steps[stepIndex - 1];
			if (prevStep) {
				prevStep.classList.remove('is-active');
				prevStep.classList.add('is-done');
			}
		}

		if (stepIndex < steps.length) {
			const currentStep = steps[stepIndex];
			if (currentStep) {
				currentStep.classList.add('is-active');
			}
			stepIndex++;
			createLoadingStepTimer = window.setTimeout(advanceStep, 700);
		} else {
			createLoadingStepTimer = window.setTimeout(finishCreateSuccessAnimation, 400);
		}
	}

	advanceStep();
}

function getNextCreateLoadingStepIndex(steps: HTMLElement[]): number {
	const activeIndex = steps.findIndex(step => step.classList.contains('is-active'));
	if (activeIndex >= 0) {
		return activeIndex + 1;
	}

	const doneCount = steps.filter(step => step.classList.contains('is-done')).length;
	return Math.min(doneCount, steps.length);
}

window.addEventListener('createSkill.chat.submit', event => {
	if (!(event instanceof CustomEvent) || !event.detail) {
		return;
	}

	const detail = event.detail as CreateSkillChatSubmitDetail;
	if (detail.mode !== 'create') {
		return;
	}

	if ((pendingCreateTemplate ?? activeCreateTemplate) === 'fast') {
		beginCreateHostWait();
	}
});

window.addEventListener('createSkillResult', event => {
	if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== 'object') {
		return;
	}

	const detail = event.detail as { success?: unknown; message?: unknown };
	if (typeof detail.success !== 'boolean') {
		return;
	}

	const completedTemplate = pendingCreateTemplate ?? activeCreateTemplate;
	pendingCreateTemplate = undefined;

	if (detail.success) {
		if (completedTemplate === 'fast') {
			startCreateSuccessAnimation();
			return;
		}

		completeCreateFlow();
		return;
	}

	showCreateError(typeof detail.message === 'string' ? detail.message : undefined);
});

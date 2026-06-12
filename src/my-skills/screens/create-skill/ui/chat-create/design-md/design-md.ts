import { designColorOptions } from './data/colors';
import { designStyleOptions } from './data/styles';
import { designTypographyOptions } from './data/typography';
import type { DesignColorOption, DesignMdSelection, DesignStyleOption, DesignTypographyOption } from './core/types';

interface DesignCreateStatusDetail {
	status: 'writing' | 'created' | 'error';
	message?: string;
}

interface DesignOpenDetail {
	overwrite?: boolean;
}

const designColorById = new Map(designColorOptions.map(option => [option.id, option]));
const designTypographyById = new Map(designTypographyOptions.map(option => [option.id, option]));
const designStyleById = new Map(designStyleOptions.map(option => [option.id, option]));
const summaryStep = 3;
const enterAnimationMs = 900;
const maxVisibleTypographyWeights = 3;

export function initDesignMdMode() {
	const root = document.querySelector<HTMLElement>('[data-design-md-screen]');
	if (!root) {
		return;
	}

	const surface = document.querySelector<HTMLElement>('[data-create-skill-surface]');
	const colorOptionsRoot = root.querySelector<HTMLElement>('[data-design-options="color"]');
	const typographyOptionsRoot = root.querySelector<HTMLElement>('[data-design-options="typography"]');
	const styleOptionsRoot = root.querySelector<HTMLElement>('[data-design-options="style"]');
	const createButton = root.querySelector<HTMLButtonElement>('[data-design-create]');
	const fileStatus = root.querySelector<HTMLElement>('[data-design-file-status]');

	if (!colorOptionsRoot || !typographyOptionsRoot || !styleOptionsRoot || !createButton || !fileStatus) {
		return;
	}

	const screen = root;
	const designCreateButton = createButton;
	const designFileStatus = fileStatus;

	const selection: DesignMdSelection = {
		color: undefined,
		typography: undefined,
		style: undefined,
	};

	renderColorOptions(colorOptionsRoot, selection);
	renderTypographyOptions(typographyOptionsRoot, selection);
	renderStyleOptions(styleOptionsRoot, selection);

	const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-design-step-panel]'));
	const progressLabel = document.querySelector<HTMLElement>('[data-create-design-progress-label]');
	const progressSteps = Array.from(document.querySelectorAll<HTMLElement>('[data-create-design-progress-step]'));
	const designBackButton = document.querySelector<HTMLButtonElement>('[data-create-design-back]');
	const designSkipButton = document.querySelector<HTMLButtonElement>('[data-create-design-skip]');
	const summaries = Array.from(root.querySelectorAll<HTMLElement>('[data-design-summary]'));
	const collageCards = Array.from(root.querySelectorAll<HTMLElement>('[data-collage-card]'));
	const designBackIcon = designBackButton?.innerHTML ?? '';
	let activeStep = 0;
	let collageFront = 2;
	let isWriting = false;
	let designFileExists = false;
	let canOverwriteDesignFile = false;
	const animatedSteps = new Set<number>();

	function syncCreateState(message?: string) {
		designCreateButton.disabled = isWriting || (designFileExists && !canOverwriteDesignFile);
		designCreateButton.setAttribute('aria-disabled', String(designCreateButton.disabled));
		designCreateButton.textContent = designFileExists && canOverwriteDesignFile ? 'Update DESIGN.md' : 'Create DESIGN.md';

		if (designFileExists && !canOverwriteDesignFile) {
			designCreateButton.textContent = 'DESIGN.md created';
		}

		if (isWriting) {
			designCreateButton.textContent = canOverwriteDesignFile ? 'Updating DESIGN.md...' : 'Creating DESIGN.md...';
			designFileStatus.textContent = 'Writing';
		} else {
			designFileStatus.textContent = message ?? (designFileExists ? (canOverwriteDesignFile ? 'Ready to update' : 'Created') : 'Ready to write');
		}

		screen.classList.toggle('is-design-writing', isWriting);
		screen.classList.toggle('is-design-created', designFileExists && !isWriting);
	}

	function syncStep(animate = false) {
		panels.forEach(panel => {
			const step = Number(panel.dataset.designStepPanel);
			const isActive = step === activeStep;
			const shouldAnimate = isActive && animate && !animatedSteps.has(step);
			panel.hidden = !isActive;
			panel.classList.toggle('is-active', isActive);

			if (shouldAnimate) {
				animatedSteps.add(step);
				playEnterAnimation(panel);
			} else {
				panel.classList.remove('is-entering');
			}
		});

		progressSteps.forEach(step => {
			const index = Number(step.dataset.createDesignProgressStep);
			step.classList.toggle('is-active', index <= Math.min(activeStep, 2));
		});

		if (progressLabel) {
			progressLabel.textContent = activeStep >= summaryStep ? 'Ready' : `Step ${activeStep + 1} of ${summaryStep}`;
		}

		surface?.style.setProperty(
			'--create-design-back-accent',
			activeStep === 0 ? 'var(--vscode-focusBorder, #0078d4)' : 'var(--create-accent)',
		);

		if (designBackButton) {
			designBackButton.classList.toggle('is-close', activeStep === 0);
			designBackButton.setAttribute('aria-label', activeStep === 0 ? 'Close design flow' : 'Back');
			designBackButton.innerHTML = activeStep === 0 ? 'x' : designBackIcon;
		}

		syncSkipButton(designSkipButton, selection, activeStep);

		// Always scroll back to top when switching steps
		surface?.scrollTo({ top: 0, behavior: 'instant' });

		// Lock scroll on the summary screen (step 3)
		surface?.classList.toggle('is-design-summary', activeStep === summaryStep);

		summaries.forEach(summary => {
			const index = Number(summary.dataset.designSummary);
			if (index === 0) {
				summary.textContent = getColorSummaryLabel(selection);
			} else if (index === 1) {
				summary.textContent = getTypographySummaryLabel(selection);
			} else if (index === 2) {
				summary.textContent = getStyleSummaryLabel(selection);
			}
		});

		if (activeStep === summaryStep) {
			renderCollageVisuals(screen, selection);
			syncCollageSkippedState(collageCards, selection);
			syncCollageDepth(collageCards, collageFront);
		}
	}

	root.addEventListener('click', event => {
		const option = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-design-option]');
		if (!option || !root.contains(option)) {
			return;
		}

		const step = Number(option.dataset.designStep);
		if (!Number.isInteger(step)) {
			return;
		}

		const value = option.dataset.designValue ?? option.textContent?.trim() ?? '';
		clearFutureDecisions(selection, step);
		if (step === 0) {
			selection.color = designColorById.get(value) ?? selection.color;
			selection.skipColor = false;
		} else if (step === 1) {
			selection.typography = designTypographyById.get(value) ?? selection.typography;
			selection.skipTypography = false;
		} else if (step === 2) {
			selection.style = designStyleById.get(value) ?? selection.style;
			selection.skipStyle = false;
		}
		root.classList.remove('is-design-error');
		syncCreateState();

		root
			.querySelectorAll<HTMLButtonElement>(`[data-design-option][data-design-step="${option.dataset.designStep ?? ''}"]`)
			.forEach(candidate => candidate.classList.toggle('is-selected', candidate === option));
		clearFutureSelectedOptions(root, step);
		syncSkipButton(designSkipButton, selection, activeStep);

		activeStep = Math.min(step + 1, summaryStep);
		syncStep(true);
	});

	designSkipButton?.addEventListener('click', () => {
		if (designSkipButton.hidden || designSkipButton.disabled || !canSkipStep(selection, activeStep)) {
			return;
		}

		clearFutureDecisions(selection, activeStep);
		if (activeStep === 0) {
			selection.color = undefined;
			selection.skipColor = true;
		} else if (activeStep === 1) {
			selection.typography = undefined;
			selection.skipTypography = true;
		} else if (activeStep === 2) {
			selection.style = undefined;
			selection.skipStyle = true;
		} else {
			return;
		}

		root.classList.remove('is-design-error');
		root
			.querySelectorAll<HTMLButtonElement>(`[data-design-option][data-design-step="${activeStep}"]`)
			.forEach(candidate => candidate.classList.remove('is-selected'));
		clearFutureSelectedOptions(root, activeStep);
		syncCreateState();

		activeStep = Math.min(activeStep + 1, summaryStep);
		syncStep(true);
	});

	window.addEventListener('createSkill.design.back', event => {
		if (!(event instanceof CustomEvent) || activeStep <= 0) {
			return;
		}

		event.preventDefault();
		activeStep -= 1;
		syncStep();
	});

	window.addEventListener('createSkill.design.open', event => {
		activeStep = 0;
		isWriting = false;
		resetSelection(selection);
		clearSelectedOptions(root);
		canOverwriteDesignFile = event instanceof CustomEvent && isDesignOpenDetail(event.detail) && event.detail.overwrite === true;
		root.classList.remove('is-design-error');
		syncCreateState();
		syncStep(true);
	});

	window.addEventListener('createSkill.design.reset', () => {
		activeStep = 0;
		isWriting = false;
		canOverwriteDesignFile = false;
		resetSelection(selection);
		clearSelectedOptions(root);
		root.classList.remove('is-design-error');
		syncCreateState();
		syncStep();
	});

	collageCards.forEach(card => {
		card.addEventListener('click', () => {
			collageFront = Number(card.dataset.collageCard);
			syncCollageDepth(collageCards, collageFront);
		});
	});

	designCreateButton.addEventListener('click', () => {
		if (designCreateButton.disabled || isWriting) {
			return;
		}

		if (!isDesignSelectionComplete(selection)) {
			root.classList.add('is-design-error');
			syncCreateState('Complete all choices');
			return;
		}

		if (!hasSelectedDesignChoice(selection)) {
			root.classList.add('is-design-error');
			syncCreateState('Select at least one choice');
			return;
		}

		isWriting = true;
		root.classList.remove('is-design-error');
		syncCreateState();
		window.dispatchEvent(new CustomEvent('createSkill.design.create', {
			detail: {
				selection: {
					colorId: selection.color?.id,
					typographyId: selection.typography?.id,
					styleId: selection.style?.id,
					skipColor: selection.skipColor === true,
					skipTypography: selection.skipTypography === true,
					skipStyle: selection.skipStyle === true,
				},
				overwrite: canOverwriteDesignFile,
			},
		}));
	});

	window.addEventListener('createSkill.design.status', event => {
		if (!(event instanceof CustomEvent) || !isDesignCreateStatusDetail(event.detail)) {
			return;
		}

		const detail = event.detail;
		isWriting = detail.status === 'writing';
		if (detail.status === 'created') {
			designFileExists = true;
			root.classList.remove('is-design-error');
			syncCreateState(detail.message ?? 'Created');
		} else if (detail.status === 'error') {
			root.classList.add('is-design-error');
			syncCreateState(detail.message ?? 'Could not write file');
		} else {
			root.classList.remove('is-design-error');
			syncCreateState(detail.message);
		}
	});

	window.addEventListener('createSkill.rootFiles.update', event => {
		if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== 'object') {
			return;
		}

		const files = event.detail as Record<string, boolean>;
		designFileExists = files['DESIGN.md'] === true;
		if (!isWriting) {
			root.classList.remove('is-design-error');
			syncCreateState();
		}
	});

	syncCreateState();
	syncStep();
}

function playEnterAnimation(panel: HTMLElement) {
	panel.classList.remove('is-entering');
	window.requestAnimationFrame(() => {
		if (panel.classList.contains('is-active')) {
			panel.classList.add('is-entering');
			window.setTimeout(() => {
				panel.classList.remove('is-entering');
			}, enterAnimationMs);
		}
	});
}

function syncCollageDepth(cards: HTMLElement[], frontIndex: number) {
	cards.forEach(card => {
		const i = Number(card.dataset.collageCard);
		const depth = (i - frontIndex + 3) % 3;
		card.dataset.collageDepth = String(depth);
	});
}

function renderCollageVisuals(root: HTMLElement, selection: DesignMdSelection) {
	const colorVisual = root.querySelector<HTMLElement>('[data-collage-visual="color"]');
	if (colorVisual && (selection.color || selection.skipColor)) {
		colorVisual.replaceChildren();

		if (selection.skipColor) {
			colorVisual.appendChild(createSkippedVisual('Existing colors'));
		} else if (selection.color) {
			const strip = document.createElement('span');
			strip.className = 'design-md-collage-color-strip';
			strip.style.background = selection.color.primary;

			const palette = document.createElement('span');
			palette.className = 'design-md-collage-palette';
			selection.color.palette.forEach(color => {
				const swatch = document.createElement('span');
				swatch.style.background = color;
				palette.appendChild(swatch);
			});

			colorVisual.append(strip, palette);
		}
	}

	const typoVisual = root.querySelector<HTMLElement>('[data-collage-visual="typography"]');
	if (typoVisual && (selection.typography || selection.skipTypography)) {
		typoVisual.replaceChildren();

		if (selection.skipTypography) {
			typoVisual.appendChild(createSkippedVisual('Existing typography'));
		} else if (selection.typography) {
			const sample = document.createElement('span');
			sample.className = 'design-md-collage-type-sample';
			sample.style.fontFamily = selection.typography.families.join(', ');
			sample.style.fontWeight = String(selection.typography.defaultWeight);
			sample.textContent = selection.typography.sample ?? 'Aa';
			typoVisual.appendChild(sample);
		}
	}

	const styleVisual = root.querySelector<HTMLElement>('[data-collage-visual="style"]');
	if (styleVisual && (selection.style || selection.skipStyle)) {
		styleVisual.replaceChildren();

		if (selection.skipStyle) {
			styleVisual.appendChild(createSkippedVisual('Existing style'));
		} else if (selection.style) {
			const mark = document.createElement('span');
			mark.className = `design-md-style-mark design-md-style-mark--${selection.style.tone ?? selection.style.id}`;
			styleVisual.appendChild(mark);
		}
	}
}

function syncCollageSkippedState(cards: HTMLElement[], selection: DesignMdSelection) {
	cards.forEach(card => {
		const index = Number(card.dataset.collageCard);
		const isSkipped = (index === 0 && selection.skipColor === true)
			|| (index === 1 && selection.skipTypography === true)
			|| (index === 2 && selection.skipStyle === true);
		card.classList.toggle('is-skipped', isSkipped);

		const badge = card.querySelector<HTMLElement>('.design-md-collage-badge');
		if (badge) {
			badge.textContent = isSkipped ? 'Keep' : getCollageBadgeLabel(index);
		}
	});
}

function getCollageBadgeLabel(index: number): string {
	if (index === 0) {
		return 'Color';
	}

	if (index === 1) {
		return 'Typography';
	}

	return 'Style';
}

function syncSkipButton(button: HTMLButtonElement | null, selection: DesignMdSelection, step: number) {
	if (!button) {
		return;
	}

	const canSkip = canSkipStep(selection, step);
	const isSkipped = isStepSkipped(selection, step);
	button.hidden = step >= summaryStep || !canSkip;
	button.disabled = !canSkip;
	button.textContent = 'Skip';
	button.classList.toggle('is-selected', isSkipped);
	button.setAttribute('aria-pressed', String(isSkipped));
	button.setAttribute('aria-hidden', String(button.hidden));
}

function resetSelection(selection: DesignMdSelection) {
	selection.color = undefined;
	selection.typography = undefined;
	selection.style = undefined;
	selection.skipColor = false;
	selection.skipTypography = false;
	selection.skipStyle = false;
}

function clearSelectedOptions(root: HTMLElement) {
	root
		.querySelectorAll<HTMLButtonElement>('[data-design-option].is-selected')
		.forEach(candidate => candidate.classList.remove('is-selected'));
}

function clearFutureSelectedOptions(root: HTMLElement, step: number) {
	root
		.querySelectorAll<HTMLButtonElement>('[data-design-option].is-selected')
		.forEach(candidate => {
			const candidateStep = Number(candidate.dataset.designStep);
			if (candidateStep > step) {
				candidate.classList.remove('is-selected');
			}
		});
}

function clearFutureDecisions(selection: DesignMdSelection, step: number) {
	if (step < 1) {
		selection.typography = undefined;
		selection.skipTypography = false;
	}

	if (step < 2) {
		selection.style = undefined;
		selection.skipStyle = false;
	}
}

function isDesignSelectionComplete(selection: DesignMdSelection): boolean {
	return (selection.color !== undefined || selection.skipColor === true)
		&& (selection.typography !== undefined || selection.skipTypography === true)
		&& (selection.style !== undefined || selection.skipStyle === true);
}

function hasSelectedDesignChoice(selection: DesignMdSelection): boolean {
	return selection.color !== undefined || selection.typography !== undefined || selection.style !== undefined;
}

function canSkipStep(selection: DesignMdSelection, step: number): boolean {
	if (step < 0 || step >= summaryStep) {
		return false;
	}

	if (step < summaryStep - 1) {
		return true;
	}

	return selection.color !== undefined || selection.typography !== undefined;
}

function isStepSkipped(selection: DesignMdSelection, step: number): boolean {
	return (step === 0 && selection.skipColor === true)
		|| (step === 1 && selection.skipTypography === true)
		|| (step === 2 && selection.skipStyle === true);
}

function getColorSummaryLabel(selection: DesignMdSelection): string {
	return selection.color?.name ?? (selection.skipColor ? 'Use existing colors' : '');
}

function getTypographySummaryLabel(selection: DesignMdSelection): string {
	return selection.typography?.name ?? (selection.skipTypography ? 'Use existing typography' : '');
}

function getStyleSummaryLabel(selection: DesignMdSelection): string {
	return selection.style?.name ?? (selection.skipStyle ? 'Use existing style' : '');
}

function createSkippedVisual(label: string): HTMLElement {
	const skipped = document.createElement('span');
	skipped.className = 'design-md-collage-skipped';
	skipped.textContent = label;

	return skipped;
}

function renderColorOptions(root: HTMLElement, selection: DesignMdSelection) {
	root.replaceChildren(...designColorOptions.map((option, index) => {
		const button = createOptionButton(option, 0, index, selection.color?.id === option.id);
		button.classList.add('design-md-option--color');

		const card = document.createElement('span');
		card.className = 'design-md-color-card';

		const head = document.createElement('span');
		head.className = 'design-md-color-card-head';
		head.style.background = option.primary;

		const name = document.createElement('span');
		name.textContent = option.name;

		const hex = document.createElement('span');
		hex.textContent = option.primary;

		const palette = document.createElement('span');
		palette.className = 'design-md-color-card-palette';

		option.palette.forEach(color => {
			const swatch = document.createElement('span');
			swatch.style.background = color;
			palette.appendChild(swatch);
		});

		const copy = document.createElement('span');
		copy.className = 'design-md-option-copy';
		copy.append(createTextSpan(option.description));

		head.append(name, hex);
		card.append(head, palette);
		button.append(card, copy);

		return button;
	}));
}

function renderTypographyOptions(root: HTMLElement, selection: DesignMdSelection) {
	root.replaceChildren(...designTypographyOptions.map((option, index) => {
		const button = createOptionButton(option, 1, index, selection.typography?.id === option.id);
		button.classList.add('design-md-option--typography');

		const content = document.createElement('span');
		content.className = 'design-md-type-card';

		const details = document.createElement('span');
		details.className = 'design-md-type-details';

		const title = document.createElement('span');
		title.className = 'design-md-type-title';
		title.textContent = option.name;

		const weights = document.createElement('span');
		weights.className = 'design-md-type-weights';

		getVisibleTypographyWeights(option.weights, option.defaultWeight).forEach(weight => {
			const weightLabel = document.createElement('span');
			weightLabel.className = 'design-md-type-weight';
			weightLabel.classList.toggle('is-previewed', weight === option.defaultWeight);
			weightLabel.dataset.typographyWeight = String(weight);
			weightLabel.style.fontWeight = String(weight);
			weightLabel.textContent = `${getWeightLabel(weight)} - ${weight}`;
			weights.appendChild(weightLabel);
		});

		const divider = document.createElement('span');
		divider.className = 'design-md-type-divider';

		const preview = document.createElement('span');
		preview.className = 'design-md-type-preview';
		preview.style.fontFamily = option.families.join(', ');
		preview.style.fontWeight = String(option.defaultWeight);

		const previewLarge = document.createElement('span');
		previewLarge.className = 'design-md-type-preview-lg';
		previewLarge.textContent = option.sample ?? 'Aa';
		let animationFrame = 0;

		const setPreviewWeight = (weight: number) => {
			preview.style.fontWeight = String(weight);
			preview.classList.remove('is-weight-changing');

			if (animationFrame) {
				window.cancelAnimationFrame(animationFrame);
			}

			animationFrame = window.requestAnimationFrame(() => {
				preview.classList.add('is-weight-changing');
				animationFrame = 0;
			});

			weights.querySelectorAll<HTMLElement>('.design-md-type-weight').forEach(item => {
				item.classList.toggle('is-previewed', item.dataset.typographyWeight === String(weight));
			});
		};

		weights.querySelectorAll<HTMLElement>('.design-md-type-weight').forEach(weightLabel => {
			weightLabel.addEventListener('click', event => {
				event.stopPropagation();
				const weight = Number(weightLabel.dataset.typographyWeight);
				if (Number.isFinite(weight)) {
					setPreviewWeight(weight);
				}
			});
		});

		details.append(title, weights);
		preview.appendChild(previewLarge);
		content.append(details, divider, preview);
		button.appendChild(content);

		return button;
	}));
}

function getVisibleTypographyWeights(weights: number[], defaultWeight: number): number[] {
	const normalizedWeights = Array.from(new Set(weights))
		.filter(Number.isFinite)
		.sort((a, b) => a - b);

	if (normalizedWeights.length <= maxVisibleTypographyWeights) {
		return normalizedWeights;
	}

	const defaultIndex = normalizedWeights.indexOf(defaultWeight);
	const targetIndex = defaultIndex >= 0
		? defaultIndex
		: getClosestWeightIndex(normalizedWeights, defaultWeight);
	const startIndex = Math.min(
		Math.max(targetIndex - 1, 0),
		normalizedWeights.length - maxVisibleTypographyWeights,
	);

	return normalizedWeights.slice(startIndex, startIndex + maxVisibleTypographyWeights);
}

function getClosestWeightIndex(weights: number[], targetWeight: number): number {
	return weights.reduce((closestIndex, weight, index) => {
		const currentDistance = Math.abs(weight - targetWeight);
		const closestDistance = Math.abs(weights[closestIndex] - targetWeight);

		return currentDistance < closestDistance ? index : closestIndex;
	}, 0);
}

function getWeightLabel(weight: number): string {
	if (weight <= 300) {
		return 'Light';
	}

	if (weight === 400) {
		return 'Regular';
	}

	if (weight === 500) {
		return 'Medium';
	}

	if (weight === 600) {
		return 'Semibold';
	}

	return 'Bold';
}

function renderStyleOptions(root: HTMLElement, selection: DesignMdSelection) {
	root.replaceChildren(...designStyleOptions.map((option, index) => {
		const button = createOptionButton(option, 2, index, selection.style?.id === option.id);
		button.classList.add('design-md-option--style');

		const card = document.createElement('span');
		card.className = 'design-md-style-card';

		const mark = document.createElement('span');
		mark.className = `design-md-style-mark design-md-style-mark--${option.tone ?? option.id}`;

		const copy = document.createElement('span');
		copy.className = 'design-md-style-copy';

		const title = document.createElement('span');
		title.className = 'design-md-style-title';
		title.textContent = option.name;

		const description = document.createElement('span');
		description.className = 'design-md-style-description';
		description.textContent = option.description;

		const reference = document.createElement('span');
		reference.className = 'design-md-style-reference';
		reference.textContent = option.references[0] ?? 'Design system';

		copy.append(title, description, reference);
		card.append(copy, mark);
		button.appendChild(card);

		return button;
	}));
}

function createOptionButton(
	option: DesignColorOption | DesignTypographyOption | DesignStyleOption,
	step: number,
	index: number,
	isSelected: boolean,
): HTMLButtonElement {
	const button = document.createElement('button');
	button.className = 'design-md-option';
	button.type = 'button';
	button.dataset.designOption = '';
	button.dataset.designStep = String(step);
	button.dataset.designValue = option.id;
	button.style.setProperty('--design-option-delay', `${index * 38}ms`);
	button.setAttribute('aria-label', option.name);
	button.classList.toggle('is-selected', isSelected);

	const id = document.createElement('span');
	id.className = 'design-md-option-id';
	id.textContent = String(index + 1).padStart(2, '0');
	button.appendChild(id);

	return button;
}

function createTextSpan(text: string): HTMLElement {
	const span = document.createElement('span');
	span.textContent = text;

	return span;
}

function isDesignCreateStatusDetail(value: unknown): value is DesignCreateStatusDetail {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const detail = value as { status?: unknown; message?: unknown };
	return (detail.status === 'writing' || detail.status === 'created' || detail.status === 'error')
		&& (detail.message === undefined || typeof detail.message === 'string');
}

function isDesignOpenDetail(value: unknown): value is DesignOpenDetail {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const detail = value as { overwrite?: unknown };
	return detail.overwrite === undefined || typeof detail.overwrite === 'boolean';
}

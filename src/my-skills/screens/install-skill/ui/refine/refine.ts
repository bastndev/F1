import { REFINE_TAXONOMY, type RefineNode } from './refine-taxonomy';

export type RefineSelectionCallback = (keywords: string[], labels: string[]) => void;

interface RefineOptions {
	onSelectionChange: RefineSelectionCallback;
}

const REFINE_CHANGE_EVENT = 'install-refine:change';
const ROOT_BREADCRUMB_LABEL = 'Refine';

export function initRefine(options: RefineOptions): () => void {
	const toggleButton = document.getElementById('install-refine-btn') as HTMLButtonElement | null;
	const panel = document.getElementById('install-refine-panel');
	const bar = document.getElementById('install-refine-bar');

	if (!toggleButton || !panel || !bar) {
		return () => {};
	}

	const stopPanelClick = (event: MouseEvent) => {
		event.stopPropagation();
	};

	panel.addEventListener('click', stopPanelClick);

	let isOpen = false;
	let selectedNodes: RefineNode[] = [];
	let navigationPath: RefineNode[] = [];
	let activeNodes: RefineNode[] = REFINE_TAXONOMY;

	const closePanel = () => {
		isOpen = false;
		panel.hidden = true;
		toggleButton.classList.remove('install-refine-btn--active');
		toggleButton.setAttribute('aria-expanded', 'false');
		renderBar();
	};

	const openPanel = () => {
		isOpen = true;
		panel.hidden = false;
		toggleButton.classList.add('install-refine-btn--active');
		toggleButton.setAttribute('aria-expanded', 'true');
		renderPanel();
	};

	const togglePanel = () => {
		if (isOpen) {
			closePanel();
		} else {
			openPanel();
		}
	};

	const getCurrentKeywords = (): string[] => {
		return selectedNodes.flatMap(node => node.keywords);
	};

	const getCurrentLabels = (): string[] => {
		return selectedNodes.map(node => node.label);
	};

	const emitSelectionChange = () => {
		options.onSelectionChange(getCurrentKeywords(), getCurrentLabels());
		window.dispatchEvent(new CustomEvent(REFINE_CHANGE_EVENT, {
			detail: { keywords: getCurrentKeywords(), labels: getCurrentLabels() },
		}));
	};

	const isSelected = (node: RefineNode): boolean => {
		return selectedNodes.some(selected => selected.id === node.id);
	};

	const toggleNode = (node: RefineNode, selectOnly = false) => {
		if (isSelected(node)) {
			selectedNodes = selectedNodes.filter(selected => selected.id !== node.id);
			emitSelectionChange();
			renderPanel();
			renderBar();
			return;
		}

		if (!selectOnly && node.children && node.children.length > 0) {
			navigationPath = [...navigationPath, node];
			activeNodes = node.children;
			renderPanel();
			return;
		}

		selectedNodes = [...selectedNodes, node];
		emitSelectionChange();
		renderPanel();
		renderBar();
	};

	const navigateToBreadcrumb = (index: number) => {
		if (index < 0) {
			navigationPath = [];
			activeNodes = REFINE_TAXONOMY;
		} else {
			const target = navigationPath[index];
			navigationPath = navigationPath.slice(0, index + 1);
			activeNodes = target.children ?? REFINE_TAXONOMY;
		}

		renderPanel();
	};

	const clearAll = () => {
		selectedNodes = [];
		navigationPath = [];
		activeNodes = REFINE_TAXONOMY;
		emitSelectionChange();
		closePanel();
	};

	const renderBar = () => {
		bar.replaceChildren();

		if (selectedNodes.length === 0) {
			bar.hidden = true;
			return;
		}

		bar.hidden = false;

		selectedNodes.forEach(node => {
			bar.append(createActiveChip(node, () => {
				selectedNodes = selectedNodes.filter(selected => selected.id !== node.id);
				emitSelectionChange();
				renderBar();
				renderPanel();
			}));
		});

		const clearButton = document.createElement('button');
		clearButton.className = 'install-refine-clear-all';
		clearButton.type = 'button';
		clearButton.textContent = 'Clear';
		clearButton.setAttribute('aria-label', 'Clear all refinements');
		clearButton.addEventListener('click', clearAll);
		bar.append(clearButton);
	};

	const renderPanel = () => {
		panel.replaceChildren();

		const inner = document.createElement('div');
		inner.className = 'install-refine-panel-inner';

		const header = document.createElement('div');
		header.className = 'install-refine-breadcrumb';

		const rootCrumb = createBreadcrumbCrumb(ROOT_BREADCRUMB_LABEL, () => {
			navigateToBreadcrumb(-1);
		});
		rootCrumb.classList.toggle('install-refine-breadcrumb--active', navigationPath.length === 0);
		header.append(rootCrumb);

		navigationPath.forEach((node, index) => {
			const separator = document.createElement('span');
			separator.className = 'install-refine-breadcrumb-sep';
			separator.textContent = '\u203A';
			separator.setAttribute('aria-hidden', 'true');
			header.append(separator);

			const crumb = createBreadcrumbCrumb(node.label, () => {
				navigateToBreadcrumb(index);
			});
			const isLastCrumb = index === navigationPath.length - 1;
			crumb.classList.toggle('install-refine-breadcrumb--active', isLastCrumb);
			header.append(crumb);
		});

		const chips = document.createElement('div');
		chips.className = 'install-refine-chips';
		chips.setAttribute('role', 'listbox');
		chips.setAttribute('aria-label', `Refinement options${navigationPath.length > 0 ? ' for ' + navigationPath[navigationPath.length - 1].label : ''}`);

		const currentParent = navigationPath[navigationPath.length - 1];
		const visibleNodes: Array<{ node: RefineNode; label: string; selectOnly: boolean }> = [
			...(currentParent ? [{ node: currentParent, label: `All ${currentParent.label}`, selectOnly: true }] : []),
			...activeNodes.map(node => ({ node, label: node.label, selectOnly: false })),
		];

		visibleNodes.forEach(({ node, label, selectOnly }, index) => {
			const chip = document.createElement('button');
			chip.className = 'install-refine-chip';
			chip.type = 'button';
			chip.textContent = label;
			chip.dataset.refineId = node.id;
			chip.setAttribute('role', 'option');
			chip.setAttribute('aria-label', label);
			chip.setAttribute('aria-selected', String(isSelected(node)));

			if (!selectOnly && node.children && node.children.length > 0) {
				chip.classList.add('install-refine-chip--has-children');
				chip.setAttribute('aria-label', `${node.label}, has sub-categories`);
			}

			if (isSelected(node)) {
				chip.classList.add('install-refine-chip--selected');
			}

			chip.addEventListener('click', () => toggleNode(node, selectOnly));
			chip.addEventListener('keydown', event => {
				if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
					event.preventDefault();
					focusChipRelative(chips, index, 1);
				} else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
					event.preventDefault();
					focusChipRelative(chips, index, -1);
				} else if (event.key === 'Home') {
					event.preventDefault();
					focusChipRelative(chips, 0, 0);
				} else if (event.key === 'End') {
					event.preventDefault();
					focusChipRelative(chips, visibleNodes.length - 1, 0);
				} else if (event.key === 'Escape') {
					event.preventDefault();
					if (navigationPath.length > 0) {
						navigateToBreadcrumb(navigationPath.length - 2);
					} else {
						closePanel();
					}
				}
			});

			chips.append(chip);
		});

		if (visibleNodes.length === 0) {
			const emptyMessage = document.createElement('span');
			emptyMessage.className = 'install-refine-empty';
			emptyMessage.textContent = 'Select a category to refine.';
			chips.append(emptyMessage);
		}

		inner.append(header, chips);
		panel.append(inner);
	};

	const handleToggleButtonClick = (event: MouseEvent) => {
		event.preventDefault();
		togglePanel();
	};

	const handleDocumentClick = (event: MouseEvent) => {
		if (!isOpen || !panel) {
			return;
		}

		const target = event.target as HTMLElement | null;
		if (!target) {
			return;
		}

		if (panel.contains(target) || toggleButton.contains(target)) {
			return;
		}

		closePanel();
	};

	const handleDocumentKeydown = (event: KeyboardEvent) => {
		if (!isOpen) {
			return;
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			if (navigationPath.length > 0) {
				navigateToBreadcrumb(navigationPath.length - 2);
			} else {
				closePanel();
			}
		}
	};

	toggleButton.addEventListener('click', handleToggleButtonClick);
	document.addEventListener('click', handleDocumentClick);
	document.addEventListener('keydown', handleDocumentKeydown);

	return () => {
		panel.removeEventListener('click', stopPanelClick);
		toggleButton.removeEventListener('click', handleToggleButtonClick);
		document.removeEventListener('click', handleDocumentClick);
		document.removeEventListener('keydown', handleDocumentKeydown);
	};
}

function createBreadcrumbCrumb(label: string, onClick: () => void): HTMLButtonElement {
	const crumb = document.createElement('button');
	crumb.className = 'install-refine-breadcrumb-crumb';
	crumb.type = 'button';
	crumb.textContent = label;
	crumb.addEventListener('click', event => {
		event.preventDefault();
		event.stopPropagation();
		onClick();
	});
	return crumb;
}

function createActiveChip(node: RefineNode, onRemove: () => void): HTMLSpanElement {
	const chip = document.createElement('span');
	chip.className = 'install-refine-active-chip';

	const label = document.createElement('span');
	label.className = 'install-refine-active-chip-label';
	label.textContent = node.label;

	const removeBtn = document.createElement('button');
	removeBtn.className = 'install-refine-active-chip-remove';
	removeBtn.type = 'button';
	removeBtn.setAttribute('aria-label', `Remove ${node.label}`);
	removeBtn.addEventListener('click', event => {
		event.preventDefault();
		event.stopPropagation();
		onRemove();
	});

	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 16 16');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('focusable', 'false');
	svg.setAttribute('width', '10');
	svg.setAttribute('height', '10');

	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('d', 'M4.5 4.5l7 7M11.5 4.5l-7 7');
	path.setAttribute('fill', 'none');
	path.setAttribute('stroke', 'currentColor');
	path.setAttribute('stroke-width', '1.5');
	path.setAttribute('stroke-linecap', 'round');
	svg.append(path);
	removeBtn.append(svg);

	chip.append(label, removeBtn);
	return chip;
}

function focusChipRelative(container: HTMLElement, currentIndex: number, offset: number): void {
	const chips = Array.from(container.querySelectorAll<HTMLButtonElement>('.install-refine-chip'));
	const targetIndex = Math.min(Math.max(0, offset === 0 ? offset : currentIndex + offset), chips.length - 1);

	if (chips[targetIndex]) {
		chips[targetIndex].focus();
	}
}

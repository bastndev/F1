import { getAgentSlug as resolveAgentSlug } from '../../shared/agents';
import { matchAgentShortcut } from '../../../shared/keymaps/cli';

type VsCodeApi = {
	getState: () => unknown;
	setState: (state: LauncherState) => void;
	postMessage: (message: { type: 'openAgent'; agent: string; smart?: boolean; rules?: boolean } | { type: 'customCli.open'; source: 'launcher' } | { type: 'cli.openTutorial' }) => void;
};

type LauncherModel = {
	label: string;
	aliases: string[];
	icon: string;
	darkIcon: boolean;
	lightIcon: boolean;
	installed: boolean;
};

type LauncherMatch = {
	model: LauncherModel;
	score: number;
};

type LauncherState = {
	launcherSessionId: string;
	currentIndex: number;
	inputValue: string;
	selectedAgent?: string;
};

declare const acquireVsCodeApi: () => VsCodeApi;

const vscode = acquireVsCodeApi();
const customCliLabel = 'Custom CLI';

const isLauncherModel = (value: unknown): value is LauncherModel => {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const model = value as Record<string, unknown>;

	return typeof model.label === 'string'
		&& Array.isArray(model.aliases)
		&& model.aliases.every((alias) => typeof alias === 'string')
		&& typeof model.icon === 'string'
		&& typeof model.darkIcon === 'boolean'
		&& typeof model.lightIcon === 'boolean'
		&& typeof model.installed === 'boolean';
};

const isLauncherState = (value: unknown): value is LauncherState => {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const state = value as Record<string, unknown>;

	return typeof state.launcherSessionId === 'string'
		&& typeof state.currentIndex === 'number'
		&& Number.isInteger(state.currentIndex)
		&& typeof state.inputValue === 'string'
		&& (state.selectedAgent === undefined || typeof state.selectedAgent === 'string');
};

const getRequiredElement = <T extends HTMLElement>(id: string) => {
	const element = document.getElementById(id);

	if (!element) {
		throw new Error(`Missing element: ${id}`);
	}

	return element as T;
};

const parseJsonScript = (id: string) => {
	const script = getRequiredElement<HTMLScriptElement>(id);

	try {
		return JSON.parse(script.textContent || 'null') as unknown;
	} catch {
		return null;
	}
};

const modelsValue = parseJsonScript('cli-models');
const models = Array.isArray(modelsValue) ? modelsValue.filter(isLauncherModel) : [];
const launcherStateSessionIdValue = parseJsonScript('launcher-state-session');
const launcherStateSessionId = typeof launcherStateSessionIdValue === 'string' ? launcherStateSessionIdValue : '';
const previousState = vscode.getState();
const persistedState = isLauncherState(previousState) && previousState.launcherSessionId === launcherStateSessionId
	? previousState
	: undefined;

let currentIndex = typeof persistedState?.currentIndex === 'number'
	&& persistedState.currentIndex >= 0
	&& persistedState.currentIndex < models.length
	? persistedState.currentIndex
	: 0;
let selectedModel: LauncherModel | undefined = models.find((model) => model.label === persistedState?.selectedAgent) || models[currentIndex] || models[0];
let selectedCustomCli = false;
let savedInputValue = '';
let invalidInputTimer: ReturnType<typeof setTimeout> | undefined;

const textElement = getRequiredElement<HTMLSpanElement>('ai-model-name');
const secondarySuggestions = getRequiredElement<HTMLSpanElement>('secondary-suggestions');
const cliInput = getRequiredElement<HTMLInputElement>('cli-input');
const inputContainer = document.querySelector<HTMLElement>('.input-container');
const selectedOption = getRequiredElement<HTMLDivElement>('selected-option');
const agentIconPalette = getRequiredElement<HTMLDivElement>('agent-icon-palette');

if (!inputContainer) {
	throw new Error('Missing element: .input-container');
}

const getMatchScore = (model: LauncherModel, query: string) => {
	const values = [model.label.toLowerCase(), ...model.aliases];
	let bestScore = 0;

	for (const value of values) {
		if (value === query) {
			bestScore = Math.max(bestScore, 100);
		} else if (value.startsWith(query)) {
			bestScore = Math.max(bestScore, 80);
		} else if (value.includes(query)) {
			bestScore = Math.max(bestScore, 50);
		}
	}

	return bestScore;
};

const getAgentSlug = (label: string): string => {
	return resolveAgentSlug(label) ?? '';
};

const findModelMatches = (query: string) => {
	return models
		.map((model) => ({ model, score: getMatchScore(model, query) }))
		.filter((entry) => entry.score > 0)
		.sort((first, second) => second.score - first.score);
};

const renderSecondarySuggestions = (matches: LauncherMatch[]) => {
	secondarySuggestions.replaceChildren();

	// Limit to 2 secondary suggestions max to avoid layout jumps when agent names are long.
	// Showing fewer items prevents the input area from expanding horizontally.
	const secondaryToShow = matches.slice(1, 3);

	for (const entry of secondaryToShow) {
		const separator = document.createElement('span');
		separator.className = 'secondary-separator';
		separator.textContent = ' · ';

		const option = document.createElement('span');
		option.className = 'secondary-model';
		option.textContent = entry.model.label;

		secondarySuggestions.append(separator, option);
	}
};

const syncPreviewIndicator = () => {
	for (const option of Array.from(agentIconPalette.querySelectorAll<HTMLElement>('.agent-icon-option'))) {
		const isCustomOption = option.dataset.customCli === 'true';
		option.classList.toggle('is-preview', isCustomOption ? selectedCustomCli : option.dataset.agent === selectedModel?.label);
	}
};

const saveLauncherState = () => {
	vscode.setState({
		launcherSessionId: launcherStateSessionId,
		currentIndex,
		inputValue: cliInput.value,
		selectedAgent: selectedModel?.label
	});
};

const showInvalidInput = () => {
	clearTimeout(invalidInputTimer);
	inputContainer.classList.add('has-input-error');
	invalidInputTimer = setTimeout(() => {
		inputContainer.classList.remove('has-input-error');
	}, 1000);
};

const setSelectedModel = (model: LauncherModel | undefined, isSearchResult: boolean, matches: LauncherMatch[] = []) => {
	if (!model) {
		selectedCustomCli = false;
		document.body.removeAttribute('data-agent');
		return;
	}

	selectedCustomCli = false;
	selectedModel = model;
	textElement.textContent = model.label;
	inputContainer.classList.toggle('has-selection', isSearchResult);
	textElement.classList.toggle('selected-model', isSearchResult);
	textElement.classList.remove('custom-cli-preview');
	renderSecondarySuggestions(isSearchResult ? matches : []);
	syncPreviewIndicator();
	saveLauncherState();

	// Only apply the specific agent color when the user has actively found a match by typing/search.
	// While browsing (palette open, default cycling, icon hover) we keep the original theme + yellow behavior.
	if (isSearchResult) {
		const slug = getAgentSlug(model.label);
		if (slug) {
			document.body.dataset.agent = slug;
		} else {
			document.body.removeAttribute('data-agent');
		}
	} else {
		document.body.removeAttribute('data-agent');
	}
};

const setNoMatch = () => {
	selectedCustomCli = false;
	selectedModel = undefined;
	document.body.removeAttribute('data-agent');
	textElement.textContent = 'No matching CLI';
	inputContainer.classList.remove('has-selection');
	textElement.classList.remove('selected-model');
	textElement.classList.remove('custom-cli-preview');
	renderSecondarySuggestions([]);
	syncPreviewIndicator();
	showInvalidInput();
	saveLauncherState();
};

const setCustomCliPreview = () => {
	selectedCustomCli = true;
	selectedModel = undefined;
	document.body.removeAttribute('data-agent');
	textElement.textContent = customCliLabel;
	inputContainer.classList.add('has-selection');
	textElement.classList.remove('selected-model');
	textElement.classList.add('custom-cli-preview');
	renderSecondarySuggestions([]);
	syncPreviewIndicator();
	saveLauncherState();
};

const openModel = (model: LauncherModel | undefined, forceRules = false, forceSmart = false) => {
	if (!model) {
		showInvalidInput();
		return;
	}

	// Alt+Left click on a CLI option opens the new "rules mode": normal skeleton,
	// then the host auto-injects the working rules once the CLI is idle.
	// The footer toggle still controls smart mode. Rules takes precedence if both
	// are somehow requested.
	const rules = forceRules;
	const smart = !rules && (forceSmart || document.body.classList.contains('is-smart-mode'));

	vscode.postMessage({
		type: 'openAgent',
		agent: model.label,
		smart,
		rules
	});
};

const openCustomCli = () => {
	vscode.postMessage({ type: 'customCli.open', source: 'launcher' });
};

const openSelectedModel = () => {
	if (selectedCustomCli) {
		openCustomCli();
		return;
	}

	if (!selectedModel) {
		showInvalidInput();
		return;
	}

	openModel(selectedModel);
};

const getPaletteOptions = () => {
	return Array.from(agentIconPalette.querySelectorAll<HTMLButtonElement>('.agent-icon-option'));
};



const handlePaletteOptionKeydown = (
	event: KeyboardEvent,
	option: HTMLButtonElement,
	activate: () => void
) => {
	const options = getPaletteOptions();
	const index = options.indexOf(option);

	if (event.key === 'Enter' || event.key === ' ') {
		event.preventDefault();
		activate();
		return;
	}

	if (event.key === 'Escape') {
		event.preventDefault();
		cliInput.focus();
		return;
	}

	if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
		event.preventDefault();
		options[(index + 1) % options.length]?.focus();
		return;
	}

	if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
		event.preventDefault();
		options[(index - 1 + options.length) % options.length]?.focus();
	}
};

const renderIconPalette = () => {
	agentIconPalette.replaceChildren();

	for (const [index, model] of models.entries()) {
		const option = document.createElement('button');
		option.className = 'agent-icon-option';
		option.classList.toggle('is-installed', model.installed);
		option.classList.toggle('is-missing', !model.installed);
		option.classList.toggle('has-dark-icon', model.darkIcon === true);
		option.classList.toggle('has-light-icon', model.lightIcon === true);
		option.type = 'button';
		option.tabIndex = 0;
		option.dataset.agent = model.label;
		option.title = model.installed ? model.label : `${model.label} is not installed`;
		option.setAttribute('aria-label', option.title);

		const image = document.createElement('img');
		image.className = 'agent-icon-image';
		image.src = model.icon;
		image.alt = '';
		image.width = 24;
		image.height = 24;
		image.draggable = false;

		const status = document.createElement('span');
		status.className = 'agent-icon-status';
		status.textContent = model.installed ? 'Ready' : 'Missing';

		const badge = document.createElement('span');
		badge.className = 'agent-icon-number';
		badge.textContent = String(index + 1);

		option.append(image, status, badge);
		option.addEventListener('click', (event) => openModel(model, event.altKey));
		option.addEventListener('focus', () => {
			const matches = [{ model, score: 100 }];
			setSelectedModel(model, true, matches);
		});
		option.addEventListener('keydown', (event) => handlePaletteOptionKeydown(event, option, () => openModel(model)));

		agentIconPalette.append(option);
	}

	const customOption = document.createElement('button');
	customOption.className = 'agent-icon-option agent-icon-option--custom is-installed';
	customOption.type = 'button';
	customOption.tabIndex = 0;
	customOption.dataset.customCli = 'true';
	customOption.title = `Open ${customCliLabel}`;
	customOption.setAttribute('aria-label', customOption.title);

	const plus = document.createElement('span');
	plus.className = 'agent-icon-plus';
	plus.textContent = '+';

	customOption.append(plus);
	customOption.addEventListener('click', openCustomCli);
	customOption.addEventListener('focus', setCustomCliPreview);
	customOption.addEventListener('keydown', (event) => handlePaletteOptionKeydown(event, customOption, openCustomCli));
	agentIconPalette.append(customOption);
};

cliInput.focus();
renderIconPalette();
if (typeof persistedState?.inputValue === 'string') {
	cliInput.value = persistedState.inputValue;
}

const restoreQuery = cliInput.value.trim();
if (restoreQuery) {
	const matches = findModelMatches(restoreQuery);
	const match = matches[0]?.model;
	if (match) {
		setSelectedModel(match, true, matches);
	} else {
		setNoMatch();
	}
} else {
	setSelectedModel(selectedModel, false);
}
document.body.classList.add('has-agent-palette');
agentIconPalette.classList.add('is-open');
agentIconPalette.setAttribute('aria-hidden', 'false');
syncPreviewIndicator();

cliInput.addEventListener('input', () => {
	const lowerValue = cliInput.value.toLowerCase();
	if (cliInput.value !== lowerValue) {
		const cursorPosition = cliInput.selectionStart;
		cliInput.value = lowerValue;
		cliInput.setSelectionRange(cursorPosition, cursorPosition);
	}

	const query = cliInput.value.trim();
	if (!query) {
		setSelectedModel(models[currentIndex], false);
		return;
	}

	const matches = findModelMatches(query);
	const match = matches[0]?.model;
	if (match) {
		setSelectedModel(match, true, matches);
	} else {
		setNoMatch();
	}
});

window.addEventListener('keydown', (event) => {
	if (event.key === 'Alt' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
		document.body.classList.add('is-alt-peek');
	}

	if (event.key === 'Tab') {
		event.preventDefault();
		footerToggle?.click();
		return;
	}

	if (document.body.classList.contains('is-alt-peek') && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
		const num = Number.parseInt(event.key, 10);
		if (Number.isInteger(num) && num >= 1 && num <= models.length) {
			event.preventDefault();
			// Alt+number keeps the existing smart-mode behavior (not the new
			// Alt+Left click rules mode).
			openModel(models[num - 1], false, true);
			return;
		}
	}

	if (document.body.classList.contains('is-smart-mode')) {
		const shortcutMatch = matchAgentShortcut(event);
		if (shortcutMatch) {
			event.preventDefault();
			const matchedModel = models.find((m) => m.label === shortcutMatch.agentLabel);
			if (matchedModel) {
				openModel(matchedModel);
			}
		}
	}
});

window.addEventListener('keyup', (event) => {
	if (event.key === 'Alt') {
		document.body.classList.remove('is-alt-peek');
	}
});

window.addEventListener('blur', () => {
	document.body.classList.remove('is-alt-peek');
});

cliInput.addEventListener('keydown', (event) => {
	if (event.key === 'Enter') {
		openSelectedModel();
		return;
	}

	if (event.key === 'Escape') {
		event.preventDefault();
	}
});

const tutorialButton = document.getElementById('cli-tutorial-button');
tutorialButton?.addEventListener('click', () => {
	vscode.postMessage({ type: 'cli.openTutorial' });
});

// Footer pill toggle (visual only — functionality to be wired later)
const footerToggle = document.getElementById('footer-mode-toggle') as HTMLButtonElement | null;
const footerToggleLabel = footerToggle?.querySelector<HTMLSpanElement>('.footer-toggle-label');
if (footerToggle && footerToggleLabel) {
	footerToggle.addEventListener('click', () => {
		const isOn = footerToggle.classList.toggle('is-on');
		footerToggle.setAttribute('aria-pressed', String(isOn));
		document.body.classList.toggle('is-smart-mode', isOn);
		footerToggleLabel.textContent = isOn
			? (footerToggleLabel.dataset.on ?? 'Smart + Skills')
			: (footerToggleLabel.dataset.off ?? '');

		if (isOn) {
			savedInputValue = cliInput.value;
			cliInput.value = '';
			cliInput.disabled = true;
			cliInput.dispatchEvent(new Event('input'));
		} else {
			cliInput.disabled = false;
			cliInput.value = savedInputValue;
			cliInput.dispatchEvent(new Event('input'));
			cliInput.focus();
		}
	});
}

const scheduleCycle = () => {
	setTimeout(() => {
		if (document.hidden || cliInput.value.trim() || models.length === 0) {
			scheduleCycle();
			return;
		}

		textElement.style.opacity = '0';

		setTimeout(() => {
			currentIndex = (currentIndex + 1) % models.length;
			setSelectedModel(models[currentIndex], false);
			textElement.style.opacity = '1';
			scheduleCycle();
		}, 400);
	}, 3800);
};
scheduleCycle();

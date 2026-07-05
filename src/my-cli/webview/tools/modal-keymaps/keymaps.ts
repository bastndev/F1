import keysStyles from './components/keys.css';
import keysHtml from './components/keys.html';
import type { ToolContext } from '../tools';
import { getShortcut, type ShortcutId } from '../../../../shared/keymaps/cli';

const stylesId = 'cli-keymaps-panel-styles';

const ensureStyles = () => {
	if (document.getElementById(stylesId)) {
		return;
	}

	const style = document.createElement('style');
	style.id = stylesId;
	style.textContent = keysStyles;
	document.head.append(style);
};

// Sections rendered from shared/keymaps/cli.ts — label and key chord come from
// the live shortcut definitions, so this modal can never show a stale binding.
// Only icons and grouping are curated here.
const keymapSections: { title: string; items: { id: ShortcutId; icon: string }[] }[] = [
	{
		title: 'Session Management',
		items: [
			{ id: 'newSession', icon: '＋' },
			{ id: 'closeSession', icon: '−' },
			{ id: 'toggleAgentPicker', icon: '⇥' },
		],
	},
	{
		title: 'Navigation',
		items: [
			{ id: 'nextSession', icon: '⇥' },
			{ id: 'prevSession', icon: '⇤' },
		],
	},
	{
		title: 'Tools & Modals',
		items: [
			{ id: 'openPrompt', icon: 'P' },
			{ id: 'openTranslate', icon: 'T' },
			{ id: 'openUse', icon: 'U' },
			{ id: 'openKeymaps', icon: 'K' },
			{ id: 'openCommands', icon: 'C' },
			{ id: 'togglePromptFilter', icon: '⚙︎' },
			{ id: 'toggleVoicePlayback', icon: '⏯' },
			{ id: 'approvePlan', icon: '▶' },
		],
	},
	{
		title: 'CLI Actions',
		items: [
			{ id: 'promptFooterModel', icon: '✦' },
			{ id: 'promptFooterResume', icon: '↻' },
			{ id: 'promptFooterUsage', icon: '▦' },
			{ id: 'promptModePro', icon: '◈' },
			{ id: 'promptModePlan', icon: '☰' },
			{ id: 'sendPrompt', icon: '⏎' },
		],
	},
];

// 'Alt + 1' → [Alt][1]; 'Capslock' → [Capslock]. Split on ' + ' (with spaces)
// so chords whose key IS '+' or '-' ('Alt + +') keep their last key.
const buildKeys = (description: string): HTMLElement => {
	const keys = document.createElement('div');
	keys.className = 'keymap-keys';
	for (const part of description.split(' + ')) {
		const kbd = document.createElement('kbd');
		kbd.className = 'key';
		kbd.textContent = part;
		keys.append(kbd);
	}
	return keys;
};

const buildItem = (id: ShortcutId, icon: string): HTMLElement | undefined => {
	const shortcut = getShortcut(id);
	if (!shortcut) {
		return undefined;
	}

	const item = document.createElement('div');
	item.className = 'keymap-item';

	const left = document.createElement('div');
	left.className = 'keymap-left';
	const iconEl = document.createElement('span');
	iconEl.className = 'keymap-icon';
	iconEl.textContent = icon;
	const label = document.createElement('span');
	label.className = 'keymap-label';
	label.textContent = shortcut.label;
	left.append(iconEl, label);

	item.append(left, buildKeys(shortcut.description));
	return item;
};

const renderShortcutSections = (host: HTMLElement) => {
	const content = host.querySelector<HTMLElement>('.keymaps-content');
	if (!content) {
		return;
	}

	// Generated sections go above the hand-written "General" one.
	const staticSection = content.querySelector('[data-static-section]');
	for (const section of keymapSections) {
		const sectionEl = document.createElement('div');
		sectionEl.className = 'keymaps-section';

		const title = document.createElement('div');
		title.className = 'keymaps-section-title';
		title.textContent = section.title;
		sectionEl.append(title);

		for (const { id, icon } of section.items) {
			const item = buildItem(id, icon);
			if (item) {
				sectionEl.append(item);
			}
		}

		content.insertBefore(sectionEl, staticSection);
	}
};

export const mountKeymapsPanel = (host: HTMLElement, context: ToolContext) => {
	ensureStyles();

	const template = document.createElement('template');
	template.innerHTML = (keysHtml as unknown as string).trim();
	host.replaceChildren(template.content.cloneNode(true));

	renderShortcutSections(host);

	const closeBtn = host.querySelector<HTMLButtonElement>('#closeKeymapsBtn');
	closeBtn?.addEventListener('click', () => context.close());
};

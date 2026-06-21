import commandsStyles from './components/commands.css';
import commandsHtml from './components/commands.html';
import claudeHtml from './components/claude/claude.html';
import codexHtml from './components/codex/codex.html';
import opencodeHtml from './components/opencode/opencode.html';
import kiroHtml from './components/kiro/kiro.html';
import copilotHtml from './components/copilot/copilot.html';
import cursorHtml from './components/cursor/cursor.html';
import kilocodeHtml from './components/kilocode/kilocode.html';
import grokHtml from './components/grok/grok.html';
import antigravityHtml from './components/antigravity/antigravity.html';
import type { ToolContext } from '../tools';

const stylesId = 'cli-commands-panel-styles';

// One authored HTML fragment per CLI, keyed by the registry slug that lands on
// .agent-shell[data-agent]. The same slug also drives --agent-accent, so the
// modal's color and its command list always match the active CLI.
const FRAGMENTS: Record<string, string> = {
	claude: claudeHtml as unknown as string,
	codex: codexHtml as unknown as string,
	opencode: opencodeHtml as unknown as string,
	kiro: kiroHtml as unknown as string,
	copilot: copilotHtml as unknown as string,
	cursor: cursorHtml as unknown as string,
	kilocode: kilocodeHtml as unknown as string,
	grok: grokHtml as unknown as string,
	antigravity: antigravityHtml as unknown as string
};

const ensureStyles = () => {
	if (document.getElementById(stylesId)) {
		return;
	}

	const style = document.createElement('style');
	style.id = stylesId;
	style.textContent = commandsStyles;
	document.head.append(style);
};

const getActiveAgentSlug = (): string =>
	document.querySelector<HTMLElement>('.agent-shell')?.dataset.agent ?? '';

export const mountCommandsPanel = (host: HTMLElement, context: ToolContext) => {
	ensureStyles();

	const template = document.createElement('template');
	template.innerHTML = (commandsHtml as unknown as string).trim();
	host.replaceChildren(template.content.cloneNode(true));

	const slug = getActiveAgentSlug();
	const list = host.querySelector<HTMLElement>('#commandsList');
	const chipsEl = host.querySelector<HTMLElement>('#commandsChips');
	const searchInput = host.querySelector<HTMLInputElement>('#commandsSearchInput');
	const countEl = host.querySelector<HTMLElement>('#commandsCount');
	const emptyEl = host.querySelector<HTMLElement>('#commandsEmpty');

	const agentLabel = host.querySelector<HTMLElement>('#commandsAgentLabel');
	if (agentLabel) {
		agentLabel.textContent = slug || 'cli';
	}

	const closeBtn = host.querySelector<HTMLButtonElement>('#closeCommandsBtn');
	closeBtn?.addEventListener('click', () => context.close());

	if (!list || !chipsEl || !searchInput || !countEl || !emptyEl) {
		return;
	}

	const fragment = FRAGMENTS[slug];
	if (!fragment) {
		emptyEl.hidden = false;
		emptyEl.textContent = 'No commands available for this CLI yet.';
		countEl.textContent = '0 commands';
		return;
	}

	// The fragment is a bundled, authored HTML file (no user input), injected
	// before the persistent empty-state node so that node survives re-filtering.
	emptyEl.insertAdjacentHTML('beforebegin', fragment);

	const groups = Array.from(list.querySelectorAll<HTMLElement>('.commands-group'));
	let activeCategory = 'All';

	const categories = ['All', ...groups.map((group) => group.dataset.category ?? '').filter(Boolean)];

	const renderChips = () => {
		chipsEl.replaceChildren();
		for (const category of categories) {
			const chip = document.createElement('button');
			chip.type = 'button';
			chip.className = 'commands-chip';
			chip.dataset.category = category;
			chip.textContent = category;
			if (category === activeCategory) {
				chip.classList.add('is-active');
			}
			chip.addEventListener('click', () => {
				activeCategory = category;
				renderChips();
				applyFilter();
			});
			chipsEl.append(chip);
		}
	};

	const applyFilter = () => {
		const query = searchInput.value.trim().toLowerCase();
		let total = 0;

		for (const group of groups) {
			const inCategory = activeCategory === 'All' || activeCategory === (group.dataset.category ?? '');
			let visibleInGroup = 0;

			group.querySelectorAll<HTMLElement>('.commands-row').forEach((row) => {
				const matches = inCategory && (query === '' || (row.textContent ?? '').toLowerCase().includes(query));
				row.hidden = !matches;
				if (matches) {
					visibleInGroup += 1;
				}
			});

			group.hidden = visibleInGroup === 0;
			total += visibleInGroup;
		}

		countEl.textContent = `${total} command${total === 1 ? '' : 's'}`;
		emptyEl.hidden = total > 0;
		if (total === 0) {
			emptyEl.textContent = query ? `No commands match "${searchInput.value.trim()}"` : 'No commands found';
		}
	};

	// Click a row → insert the bare command into the terminal WITHOUT submitting,
	// so the user can still append arguments (e.g. "/model " then a name).
	list.addEventListener('click', (event) => {
		const target = event.target instanceof HTMLElement ? event.target : null;
		const command = target?.closest<HTMLElement>('.commands-row')?.dataset.cmd;
		if (!command) {
			return;
		}
		context.sendToActiveSession?.(command, { submit: false });
		context.close();
	});

	searchInput.addEventListener('input', applyFilter);

	renderChips();
	applyFilter();

	// Focus the search after the controller's own focus pass (single rAF) so the
	// caret lands in the search box instead of the dialog container.
	requestAnimationFrame(() => requestAnimationFrame(() => searchInput.focus()));
};

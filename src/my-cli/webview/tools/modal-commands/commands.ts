import commandsStyles from './components/commands.css';
import commandsHtml from './components/commands.html';
import type { ToolContext } from '../tools';

const stylesId = 'cli-commands-panel-styles';

const ensureStyles = () => {
	if (document.getElementById(stylesId)) {
		return;
	}

	const style = document.createElement('style');
	style.id = stylesId;
	style.textContent = commandsStyles;
	document.head.append(style);
};

// The active CLI's slug lives on .agent-shell (set in terminal.ts). It drives
// both the accent color (via cli-themes.css) and — in Phase B — which per-CLI
// command fragment gets injected into the list.
const getActiveAgentSlug = (): string =>
	document.querySelector<HTMLElement>('.agent-shell')?.dataset.agent ?? '';

export const mountCommandsPanel = (host: HTMLElement, context: ToolContext) => {
	ensureStyles();

	const template = document.createElement('template');
	template.innerHTML = (commandsHtml as unknown as string).trim();
	host.replaceChildren(template.content.cloneNode(true));

	const agentLabel = host.querySelector<HTMLElement>('#commandsAgentLabel');
	if (agentLabel) {
		agentLabel.textContent = getActiveAgentSlug() || 'cli';
	}

	const closeBtn = host.querySelector<HTMLButtonElement>('#closeCommandsBtn');
	closeBtn?.addEventListener('click', () => context.close());

	// Phase B: read the active slug, inject the matching components/<slug>/<slug>.html
	// fragment into #commandsList, build the chips from its group labels, wire the
	// search filter, and send a picked command via
	// context.sendToActiveSession(cmd, { submit: false }).
};

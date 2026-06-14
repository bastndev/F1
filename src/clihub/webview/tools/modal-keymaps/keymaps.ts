import keysStyles from './components/keys.css';
import keysHtml from './components/keys.html';
import type { ToolContext } from '../tools';

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

export const mountKeymapsPanel = (host: HTMLElement, context: ToolContext) => {
	ensureStyles();

	const template = document.createElement('template');
	template.innerHTML = (keysHtml as unknown as string).trim();
	host.replaceChildren(template.content.cloneNode(true));

	const closeBtn = host.querySelector<HTMLButtonElement>('#closeKeymapsBtn');
	closeBtn?.addEventListener('click', () => context.close());
};

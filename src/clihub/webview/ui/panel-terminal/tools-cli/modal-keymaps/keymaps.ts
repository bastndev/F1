import keysStyles from './components/keys.css';
import keysHtml from './components/keys.html';

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

export const mountKeymapsPanel = (host: HTMLElement) => {
	ensureStyles();

	const template = document.createElement('template');
	template.innerHTML = keysHtml.trim();
	host.replaceChildren(template.content.cloneNode(true));
};

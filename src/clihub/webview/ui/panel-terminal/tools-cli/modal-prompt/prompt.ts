import promptStyles from './components/prompt.css';
import promptHtml from './components/prompt.html';

const stylesId = 'cli-prompt-panel-styles';

const ensureStyles = () => {
	if (document.getElementById(stylesId)) {
		return;
	}

	const style = document.createElement('style');
	style.id = stylesId;
	style.textContent = promptStyles;
	document.head.append(style);
};

export const mountPromptPanel = (host: HTMLElement) => {
	ensureStyles();

	const template = document.createElement('template');
	template.innerHTML = promptHtml.trim();
	host.replaceChildren(template.content.cloneNode(true));
};

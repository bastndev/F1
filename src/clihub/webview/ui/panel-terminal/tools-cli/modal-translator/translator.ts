import translatorStyles from './components/translator.css';
import translatorHtml from './components/translator.html';

const stylesId = 'cli-translator-panel-styles';

const ensureStyles = () => {
	if (document.getElementById(stylesId)) {
		return;
	}

	const style = document.createElement('style');
	style.id = stylesId;
	style.textContent = translatorStyles;
	document.head.append(style);
};

export const mountTranslatorPanel = (host: HTMLElement) => {
	ensureStyles();

	const template = document.createElement('template');
	template.innerHTML = translatorHtml.trim();
	host.replaceChildren(template.content.cloneNode(true));
};

import translatorStyles from './components/translator.css';
import translatorHtml from './components/translator.html';
import type { ToolContext } from '../tools';
import { initializeTranslator } from './core/translator';

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

export const mountTranslatorPanel = (host: HTMLElement, context: ToolContext) => {
	ensureStyles();

	const template = document.createElement('template');
	template.innerHTML = translatorHtml.trim();
	host.replaceChildren(template.content.cloneNode(true));

	// All behavior logic lives in core/ (per project convention)
	initializeTranslator(host, context);
};

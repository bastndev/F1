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

	// === Tab switching logic + chat area reaction ===
	initPromptTabs(host);
};

function initPromptTabs(host: HTMLElement) {
	const tabs = host.querySelectorAll<HTMLElement>('.prompt-tab');
	const textarea = host.querySelector<HTMLTextAreaElement>('#promptInput');
	const textareaWrap = host.querySelector<HTMLElement>('.prompt-textarea-wrap');

	if (!tabs.length || !textarea) {
		return;
	}

	const updateChatForTab = (tab: string) => {
		if (!textareaWrap) {
			return;
		}

		textareaWrap.classList.toggle('is-pro', tab === 'enhance');

		if (tab === 'enhance') {
			textarea.placeholder = 'describe what you want to improve or generate…';
		} else {
			textarea.placeholder = 'Ask anything…';
		}
	};

	tabs.forEach((tabEl) => {
		tabEl.addEventListener('click', () => {
			// Switch active states
			tabs.forEach((t) => t.classList.remove('active'));
			tabEl.classList.add('active');

			const tab = tabEl.dataset.tab || 'write';
			updateChatForTab(tab);
		});
	});

	// Initialize with current active tab
	const initialActive = host.querySelector<HTMLElement>('.prompt-tab.active');
	const initialTab = initialActive?.dataset.tab || 'write';
	updateChatForTab(initialTab);
}

import useStyles from './components/use.css';
import useHtml from './components/use.html';
import type { ToolContext } from '../tools';

const stylesId = 'cli-use-panel-styles';
const refreshIntervalMs = 1000;

const ensureStyles = () => {
	if (document.getElementById(stylesId)) {
		return;
	}

	const style = document.createElement('style');
	style.id = stylesId;
	style.textContent = useStyles;
	document.head.append(style);
};

const getText = (id: string, fallback: string) => {
	const value = document.getElementById(id)?.textContent?.trim();
	return value || fallback;
};

const setText = (host: HTMLElement, selector: string, value: string) => {
	const element = host.querySelector<HTMLElement>(selector);
	if (!element) {
		return;
	}

	element.textContent = value;
	element.title = value;
};

const getStatusParts = () => {
	const statusLine = getText('cli-terminal-status', 'No active session');
	const separator = ' - ';
	if (!statusLine.includes(separator)) {
		return { status: statusLine, workspace: 'none' };
	}

	const [status, ...workspaceParts] = statusLine.split(separator);
	return {
		status: status || 'unknown',
		workspace: workspaceParts.join(separator) || 'none',
	};
};

const setStatusDot = (host: HTMLElement, status: string) => {
	const dot = host.querySelector<HTMLElement>('#useStatusDot');
	if (!dot) {
		return;
	}

	dot.classList.toggle('is-running', status === 'running');
	dot.classList.toggle('is-exited', status.startsWith('exited'));
	dot.classList.toggle('is-error', status === 'error');
};

const formatOpenDuration = (createdAt: number | undefined) => {
	if (!createdAt) {
		return '--:--:--';
	}

	const totalSeconds = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	return [hours, minutes, seconds]
		.map((part) => String(part).padStart(2, '0'))
		.join(':');
};

const renderUseState = (host: HTMLElement, context: ToolContext) => {
	const agent = getText('cli-terminal-label', 'CLI');
	const { status } = getStatusParts();

	setText(host, '#useAgentName', agent);
	setText(host, '#useStatusValue', status);
	setText(host, '#useOpenFor', formatOpenDuration(context.getActiveSessionCreatedAt?.()));
	setStatusDot(host, status);
};

export const mountUsePanel = (host: HTMLElement, context: ToolContext) => {
	ensureStyles();

	const template = document.createElement('template');
	template.innerHTML = (useHtml as unknown as string).trim();
	host.replaceChildren(template.content.cloneNode(true));

	const closeBtn = host.querySelector<HTMLButtonElement>('#closeUseBtn');
	closeBtn?.addEventListener('click', () => context.close());

	renderUseState(host, context);
	const interval = window.setInterval(() => renderUseState(host, context), refreshIntervalMs);
	return () => window.clearInterval(interval);
};

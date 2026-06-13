import useStyles from './components/use.css';
import useHtml from './components/use.html';
import type { CliUsageSnapshot, ToolContext } from '../tools';

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

const setHidden = (host: HTMLElement, selector: string, hidden: boolean) => {
	const element = host.querySelector<HTMLElement>(selector);
	if (!element) {
		return;
	}

	element.hidden = hidden;
};

const stripAnsi = (value: string) => value.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');

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

const getActiveAgentLabel = () => getText('cli-terminal-label', 'CLI');

const getUsageCommandLabel = (agentLabel: string) => (
	agentLabel.toLowerCase().includes('kiro') ? '/usage' : 'not configured'
);

const parseKiroUsage = (raw: string) => {
	const text = stripAnsi(raw);
	const plan = text.match(/resets on\s+[0-9-]+\s*\|\s*([^\r\n]+)/i)?.[1]?.trim() ?? 'kiro';
	const reset = text.match(/resets on\s+([0-9-]+)/i)?.[1]?.trim() ?? 'unknown';
	const credits = text.match(/credits\s*\(([^)]+)\)/i)?.[1]?.trim() ?? 'unknown';
	const percentValue = Number(text.match(/(\d+(?:\.\d+)?)\s*%/)?.[1] ?? NaN);
	const percent = Number.isFinite(percentValue) ? Math.max(0, Math.min(100, percentValue)) : 0;
	const overages = text.match(/overages:\s*([^\r\n]+)/i)?.[1]?.trim() ?? 'unknown';

	return { plan, reset, credits, percent, overages };
};

const renderUsageMessage = (host: HTMLElement, title: string, detail: string) => {
	setHidden(host, '#useUsageResult', true);
	setHidden(host, '#useUsageMessage', false);
	setText(host, '#useUsageMessageTitle', title);
	setText(host, '#useUsageMessageDetail', detail);
};

const renderUsageSnapshot = (host: HTMLElement, snapshot: CliUsageSnapshot | undefined) => {
	if (!snapshot) {
		const agent = getActiveAgentLabel();
		renderUsageMessage(host, 'No usage data', getUsageCommandLabel(agent));
		return;
	}

	if (!snapshot.agentLabel.toLowerCase().includes('kiro')) {
		renderUsageMessage(host, 'Not configured', snapshot.agentLabel);
		return;
	}

	const parsed = parseKiroUsage(snapshot.raw);
	setHidden(host, '#useUsageMessage', true);
	setHidden(host, '#useUsageResult', false);
	setText(host, '#useUsagePlan', parsed.plan);
	setText(host, '#useUsageCredits', parsed.credits);
	setText(host, '#useUsagePercent', `${parsed.percent.toFixed(1)}%`);
	setText(host, '#useUsageReset', parsed.reset);
	setText(host, '#useUsageOverages', parsed.overages);

	const bar = host.querySelector<HTMLElement>('#useUsageBar');
	if (bar) {
		bar.style.width = `${parsed.percent}%`;
	}
};

const setRefreshState = (host: HTMLElement, isLoading: boolean) => {
	const button = host.querySelector<HTMLButtonElement>('#useRefreshBtn');
	const usageCard = host.querySelector<HTMLElement>('.use-usage-card');
	if (button) {
		button.disabled = isLoading;
		button.classList.toggle('is-loading', isLoading);
		setText(host, '#useRefreshLabel', isLoading ? 'Loading' : 'Refresh');
	}

	if (usageCard) {
		usageCard.classList.toggle('is-loading', isLoading);
		usageCard.setAttribute('aria-busy', String(isLoading));
	}
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

	setText(host, '#useModalTitle', agent);
	setText(host, '#useStatusValue', status);
	setText(host, '#useOpenFor', formatOpenDuration(context.getActiveSessionCreatedAt?.()));
	setStatusDot(host, status);
};

export const mountUsePanel = (host: HTMLElement, context: ToolContext) => {
	ensureStyles();
	let shouldDismissCliUsageView = false;
	let didDismissCliUsageView = false;
	let isRefreshingUsage = false;
	let isDisposed = false;

	const template = document.createElement('template');
	template.innerHTML = (useHtml as unknown as string).trim();
	host.replaceChildren(template.content.cloneNode(true));

	const dismissCliUsageView = () => {
		if (!shouldDismissCliUsageView || didDismissCliUsageView) {
			return;
		}

		didDismissCliUsageView = true;
		context.dismissUsageView?.();
	};

	const closeBtn = host.querySelector<HTMLButtonElement>('#closeUseBtn');
	closeBtn?.addEventListener('click', () => {
		dismissCliUsageView();
		context.close();
	});

	const refreshUsage = () => {
		if (isDisposed || isRefreshingUsage) {
			return;
		}

		if (!context.requestUsage) {
			renderUsageMessage(host, 'Not configured', getActiveAgentLabel());
			return;
		}

		const commandLabel = getUsageCommandLabel(getActiveAgentLabel());
		if (commandLabel === 'not configured') {
			renderUsageMessage(host, 'Not configured', getActiveAgentLabel());
			return;
		}

		isRefreshingUsage = true;
		shouldDismissCliUsageView = true;
		renderUsageMessage(host, 'Loading usage', commandLabel);
		setRefreshState(host, true);
		void context.requestUsage()
			.then((snapshot) => {
				if (!isDisposed) {
					renderUsageSnapshot(host, snapshot);
				}
			})
			.catch((error) => {
				shouldDismissCliUsageView = false;
				if (isDisposed) {
					return;
				}
				const message = error instanceof Error ? error.message : 'Usage refresh failed.';
				renderUsageMessage(host, 'Refresh failed', message);
			})
			.finally(() => {
				isRefreshingUsage = false;
				if (!isDisposed) {
					setRefreshState(host, false);
				}
			});
	};

	const refreshBtn = host.querySelector<HTMLButtonElement>('#useRefreshBtn');
	refreshBtn?.addEventListener('click', refreshUsage);

	renderUseState(host, context);
	renderUsageSnapshot(host, context.getUsageSnapshot?.());
	if (getUsageCommandLabel(getActiveAgentLabel()) !== 'not configured') {
		window.setTimeout(refreshUsage, 0);
	}
	const interval = window.setInterval(() => renderUseState(host, context), refreshIntervalMs);
	return () => {
		isDisposed = true;
		window.clearInterval(interval);
		dismissCliUsageView();
	};
};

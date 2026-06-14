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

type UsageAgentKind = 'claude' | 'kiro';

type UsageBar = {
	label: string;
	percent: number;
	detail?: string;
};

type UsageMetric = {
	label: string;
	value: string;
};

type ParsedUsage = {
	title: string;
	summary: string;
	bars: UsageBar[];
	metrics: UsageMetric[];
	note?: string;
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

const getActiveAgentLabel = () => getText('cli-terminal-label', 'CLI');

const getUsageAgentKind = (agentLabel: string): UsageAgentKind | undefined => {
	const lower = agentLabel.toLowerCase();
	if (lower.includes('claude')) {
		return 'claude';
	}
	if (lower.includes('kiro')) {
		return 'kiro';
	}
	return undefined;
};

const getUsageCommandLabel = (agentLabel: string) => (
	getUsageAgentKind(agentLabel) ? '/usage' : 'not configured'
);

const clampPercent = (value: number) => (
	Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
);

const parsePercent = (value: string | undefined) => clampPercent(Number(value ?? NaN));

const formatPercent = (value: number) => `${clampPercent(value).toFixed(1)}%`;

const getSection = (text: string, start: RegExp, end: RegExp) => {
	const startMatch = start.exec(text);
	if (!startMatch) {
		return '';
	}

	const rest = text.slice(startMatch.index + startMatch[0].length);
	const endMatch = end.exec(rest);
	return (endMatch ? rest.slice(0, endMatch.index) : rest).trim();
};

const parseKiroUsage = (raw: string): ParsedUsage => {
	const text = stripAnsi(raw);
	const plan = text.match(/resets on\s+[0-9-]+\s*\|\s*([^\r\n]+)/i)?.[1]?.trim() ?? 'Kiro usage';
	const reset = text.match(/resets on\s+([0-9-]+)/i)?.[1]?.trim() ?? 'unknown';
	const credits = text.match(/credits\s*\(([^)]+)\)/i)?.[1]?.trim() ?? 'unknown';
	const percent = parsePercent(text.match(/(\d+(?:\.\d+)?)\s*%/)?.[1]);
	const overages = text.match(/overages:\s*([^\r\n]+)/i)?.[1]?.trim() ?? 'unknown';

	return {
		title: plan,
		summary: formatPercent(percent),
		bars: [
			{ label: 'Usage', percent, detail: `resets ${reset}` }
		],
		metrics: [
			{ label: 'credits', value: credits },
			{ label: 'resets', value: reset },
			{ label: 'overages', value: overages }
		],
		note: 'This CLI currently reports a single usage window.'
	};
};

const parseClaudeUsage = (raw: string): ParsedUsage => {
	const text = stripAnsi(raw);
	const sessionSection = getSection(text, /current session/i, /current week|what's contributing|usage credits|$|est\. to cancel/i);
	const weekSection = getSection(text, /current week[^\r\n]*/i, /what's contributing|usage credits|$|est\. to cancel/i);
	const sessionPercent = parsePercent(sessionSection.match(/(\d+(?:\.\d+)?)\s*%\s*used/i)?.[1]);
	const weekPercent = parsePercent(weekSection.match(/(\d+(?:\.\d+)?)\s*%\s*used/i)?.[1]);
	const sessionReset = sessionSection.match(/resets\s+([^\r\n]+)/i)?.[1]?.trim() ?? 'unknown';
	const weekReset = weekSection.match(/resets\s+([^\r\n]+)/i)?.[1]?.trim() ?? 'unknown';

	return {
		title: 'Claude usage',
		summary: `${formatPercent(weekPercent)} week`,
		bars: [
			{ label: 'Current session', percent: sessionPercent, detail: `resets ${sessionReset}` },
			{ label: 'Current week', percent: weekPercent, detail: `resets ${weekReset}` }
		],
		metrics: [
			{ label: 'session', value: `${formatPercent(sessionPercent)} used` },
			{ label: 'session reset', value: sessionReset },
			{ label: 'week reset', value: weekReset }
		]
	};
};

const parseUsage = (snapshot: CliUsageSnapshot): ParsedUsage | undefined => {
	const kind = getUsageAgentKind(snapshot.agentLabel);
	if (kind === 'claude') {
		return parseClaudeUsage(snapshot.raw);
	}
	if (kind === 'kiro') {
		return parseKiroUsage(snapshot.raw);
	}
	return undefined;
};

const renderUsageMessage = (host: HTMLElement, title: string, detail: string) => {
	setHidden(host, '#useUsageResult', true);
	setHidden(host, '#useUsageMessage', false);
	setText(host, '#useUsageMessageTitle', title);
	setText(host, '#useUsageMessageDetail', detail);
};

const createUsageBar = (bar: UsageBar) => {
	const item = document.createElement('div');
	item.className = 'use-usage-bar-item';

	const header = document.createElement('div');
	header.className = 'use-usage-bar-head';

	const label = document.createElement('strong');
	label.textContent = bar.label;
	label.title = bar.label;

	const value = document.createElement('span');
	value.textContent = `${formatPercent(bar.percent)} used`;
	value.title = value.textContent;

	header.append(label, value);

	const track = document.createElement('div');
	track.className = 'use-usage-bar';
	track.setAttribute('aria-hidden', 'true');

	const fill = document.createElement('span');
	fill.style.width = '0%';
	track.append(fill);

	item.append(header, track);

	if (bar.detail) {
		const detail = document.createElement('div');
		detail.className = 'use-usage-bar-detail';
		detail.textContent = bar.detail;
		detail.title = bar.detail;
		item.append(detail);
	}

	return item;
};

const createUsageMetric = (metric: UsageMetric) => {
	const item = document.createElement('div');
	const label = document.createElement('span');
	const value = document.createElement('strong');

	label.textContent = metric.label;
	value.textContent = metric.value;
	value.title = metric.value;
	item.append(label, value);

	return item;
};

const renderUsageSnapshot = (host: HTMLElement, snapshot: CliUsageSnapshot | undefined) => {
	if (!snapshot) {
		const agent = getActiveAgentLabel();
		renderUsageMessage(host, 'No usage data', getUsageCommandLabel(agent));
		return;
	}

	const parsed = parseUsage(snapshot);
	if (!parsed) {
		renderUsageMessage(host, 'Not configured', snapshot.agentLabel);
		return;
	}

	setHidden(host, '#useUsageMessage', true);
	const result = host.querySelector<HTMLElement>('#useUsageResult');
	setHidden(host, '#useUsageResult', false);
	setText(host, '#useUsageTitle', parsed.title);
	setText(host, '#useUsageSummary', parsed.summary);

	const bars = host.querySelector<HTMLElement>('#useUsageBars');
	if (bars) {
		bars.replaceChildren(...parsed.bars.map(createUsageBar));
	}

	const note = host.querySelector<HTMLElement>('#useUsageNote');
	if (note) {
		note.hidden = !parsed.note;
		note.textContent = parsed.note ?? '';
		note.title = parsed.note ?? '';
	}

	const meta = host.querySelector<HTMLElement>('#useUsageMeta');
	if (meta) {
		meta.replaceChildren(...parsed.metrics.map(createUsageMetric));
	}

	// Nice appear transition + animated bar fills (prevents jarring pop-in)
	if (result) {
		result.style.opacity = '0';
		requestAnimationFrame(() => {
			result.style.opacity = '1';
		});
	}

	// Trigger the width transitions on the freshly created bars
	if (bars) {
		requestAnimationFrame(() => {
			const fills = bars.querySelectorAll<HTMLElement>('.use-usage-bar span');
			parsed.bars.forEach((bar, i) => {
				if (fills[i]) {
					fills[i].style.width = `${clampPercent(bar.percent)}%`;
				}
			});
		});
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

		// No text in the card during loading — rely on the button ("Loading" + spinner)
		// and the card's sweep animation + reserved min-height for visual feedback.
		setHidden(host, '#useUsageMessage', true);
		setHidden(host, '#useUsageResult', true);
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

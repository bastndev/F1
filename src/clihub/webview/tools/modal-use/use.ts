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

type UsageAgentKind = 'antigravity' | 'claude' | 'codex' | 'kiro';

type UsageBar = {
	label: string;
	percent: number;
	detail?: string;
	reset?: string;
};

type UsageMetric = {
	label: string;
	value: string;
};

type ParsedUsage = {
	title: string;
	summary?: string;
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
	if (lower.includes('antigravity')) {
		return 'antigravity';
	}
	if (lower.includes('claude')) {
		return 'claude';
	}
	if (lower.includes('codex')) {
		return 'codex';
	}
	if (lower.includes('kiro')) {
		return 'kiro';
	}
	return undefined;
};

const getUsageCommandLabel = (agentLabel: string) => {
	const kind = getUsageAgentKind(agentLabel);
	if (kind === 'codex') {
		return '/status';
	}
	return kind ? '/usage' : 'not configured';
};

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

const getCleanLine = (line: string) => line
	.replace(/[│┃║|]/g, ' ')
	.replace(/\s+/g, ' ')
	.trim();

const stripUsageVisualBar = (line: string) => line
	.replace(/\[[\s█▓▒░#=+\-.▏▎▍▌▋▊▉■□▁▂▃▄▅▆▇━─]{3,}\]/g, ' ')
	.replace(/[█▓▒░▏▎▍▌▋▊▉■□▁▂▃▄▅▆▇]{3,}/g, ' ')
	.replace(/\s+/g, ' ')
	.trim();

const titleCase = (value: string) => value
	.replace(/[_-]+/g, ' ')
	.replace(/\b\w/g, (char) => char.toUpperCase())
	.trim();

const parseCompactNumber = (value: string) => Number(value.replace(/[,_\s]/g, ''));

const getAntigravityGroupLabel = (value: string) => titleCase(value)
	.replace(/\bAnd\b/g, 'and')
	.replace(/\bGpt\b/g, 'GPT');

const getAntigravityMetricLabel = (label: string) => {
	const normalized = label
		.toLowerCase()
		.replace(/\s+models\b/g, '')
		.replace(/\s+and\s+/g, '/')
		.trim();
	return `${normalized || label.toLowerCase()} refresh`;
};

const parseAntigravityUsage = (raw: string): ParsedUsage => {
	const text = stripAnsi(raw);
	const lines = text.split(/\r?\n/).map(getCleanLine).filter(Boolean);
	const bars: UsageBar[] = [];
	let groupLabel = 'Weekly limit';

	for (let index = 0; index < lines.length; index += 1) {
		const cleanLine = stripUsageVisualBar(lines[index]);
		if (!cleanLine) {
			continue;
		}

		if (/models?$/i.test(cleanLine) && !/models within/i.test(cleanLine)) {
			groupLabel = getAntigravityGroupLabel(cleanLine);
			continue;
		}

		const remainingMatch = cleanLine.match(/(\d+(?:\.\d+)?)\s*%\s*(remaining|left)/i);
		if (!remainingMatch) {
			continue;
		}

		const previousLinePercent = stripUsageVisualBar(lines[index - 1] ?? '')
			.match(/(\d+(?:\.\d+)?)\s*%/)?.[1];
		const remaining = parsePercent(previousLinePercent ?? remainingMatch[1]);
		const refresh = cleanLine.match(/refreshes?\s+in\s+([^·\r\n]+)/i)?.[1]?.trim();
		const detail = [
			`${formatPercent(remaining)} remaining`,
			refresh ? `refreshes in ${refresh}` : undefined
		].filter((part): part is string => !!part).join(' - ');

		bars.push({
			label: groupLabel,
			percent: 100 - remaining,
			detail,
			reset: refresh
		});
	}

	const metrics = bars
		.filter((bar) => !!bar.reset)
		.map((bar): UsageMetric => ({
			label: getAntigravityMetricLabel(bar.label),
			value: bar.reset ?? 'unknown'
		}))
		.slice(0, 3);

	return {
		title: 'Antigravity usage',
		summary: bars.length === 1 ? '1 weekly group' : bars.length > 1 ? `${bars.length} weekly groups` : '/usage',
		bars: bars.length > 0 ? bars : [
			{ label: 'Weekly limit', percent: 0, detail: 'No usage percentage found in /usage output' }
		],
		metrics: metrics.length > 0 ? metrics : [
			{ label: 'command', value: '/usage' },
			{ label: 'usage', value: bars.length > 0 ? 'detected' : 'not reported' },
			{ label: 'source', value: 'Antigravity CLI' }
		]
	};
};

const getCodexResetDetail = (lines: string[], startIndex: number) => {
	for (const line of lines.slice(startIndex + 1, startIndex + 3)) {
		if (/\d+(?:\.\d+)?\s*%\s*(?:used|remaining|left)?/i.test(stripUsageVisualBar(line))) {
			return undefined;
		}

		const reset = line.match(/\(?\s*resets\s+([^)]+?)\s*\)?$/i)?.[1]?.trim();
		if (reset) {
			return reset;
		}
	}
	return undefined;
};

const getCodexPercentBars = (text: string): UsageBar[] => {
	const lines = text.split(/\r?\n/).map(getCleanLine).filter(Boolean);
	const bars: UsageBar[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		const cleanLine = stripUsageVisualBar(line);
		const percentMatch = cleanLine.match(/(\d+(?:\.\d+)?)\s*%\s*(used|remaining|left)?/i);
		if (!percentMatch) {
			continue;
		}

		const rawPercent = parsePercent(percentMatch[1]);
		const mode = percentMatch[2]?.toLowerCase();
		const percent = mode === 'remaining' || mode === 'left' ? 100 - rawPercent : rawPercent;
		const labelSource = cleanLine
			.replace(percentMatch[0], '')
			.replace(/\b(used|remaining|left)\b/gi, '')
			.replace(/[:•·-]+$/g, '')
			.trim();
		const label = labelSource ? titleCase(labelSource) : 'Status';
		const reset = getCodexResetDetail(lines, index);
		const details = [
			mode === 'remaining' || mode === 'left' ? `${formatPercent(rawPercent)} ${mode}` : undefined,
			reset ? `resets ${reset}` : undefined
		].filter((detail): detail is string => !!detail);

		bars.push({ label, percent, detail: details.join(' - ') || undefined, reset });
	}

	return bars.slice(0, 2);
};

const getCodexResetMetricLabel = (label: string) => {
	const cleanLabel = label.toLowerCase().replace(/\s+limit\b/, '').trim();
	return `${cleanLabel || label.toLowerCase()} reset`;
};

const getCodexTokenBar = (text: string): UsageBar | undefined => {
	const tokenLine = text
		.split(/\r?\n/)
		.map(getCleanLine)
		.find((line) => /(token|context|usage)/i.test(line) && /(?:\d[\d,_\s]*)\s*(?:\/|of)\s*(?:\d[\d,_\s]*)/i.test(line));
	const match = tokenLine?.match(/(\d[\d,_\s]*)\s*(?:\/|of)\s*(\d[\d,_\s]*)/i);
	if (!match) {
		return undefined;
	}

	const used = parseCompactNumber(match[1]);
	const total = parseCompactNumber(match[2]);
	if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) {
		return undefined;
	}

	return {
		label: /context/i.test(tokenLine ?? '') ? 'Context' : 'Tokens',
		percent: clampPercent((used / total) * 100),
		detail: `${match[1].trim()} of ${match[2].trim()}`
	};
};

const getCodexMetric = (text: string, label: string, pattern: RegExp): UsageMetric | undefined => {
	const value = text.match(pattern)?.[1]?.trim();
	if (!value) {
		return undefined;
	}
	return { label, value };
};

const parseCodexUsage = (raw: string): ParsedUsage => {
	const text = stripAnsi(raw);
	const bars = getCodexPercentBars(text);
	const tokenBar = bars.length === 0 ? getCodexTokenBar(text) : undefined;
	if (tokenBar) {
		bars.push(tokenBar);
	}

	const resetMetrics = bars
		.filter((bar) => !!bar.reset)
		.map((bar): UsageMetric => ({
			label: getCodexResetMetricLabel(bar.label),
			value: bar.reset ?? 'unknown'
		}));
	const metrics = [
		...resetMetrics,
		getCodexMetric(text, 'model', /\bmodel\s*[:=]\s*([^\r\n]+)/i),
		getCodexMetric(text, 'approval', /\bapproval(?:s)?\s*[:=]\s*([^\r\n]+)/i),
		getCodexMetric(text, 'sandbox', /\bsandbox\s*[:=]\s*([^\r\n]+)/i)
	].filter((metric): metric is UsageMetric => !!metric).slice(0, 3);

	return {
		title: 'Codex status',
		bars: bars.length > 0 ? bars : [
			{ label: 'Status', percent: 0, detail: 'No usage percentage found in /status output' }
		],
		metrics: metrics.length > 0 ? metrics : [
			{ label: 'command', value: '/status' },
			{ label: 'usage', value: bars.length > 0 ? 'detected' : 'not reported' },
			{ label: 'source', value: 'Codex CLI' }
		],
		note: bars.length > 1
			? undefined
			: 'Codex status output may expose one usage window or only environment status.'
	};
};

const parseUsage = (snapshot: CliUsageSnapshot): ParsedUsage | undefined => {
	const kind = getUsageAgentKind(snapshot.agentLabel);
	if (kind === 'antigravity') {
		return parseAntigravityUsage(snapshot.raw);
	}
	if (kind === 'claude') {
		return parseClaudeUsage(snapshot.raw);
	}
	if (kind === 'codex') {
		return parseCodexUsage(snapshot.raw);
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
	setHidden(host, '#useUsageSummary', !parsed.summary);
	if (parsed.summary) {
		setText(host, '#useUsageSummary', parsed.summary);
	}

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

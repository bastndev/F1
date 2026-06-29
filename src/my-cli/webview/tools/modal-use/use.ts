import useStyles from './components/use.css';
import useHtml from './components/use.html';
import type { CliUsageSnapshot, ToolContext } from '../tools';
import type { UsageBar, UsageMetric } from './usage-types';
import { clampPercent, formatPercent } from './usage-utils';
import { USAGE_BUSY_ERROR, getUsageCommandLabel, parseUsage } from './agents';

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

const triggerEmptyRefreshAnimation = (host: HTMLElement) => {
	const message = host.querySelector<HTMLElement>('#useUsageMessage');
	if (!message) {
		return;
	}

	message.classList.remove('is-refreshing-empty');
	void message.offsetWidth;
	message.classList.add('is-refreshing-empty');
	window.setTimeout(() => message.classList.remove('is-refreshing-empty'), 560);
};

const renderUsageMessage = (host: HTMLElement, title: string, detail: string, options?: { empty?: boolean; animate?: boolean; working?: boolean }) => {
	setHidden(host, '#useUsageResult', true);
	setHidden(host, '#useUsageMessage', false);
	const message = host.querySelector<HTMLElement>('#useUsageMessage');
	message?.classList.toggle('is-empty-state', options?.empty === true);
	// is-working keeps the square face but sweeps an animated "ray" across the
	// dots — every other message state clears it.
	message?.classList.toggle('is-working', options?.working === true);
	setText(host, '#useUsageMessageTitle', title);
	setText(host, '#useUsageMessageDetail', detail);
	if (options?.animate) {
		triggerEmptyRefreshAnimation(host);
	}
};

const renderUnsupportedUsage = (host: HTMLElement, animate = false) => {
	renderUsageMessage(
		host,
		'Not available yet',
		'This CLI does not expose usage data here yet.',
		{ empty: true, animate }
	);
};

// Shown when an idle-only CLI (e.g. Kiro) is mid-task: same square face as the
// empty state, different text, and a moving ray. No usage command was sent.
const renderBusyUsage = (host: HTMLElement, animate = false) => {
	renderUsageMessage(
		host,
		'<coding />',
		'This CLI is working — press Refresh once the task finishes.',
		{ empty: true, working: true, animate }
	);
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
	const isExhausted = bar.percent < 1;
	if (isExhausted) {
		value.textContent = 'Quota exhausted';
		value.classList.add('is-exhausted-text');
	} else {
		value.textContent = `${formatPercent(bar.percent)} available`;
	}
	value.title = value.textContent;

	header.append(label, value);

	const track = document.createElement('div');
	track.className = 'use-usage-bar';
	if (isExhausted) {
		track.classList.add('is-empty');
	}
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
		if (getUsageCommandLabel(agent) === 'not configured') {
			renderUnsupportedUsage(host);
			return;
		}
		renderUsageMessage(host, 'No usage data', getUsageCommandLabel(agent));
		return;
	}

	const parsed = parseUsage(snapshot);
	if (!parsed) {
		renderUnsupportedUsage(host);
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

	// Mark the modal as exhausted if ANY bar is at/near zero — drives the
	// red top-accent-line effect via CSS [data-exhausted].
	const modal = host.querySelector<HTMLElement>('.use-modal');
	const anyExhausted = parsed.bars.some((bar) => bar.percent < 1);
	modal?.setAttribute('data-exhausted', String(anyExhausted));

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
					fills[i].className = '';
					if (bar.percent < 1) {
						// Already styled as exhausted via is-empty on the track
					} else if (bar.percent <= 15) {
						fills[i].classList.add('is-danger');
					} else if (bar.percent <= 59) {
						fills[i].classList.add('is-warning');
					}
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
			renderUnsupportedUsage(host, true);
			return;
		}

		const commandLabel = getUsageCommandLabel(getActiveAgentLabel());
		if (commandLabel === 'not configured') {
			renderUnsupportedUsage(host, true);
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
				// Nothing was injected for any rejection, so never dismiss a view.
				shouldDismissCliUsageView = false;
				if (isDisposed) {
					return;
				}
				// Busy is not a failure: the CLI is mid-task, so show the
				// in-progress card and let the user Refresh when it's done.
				if (error instanceof Error && error.message === USAGE_BUSY_ERROR) {
					renderBusyUsage(host, true);
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

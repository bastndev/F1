export type CliAgentOption = {
	label: string;
};

export type CliAgentIcon = {
	label: string;
	icon: string;
	darkIcon: boolean;
	lightIcon: boolean;
};

export type CliSessionSummary = {
	id: string;
	label: string;
	cwd: string;
	status: 'running' | 'exited' | 'error';
	hasUnread: boolean;
	exitCode?: number;
};

type TabControllerOptions = {
	getAgentIcon: (label: string) => CliAgentIcon | undefined;
	onCreate: (agent: string) => void;
	onCycleSession: (offset: 1 | -1) => void;
	onSwitch: (sessionId: string) => void;
	onClose: (sessionId: string) => void;
	onOpenTool?: (tool: 'translate' | 'keymaps') => void;
};

const getRequiredElement = <T extends HTMLElement>(id: string) => {
	const element = document.getElementById(id);

	if (!element) {
		throw new Error(`Missing element: ${id}`);
	}

	return element as T;
};

const getStatusLabel = (session: CliSessionSummary) => {
	if (session.status === 'exited') {
		return typeof session.exitCode === 'number' ? `exited ${session.exitCode}` : 'exited';
	}

	return session.status;
};

const getProjectLabel = (cwd: string) => {
	const normalizedPath = cwd.replace(/[\\/]+$/, '');
	const projectName = normalizedPath.split(/[\\/]/).pop();

	return projectName ? `~/${projectName}` : '~/workspace';
};

export const createTabController = (options: TabControllerOptions) => {
	const createButton = getRequiredElement<HTMLButtonElement>('cli-create-button');
	const createButtonLabel = getRequiredElement<HTMLSpanElement>('cli-create-button-label');
	const toolsButton = getRequiredElement<HTMLButtonElement>('cli-tools-button');
	const toolsPopover = getRequiredElement<HTMLDivElement>('cli-tools-popover');
	const agentButton = getRequiredElement<HTMLButtonElement>('cli-agent-button');
	const agentLabel = getRequiredElement<HTMLSpanElement>('cli-agent-label');
	const agentMenu = getRequiredElement<HTMLDivElement>('cli-agent-menu');
	const sessionList = getRequiredElement<HTMLDivElement>('cli-session-list');
	let currentAgents: CliAgentOption[] = [];
	let currentAgentSignature = '';
	let currentAgentLabel = '';
	let currentActiveSessionId: string | undefined;
	let isAgentMenuOpen = false;
	let isToolsPopoverOpen = false;
	let lastShortcutSignature = '';
	let lastShortcutAt = 0;
	let currentSessionCount = 0;
	let isAltPressed = false;
	let isCreateButtonHovered = false;

	const setAgentMenuOpen = (isOpen: boolean) => {
		isAgentMenuOpen = isOpen;
		agentMenu.hidden = !isOpen;
		agentButton.classList.toggle('is-open', isOpen);
		agentButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
	};

	const setToolsPopoverOpen = (isOpen: boolean) => {
		isToolsPopoverOpen = isOpen;
		toolsPopover.hidden = !isOpen;
		toolsButton.classList.toggle('is-open', isOpen);
		toolsButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
	};

	const closeFloatingPanels = () => {
		if (isAgentMenuOpen) {
			setAgentMenuOpen(false);
		}

		if (isToolsPopoverOpen) {
			setToolsPopoverOpen(false);
		}
	};

	const syncAgentPicker = () => {
		const hasAgents = currentAgents.length > 0;
		agentButton.disabled = !hasAgents;
		agentLabel.textContent = currentAgentLabel || (hasAgents ? currentAgents[0].label : 'Loading CLI');

		for (const option of Array.from(agentMenu.querySelectorAll<HTMLButtonElement>('.agent-picker-option'))) {
			const isSelected = option.dataset.agentLabel === currentAgentLabel;
			option.classList.toggle('is-selected', isSelected);
			option.setAttribute('aria-selected', isSelected ? 'true' : 'false');
		}
	};

	const selectAgent = (label: string) => {
		currentAgentLabel = label;
		syncAgentPicker();
		setAgentMenuOpen(false);
		agentButton.focus();
		options.onCreate(label);
	};

	const focusAgentOption = (offset: 1 | -1) => {
		const optionButtons = Array.from(agentMenu.querySelectorAll<HTMLButtonElement>('.agent-picker-option'));
		if (optionButtons.length === 0) {
			return;
		}

		const activeIndex = optionButtons.findIndex((option) => option === document.activeElement);
		const selectedIndex = optionButtons.findIndex((option) => option.dataset.agentLabel === currentAgentLabel);
		const currentIndex = activeIndex >= 0 ? activeIndex : Math.max(selectedIndex, 0);
		const nextIndex = (currentIndex + offset + optionButtons.length) % optionButtons.length;
		optionButtons[nextIndex]?.focus();
	};

	const isCreateShortcut = (event: KeyboardEvent) => {
		return event.altKey
			&& !event.ctrlKey
			&& !event.metaKey
			&& (event.key === '+' || event.code === 'Equal' || event.code === 'NumpadAdd');
	};

	const isCloseShortcut = (event: KeyboardEvent) => {
		return event.altKey
			&& !event.ctrlKey
			&& !event.metaKey
			&& (event.key === '-' || event.code === 'Minus' || event.code === 'NumpadSubtract');
	};

	const getShortcutAction = (event: KeyboardEvent) => {
		if (isCreateShortcut(event)) {
			return 'create';
		}

		if (isCloseShortcut(event)) {
			return 'close';
		}

		return undefined;
	};

	const createCurrentAgentSession = () => {
		if (currentAgentLabel) {
			options.onCreate(currentAgentLabel);
		}
	};

	const closeActiveSession = () => {
		if (currentActiveSessionId) {
			options.onClose(currentActiveSessionId);
		}
	};

	const updateCreateButtonVisuals = () => {
		if (isAltPressed && isCreateButtonHovered) {
			createButtonLabel.textContent = '-';
		} else {
			createButtonLabel.textContent = currentSessionCount >= 3 && currentSessionCount <= 9 ? String(currentSessionCount) : '+';
		}
	};

	const updateCreateButtonLabel = (sessionCount: number) => {
		currentSessionCount = sessionCount;
		updateCreateButtonVisuals();
	};

	const handleKeyboardShortcut = (event: KeyboardEvent) => {
		if (event.type !== 'keydown' || event.repeat) {
			return false;
		}

		const action = getShortcutAction(event);
		if (!action) {
			return false;
		}

		event.preventDefault();
		event.stopPropagation();

		const shortcutSignature = `${action}:${event.code}:${event.key}`;
		const now = Date.now();
		if (shortcutSignature === lastShortcutSignature && now - lastShortcutAt < 180) {
			return true;
		}

		lastShortcutSignature = shortcutSignature;
		lastShortcutAt = now;

		if (action === 'create') {
			createCurrentAgentSession();
			return true;
		}

		closeActiveSession();
		return true;
	};

	createButton.addEventListener('click', (event) => {
		if (event.altKey) {
			closeActiveSession();
		} else {
			createCurrentAgentSession();
		}
	});

	createButton.addEventListener('mouseenter', (event) => {
		isAltPressed = event.altKey;
		isCreateButtonHovered = true;
		updateCreateButtonVisuals();
	});

	createButton.addEventListener('mouseleave', () => {
		isCreateButtonHovered = false;
		updateCreateButtonVisuals();
	});

	agentButton.addEventListener('click', (event) => {
		event.stopPropagation();
		setToolsPopoverOpen(false);
		setAgentMenuOpen(!isAgentMenuOpen);
	});

	agentButton.addEventListener('keydown', (event) => {
		if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
			return;
		}

		event.preventDefault();
		setToolsPopoverOpen(false);
		setAgentMenuOpen(true);
		focusAgentOption(event.key === 'ArrowDown' ? 1 : -1);
	});

	agentMenu.addEventListener('click', (event) => {
		event.stopPropagation();
		const optionButton = event.target instanceof HTMLElement
			? event.target.closest<HTMLButtonElement>('.agent-picker-option')
			: undefined;
		if (optionButton?.dataset.agentLabel) {
			selectAgent(optionButton.dataset.agentLabel);
		}
	});

	agentMenu.addEventListener('keydown', (event) => {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			focusAgentOption(event.key === 'ArrowDown' ? 1 : -1);
			return;
		}

		if (event.key === 'Enter' || event.key === ' ') {
			const optionButton = event.target instanceof HTMLElement
				? event.target.closest<HTMLButtonElement>('.agent-picker-option')
				: undefined;
			if (optionButton?.dataset.agentLabel) {
				event.preventDefault();
				selectAgent(optionButton.dataset.agentLabel);
			}
		}
	});

	toolsButton.addEventListener('click', (event) => {
		event.stopPropagation();
		setAgentMenuOpen(false);
		setToolsPopoverOpen(!isToolsPopoverOpen);
	});

	toolsPopover.addEventListener('click', (event) => {
		event.stopPropagation();

		const target = event.target instanceof HTMLElement ? event.target : null;
		const toolButton = target?.closest<HTMLButtonElement>('[data-tool]');

		if (toolButton?.dataset.tool && options.onOpenTool) {
			const tool = toolButton.dataset.tool as 'translate' | 'keymaps';
			setToolsPopoverOpen(false);
			options.onOpenTool(tool);
		}
	});

	document.addEventListener('click', () => {
		closeFloatingPanels();
	});

	document.addEventListener('keyup', (event) => {
		if (event.key === 'Alt') {
			isAltPressed = false;
			updateCreateButtonVisuals();
		}
	});

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Alt') {
			isAltPressed = true;
			updateCreateButtonVisuals();
		}

		if (handleKeyboardShortcut(event)) {
			return;
		}

		if (event.key === 'Escape' && (isAgentMenuOpen || isToolsPopoverOpen)) {
			event.preventDefault();
			closeFloatingPanels();
			if (document.activeElement instanceof HTMLElement && document.activeElement.closest('#cli-agent-menu')) {
				agentButton.focus();
			} else {
				toolsButton.focus();
			}
			return;
		}

		if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) {
			return;
		}

		const target = event.target instanceof HTMLElement ? event.target : undefined;
		const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
		if (target?.closest('.xterm') || activeElement?.closest('.xterm')) {
			return;
		}

		if (!sessionList.querySelector('.agent-session-item')) {
			return;
		}

		event.preventDefault();
		options.onCycleSession(event.shiftKey ? -1 : 1);
	});

	const setAgents = (agents: CliAgentOption[]) => {
		const nextAgentSignature = agents.map((agent) => agent.label).join('\u001f');
		if (nextAgentSignature === currentAgentSignature) {
			return;
		}

		const previousValue = currentAgentLabel;
		currentAgentSignature = nextAgentSignature;
		currentAgents = agents;
		agentMenu.replaceChildren();

		for (const agent of agents) {
			const option = document.createElement('button');
			option.className = 'agent-picker-option';
			option.type = 'button';
			option.role = 'option';
			option.dataset.agentLabel = agent.label;

			const icon = options.getAgentIcon(agent.label);
			if (icon) {
				option.classList.toggle('has-dark-icon', icon.darkIcon);
				option.classList.toggle('has-light-icon', icon.lightIcon);

				const image = document.createElement('img');
				image.className = 'agent-picker-option-icon';
				image.src = icon.icon;
				image.alt = '';
				image.draggable = false;
				option.append(image);
			} else {
				const fallbackIcon = document.createElement('span');
				fallbackIcon.className = 'agent-picker-option-fallback';
				fallbackIcon.textContent = agent.label.slice(0, 1);
				option.append(fallbackIcon);
			}

			const text = document.createElement('span');
			text.className = 'agent-picker-option-label';
			text.textContent = agent.label;
			option.append(text);
			agentMenu.append(option);
		}

		if (agents.some((agent) => agent.label === previousValue)) {
			currentAgentLabel = previousValue;
		} else {
			currentAgentLabel = agents[0]?.label || '';
		}

		syncAgentPicker();
	};

	const render = (sessions: CliSessionSummary[], activeSessionId: string | undefined) => {
		currentActiveSessionId = activeSessionId;
		updateCreateButtonLabel(sessions.length);

		if (sessions.length === 0) {
			const emptyState = document.createElement('div');
			emptyState.className = 'agent-session-empty';
			emptyState.textContent = currentAgents.length ? 'No open CLI sessions.' : 'Loading CLI sessions.';
			sessionList.replaceChildren(emptyState);
			return;
		}

		const fragment = document.createDocumentFragment();

		for (const session of sessions) {
			const item = document.createElement('div');
			item.className = 'agent-session-item';
			item.classList.toggle('is-active', session.id === activeSessionId);
			item.classList.toggle('has-unread', session.hasUnread);
			item.tabIndex = 0;
			item.setAttribute('role', 'option');
			item.setAttribute('aria-selected', session.id === activeSessionId ? 'true' : 'false');

			const icon = options.getAgentIcon(session.label);
			if (icon) {
				item.classList.toggle('has-dark-icon', icon.darkIcon);
				item.classList.toggle('has-light-icon', icon.lightIcon);
			}

			const iconFrame = document.createElement('div');
			iconFrame.className = 'agent-session-icon-frame';
			iconFrame.setAttribute('aria-hidden', 'true');

			if (icon) {
				const image = document.createElement('img');
				image.className = 'agent-session-icon-image';
				image.src = icon.icon;
				image.alt = '';
				image.draggable = false;
				iconFrame.append(image);
			}

			const main = document.createElement('div');
			main.className = 'agent-session-main';

			const titleRow = document.createElement('div');
			titleRow.className = 'agent-session-title-row';

			const dot = document.createElement('span');
			dot.className = 'agent-session-dot';

			const title = document.createElement('div');
			title.className = 'agent-session-title';
			title.textContent = session.label;

			const project = document.createElement('div');
			project.className = 'agent-session-project';
			project.textContent = getProjectLabel(session.cwd);

			const meta = document.createElement('div');
			const statusClass = `agent-session-status--${session.status}`;
			meta.className = 'agent-session-meta';
			const status = document.createElement('span');
			status.className = `agent-session-status ${statusClass}`;
			status.textContent = getStatusLabel(session);
			meta.append(status);

			const closeButton = document.createElement('button');
			closeButton.className = 'agent-session-close';
			closeButton.type = 'button';
			closeButton.tabIndex = -1;
			closeButton.title = 'Close CLI';
			closeButton.setAttribute('aria-label', `Close ${session.label}`);
			closeButton.textContent = 'x';
			closeButton.addEventListener('click', (event) => {
				event.stopPropagation();
				options.onClose(session.id);
			});
			closeButton.addEventListener('keydown', (event) => {
				if (event.key !== 'Tab') {
					event.stopPropagation();
				}
			});

			const switchSession = () => options.onSwitch(session.id);
			item.addEventListener('click', switchSession);
			item.addEventListener('keydown', (event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					switchSession();
				}
			});

			titleRow.append(title, dot);
			main.append(titleRow, project, meta);
			item.append(iconFrame, main, closeButton);
			fragment.append(item);
		}

		sessionList.replaceChildren(fragment);
	};

	return {
		handleKeyboardShortcut,
		render,
		setAgents
	};
};

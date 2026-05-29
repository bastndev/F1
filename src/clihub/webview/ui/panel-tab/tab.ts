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
	const agentSelect = getRequiredElement<HTMLSelectElement>('cli-agent-select');
	const sessionList = getRequiredElement<HTMLDivElement>('cli-session-list');
	let currentAgents: CliAgentOption[] = [];
	let currentAgentSignature = '';

	createButton.addEventListener('click', () => {
		if (agentSelect.value) {
			options.onCreate(agentSelect.value);
		}
	});

	document.addEventListener('keydown', (event) => {
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

		const previousValue = agentSelect.value;
		currentAgentSignature = nextAgentSignature;
		currentAgents = agents;
		agentSelect.replaceChildren();

		for (const agent of agents) {
			const option = document.createElement('option');
			option.value = agent.label;
			option.textContent = agent.label;
			agentSelect.append(option);
		}

		if (agents.some((agent) => agent.label === previousValue)) {
			agentSelect.value = previousValue;
		}
	};

	const render = (sessions: CliSessionSummary[], activeSessionId: string | undefined) => {
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
		render,
		setAgents
	};
};

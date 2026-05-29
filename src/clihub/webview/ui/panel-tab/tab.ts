export type CliAgentOption = {
	label: string;
};

export type CliSessionSummary = {
	id: string;
	label: string;
	commandLine: string;
	cwd: string;
	status: 'running' | 'exited' | 'error';
	hasUnread: boolean;
	exitCode?: number;
};

type TabControllerOptions = {
	onBack: () => void;
	onCreate: (agent: string) => void;
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

export const createTabController = (options: TabControllerOptions) => {
	const backButton = document.querySelector<HTMLButtonElement>('[data-action="back-to-launcher"]');
	const createButton = getRequiredElement<HTMLButtonElement>('cli-create-button');
	const agentSelect = getRequiredElement<HTMLSelectElement>('cli-agent-select');
	const sessionList = getRequiredElement<HTMLDivElement>('cli-session-list');
	let currentAgents: CliAgentOption[] = [];

	backButton?.addEventListener('click', options.onBack);
	createButton.addEventListener('click', () => {
		if (agentSelect.value) {
			options.onCreate(agentSelect.value);
		}
	});

	const setAgents = (agents: CliAgentOption[]) => {
		const previousValue = agentSelect.value;
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
		sessionList.replaceChildren();

		if (sessions.length === 0) {
			const emptyState = document.createElement('div');
			emptyState.className = 'agent-session-empty';
			emptyState.textContent = currentAgents.length ? 'No open CLI sessions.' : 'Loading CLI sessions.';
			sessionList.append(emptyState);
			return;
		}

		for (const session of sessions) {
			const item = document.createElement('div');
			item.className = 'agent-session-item';
			item.classList.toggle('is-active', session.id === activeSessionId);
			item.classList.toggle('has-unread', session.hasUnread);
			item.tabIndex = 0;
			item.setAttribute('role', 'option');
			item.setAttribute('aria-selected', session.id === activeSessionId ? 'true' : 'false');

			const main = document.createElement('div');
			main.className = 'agent-session-main';

			const titleRow = document.createElement('div');
			titleRow.className = 'agent-session-title-row';

			const dot = document.createElement('span');
			dot.className = 'agent-session-dot';

			const title = document.createElement('div');
			title.className = 'agent-session-title';
			title.textContent = session.label;

			const meta = document.createElement('div');
			const statusClass = `agent-session-status--${session.status}`;
			meta.className = 'agent-session-meta';
			const status = document.createElement('span');
			status.className = `agent-session-status ${statusClass}`;
			status.textContent = getStatusLabel(session);
			meta.append(status);
			meta.append(` - ${session.commandLine}`);

			const closeButton = document.createElement('button');
			closeButton.className = 'agent-session-close';
			closeButton.type = 'button';
			closeButton.title = 'Close CLI';
			closeButton.setAttribute('aria-label', `Close ${session.label}`);
			closeButton.textContent = 'x';
			closeButton.addEventListener('click', (event) => {
				event.stopPropagation();
				options.onClose(session.id);
			});

			const switchSession = () => options.onSwitch(session.id);
			item.addEventListener('click', switchSession);
			item.addEventListener('keydown', (event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					switchSession();
				}
			});

			titleRow.append(dot, title);
			main.append(titleRow, meta);
			item.append(main, closeButton);
			sessionList.append(item);
		}
	};

	return {
		render,
		setAgents
	};
};

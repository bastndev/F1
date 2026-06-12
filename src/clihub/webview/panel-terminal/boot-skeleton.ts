/**
 * Animated "CLI is starting" skeleton shown in the terminal stack until the
 * real CLI produces output. Dismissal contract: the skeleton stays until the
 * first output arrives, then lingers exactly one second before its exit
 * animation; a hard safety net removes it after 14s no matter what.
 */
export type BootSkeletonController = {
	/** Show a skeleton for a freshly created session. No-op if one exists. */
	create: (sessionId: string) => void;
	has: (sessionId: string) => boolean;
	/** Begin the exit animation and forget the session. */
	dismiss: (sessionId: string) => void;
	/** First CLI output for a session — schedules the 1s lingering dismissal. */
	notifyOutput: (sessionId: string) => void;
	/** Drop skeletons (without exit animation) for sessions that no longer exist. */
	removeClosed: (openSessionIds: Set<string>) => void;
	/** Toggle the is-active class to match the active session. */
	setActiveSession: (activeSessionId: string | undefined) => void;
};

export const createBootSkeletons = (options: {
	stack: HTMLElement;
	getSessionLabel: (sessionId: string) => string;
	getAgentSlug: (label: string) => string;
}): BootSkeletonController => {
	const skeletons = new Map<string, HTMLDivElement>();
	const sessionsWithFirstOutput = new Set<string>();

	const dismiss = (sessionId: string) => {
		const skeleton = skeletons.get(sessionId);
		if (!skeleton) {
			return;
		}

		skeletons.delete(sessionId);
		sessionsWithFirstOutput.delete(sessionId);

		skeleton.classList.add('is-exiting');

		const remove = () => {
			skeleton.remove();
		};

		// Match the CSS transition duration (520ms)
		skeleton.addEventListener('transitionend', remove, { once: true });
		// Safety fallback in case transitionend doesn't fire
		setTimeout(remove, 800);
	};

	const create = (sessionId: string) => {
		if (skeletons.has(sessionId)) {
			return;
		}

		const agentLabel = options.getSessionLabel(sessionId);
		const agentSlug = options.getAgentSlug(agentLabel);

		const skeleton = document.createElement('div');
		skeleton.className = 'cli-boot-skeleton';
		skeleton.dataset.sessionId = sessionId;
		skeleton.dataset.agent = agentSlug;

		// Premium scan overlay (terminal "reading" feel)
		const scan = document.createElement('div');
		scan.className = 's-scan';
		skeleton.append(scan);

		// Main rich line field (fills most of the vertical space)
		const main = document.createElement('div');
		main.className = 's-main';

		// Vertical beam (subtle descending light column) — placed inside .s-main
		// so it naturally stops before the live typing dots area
		const vbeamWrap = document.createElement('div');
		vbeamWrap.className = 's-vbeam-wrap';
		const vbeam = document.createElement('div');
		vbeam.className = 's-vbeam';
		vbeamWrap.appendChild(vbeam);
		main.appendChild(vbeamWrap);

		// BLOCK GROUPS — structured left accent bars + grouped shimmer lines
		// (replaces previous flat list of lines for richer visual rhythm)
		const blockGroups: string[][] = [
			['full', 'long'],
			['med', 'long', 'thick'],
			['indent', 'med', 'short'],
			['long', 'med', 'full'],
			['tiny', 'long', 'med'],
			['indent', 'thick', 'short', 'long'],
			['med', 'full']
		];

		for (const group of blockGroups) {
			const block = document.createElement('div');
			block.className = 's-block';

			const bar = document.createElement('div');
			bar.className = 's-block-bar';

			const linesWrap = document.createElement('div');
			linesWrap.className = 's-block-lines';

			for (const variant of group) {
				const line = document.createElement('div');
				line.className = `s-line ${variant}`;
				linesWrap.appendChild(line);
			}

			block.append(bar, linesWrap);
			main.appendChild(block);
		}

		skeleton.appendChild(main);

		// Strong LIVE ZONE — solves the "bottom is always black" problem
		const live = document.createElement('div');
		live.className = 's-live';

		const liveLines = ['long', 'full', 'med', 'long'];
		for (const variant of liveLines) {
			const line = document.createElement('div');
			line.className = `s-line ${variant}`;
			live.append(line);
		}

		// Real typing presence (three dots) — modern and alive
		const typing = document.createElement('div');
		typing.className = 's-typing';

		const sym = document.createElement('span');
		sym.className = 's-sym';
		sym.textContent = '▍';

		const dots = document.createElement('div');
		dots.className = 's-typing-dots';
		for (let i = 0; i < 3; i++) {
			const dot = document.createElement('div');
			dot.className = 's-dot';
			dots.append(dot);
		}

		typing.append(sym, dots);
		live.append(typing);

		skeleton.append(live);

		// Subtle status/context row (adds polish, feels intentional)
		const status = document.createElement('div');
		status.className = 's-status';

		const statusLeft = document.createElement('div');
		statusLeft.className = 's-status-left';

		const statusDot = document.createElement('div');
		statusDot.className = 's-status-dot';

		const statusText = document.createElement('span');
		statusText.textContent = agentLabel ? `starting ${agentLabel}` : 'preparing session';

		statusLeft.append(statusDot, statusText);

		const statusRight = document.createElement('span');
		statusRight.textContent = 'waiting for output';

		status.append(statusLeft, statusRight);
		skeleton.append(status);

		options.stack.append(skeleton);
		skeletons.set(sessionId, skeleton);

		// Hard safety net
		setTimeout(() => {
			if (skeletons.has(sessionId)) {
				dismiss(sessionId);
			}
		}, 14000);
	};

	return {
		create,
		dismiss,
		has: (sessionId) => skeletons.has(sessionId),
		notifyOutput: (sessionId) => {
			if (!skeletons.has(sessionId) || sessionsWithFirstOutput.has(sessionId)) {
				return;
			}

			sessionsWithFirstOutput.add(sessionId);

			// Wait 1 full second after the CLI actually speaks before we begin
			// the exit animation.
			setTimeout(() => {
				dismiss(sessionId);
			}, 1000);
		},
		removeClosed: (openSessionIds) => {
			for (const [sessionId, skeleton] of skeletons) {
				if (!openSessionIds.has(sessionId)) {
					skeleton.remove();
					skeletons.delete(sessionId);
					sessionsWithFirstOutput.delete(sessionId);
				}
			}
		},
		setActiveSession: (activeSessionId) => {
			for (const [sessionId, skeleton] of skeletons) {
				skeleton.classList.toggle('is-active', sessionId === activeSessionId);
			}
		}
	};
};

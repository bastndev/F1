/**
 * Skills row: chips for the skills installed in the workspace
 * (.agents/skills/* and .claude/skills/*, deduplicated by name, scanned
 * host-side). The row only appears when at least one skill exists.
 *
 * ONE aggregate [Skills #N] token in the textarea represents the selection.
 * The ordered `selected` array is authoritative; the token is purely visual.
 * Chips show numbered badges (#1, #2) that update as selection order changes.
 * A footer legend "skills: #1 cavecrew · #2 nido" appears when any are active.
 */
import {
	buildSkillsToken,
	skillsTokenPattern,
	skillsTokenPresencePattern,
	skillsTokenWithOptionalTrailingSpacePattern,
	type WorkspaceSkill
} from '../../../shared/prompt';
import type { PromptContext } from './prompt-context';

// The active CLI decides which skills folder a route should prefer. Same
// label source updateFooterModel uses.
export function isClaudeSession(): boolean {
	const label = document.getElementById('cli-terminal-label')?.textContent ?? '';
	return label.toLowerCase().includes('claude');
}

export function initSkillsChips(
	host: HTMLElement,
	context: PromptContext,
	textarea: HTMLTextAreaElement,
	onSelectionChange: (selected: WorkspaceSkill[]) => void,
	initialSelected: WorkspaceSkill[] = []
): (() => void) | undefined {
	const row = host.querySelector<HTMLElement>('.prompt-skills');
	const chipsHost = host.querySelector<HTMLElement>('#skillChips');
	if (!row || !chipsHost || !context.requestWorkspaceSkills) {
		return undefined;
	}

	const selected: WorkspaceSkill[] = [];
	let updatingToken = false;

	const createAddChip = () => {
		const addChip = document.createElement('button');
		addChip.type = 'button';
		addChip.className = 'prompt-tool-btn prompt-skill-add';
		addChip.textContent = '+';
		addChip.setAttribute('aria-label', 'Create a skill');

		if (context.openCreateSkill) {
			// The modal stays open: the draft keeps waiting while the skill is
			// created, and the registered refresh adds the new chip on return.
			addChip.addEventListener('click', () => {
				context.openCreateSkill?.();
			});
		} else {
			addChip.disabled = true;
			addChip.setAttribute('aria-disabled', 'true');
		}

		return addChip;
	};

	const updateToken = () => {
		updatingToken = true;
		try {
			const hasToken = skillsTokenPresencePattern.test(textarea.value);

			if (selected.length === 0) {
				if (hasToken) {
					textarea.value = textarea.value
						.replace(skillsTokenWithOptionalTrailingSpacePattern, '')
						.trimStart();
					textarea.dispatchEvent(new Event('input', { bubbles: true }));
				}
			} else {
				const newToken = buildSkillsToken(selected.length);
				if (hasToken) {
					textarea.value = textarea.value
						.replace(skillsTokenPattern, newToken);
				} else {
					const current = textarea.value;
					textarea.value = current ? `${newToken} ${current}` : `${newToken} `;
				}
				textarea.setSelectionRange(textarea.value.length, textarea.value.length);
				textarea.dispatchEvent(new Event('input', { bubbles: true }));
			}

			onSelectionChange([...selected]);
		} finally {
			updatingToken = false;
		}
	};

	const syncBadges = () => {
		for (const chip of Array.from(chipsHost.querySelectorAll<HTMLButtonElement>('[data-skill]'))) {
			const name = chip.dataset.skill!;
			const idx = selected.findIndex((s) => s.name === name);
			const badge = chip.querySelector<HTMLElement>('.skill-badge');
			chip.classList.toggle('selected', idx >= 0);
			if (badge) {
				badge.textContent = idx >= 0 ? `#${idx + 1}` : '';
			}
		}
	};

	const renderSkills = (skills: WorkspaceSkill[]) => {
		chipsHost.replaceChildren();

		if (!skills.length) {
			chipsHost.append(createAddChip());
			row.hidden = false;
			return;
		}

		for (const skill of skills) {
			const chip = document.createElement('button');
			chip.className = 'prompt-tool-btn prompt-skill-chip';
			chip.dataset.skill = skill.name;
			chip.title = `Ask the CLI to use its "${skill.name}" skill`;

			const label = document.createElement('span');
			label.className = 'skill-label';
			label.textContent = skill.name;

			const badge = document.createElement('span');
			badge.className = 'skill-badge';
			badge.setAttribute('aria-hidden', 'true');

			chip.append(label, badge);

			chip.addEventListener('click', () => {
				const idx = selected.findIndex((s) => s.name === skill.name);
				if (idx >= 0) {
					selected.splice(idx, 1);
				} else {
					selected.push(skill);
				}
				updateToken();
				syncBadges();
				textarea.focus();
			});

			chipsHost.append(chip);
		}

		row.hidden = false;
		syncBadges();
	};

	const refresh = () => {
		void context.requestWorkspaceSkills!().then((skills) => {
			if (!row.isConnected) {
				return;
			}

			const validNames = new Set(skills.map(s => s.name));
			const prevCount = selected.length;
			for (let i = selected.length - 1; i >= 0; i--) {
				if (!validNames.has(selected[i].name)) {
					selected.splice(i, 1);
				}
			}
			if (selected.length !== prevCount) {
				updateToken();
			}

			renderSkills(skills);
		});
	};

	void context.requestWorkspaceSkills().then((skills) => {
		if (!row.isConnected) {
			return;
		}

		// Restore a draft's selection (survives modal close/reopen) — but only
		// for skills that still exist, and only when the draft text still
		// carries the token; a bare token with nothing to back it is stale.
		if (initialSelected.length && skillsTokenPresencePattern.test(textarea.value)) {
			const validNames = new Set(skills.map((s) => s.name));
			selected.push(...initialSelected.filter((s) => validNames.has(s.name)));
		}

		renderSkills(skills);

		if (selected.length === 0) {
			if (skillsTokenPresencePattern.test(textarea.value)) {
				textarea.value = textarea.value
					.replace(skillsTokenWithOptionalTrailingSpacePattern, '')
					.trimStart();
				textarea.dispatchEvent(new Event('input', { bubbles: true }));
			}
		} else if (selected.length !== initialSelected.length) {
			// Some previously selected skills vanished from disk while the
			// modal was closed — repair the token to match what's left.
			updateToken();
		} else {
			onSelectionChange([...selected]);
		}
	});

	textarea.addEventListener('input', () => {
		if (updatingToken) {
			return;
		}
		if (selected.length > 0 && !skillsTokenPresencePattern.test(textarea.value)) {
			selected.length = 0;
			onSelectionChange([]);
			syncBadges();
		}
	});

	return refresh;
}

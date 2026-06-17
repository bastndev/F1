import { altKey } from './utils';
import type { ShortcutDefinition } from './utils';

export type SkillsShortcutId = 'goCreate' | 'goInstall' | 'goLocal';

export type SkillsTabTarget = 'create-panel' | 'install-panel' | 'local-panel';

export interface SkillsShortcutDefinition extends ShortcutDefinition<SkillsShortcutId> {
  target: SkillsTabTarget;
}

export const skillsShortcuts: SkillsShortcutDefinition[] = [
  {
    id: 'goCreate',
    label: 'Go to Create tab',
    description: 'Alt + 1',
    target: 'create-panel',
    match: altKey('1'),
  },
  {
    id: 'goInstall',
    label: 'Go to Install tab',
    description: 'Alt + 2',
    target: 'install-panel',
    match: altKey('2'),
  },
  {
    id: 'goLocal',
    label: 'Go to Local tab',
    description: 'Alt + 3',
    target: 'local-panel',
    match: altKey('3'),
  },
];

export function matchesSkillsShortcut(event: KeyboardEvent, id: SkillsShortcutId): boolean {
  return skillsShortcuts.find(s => s.id === id)?.match(event) ?? false;
}

export function getSkillsTabTarget(event: KeyboardEvent): SkillsTabTarget | undefined {
  return skillsShortcuts.find(s => s.match(event))?.target;
}

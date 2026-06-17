// ─── Matcher factory ──────────────────────────────────────────────────────────

function altKey(targetKey: string): (event: KeyboardEvent) => boolean {
  const lower = targetKey.toLowerCase();
  return (event: KeyboardEvent): boolean => {
    if (!event.altKey || event.ctrlKey || event.metaKey) { return false; }
    const k = event.key.toLowerCase();
    const code = event.code.toLowerCase();
    if (k === lower) { return true; }
    if (lower === '+' && (k === '+' || code.includes('equal') || code.includes('numpadadd'))) { return true; }
    if (lower === '-' && (k === '-' || code.includes('minus') || code.includes('numpadsubtract'))) { return true; }
    return false;
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type SkillsShortcutId = 'goCreate' | 'goInstall' | 'goLocal';

export type SkillsTabTarget = 'create-panel' | 'install-panel' | 'local-panel';

export interface SkillsShortcutDefinition {
  id: SkillsShortcutId;
  label: string;
  description: string;
  target: SkillsTabTarget;
  match: (event: KeyboardEvent) => boolean;
}

// ─── Shortcuts ────────────────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getSkillsTabTarget(event: KeyboardEvent): SkillsTabTarget | undefined {
  return skillsShortcuts.find(s => s.match(event))?.target;
}

// ─── Matcher factories ────────────────────────────────────────────────────────

function altKey(targetKey: string): (event: KeyboardEvent) => boolean {
  const lower = targetKey.toLowerCase();
  return (event: KeyboardEvent): boolean => {
    if (!event.altKey || event.ctrlKey || event.metaKey) { return false; }
    const k = event.key.toLowerCase();
    const code = event.code.toLowerCase();
    if (k === lower) { return true; }
    if (lower === '+' && (k === '+' || code.includes('equal') || code.includes('numpadadd'))) { return true; }
    if (lower === '-' && (k === '-' || code.includes('minus') || code.includes('numpadsubtract'))) { return true; }
    if (lower === '9' && (k === '9' || code.includes('numpad9'))) { return true; }
    return false;
  };
}

function plainTab(): (event: KeyboardEvent) => boolean {
  return (e: KeyboardEvent) => e.key === 'Tab' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
}

function shiftTab(): (event: KeyboardEvent) => boolean {
  return (e: KeyboardEvent) => e.key === 'Tab' && e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
}

function ctrlSpace(): (event: KeyboardEvent) => boolean {
  return (e: KeyboardEvent) =>
    (e.key === ' ' || e.code === 'Space') && e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
}

function spaceKey(): (event: KeyboardEvent) => boolean {
  return (e: KeyboardEvent) =>
    (e.key === ' ' || e.code === 'Space') && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
}

function escapeKey(): (event: KeyboardEvent) => boolean {
  return (e: KeyboardEvent) => e.key === 'Escape';
}

function Capslock(): (event: KeyboardEvent) => boolean {
  return (e: KeyboardEvent) =>
    e.key === 'CapsLock' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
}

function shiftFKey(num: number): (event: KeyboardEvent) => boolean {
  const key = `F${num}`;
  return (e: KeyboardEvent) => e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && e.key === key;
}

function promptSendKey(): (event: KeyboardEvent) => boolean {
  return (e: KeyboardEvent) =>
    e.key === 'Enter'
    && !e.shiftKey
    && (e.ctrlKey || e.metaKey || e.altKey);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShortcutContext = 'launcher' | 'terminal' | 'prompt';

export type ShortcutId =
  | 'newSession'
  | 'closeSession'
  | 'toggleAgentPicker'
  | 'togglePromptFilter'
  | 'nextSession'
  | 'prevSession'
  | 'toggleAgentPalette'
  | 'closeLauncherPalette'
  | 'openPrompt'
  | 'openTranslate'
  | 'openKeymaps'
  | 'openUse'
  | 'toggleVoicePlayback'
  | 'sendPrompt';

export interface ShortcutDefinition {
  id: ShortcutId;
  label: string;
  contexts: ShortcutContext[];
  description: string;
  match: (event: KeyboardEvent) => boolean;
}

// ─── Shortcuts ────────────────────────────────────────────────────────────────

export const shortcuts: ShortcutDefinition[] = [
  {
    id: 'newSession',
    label: 'New CLI session',
    contexts: ['terminal'],
    description: 'Alt + +',
    match: altKey('+'),
  },
  {
    id: 'closeSession',
    label: 'Close current session',
    contexts: ['terminal'],
    description: 'Alt + -',
    match: altKey('-'),
  },
  {
    id: 'toggleAgentPicker',
    label: 'Open CLI selector',
    contexts: ['terminal'],
    description: 'Capslock',
    match: Capslock(),
  },
  {
    id: 'togglePromptFilter',
    label: 'Toggle Prompt filter',
    contexts: ['terminal'],
    description: 'Ctrl + Space',
    match: ctrlSpace(),
  },
  {
    id: 'nextSession',
    label: 'Next session',
    contexts: ['terminal'],
    description: 'Tab',
    match: plainTab(),
  },
  {
    id: 'prevSession',
    label: 'Previous session',
    contexts: ['terminal'],
    description: 'Shift + Tab',
    match: shiftTab(),
  },
  {
    id: 'openPrompt',
    label: 'Open Prompt tool',
    contexts: ['terminal'],
    description: 'Shift + F1',
    match: shiftFKey(1),
  },
  {
    id: 'openTranslate',
    label: 'Open Translate tool',
    contexts: ['terminal'],
    description: 'Shift + F2',
    match: shiftFKey(2),
  },
  {
    id: 'openKeymaps',
    label: 'Open Keymaps tool',
    contexts: ['terminal'],
    description: 'Shift + F4',
    match: shiftFKey(4),
  },
  {
    id: 'openUse',
    label: 'Open Status/use tool',
    contexts: ['terminal'],
    description: 'Shift + F3',
    match: shiftFKey(3),
  },
  {
    id: 'toggleVoicePlayback',
    label: 'Play / pause Listen (Translator)',
    contexts: ['terminal'],
    description: 'Space',
    match: spaceKey(),
  },
  {
    id: 'sendPrompt',
    label: 'Execute prompt',
    contexts: ['prompt'],
    description: 'Ctrl + Enter',
    match: promptSendKey(),
  },
  {
    id: 'toggleAgentPalette',
    label: 'Toggle agents palette',
    contexts: ['launcher'],
    description: 'Tab',
    match: plainTab(),
  },
  {
    id: 'closeLauncherPalette',
    label: 'Close agents palette',
    contexts: ['launcher'],
    description: 'Escape',
    match: escapeKey(),
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getShortcuts(context?: ShortcutContext): ShortcutDefinition[] {
  if (!context) { return shortcuts; }
  return shortcuts.filter(s => s.contexts.includes(context));
}

export function getShortcut(id: ShortcutId): ShortcutDefinition | undefined {
  return shortcuts.find(s => s.id === id);
}

export function matchesShortcut(event: KeyboardEvent, id: ShortcutId): boolean {
  return shortcuts.find(s => s.id === id)?.match(event) ?? false;
}

export function consumeShortcut(event: KeyboardEvent, id: ShortcutId): boolean {
  if (matchesShortcut(event, id)) {
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
  return false;
}

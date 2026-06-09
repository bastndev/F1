/**
 * Central keyboard shortcuts definition (Option 1 - Light)
 *
 * This file is the single source of truth for shortcut detection.
 * It only handles matching, NOT the actions themselves.
 * Actions remain in the components (tab.ts, terminal.ts, launcher).
 *
 * Includes both session management shortcuts and tool modal openers
 * (Prompt, Translate, Keymaps).
 */

export type ShortcutContext = 'launcher' | 'terminal';

export type ShortcutId =
  | 'newSession'
  | 'closeSession'
  | 'toggleAgentPicker'   // terminal agent selector
  | 'nextSession'
  | 'prevSession'
  | 'toggleAgentPalette'   // launcher only
  | 'closeLauncherPalette' // launcher only
  | 'openPrompt'           // opens the Prompt tool modal
  | 'openTranslate'        // opens the Translate tool modal
  | 'openKeymaps';         // opens the Keymaps tool modal

export interface ShortcutDefinition {
  id: ShortcutId;
  label: string;
  contexts: ShortcutContext[];
  description: string;
  /** Returns true if the given event matches this shortcut */
  match: (event: KeyboardEvent) => boolean;
}

// ============================================
// Declarative shortcut matcher factories
// Use these so you can change shortcuts easily by editing only the array below.
// ============================================

/** Matches Alt + a specific key (handles different keyboard layouts for symbols) */
export function altKey(targetKey: string) {
  const lower = targetKey.toLowerCase();
  return (event: KeyboardEvent): boolean => {
    if (!event.altKey || event.ctrlKey || event.metaKey) {
      return false;
    }

    const k = event.key.toLowerCase();
    const code = event.code.toLowerCase();

    // Direct match on key
    if (k === lower) {
      return true;
    }

    // Common symbol fallbacks (for + - = etc across layouts)
    if (lower === '+' && (k === '+' || code.includes('equal') || code.includes('numpadadd'))) {
      return true;
    }
    if (lower === '-' && (k === '-' || code.includes('minus') || code.includes('numpadsubtract'))) {
      return true;
    }
    if (lower === '9' && (k === '9' || code.includes('numpad9'))) {
      return true;
    }

    return false;
  };
}

/** Matches plain Tab (no modifiers) */
export function plainTab() {
  return (event: KeyboardEvent): boolean => {
    return (
      event.key === 'Tab' &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey
    );
  };
}

/** Matches Shift + Tab */
export function shiftTab() {
  return (event: KeyboardEvent): boolean => {
    return (
      event.key === 'Tab' &&
      event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    );
  };
}

/** Matches Ctrl + Tab */
export function ctrlTab() {
  return (event: KeyboardEvent): boolean => {
    return (
      event.key === 'Tab' &&
      event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.shiftKey
    );
  };
}

/** Matches Escape key */
export function escapeKey() {
  return (event: KeyboardEvent): boolean => {
    return event.key === 'Escape';
  };
}

/** Matches Shift + F1, Shift + F2, etc. (common for opening tools/panels) */
export function shiftFKey(num: number) {
  const targetKey = `F${num}`;
  return (event: KeyboardEvent): boolean => {
    return (
      event.shiftKey &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      event.key === targetKey
    );
  };
}

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
    description: 'Ctrl + Tab',
    match: ctrlTab(),
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

  // Tool modals (opened via Shift + Fn)
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
    description: 'Shift + F3',
    match: shiftFKey(3),
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

export function getShortcuts(context?: ShortcutContext): ShortcutDefinition[] {
  if (!context) {
    return shortcuts;
  }
  return shortcuts.filter((s) => s.contexts.includes(context));
}

export function matchesShortcut(event: KeyboardEvent, id: ShortcutId): boolean {
  const shortcut = shortcuts.find((s) => s.id === id);
  return shortcut ? shortcut.match(event) : false;
}

export function getShortcut(id: ShortcutId): ShortcutDefinition | undefined {
  return shortcuts.find((s) => s.id === id);
}

/**
 * Helper to prevent default + stop propagation for matched shortcuts.
 * Use in keydown handlers.
 */
export function consumeShortcut(event: KeyboardEvent, id: ShortcutId): boolean {
  if (matchesShortcut(event, id)) {
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
  return false;
}

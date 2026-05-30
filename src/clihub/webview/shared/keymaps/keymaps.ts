/**
 * Central keyboard shortcuts definition (Option 1 - Light)
 *
 * This file is the single source of truth for shortcut detection.
 * It only handles matching, NOT the actions themselves.
 * Actions remain in the components (tab.ts, terminal.ts, launcher).
 */

export type ShortcutContext = 'launcher' | 'terminal';

export type ShortcutId =
  | 'newSession'
  | 'closeSession'
  | 'nextSession'
  | 'prevSession'
  | 'toggleAgentPalette'   // launcher only
  | 'closeLauncherPalette'; // launcher only

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

/** Matches Escape key */
export function escapeKey() {
  return (event: KeyboardEvent): boolean => {
    return event.key === 'Escape';
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

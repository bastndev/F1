import { altKey, plainTab, shiftTab, ctrlSpace, escapeKey, Capslock, shiftFKey } from './utils';
import type { ShortcutDefinition as BaseShortcutDefinition } from './utils';

export type ShortcutContext = 'launcher' | 'terminal';

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
  | 'openUse';

export interface ShortcutDefinition extends BaseShortcutDefinition<ShortcutId> {
  contexts: ShortcutContext[];
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

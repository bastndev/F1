export interface ShortcutDefinition<TId extends string = string> {
  id: TId;
  label: string;
  description: string;
  match: (event: KeyboardEvent) => boolean;
}

export function altKey(targetKey: string): (event: KeyboardEvent) => boolean {
  const lower = targetKey.toLowerCase();
  return (event: KeyboardEvent): boolean => {
    if (!event.altKey || event.ctrlKey || event.metaKey) {
      return false;
    }
    const k = event.key.toLowerCase();
    const code = event.code.toLowerCase();
    if (k === lower) { return true; }
    if (lower === '+' && (k === '+' || code.includes('equal') || code.includes('numpadadd'))) { return true; }
    if (lower === '-' && (k === '-' || code.includes('minus') || code.includes('numpadsubtract'))) { return true; }
    if (lower === '9' && (k === '9' || code.includes('numpad9'))) { return true; }
    return false;
  };
}

export function plainTab(): (event: KeyboardEvent) => boolean {
  return (event: KeyboardEvent): boolean =>
    event.key === 'Tab' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

export function shiftTab(): (event: KeyboardEvent) => boolean {
  return (event: KeyboardEvent): boolean =>
    event.key === 'Tab' && event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
}

export function ctrlTab(): (event: KeyboardEvent) => boolean {
  return (event: KeyboardEvent): boolean =>
    event.key === 'Tab' && event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
}

export function ctrlSpace(): (event: KeyboardEvent) => boolean {
  return (event: KeyboardEvent): boolean =>
    (event.key === ' ' || event.code === 'Space') &&
    event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey;
}

export function escapeKey(): (event: KeyboardEvent) => boolean {
  return (event: KeyboardEvent): boolean => event.key === 'Escape';
}

export function Capslock(): (event: KeyboardEvent) => boolean {
  return (event: KeyboardEvent): boolean =>
    event.key === 'CapsLock' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

export function shiftFKey(num: number): (event: KeyboardEvent) => boolean {
  const targetKey = `F${num}`;
  return (event: KeyboardEvent): boolean =>
    event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && event.key === targetKey;
}

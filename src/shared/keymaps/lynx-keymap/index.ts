/** Marketplace ID of the Lynx Keymap extension this chord installs / activates. */
export const LYNX_KEYMAP_EXTENSION_ID = 'bastndev.lynx-keymap';

/** True when the event is the Lynx Keymap activation chord: Alt + CapsLock with no other modifiers. */
export function isAltCapsLock(event: KeyboardEvent): boolean {
  return event.key === 'CapsLock' && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

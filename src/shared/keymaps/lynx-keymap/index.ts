/**
 * Lynx Keymap's bottom-panel navigation chords: Alt + E/R/W/Q toggle the CLI Hub,
 * GitLab, integrated Terminal and Debug REPL panels respectively.
 *
 * The CLI Hub runs xterm.js in a webview, which otherwise captures these and feeds
 * them to the shell — so while the terminal is focused they never reach VS Code and
 * the user is stuck. The terminal key handler uses this to let them pass through to
 * VS Code's keybinding service, so the user can move between panels without leaving
 * the terminal first.
 *
 * Scoped to plain Alt + single letter (no Ctrl/Meta/Shift) so it never clashes with
 * Shift+Alt+E/R/W/Q (Lynx's AI chords), Alt+Enter (CLI newline) or terminal control
 * keys. This is an allowlist on purpose: every other key still belongs to the CLI.
 */
const LYNX_PANEL_NAV_KEYS = new Set(['e', 'r', 'w', 'q']);

export function isLynxPanelNavChord(event: KeyboardEvent): boolean {
  return event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey
    && LYNX_PANEL_NAV_KEYS.has(event.key.toLowerCase());
}

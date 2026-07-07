/**
 * Detects when a CLI is showing a pending interactive question (choice list,
 * approval gate, or y/n confirm) rather than just streaming output. Generic
 * across agents: Ink/blessed-style TUI prompts share the same idioms
 * (selection pointer + option, approval button row, y/n) no matter which CLI
 * renders them.
 *
 * Two consumers:
 * - webview feeds the rendered visible viewport (accurate — an answered prompt
 *   clears once the TUI redraws it away);
 * - host feeds the raw ANSI output accumulated since the user's last keystroke
 *   via isRawOutputAwaitingInput, used while the webview is torn down.
 */
import { stripAnsi } from './model-detect';

// Selection pointer sitting on a real choice — a number ("❯ 1.") or an approval
// word ("❯ yes", "❯ allow"). Anchored to a choice so a bare "❯ " input cursor,
// or "❯ <typed text>", never trips it. Covers Claude menus + Kiro's approval.
const pointerChoicePattern =
	/^[ \t]*[❯›▸▶➤*][ \t]*(?:\d+[.)]|yes\b|no\b|allow\b|approve\b|accept\b|reject\b|deny\b|trust\b)/im;

// Pointer-less approvals: button rows (OpenCode "allow once / allow always")
// and standalone gate phrases (Kiro "requires approval"). Specific enough to
// rarely collide with normal prose the agent prints.
const approvalPhrasePattern =
	/\ballow once\b|\ballow always\b|permission required|requires approval|do you want to proceed|press enter to confirm|waiting for (?:your )?(?:approval|confirmation)/i;

// Inline y/n confirmation: "(y/n)", "[Y/n]".
const yesNoPattern = /[([]\s*y\s*\/\s*n\s*[)\]]/i;

export const isAwaitingUserInput = (screenText: string): boolean =>
	pointerChoicePattern.test(screenText)
	|| approvalPhrasePattern.test(screenText)
	|| yesNoPattern.test(screenText);

/** Raw-stream variant: strip ANSI first. Cursor-move-only line breaks are lost
 *  after stripping, but the phrase/y-n patterns aren't line-anchored and Ink
 *  frames keep real newlines, so the pointer pattern still lands. */
export const isRawOutputAwaitingInput = (rawOutput: string): boolean =>
	isAwaitingUserInput(stripAnsi(rawOutput));

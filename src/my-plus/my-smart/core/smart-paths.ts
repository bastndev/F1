/**
 * "Smart + Skills" constants. Pure data — no vscode, no fs, no DOM.
 */

/**
 * The needle the host watches for in the RENDERED terminal buffer to confirm the
 * Smart priming landed (see main._launchSmart / sessionManager.bufferContains — a
 * literal case-sensitive `.includes`). A miss keeps the loading overlay up until
 * the 90s hard cap, so the needle must survive whatever the CLI does when it
 * displays the reply: keep it all-lowercase (some CLIs lowercase their whole
 * transcript), markdown-inert, short plain ASCII with NO emoji (emoji can get
 * re-shaped on render). Sibling case proven in production: rules-content.ts.
 */
export const SMART_READY_MARKER = 'i am ready for work';

/** The exact line the CLI is asked to end its first reply with (its own readiness
 *  signal, shown in the chat). Derived from SMART_READY_MARKER so the watched
 *  needle is always a substring of the reply, and lowercase so the match holds on
 *  both case-preserving and case-lowercasing CLIs. */
export const SMART_READY_MESSAGE = `${SMART_READY_MARKER} ✅`;

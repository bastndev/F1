/**
 * Fallback adapter for every CLI that does NOT expose usage data
 * (OpenCode, Copilot, Cursor, Kilo, Grok, Gemini, …). Empty command, so
 * no keystrokes are ever injected; renders the "Not available yet" card.
 *
 * TODO: implement the UsageAgent that returns the unsupported state.
 */
export {};

/**
 * Front door for the CLI Hub extension. The only file code outside
 * src/my-cli/ (i.e. src/extension.ts) should import.
 *
 * Host-side exports only: src/my-cli compiles into four bundles across two
 * runtimes, and the webview entry points (webview/launcher/index.ts,
 * webview/panel-terminal/terminal.ts) run side effects at import time —
 * re-exporting anything from webview/ here would drag browser code into the
 * Node bundle and crash activation. Keep this file tiny; if it grows past a
 * handful of exports, internals are leaking out.
 */
export { MyCliViewProvider } from './core/main';

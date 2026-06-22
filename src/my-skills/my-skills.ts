/**
 * Front door for the "My Skills" feature — the only file outside src/my-skills/
 * that other code (src/extension.ts) should import.
 *
 * Host-side (Node) exports only. The provider implementation and its host-side
 * orchestration live in core/main.ts; keep this file tiny — if it grows past a
 * handful of exports, internals are leaking out.
 */

export { MySkillsViewProvider } from './core/main';

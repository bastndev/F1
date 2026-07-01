/**
 * Front door for the "My Memory" feature — the only file outside src/my-memory/
 * that other code should import.
 *
 * Host-side (Node) exports only. This is the slim project-context engine reused
 * by "Smart + Skills" (src/my-smart).
 */

export { MemoryService } from './core/memory-service';

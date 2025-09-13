# F1 

Allows you to control editor functions and manage extensions directly from the keyboard, streamlining your workflow with configurable shortcuts.

## Features

- **Custom Shortcuts (Create Shortcut & My List)** — Create and assign quick bindings; includes defaults like Toggle Word Wrap (F1) and AI Suggestion (disable/enable) (Shift+F1).
- **Editor Controls** — Per-control toggles for Minimap, Code Folding, Line Numbers, Cursor Blinking, Color Decorators, Indent Guides, Sticky Scroll, Cursor Smooth Caret Animation, and Terminal Suggest.
- **Extension Compatibility** — Verified compatibility with popular extensions shown in the UI (GitHub Copilot, GitHub Copilot Chat, Error Lens, ESLint, Live Server, Image Preview, Bracket Lynx, etc.).

Discover more extensions at [bastndev.com/extensions](https://bastndev.com/extensions)



## Changelog

Following VS Code best practices, F1 uses semantic versioning for all releases.

</br>

<!-- --- -->
## [0.0.3] - 2025-09-13

### Added
- "Create Shortcut" (beta) integration and "My List" custom shortcuts UI.
    - Included default quick bindings shown in UI: Toggle Word Wrap (F1), AI Suggestion (disable/enable) (Shift+F1).
- Full Editor Controls panel with individual toggles:
    - Minimap, Code Folding, Line Numbers, Cursor Blinking, Color Decorators, Indent Guides, Sticky Scroll.
    - Cursor Smooth Caret Animation toggle.
    - Terminal Suggest (new) entry and UX for enabling/disabling terminal suggestions.
- Bracket colorization improvements:
    - Bracket LINE Colorization and Bracket PAIR Colorization support.
- Extension compatibility matrix and icons support:
    - Tested/verified compatibility with common extensions visible in UI: GitHub Copilot, GitHub Copilot Chat, Error Lens, ESLint, Code Spell Checker, Live Server, Image Preview, Astro, Bracket Lynx, Lynx Keymap (75% Keyboard), F1 helper, esbuild Problem Matchers, Extension Test Runner.
- Visual and UX polish:
    - New sidebar compact lists, improved spacing, and explicit “new” badges where applicable.

### Changed
- Refactored theme internals and settings structure to support per-control toggles and extension-driven UI entries.
- Consolidated keybinding visuals and documentation to match displayed in-app shortcuts.
- Improved contrast and spacing for the editor controls panel to match screenshot layout and accessibility guidelines.

### Fixed
- Resolved inconsistent bracket coloring across scopes.
- Fixed issues with cursor animation and sticky-scroll interaction.
- Fixed edge cases where Terminal Suggest entries did not render when certain extensions are present.

### Notes
- One-time registration flow remains the same; extension compatibility was validated on VS Code builds concurrent with listed extension versions.
- If you use custom keymaps, re-check bindings after update; use "Create Shortcut" (beta) to reassign quickly.
- For feedback or to report regressions, open an issue on the repository with reproducible steps.

## [0.0.2] - 2025-07-22

### Added
- **Editor Controls**: Enhanced editor features including:
- (disable/enable)
- Improved compatibility with VS Code extensions.
- Enhanced UI for better coding experience.

---

## [0.0.1] - 2025-07-10

### Initial Release
- Initial release of F1
- Basic F1 visual ad keymaps
- Core theme infrastructure and settings
# Editor and local workspace state
.vscode/**
.vscode-test/**
.gitignore
.vscodeignore
.yarnrc

# Exclude all src/ except runtime assets loaded via extensionUri at runtime.
# Negations below are required — removing them causes panels to render blank.
src/**
!src/shared/
!src/shared/**/
!src/shared/**/*.html
!src/shared/**/*.css
!src/shared/**/*.svg
!src/shared/**/*.png
!src/shared/**/*.webp
!src/my-skills/
!src/my-skills/**/
!src/my-skills/**/*.html
!src/my-skills/**/*.css
!src/my-skills/**/*.svg
!src/my-skills/**/*.png
!src/my-skills/**/*.webp

# Smart + Skills rules asset read via extensionUri at runtime (loadRules → RULES_ASSET_SEGMENTS).
# Match only .md so bundled .ts sources stay out of the package.
!src/my-plus/**/*.md

# Repo-only assets (~13 MB) — not loaded by the extension
public/**

# Tests and generated development maps
**/__test__/**
**/__tests__/**
**/*.test.*
**/*.spec.*
**/*.ts
**/*.map

# Build, lint, typecheck, and package-manager inputs
.prettierignore
bun.lock
esbuild.js
**/eslint.config.mjs
**/tsconfig.json

# Native debug symbols — trims ~53 MB of node-pty .pdb files
**/*.pdb

# fixnow dictionaries (~11 MB total). Keep en/es/pt/ru; drop ar/de/fr/vi (unused).
# Mirrors src/my-cli/shared/prompt/languages.ts.
node_modules/fixnow/dictionaries/ar/**
node_modules/fixnow/dictionaries/de/**
node_modules/fixnow/dictionaries/fr/**
node_modules/fixnow/dictionaries/vi/**

# Contributor-only documentation
AGENTS.md
ARCHITECTURE.md
CLAUDE.md
CODE_OF_CONDUCT.md
CONTRIBUTING.md
NOTES.md
vsc-extension-quickstart.md

# Agent/context caches and graph analysis output
.agents/**
.claude/**
.codex/**

# Local package artifacts
*.vsix

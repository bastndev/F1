# Contributing to F1

## Welcome! 🌟

Thank you for your interest in contributing to **F1**! We're excited to have you join our community of developers who are passionate about creating optimized productivity shortcuts for VS Code and compatible editors.

Whether you want to add support for new editors, create new shortcuts, improve existing editor controls, or enhance documentation, your contributions are valuable and welcome.

## Understanding the Project 🏗️

Before diving into contributions, we recommend reading our [**Architecture Documentation**](https://github.com/bastndev/F1/blob/main/ARCHITECTURE.md) to understand:

- How the shortcut system works across multiple editors
- The dynamic management and auto-synchronization system
- File organization and shortcut structure
- Multi-editor support architecture
- Integration principles

This will help you make more effective contributions and understand where your changes fit in the bigger picture.

## Getting Started 🚀

### Prerequisites

- **VS Code** (primary development environment)
- **Git** for version control
- **Knowledge of editor features** recommended for creating productivity shortcuts
- **Multiple editors** for testing cross-editor compatibility

### Setting Up Your Development Environment

1. **Fork the repository**: Click the "Fork" button on the [F1 repository](https://github.com/bastndev/F1)

2. **Clone your fork**:

```bash
git clone https://github.com/YOUR-USERNAME/F1.git
cd F1
```

3. **Switch to the dev branch**:

```bash
git checkout dev
```

4. **Open in VS Code**:

```bash
code .
```

## Development Workflow 🛠️

### Testing Your Changes

- **Press `F5`** to launch a new VS Code window with your extension loaded
- **Alternative**: If you have the "F1" extension installed, use Command Palette → "F1: ..." commands
- **Test across editors**: Verify shortcuts work in VS Code, Cursor, Windsurf, etc.
- **Test functionality**: Ensure compatibility with various editor features

### Making Changes

1. **Create your changes** in the `dev` branch
2. **Test thoroughly** across multiple editors and features
3. **Commit your changes** with descriptive messages
4. **Push to your fork**:

```bash
git push origin dev
```

## Types of Contributions 📝

### 1. Adding Support for New Editors

**Currently supported**: VS Code • Cursor • Windsurf • Trae.ai • Kiro • Firebase Studio

**To add a new editor**:

**Files to modify**:

- `package.json` - Add new configurations for the editor
- `src/extension.ts` - Configure editor detection and management
- Ensure shortcut compatibility

**Example process**:

1. Research the new editor's system
2. Map F1 shortcuts to editor-specific format
3. Add dynamic management support if the editor supports it
4. Test shortcut functionality and management commands
5. Update documentation

### 2. Creating New Shortcuts

**Current shortcut categories**:

- **Editor Controls** (minimap, line numbers, etc.)
- **Dynamic Shortcuts** (user-defined shortcuts)
- **Toggle Features** (AI suggestions, markdown wrap, etc.)

**New shortcut areas**:

- Advanced editor features
- Workflow optimizations
- Custom toggles

### 3. Improving Existing Shortcuts

You can enhance any of our current shortcut categories:

- **Editor Controls** (toggle minimap, code folding, etc.)
- **Dynamic Shortcuts** (user-defined combinations)
- **Feature Toggles** (AI suggestions, etc.)

### 4. Enhancing Dynamic Management

**Management system improvements**:

- Better shortcut organization
- Enhanced auto-synchronization
- New management commands
- Cross-editor compatibility
- Smart shortcut suggestions

### 5. Documentation Improvements

We welcome improvements to:

- **README.md** - Main project documentation
- **CONTRIBUTING.md** - This guide
- **ARCHITECTURE.md** - Technical architecture documentation
- **CHANGELOG.md** - Version history
- Code comments and inline documentation

## Project Structure Deep Dive 📁

```
F1/
├── src/
│   ├── extension.ts                 # 🎯 MAIN CONTRIBUTION AREA
│   │                                 # Main entry point & orchestrator
│   ├── core/
│   │   └── performance-shortcut.ts  # Performance utilities
│   ├── disable-enable/
│   │   ├── editor-controls/
│   │   │   ├── ed-controls.ts       # Editor controls activation
│   │   │   └── ed-icons.ts          # UI icons
│   │   ├── extensions/
│   │   │   └── editor-extensions.ts # Extensions panel
│   │   └── shortcuts/
│   │       ├── ui.ts                # Webview provider
│   │       ├── create-shortcut/
│   │       │   ├── btn-shortcut.ts  # Shortcut creation UI
│   │       │   ├── ed-content.ts    # Content editor
│   │       │   └── ex-content.ts    # Content extraction
│   │       └── my-list/
│   │           ├── dynamic-shortcuts.ts # Dynamic shortcut manager
│   │           ├── user-shortcuts.ts    # User shortcut UI
│   │           └── default/
│   │               ├── ai.ts        # AI shortcuts
│   │               └── f1.ts        # F1 shortcuts
│   └── __test__/
│       └── extension.test.ts        # Test suite
├── assets/
│   ├── icon.png                  # Extension icon
│   └── gif/
│       └── screenshot.gif        # Demo animation
├── esbuild.js                    # Build configuration
├── eslint.config.mjs             # Linting configuration
├── package.json                  # 🎯 EXTENSION CONFIGURATION
├── tsconfig.json                 # TypeScript configuration
└── README.md                     # Documentation
```

### Key Files for Contributors

**`src/extension.ts`** - Main orchestrator:

- Initializes all subsystems
- Registers commands and webview providers
- Manages dynamic shortcut system
- Handles configuration toggling logic

**`src/disable-enable/shortcuts/my-list/dynamic-shortcuts.ts`** - Dynamic shortcut manager:

- Runtime execution of custom shortcuts
- Persistent storage using VS Code's global state
- F2-F12 key combination support

**`src/disable-enable/editor-controls/ed-controls.ts`** - Editor controls:

- Toggle system for VS Code settings
- Handles boolean, enum, and string configurations
- User feedback for state changes

**`src/disable-enable/shortcuts/ui.ts`** - Webview provider:

- Manages F1 Shortcuts panel interface
- Handles UI interactions and message passing
- Real-time updates and analytics

**`package.json`** - Extension configuration:

- Command definitions and keybindings
- Activation events and views
- Editor compatibility settings
- Contribution points for menus and panels

**`esbuild.js`** - Build system:

- TypeScript compilation and bundling
- Development watch mode
- Production build optimization

## Submitting Your Contribution 🎯

### Pull Request Requirements

When creating your PR, please include:

1. **Clear description** of what you've added/changed

2. **Shortcut information** (if adding new shortcuts):

   - Shortcut name and key combination
   - Functionality description
   - Usage examples
   - Testing results

3. **Editor compatibility** (if adding editor support):

   - Editor name and version
   - Specific features implemented
   - Management system integration
   - Compatibility notes

4. **Screenshots/Videos** (highly recommended):
   - Show shortcuts in action across different editors
   - Demonstrate functionality
   - Include workflow examples

### Testing Checklist

Before submitting, please test with:

**Functionality:**

- ✅ **Editor controls** (minimap, line numbers, etc.)
- ✅ **Dynamic shortcuts** (user-defined)
- ✅ **Toggle features** (AI suggestions, etc.)
- ✅ **Management commands** (add, remove, list)

**Editors:**

- ✅ **VS Code** - Primary support
- ✅ **Cursor, Windsurf, Trae.ai, Kiro, Firebase Studio** - Compatibility
- ✅ **Key combinations** and functionality

## Important Notes ⚠️

### What You CAN Modify

**Extension modifications**:

- ✅ Add new shortcut patterns
- ✅ Improve existing shortcut structures
- ✅ Extend shortcut categories
- ✅ Add new management commands

**Guidelines**:

- Follow existing shortcut structure
- Use appropriate editor features
- Include meaningful functionality
- Test for conflicts with existing shortcuts

### Code Formatting

The project maintains specific formatting. Your changes should respect the existing structure and spacing patterns shown in the current files.

### Branch Strategy

- **Work in**: `dev` branch only
- **Submit PRs to**: `dev` branch
- The maintainer will merge `dev` → `main` for releases

## Naming Conventions 📝

**No strict patterns required**, but for consistency:

**Commands in package.json**: Follow existing pattern:

- `f1.[functionName]`
- Example: `f1.toggleMinimap`

## Multi-Editor Integration Guide 🌐

When adding support for a new editor:

### 1. Research Phase

- Study the editor's system
- Identify dynamic management capabilities
- Map equivalent functions to existing F1 shortcuts

### 2. Implementation Phase

- Add configurations to appropriate files
- Update `src/extension.ts` for editor detection
- Modify management system for command execution
- Set appropriate compatibility in package.json

### 3. Testing Phase

- Verify all shortcut categories work
- Test dynamic management functionality
- Confirm compatibility
- Check cross-editor consistency

## Getting Help 🆘

- **Bugs or issues?** Create an [Issue](https://github.com/bastndev/F1/issues)
- **Architecture questions?** Check the [Architecture documentation](https://github.com/bastndev/F1/blob/main/ARCHITECTURE.md)
- **Need inspiration?** Study existing shortcuts in `src/extension.ts`

## Code of Conduct 📋

Please read and follow our [Code of Conduct](https://github.com/bastndev/F1/blob/main/CODE_OF_CONDUCT.md) to ensure a welcoming environment for everyone.

---

**Thank you for contributing to F1!** Your work helps developers worldwide have a consistent, efficient development experience across all editors and platforms. 🚀</content>
<parameter name="filePath">/home/bastndev/Documents/bastndev/VScode/F1/CONTRIBUTING.md

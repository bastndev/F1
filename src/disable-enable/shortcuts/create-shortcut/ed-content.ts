interface EditorControl {
  name: string;
  category: 'editor' | 'ui' | 'formatting' | 'features' | 'debugging';
  configKey?: string;
  isSeparator?: boolean;
  isNew?: boolean;
}

// Static controls array
export const editorControls: EditorControl[] = [
  // Editor Visual Features
  // Separator
  // {name: 'Editor Features',category: 'editor',isSeparator: true,},

  {name: 'Minimap',category: 'editor',configKey: 'editor.minimap.enabled',},
  {name: 'Code Folding',category: 'editor',configKey: 'editor.folding',},
  {name: 'Line Numbers',category: 'editor',configKey: 'editor.lineNumbers',},
  {name: 'Cursor Blinking',category: 'editor',configKey: 'editor.cursorBlinking',},
  {name: 'Color Decorators',category: 'editor',configKey: 'editor.colorDecorators',},
  {name: 'Indent Guides',category: 'editor',configKey: 'editor.guides.indentation',},
  {name: 'Sticky Scroll',category: 'editor',configKey: 'editor.stickyScroll.enabled',},
  {name: 'Cursor Smooth Caret Animation',category: 'editor',configKey: 'editor.cursorSmoothCaretAnimation',},
  {name: 'Terminal Suggest',category: 'editor',configKey: 'terminal.integrated.suggest.enabled', isNew: true}, // new

  // Separator
  {name: 'Editor Features',category: 'ui',isSeparator: true,},

  // UI Features
  {name: 'Bracket LINE Colorization',category: 'ui',configKey: 'editor.guides.bracketPairs',},
  {name: 'Bracket PAIR Colorization',category: 'ui',configKey: 'editor.bracketPairColorization.enabled',},
  {name: 'Breadcrumbs',category: 'ui',configKey: 'breadcrumbs.enabled',},
  {name: 'Compact Folders',category: 'ui',configKey: 'explorer.compactFolders',},
  {name: 'Panel',category: 'ui',configKey: 'workbench.panel.defaultLocation',},
  {name: 'Side Bar',category: 'ui',configKey: 'workbench.sideBar.location',},
  {name: 'Status Bar',category: 'ui',configKey: 'workbench.statusBar.visible',},
  {name: 'Tabs',category: 'ui',configKey: 'workbench.editor.showTabs',},
  {name: 'Tree Indent',category: 'ui',configKey: 'workbench.tree.indent',},

  // Separator
  {name: 'UI Components',category: 'formatting',isSeparator: true,},

  // Formatting & Code Features
  {name: 'Auto Save',category: 'formatting',configKey: 'files.autoSave',},
  {name: 'Format On Paste',category: 'formatting',configKey: 'editor.formatOnPaste',},
  {name: 'Format On Save',category: 'formatting',configKey: 'editor.formatOnSave',},
  {name: 'Format On Type',category: 'formatting',configKey: 'editor.formatOnType',},
  {name: 'Insert Final Newline',category: 'formatting',configKey: 'files.insertFinalNewline',},
  {name: 'Trim Trailing Whitespace',category: 'formatting',configKey: 'files.trimTrailingWhitespace',},

  // Separator
  {name: 'Formatting Options',category: 'features',isSeparator: true,},

  // IntelliSense & Features
  {name: 'Accept Suggestion On Enter',category: 'features',configKey: 'editor.acceptSuggestionOnEnter',},
  {name: 'Auto Closing Brackets',category: 'features',configKey: 'editor.autoClosingBrackets',},
  {name: 'Auto Closing Quotes',category: 'features',configKey: 'editor.autoClosingQuotes',},
  {name: 'Auto Surround Selection',category: 'features',configKey: 'editor.autoSurround',},
  {name: 'Code Lens',category: 'features',configKey: 'editor.codeLens',},
  {name: 'Git Auto Fetch',category: 'features',configKey: 'git.autofetch',},
  {name: 'Git Decorations',category: 'features',configKey: 'git.decorations.enabled',},
  {name: 'Hover',category: 'features',configKey: 'editor.hover.enabled',},
  {name: 'IntelliSense',category: 'features',configKey: 'editor.quickSuggestions',},
  {name: 'Parameter Hints',category: 'features',configKey: 'editor.parameterHints.enabled',},
  {name: 'Suggest On Trigger Characters',category: 'features',configKey: 'editor.suggestOnTriggerCharacters',},

  // Separator
  {name: 'Advanced Features',category: 'debugging',isSeparator: true,},

  // Debugging & Terminal
  {name: 'Debug Console',category: 'debugging',configKey: 'debug.console.fontSize',},
  {name: 'Inline Values',category: 'debugging',configKey: 'debug.inlineValues',},
  {name: 'Terminal Cursor Blinking',category: 'debugging',configKey: 'terminal.integrated.cursorBlinking',},
];

/**
 * Get available editor controls for shortcut creator
 */
export function getAvailableEditorControls(): Array<{name: string, key: string, category: string}> {
  return editorControls
    .filter(control => control.configKey) // Only include controls with config keys
    .map(control => ({
      name: control.name,
      key: control.configKey!,
      category: control.category
    }));
}
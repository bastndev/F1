interface EditorControl {
  name: string;
  category: 'editor' | 'ui' | 'formatting' | 'features' | 'debugging';
  configKey?: string;
  commandId?: string; // Para comandos que no son configuraciones
  isSeparator?: boolean;
}

export const editorControls: EditorControl[] = [
  // Editor Visual Features
  {name: 'Minimap', category: 'editor', configKey: 'editor.minimap.enabled'},
  {name: 'Code Folding', category: 'editor', configKey: 'editor.folding'},
  {name: 'Line Numbers', category: 'editor', configKey: 'editor.lineNumbers'},
  {name: 'Cursor Blinking', category: 'editor', configKey: 'editor.cursorBlinking'},
  {name: 'Color Decorators', category: 'editor', configKey: 'editor.colorDecorators'},
  {name: 'Indent Guides', category: 'editor', configKey: 'editor.guides.indentation'},
  {name: 'Sticky Scroll', category: 'editor', configKey: 'editor.stickyScroll.enabled'},
  {name: 'Cursor Smooth Caret Animation', category: 'editor', configKey: 'editor.cursorSmoothCaretAnimation'},
  {name: 'Bracket Pair Colorization', category: 'editor', configKey: 'editor.bracketPairColorization.enabled'},
  {name: 'Bracket Pair Guides', category: 'editor', configKey: 'editor.guides.bracketPairs'},
  // NUEVOS que faltaban
  {name: 'Word Wrap', category: 'editor', configKey: 'editor.wordWrap'},
  {name: 'Render Whitespace', category: 'editor', configKey: 'editor.renderWhitespace'},
  {name: 'Render Control Characters', category: 'editor', configKey: 'editor.renderControlCharacters'},

  // UI Features  
  {name: 'Breadcrumbs', category: 'ui', configKey: 'breadcrumbs.enabled'},
  {name: 'Compact Folders', category: 'ui', configKey: 'explorer.compactFolders'},
  {name: 'Status Bar', category: 'ui', configKey: 'workbench.statusBar.visible'},
  {name: 'Tabs', category: 'ui', configKey: 'workbench.editor.showTabs'},
  // Estos necesitan commandId en lugar de configKey
  {name: 'Panel', category: 'ui', commandId: 'workbench.action.togglePanel'},
  {name: 'Side Bar', category: 'ui', commandId: 'workbench.action.toggleSidebarVisibility'},
  {name: 'Activity Bar', category: 'ui', commandId: 'workbench.action.toggleActivityBarVisibility'},
  // NUEVOS que faltaban
  {name: 'Menu Bar', category: 'ui', configKey: 'window.menuBarVisibility'},
  {name: 'Tab Size Badge', category: 'ui', configKey: 'workbench.editor.tabSizing'},

  // Formatting & Code Features
  {name: 'Auto Save', category: 'formatting', configKey: 'files.autoSave'},
  {name: 'Format On Paste', category: 'formatting', configKey: 'editor.formatOnPaste'},
  {name: 'Format On Save', category: 'formatting', configKey: 'editor.formatOnSave'},
  {name: 'Format On Type', category: 'formatting', configKey: 'editor.formatOnType'},
  {name: 'Insert Final Newline', category: 'formatting', configKey: 'files.insertFinalNewline'},
  {name: 'Trim Final Newlines', category: 'formatting', configKey: 'files.trimFinalNewlines'},
  {name: 'Trim Trailing Whitespace', category: 'formatting', configKey: 'files.trimTrailingWhitespace'},
  // NUEVOS que faltaban
  {name: 'Auto Indent', category: 'formatting', configKey: 'editor.autoIndent'},

  // IntelliSense & Features
  {name: 'Accept Suggestion On Enter', category: 'features', configKey: 'editor.acceptSuggestionOnEnter'},
  {name: 'Auto Closing Brackets', category: 'features', configKey: 'editor.autoClosingBrackets'},
  {name: 'Auto Closing Quotes', category: 'features', configKey: 'editor.autoClosingQuotes'},
  {name: 'Auto Surround Selection', category: 'features', configKey: 'editor.autoSurround'},
  {name: 'Code Lens', category: 'features', configKey: 'editor.codeLens'},
  {name: 'Git Auto Fetch', category: 'features', configKey: 'git.autofetch'},
  {name: 'Git Decorations', category: 'features', configKey: 'git.decorations.enabled'},
  {name: 'Hover', category: 'features', configKey: 'editor.hover.enabled'},
  {name: 'IntelliSense', category: 'features', configKey: 'editor.quickSuggestions'},
  {name: 'Parameter Hints', category: 'features', configKey: 'editor.parameterHints.enabled'},
  {name: 'Suggest On Trigger Characters', category: 'features', configKey: 'editor.suggestOnTriggerCharacters'},
  {name: 'Terminal Suggest', category: 'features', configKey: 'terminal.integrated.suggest.enabled'},
  // NUEVOS que faltaban
  {name: 'Auto Closing Delete', category: 'features', configKey: 'editor.autoClosingDelete'},
  {name: 'Auto Closing Over Type', category: 'features', configKey: 'editor.autoClosingOvertype'},
  {name: 'Tab Completion', category: 'features', configKey: 'editor.tabCompletion'},

  // Debugging & Terminal
  {name: 'Inline Values', category: 'debugging', configKey: 'debug.inlineValues'},
  {name: 'Terminal Cursor Blinking', category: 'debugging', configKey: 'terminal.integrated.cursorBlinking'},
  // Corregido: Debug Console como comando
  {name: 'Debug Console', category: 'debugging', commandId: 'workbench.debug.action.toggleRepl'},
  // NUEVOS que faltaban
  {name: 'Debug Toolbar', category: 'debugging', configKey: 'debug.toolBarLocation'},
  {name: 'Terminal Bell', category: 'debugging', configKey: 'terminal.integrated.enableBell'},
];

/**
 * Get available editor controls for shortcut creator
 */
export function getAvailableEditorControls(): Array<{name: string, key: string, category: string, type: 'config' | 'command'}> {
  return editorControls
    .filter(control => control.configKey || control.commandId)
    .map(control => ({
      name: control.name,
      key: control.configKey || control.commandId!,
      category: control.category,
      type: control.configKey ? 'config' : 'command'
    }));
}
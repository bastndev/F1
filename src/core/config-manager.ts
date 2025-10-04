import * as vscode from 'vscode';

export type ToggleAction = 'enable' | 'disable';

export interface ConfigToggleResult {
  actionType: ToggleAction;
  readableName: string;
  formattedValue: string;
}

export class ConfigManager {
  private static readonly configMappings: Record<string, { onValue: any; offValue: any }> = {
    'editor.lineNumbers': { onValue: 'on', offValue: 'off' },
    'files.autoSave': { onValue: 'afterDelay', offValue: 'off' },
    'editor.cursorBlinking': { onValue: 'blink', offValue: 'solid' },
    'editor.acceptSuggestionOnEnter': { onValue: 'on', offValue: 'off' },
    'editor.smoothScrolling': { onValue: true, offValue: false },
    'editor.bracketPairColorization.enabled': { onValue: true, offValue: false },
    'editor.bracketMatching': { onValue: true, offValue: false },
    'breadcrumbs.enabled': { onValue: true, offValue: false },
    'explorer.compactFolders': { onValue: true, offValue: false },
    'workbench.editor.enablePreview': { onValue: true, offValue: false },
    'workbench.sideBar.location': { onValue: 'left', offValue: 'right' }, // Note: this might need adjustment
    'workbench.statusBar.visible': { onValue: true, offValue: false },
    'workbench.editor.showTabs': { onValue: 'multiple', offValue: 'single' },
    'editor.tree.indent': { onValue: 4, offValue: 2 }, // Assuming default indent
    'editor.formatOnPaste': { onValue: true, offValue: false },
    'editor.formatOnSave': { onValue: true, offValue: false },
    'editor.formatOnType': { onValue: true, offValue: false },
    'editor.insertFinalNewline': { onValue: true, offValue: false },
    'files.trimTrailingWhitespace': { onValue: true, offValue: false },
    'editor.autoClosingBrackets': { onValue: 'always', offValue: 'never' },
    'editor.autoClosingQuotes': { onValue: 'always', offValue: 'never' },
    'editor.autoSurround': { onValue: 'languageDefined', offValue: 'never' },
    'editor.codeLens': { onValue: true, offValue: false },
    'git.autofetch': { onValue: true, offValue: false },
    'git.decorations.enabled': { onValue: true, offValue: false },
    'editor.hover.enabled': { onValue: true, offValue: false },
    'editor.suggestOnTriggerCharacters': { onValue: true, offValue: false },
    'editor.inlineSuggest.enabled': { onValue: true, offValue: false },
    'editor.parameterHints.enabled': { onValue: true, offValue: false },
    'debug.console.acceptSuggestionOnEnter': { onValue: true, offValue: false },
    'terminal.integrated.cursorBlinking': { onValue: true, offValue: false },
    'editor.inlayHints.enabled': { onValue: true, offValue: false },
  };

  private static readonly readableNames: Record<string, string> = {
    'editor.minimap.enabled': 'Minimap',
    'editor.folding': 'Code Folding',
    'editor.lineNumbers': 'Line Numbers',
    'editor.cursorBlinking': 'Cursor Blinking',
    'editor.colorDecorators': 'Color Decorators',
    'editor.renderIndentGuides': 'Indent Guides',
    'editor.stickyScroll.enabled': 'Sticky Scroll',
    'editor.smoothScrolling': 'Cursor Smooth Caret Animation',
    'editor.bracketPairColorization.enabled': 'Bracket PAIR Colorization',
    'editor.bracketMatching': 'Bracket LINE Colorization',
    'breadcrumbs.enabled': 'Breadcrumbs',
    'explorer.compactFolders': 'Compact Folders',
    'workbench.editor.enablePreview': 'Panel',
    'workbench.sideBar.location': 'Side Bar',
    'workbench.statusBar.visible': 'Status Bar',
    'workbench.editor.showTabs': 'Tabs',
    'editor.tree.indent': 'Tree Indent',
    'files.autoSave': 'Auto Save',
    'editor.formatOnPaste': 'Format On Paste',
    'editor.formatOnSave': 'Format On Save',
    'editor.formatOnType': 'Format On Type',
    'editor.insertFinalNewline': 'Insert Final Newline',
    'files.trimTrailingWhitespace': 'Trim Trailing Whitespace',
    'editor.acceptSuggestionOnEnter': 'Accept Suggestion On Enter',
    'editor.autoClosingBrackets': 'Auto Closing Brackets',
    'editor.autoClosingQuotes': 'Auto Closing Quotes',
    'editor.autoSurround': 'Auto Surround Selection',
    'editor.codeLens': 'Code Lens',
    'git.autofetch': 'Git Auto Fetch',
    'git.decorations.enabled': 'Git Decorations',
    'editor.hover.enabled': 'Hover',
    'editor.suggestOnTriggerCharacters': 'Suggest On Trigger Characters',
    'editor.inlineSuggest.enabled': 'IntelliSense',
    'editor.parameterHints.enabled': 'Parameter Hints',
    'debug.console.acceptSuggestionOnEnter': 'Debug Console',
    'terminal.integrated.cursorBlinking': 'Terminal Cursor Blinking',
    'editor.inlayHints.enabled': 'Inline Values',
  };

  public static async toggleConfiguration(configKey: string): Promise<ConfigToggleResult> {
    try {
      const config = vscode.workspace.getConfiguration();
      const currentValue = config.get(configKey);

      const newValue = this.calculateNewValue(configKey, currentValue);
      const actionType = this.determineActionType(configKey, currentValue, newValue);

      await config.update(configKey, newValue, vscode.ConfigurationTarget.Global);

      const readableName = this.getReadableName(configKey);
      const formattedValue = this.formatValue(newValue);

      console.log(`${readableName}: ${formattedValue}`);

      return { actionType, readableName, formattedValue };
    } catch (error) {
      console.warn(`Failed to toggle ${configKey}:`, error);
      return { actionType: 'disable', readableName: configKey, formattedValue: 'Error' };
    }
  }

  private static calculateNewValue(configKey: string, currentValue: any): any {
    const mapping = this.configMappings[configKey];
    if (mapping) {
      return currentValue === mapping.onValue ? mapping.offValue : mapping.onValue;
    }

    if (typeof currentValue === 'boolean') {
      return !currentValue;
    }

    // Default toggle for other types
    return !currentValue;
  }

  private static determineActionType(configKey: string, oldValue: any, newValue: any): ToggleAction {
    const mapping = this.configMappings[configKey];
    if (mapping) {
      // For mappings, check if newValue matches the "on" value
      return newValue === mapping.onValue ? 'enable' : 'disable';
    }

    if (typeof oldValue === 'boolean') {
      return newValue ? 'enable' : 'disable';
    }

    // For other types, assume enable if truthy
    return newValue ? 'enable' : 'disable';
  }

  private static getReadableName(configKey: string): string {
    return this.readableNames[configKey] || configKey;
  }

  private static formatValue(value: any): string {
    if (typeof value === 'boolean') {
      return value ? 'Enabled' : 'Disabled';
    }
    if (value === 'on' || value === 'afterDelay' || value === 'blink' || value === 'always' || value === 'languageDefined' || value === 'multiple') {
      return 'Enabled';
    }
    if (value === 'off' || value === 'solid' || value === 'never' || value === 'single') {
      return 'Disabled';
    }
    if (typeof value === 'number') {
      return value > 0 ? 'Enabled' : 'Disabled';
    }
    return String(value);
  }
}
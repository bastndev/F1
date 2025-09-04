import * as vscode from 'vscode';

interface EditorControl {
    name: string;
    category: 'editor' | 'ui' | 'formatting' | 'features' | 'debugging';
    configKey?: string; // Para futura implementación
}

class EditorControlsProvider implements vscode.TreeDataProvider<EditorControl> {
    private controls: EditorControl[] = [
        // Editor Visual Features
        { name: 'Minimap', category: 'editor', configKey: 'editor.minimap.enabled' },
        { name: 'Line Numbers', category: 'editor', configKey: 'editor.lineNumbers' },
        { name: 'Word Wrap', category: 'editor', configKey: 'editor.wordWrap' },
        { name: 'Code Folding', category: 'editor', configKey: 'editor.folding' },
        { name: 'Sticky Scroll', category: 'editor', configKey: 'editor.stickyScroll.enabled' },
        { name: 'Indent Guides', category: 'editor', configKey: 'editor.guides.indentation' },
        { name: 'Bracket Pair Colorization', category: 'editor', configKey: 'editor.bracketPairColorization.enabled' },
        { name: 'Color Decorators', category: 'editor', configKey: 'editor.colorDecorators' },
        { name: 'Cursor Blinking', category: 'editor', configKey: 'editor.cursorBlinking' },
        { name: 'Cursor Smooth Caret Animation', category: 'editor', configKey: 'editor.cursorSmoothCaretAnimation' },
        
        // UI Features
        { name: 'Breadcrumbs', category: 'ui', configKey: 'breadcrumbs.enabled' },
        { name: 'Activity Bar', category: 'ui', configKey: 'workbench.activityBar.visible' },
        { name: 'Status Bar', category: 'ui', configKey: 'workbench.statusBar.visible' },
        { name: 'Side Bar', category: 'ui', configKey: 'workbench.sideBar.location' },
        { name: 'Panel', category: 'ui', configKey: 'workbench.panel.defaultLocation' },
        { name: 'Tabs', category: 'ui', configKey: 'workbench.editor.showTabs' },
        { name: 'Compact Folders', category: 'ui', configKey: 'explorer.compactFolders' },
        { name: 'Tree Indent', category: 'ui', configKey: 'workbench.tree.indent' },
        
        // Formatting & Code Features
        { name: 'Format On Save', category: 'formatting', configKey: 'editor.formatOnSave' },
        { name: 'Format On Type', category: 'formatting', configKey: 'editor.formatOnType' },
        { name: 'Format On Paste', category: 'formatting', configKey: 'editor.formatOnPaste' },
        { name: 'Auto Save', category: 'formatting', configKey: 'files.autoSave' },
        { name: 'Trim Trailing Whitespace', category: 'formatting', configKey: 'files.trimTrailingWhitespace' },
        { name: 'Insert Final Newline', category: 'formatting', configKey: 'files.insertFinalNewline' },
        
        // IntelliSense & Features
        { name: 'IntelliSense', category: 'features', configKey: 'editor.quickSuggestions' },
        { name: 'Parameter Hints', category: 'features', configKey: 'editor.parameterHints.enabled' },
        { name: 'Hover', category: 'features', configKey: 'editor.hover.enabled' },
        { name: 'Code Lens', category: 'features', configKey: 'editor.codeLens' },
        { name: 'Auto Closing Brackets', category: 'features', configKey: 'editor.autoClosingBrackets' },
        { name: 'Auto Closing Quotes', category: 'features', configKey: 'editor.autoClosingQuotes' },
        { name: 'Auto Surround Selection', category: 'features', configKey: 'editor.autoSurround' },
        { name: 'Suggest On Trigger Characters', category: 'features', configKey: 'editor.suggestOnTriggerCharacters' },
        { name: 'Accept Suggestion On Enter', category: 'features', configKey: 'editor.acceptSuggestionOnEnter' },
        
        // Debugging & Terminal
        { name: 'Debug Console', category: 'debugging', configKey: 'debug.console.fontSize' },
        { name: 'Inline Values', category: 'debugging', configKey: 'debug.inlineValues' },
        { name: 'Terminal Cursor Blinking', category: 'debugging', configKey: 'terminal.integrated.cursorBlinking' },
        { name: 'Git Decorations', category: 'features', configKey: 'git.decorations.enabled' },
        { name: 'Git Auto Fetch', category: 'features', configKey: 'git.autofetch' }
    ];

    getTreeItem(element: EditorControl): vscode.TreeItem {
        const item = new vscode.TreeItem(element.name);
        item.tooltip = `Category: ${element.category}`;
        return item;
    }

    getChildren(): EditorControl[] {
        return this.controls.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Métodos para futura implementación
    getControlsByCategory(category: string): EditorControl[] {
        return this.controls.filter(control => control.category === category);
    }

    getControlByName(name: string): EditorControl | undefined {
        return this.controls.find(control => control.name === name);
    }
}

export function activate(context: vscode.ExtensionContext) {
    vscode.window.registerTreeDataProvider('f1-editor-controls', new EditorControlsProvider());
}

export function deactivate() {}
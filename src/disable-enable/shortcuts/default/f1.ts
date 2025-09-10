import * as vscode from 'vscode';

// Notifications wrap
function showWordWrapToggleNotification(isEnabled: boolean): void {
  const emoji = isEnabled ? '❌' : '✅';
  const status = isEnabled ? 'DISABLED' : 'ENABLED';
  vscode.window.showInformationMessage(`📝 Word Wrap ${status} ${emoji}`);
}

export function activate(context: vscode.ExtensionContext) {
  //================================================================
  // Toggle Word Wrap for All Files (F1) - Synchronized with Markdown
  //================================================================
  const toggleMarkdownWrap = vscode.commands.registerCommand(
    'f1.toggleMarkdownWrap',
    async () => {
      const config = vscode.workspace.getConfiguration();
      
      // Get current markdown word wrap state first (this will be our reference)
      const currentSetting = config.get('[markdown]') as any;
      const currentMarkdownWrap = currentSetting?.['editor.wordWrap'] || 'off';
      const newMarkdownWrap = currentMarkdownWrap === 'off' ? 'on' : 'off';
      
      try {
        // Synchronize general word wrap
        await config.update(
          'editor.wordWrap',
          newMarkdownWrap,
          vscode.ConfigurationTarget.Global
        );

        // Update markdown specific word wrap
        await config.update(
          '[markdown]',
          {
            'editor.formatOnSave': false,
            'editor.defaultFormatter': null,
            'editor.wordWrap': newMarkdownWrap,
          },
          vscode.ConfigurationTarget.Global
        );

        showWordWrapToggleNotification(newMarkdownWrap === 'on');
      } catch (error) {
        vscode.window.showErrorMessage(`Error toggling word wrap: ${error}`);
      }
    }
  );

  context.subscriptions.push(toggleMarkdownWrap);
}
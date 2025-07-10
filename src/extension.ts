import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "shuu" is now active!');

  const disposable = vscode.commands.registerCommand('shuu.helloWorld', () => {
    vscode.window.showInformationMessage('Hello World from Shuu!');
  });

  // Command to toggle markdown word wrap
  const toggleMarkdownWrap = vscode.commands.registerCommand(
    'shuu.toggleMarkdownWrap',
    async () => {
      const config = vscode.workspace.getConfiguration();
      const currentSetting = config.get('[markdown]') as any;

      // Get current wordWrap value for markdown
      const currentWordWrap = currentSetting?.['editor.wordWrap'] || 'off';

      // Toggle between 'on' and 'off'
      const newWordWrap = currentWordWrap === 'off' ? 'on' : 'off';

      // Update configuration
      await config.update(
        '[markdown]',
        {
          'editor.formatOnSave': false,
          'editor.defaultFormatter': null,
          'editor.wordWrap': newWordWrap,
        },
        vscode.ConfigurationTarget.Global
      );

      // Show status message
      const emoji = newWordWrap === 'on' ? '📝' : '🚫';
      const status = newWordWrap === 'on' ? 'enabled' : 'disabled';

      vscode.window.showInformationMessage(
        `${emoji} Markdown word wrap ${status}`
      );
    }
  );

  context.subscriptions.push(disposable, toggleMarkdownWrap);
}

export function deactivate() {}

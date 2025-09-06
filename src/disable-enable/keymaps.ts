import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  // Toggle Markdown Word Wrap (F1)
  const toggleMarkdownWrap = vscode.commands.registerCommand(
    'f1.toggleMarkdownWrap',
    async () => {
      const config = vscode.workspace.getConfiguration();
      const currentSetting = config.get('[markdown]') as any;
      const currentWordWrap = currentSetting?.['editor.wordWrap'] || 'off';
      const newWordWrap = currentWordWrap === 'off' ? 'on' : 'off';

      await config.update(
        '[markdown]',
        {
          'editor.formatOnSave': false,
          'editor.defaultFormatter': null,
          'editor.wordWrap': newWordWrap,
        },
        vscode.ConfigurationTarget.Global
      );

      // Show notification
      const status = newWordWrap === 'on' ? 'enabled' : 'disabled';
      vscode.window.showInformationMessage(`Markdown Word Wrap ${status}`);
    }
  );

  context.subscriptions.push(toggleMarkdownWrap);
}
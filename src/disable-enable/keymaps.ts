import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  // Toggle Word Wrap for All Files (F1)
  const toggleMarkdownWrap = vscode.commands.registerCommand(
    'f1.toggleMarkdownWrap',
    async () => {
      const config = vscode.workspace.getConfiguration();
      
      // Toggle general word wrap for all files
      const currentGeneralWrap = config.get('editor.wordWrap') as string;
      const newGeneralWrap = currentGeneralWrap === 'off' ? 'on' : 'off';
      
      await config.update(
        'editor.wordWrap',
        newGeneralWrap,
        vscode.ConfigurationTarget.Global
      );

      // Toggle markdown specific word wrap
      const currentSetting = config.get('[markdown]') as any;
      const currentMarkdownWrap = currentSetting?.['editor.wordWrap'] || 'off';
      const newMarkdownWrap = currentMarkdownWrap === 'off' ? 'on' : 'off';

      await config.update(
        '[markdown]',
        {
          'editor.formatOnSave': false,
          'editor.defaultFormatter': null,
          'editor.wordWrap': newMarkdownWrap,
        },
        vscode.ConfigurationTarget.Global
      );

      // Show notification
      const status = newGeneralWrap === 'on' ? 'enabled ✅' : 'disabled ❌';
      vscode.window.showInformationMessage(`Word Wrap ${status}`);
    }
  );

  context.subscriptions.push(toggleMarkdownWrap);
}
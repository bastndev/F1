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

  // Command to toggle word wrap for all files (F1 key)
  const toggleCodeFormatting = vscode.commands.registerCommand(
    'shuu.toggleCodeFormatting',
    async () => {
      const config = vscode.workspace.getConfiguration();
      
      // Get current wordWrap setting for all editors
      const currentWordWrap = config.get('editor.wordWrap') as string;
      
      // Toggle between 'on' and 'off'
      const newWordWrap = currentWordWrap === 'off' ? 'on' : 'off';
      
      // Update configuration globally
      await config.update(
        'editor.wordWrap',
        newWordWrap,
        vscode.ConfigurationTarget.Global
      );

      // Show status message
      const emoji = newWordWrap === 'on' ? '📖' : '📏';
      const status = newWordWrap === 'on' ? 'enabled' : 'disabled';

      vscode.window.showInformationMessage(
        `${emoji} Word wrap ${status}`
      );
    }
  );

  // Command to toggle minimap (F2 key)
  const toggleMinimap = vscode.commands.registerCommand(
    'shuu.toggleMinimap',
    async () => {
      const config = vscode.workspace.getConfiguration();
      
      // Get current minimap setting
      const currentMinimap = config.get('editor.minimap.enabled') as boolean;
      
      // Toggle the setting
      const newMinimap = !currentMinimap;
      
      // Update configuration globally
      await config.update(
        'editor.minimap.enabled',
        newMinimap,
        vscode.ConfigurationTarget.Global
      );

      // Show status message
      const emoji = newMinimap ? '🗺️' : '🚫';
      const status = newMinimap ? 'enabled' : 'disabled';

      vscode.window.showInformationMessage(
        `${emoji} Minimap ${status}`
      );
    }
  );

  // Command to toggle breadcrumbs (Ctrl+F2 key)
  const toggleBreadcrumbs = vscode.commands.registerCommand(
    'shuu.toggleBreadcrumbs',
    async () => {
      const config = vscode.workspace.getConfiguration();
      
      // Get current breadcrumbs setting
      const currentBreadcrumbs = config.get('breadcrumbs.enabled') as boolean;
      
      // Toggle the setting
      const newBreadcrumbs = !currentBreadcrumbs;
      
      // Update configuration globally
      await config.update(
        'breadcrumbs.enabled',
        newBreadcrumbs,
        vscode.ConfigurationTarget.Global
      );

      // Show status message
      const emoji = newBreadcrumbs ? '🍞' : '🚫';
      const status = newBreadcrumbs ? 'enabled' : 'disabled';

      vscode.window.showInformationMessage(
        `${emoji} Breadcrumbs ${status}`
      );
    }
  );

  context.subscriptions.push(disposable, toggleMarkdownWrap, toggleCodeFormatting, toggleMinimap, toggleBreadcrumbs);
}

export function deactivate() {}
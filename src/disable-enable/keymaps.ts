import * as vscode from 'vscode';

// Helper function for consistent notifications
function showToggleNotification(feature: string, isEnabled: boolean): void {
  const emoji = isEnabled ? '✅' : '❌';
  const status = isEnabled ? 'enabled' : 'disabled';
  vscode.window.showInformationMessage(`${feature} ${status} ${emoji}`);
}

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

      // Show notification using helper function
      showToggleNotification('Word Wrap', newGeneralWrap === 'on');
    }
  );

  //================================================================
  // Toggle AI Suggestions for All Files (Shift+F1)
  //================================================================
  const toggleAISuggestions = vscode.commands.registerCommand(
    'f1.toggleAISuggestions',
    async () => {
      const config = vscode.workspace.getConfiguration();

      // Get current AI suggestions settings
      const currentInlineSuggest = config.get('editor.inlineSuggest.enabled') as boolean;
      const currentCopilotInline = config.get('github.copilot.enable') as any;

      // Toggle the settings
      const newInlineSuggest = !currentInlineSuggest;

      try {
        // Update inline suggestions (affects most AI assistants)
        await config.update(
          'editor.inlineSuggest.enabled',
          newInlineSuggest,
          vscode.ConfigurationTarget.Global
        );

        // Update GitHub Copilot specific settings if available
        if (currentCopilotInline !== undefined) {
          await config.update(
            'github.copilot.enable',
            {
              "*": newInlineSuggest,
              "plaintext": newInlineSuggest,
              "markdown": newInlineSuggest,
              "scminput": newInlineSuggest
            },
            vscode.ConfigurationTarget.Global
          );
        }

        // Also toggle copilot inline suggestions if the setting exists
        const copilotInlineSuggest = config.get('github.copilot.inlineSuggest.enable');
        if (copilotInlineSuggest !== undefined) {
          await config.update(
            'github.copilot.inlineSuggest.enable',
            newInlineSuggest,
            vscode.ConfigurationTarget.Global
          );
        }

        // Show notification using helper function
        showToggleNotification('AI Suggestions', newInlineSuggest);

      } catch (error) {
        vscode.window.showErrorMessage(
          `Error toggling AI suggestions: ${error}`
        );
      }
    }
  );

  // Register commands
  context.subscriptions.push(toggleMarkdownWrap, toggleAISuggestions);
}
import * as vscode from 'vscode';

export function registerKeymapCommands(context: vscode.ExtensionContext) {
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

  // Command to toggle format on save (F3 key)
  const toggleFormatOnSave = vscode.commands.registerCommand(
    'shuu.toggleFormatOnSave',
    async () => {
      const config = vscode.workspace.getConfiguration();
      
      // Get current formatOnSave setting
      const currentFormatOnSave = config.get('editor.formatOnSave') as boolean;
      
      // Toggle the setting
      const newFormatOnSave = !currentFormatOnSave;
      
      // Update configuration globally
      await config.update(
        'editor.formatOnSave',
        newFormatOnSave,
        vscode.ConfigurationTarget.Global
      );

      // Show status message
      const emoji = newFormatOnSave ? '✨' : '🚫';
      const status = newFormatOnSave ? 'enabled' : 'disabled';

      vscode.window.showInformationMessage(
        `${emoji} Format on save ${status}`
      );
    }
  );

  // Command to toggle AI suggestions (F4 key)
  const toggleAISuggestions = vscode.commands.registerCommand(
    'shuu.toggleAISuggestions',
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

        // Show status message
        const emoji = newInlineSuggest ? '🤖' : '🚫';
        const status = newInlineSuggest ? 'enabled' : 'disabled';

        vscode.window.showInformationMessage(
          `${emoji} AI suggestions ${status}`
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error toggling AI suggestions: ${error}`
        );
      }
    }
  );

  // Command to toggle hover (F5 key)
  const toggleHover = vscode.commands.registerCommand(
    'shuu.toggleHover',
    async () => {
      const config = vscode.workspace.getConfiguration();
      
      // Get current hover setting
      const currentHover = config.get('editor.hover.enabled') as boolean;
      
      // Toggle the setting
      const newHover = !currentHover;
      
      // Update configuration globally
      await config.update(
        'editor.hover.enabled',
        newHover,
        vscode.ConfigurationTarget.Global
      );

      // Show status message
      const emoji = newHover ? '👀' : '🚫';
      const status = newHover ? 'enabled' : 'disabled';

      vscode.window.showInformationMessage(
        `${emoji} Hover ${status}`
      );
    }
  );

  // Command to toggle folding (F6 key)
  const toggleFolding = vscode.commands.registerCommand(
    'shuu.toggleFolding',
    async () => {
      const config = vscode.workspace.getConfiguration();
      
      // Get current folding setting
      const currentFolding = config.get('editor.folding') as boolean;
      
      // Toggle the setting
      const newFolding = !currentFolding;
      
      // Update configuration globally
      await config.update(
        'editor.folding',
        newFolding,
        vscode.ConfigurationTarget.Global
      );

      // Show status message
      const emoji = newFolding ? '📁' : '🚫';
      const status = newFolding ? 'enabled' : 'disabled';

      vscode.window.showInformationMessage(
        `${emoji} Code folding ${status}`
      );
    }
  );

  // Command to toggle sticky scroll (F7 key)
  const toggleStickyScroll = vscode.commands.registerCommand(
    'shuu.toggleStickyScroll',
    async () => {
      const config = vscode.workspace.getConfiguration();
      
      // Get current sticky scroll setting
      const currentStickyScroll = config.get('editor.stickyScroll.enabled') as boolean;
      
      // Toggle the setting
      const newStickyScroll = !currentStickyScroll;
      
      // Update configuration globally
      await config.update(
        'editor.stickyScroll.enabled',
        newStickyScroll,
        vscode.ConfigurationTarget.Global
      );

      // Show status message
      const emoji = newStickyScroll ? '📌' : '🚫';
      const status = newStickyScroll ? 'enabled' : 'disabled';

      vscode.window.showInformationMessage(
        `${emoji} Sticky scroll ${status}`
      );
    }
  );

  // Command to toggle compact folders (F8 key)
  const toggleCompactFolders = vscode.commands.registerCommand(
    'shuu.toggleCompactFolders',
    async () => {
      const config = vscode.workspace.getConfiguration();
      
      // Get current compact folders setting
      const currentCompactFolders = config.get('explorer.compactFolders') as boolean;
      
      // Toggle the setting
      const newCompactFolders = !currentCompactFolders;
      
      // Update configuration globally
      await config.update(
        'explorer.compactFolders',
        newCompactFolders,
        vscode.ConfigurationTarget.Global
      );

      // Show status message
      const emoji = newCompactFolders ? '📂' : '📁';
      const status = newCompactFolders ? 'enabled (compact)' : 'disabled (expanded)';

      vscode.window.showInformationMessage(
        `${emoji} Compact folders ${status}`
      );
    }
  );

  context.subscriptions.push(
    disposable, 
    toggleMarkdownWrap, 
    toggleCodeFormatting, 
    toggleMinimap, 
    toggleBreadcrumbs, 
    toggleFormatOnSave, 
    toggleAISuggestions,
    toggleHover,
    toggleFolding,
    toggleStickyScroll,
    toggleCompactFolders
  );
}
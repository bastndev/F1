export interface ShortcutItem {
  label: string;
  key: string;
  command: string;
  isDefault?: boolean;
}

export class MyListUI {
  static generateShortcutsHTML(): string {
    const defaultShortcuts: ShortcutItem[] = [
      {
        label: 'Toggle word Wrap',
        key: 'F1',
        command: 'Toggle Word Wrap',
        isDefault: true,
      },
      {
        label: 'AI suggestion (disable/enable)',
        key: 'Shift+F1',
        command: 'Toggle AI',
        isDefault: true,
      },
    ];

    const userShortcuts: ShortcutItem[] = [
      { label: 'Test 🧪', key: 'Ctrl+B', command: 'Toggle Terminal' },
      { label: 'Test 🧪', key: 'Ctrl+B', command: 'Command Palette' },
      { label: 'Test 🧪', key: 'Ctrl+B', command: 'Quick Open' },
      { label: 'Test 🧪', key: 'Ctrl+B', command: 'Toggle Sidebar' },
      { label: 'Test 🧪', key: 'Ctrl+B', command: 'Toggle Sidebar' },
      { label: 'Test 🧪', key: 'Ctrl+B', command: 'Toggle Sidebar' },
      { label: 'Test 🧪', key: 'Ctrl+B', command: 'Toggle Sidebar' },
    ];

    return `
            <div class="shortcuts-container">
                ${defaultShortcuts
                  .map(
                    (shortcut) => `
                    <div class="shortcut-item default" onclick="executeCommand('${shortcut.command}')">
                        <span>${shortcut.label}</span>
                        <span class="shortcut-key">${shortcut.key}</span>
                    </div>
                `
                  )
                  .join('')}
                
                <div class="user-line"></div>
                
                ${userShortcuts
                  .map(
                    (shortcut) => `
                    <div class="shortcut-item" onclick="executeCommand('${shortcut.command}')">
                        <span>${shortcut.label}</span>
                        <span class="shortcut-key">${shortcut.key}</span>
                    </div>
                `
                  )
                  .join('')}
            </div>
        `;
  }
}

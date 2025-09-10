export interface ShortcutItem {
  label: string;
  key: string;
  // command: string;
  isDefault?: boolean;
}

export class MyListUI {
  static generateShortcutsHTML(): string {
    const defaultShortcuts: ShortcutItem[] = [
      {
        label: 'Toggle word Wrap',
        key: 'F1',
        // command: '',
        isDefault: true,
      },
      {
        label: 'AI suggestion (disable/enable)',
        key: 'Shift+F1',
        // command: '',
        isDefault: true,
      },
    ];

    const userShortcuts: ShortcutItem[] = [
      { label: 'Test 1 🧪', key: 'Ctrl+B' },
      { label: 'Test 2 🧪', key: 'Ctrl+B' },
      { label: 'Test 3 🧪', key: 'Ctrl+B' },
      { label: 'Test 4 🧪', key: 'Ctrl+B' },
      { label: 'Test 5 🧪', key: 'Ctrl+B' },
      { label: 'Test 6 🧪', key: 'Ctrl+B' },
      { label: 'Test 7 🧪', key: 'Ctrl+B' },
    ];

    return `
            <div class="shortcuts-container">
                ${defaultShortcuts
                  .map(
                    (shortcut) => `
                    <div class="shortcut-item default" title="DEFAULT">
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
                    <div class="shortcut-item user-delete">
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

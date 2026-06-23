<div align="center">

[![Lynx F1](https://raw.githubusercontent.com/bastndev/F1/refs/heads/main/public/banner.webp)](https://www.gohit.xyz/extension/f1)

<p>
  <img src="https://vsmarketplacebadges.dev/version-short/bastndev.f1.jpg?style=for-the-badge&colorA=000000&colorB=FFFFFF&label=VERSION" alt="Version">&nbsp;
  <img src="https://vsmarketplacebadges.dev/downloads-short/bastndev.f1.jpg?style=for-the-badge&colorA=000000&colorB=FFFFFF&label=Downloads" alt="Downloads">&nbsp;
  <img src="https://vsmarketplacebadges.dev/rating-short/bastndev.f1.jpg?style=for-the-badge&colorA=000000&colorB=FFFFFF&label=RATING" alt="Rating">&nbsp;
  <a href="https://github.com/bastndev/F1"><img src="https://raw.githubusercontent.com/bastndev/F1/refs/heads/main/public/github/icons/star.png" width="26.6px" alt="Github Star ⭐️"></a>
</p>

<p >
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_ES.md">Español 🇪🇸</a> |
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_ZH.md">中文 🇨🇳</a> |
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_DE.md">Deutsch 🇩🇪</a> |
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_FR.md">Français 🇫🇷</a> |
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_JA.md">日本語 🇯🇵</a> |
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_KO.md">한국어 🇰🇷</a> |
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_PT.md">Português 🇧🇷</a> |
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_RU.md">Русский 🇷🇺</a> |
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_VI.md">Tiếng Việt 🇻🇳</a> |
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_HI.md">हिन्दी 🇮🇳</a> |
  <a href="https://github.com/bastndev/F1/blob/main/public/docs/README_AR.md">العربية 🇸🇦</a><span>...</span>
</p>

**Запускайте и управляйте всеми ИИ-агентами (CLI) из одной панели VS Code.**

</div>

---

F1 превращает VS Code в центр для ИИ-агентов. Открывайте **Claude Code, Codex, Copilot, Cursor, Kiro, Kilo Code, OpenCode, Grok, Antigravity** — или любой другой CLI — во встроенных терминалах, мгновенно переключайтесь между ними, пишите лучшие промпты и сохраняйте контекст проекта доступным для загрузки каждым агентом.

## ⌨️ Горячие клавиши

| Команда                   | 🍎 macOS            | 🟦 Windows             | 🐧 Linux               | Поддерживается |
| :------------------------ | :------------------ | :--------------------- | :--------------------- | --------- |
| Фокус на CLI              | `F1`                | `F1`                   | `F1`                   | ㅤㅤ✅    |
| Фокус на Skills           | `⌘ + 3`             | `Ctrl + 3`             | `Ctrl + 3`             | ㅤㅤ✅    |
| Развернуть / Свернуть панель | <code>⌘ + \`</code> | <code>Ctrl + \`</code> | <code>Ctrl + \`</code> | ㅤㅤ✅    |
| -                         | -                   | -                      | -                      |           |
| Боковая панель (П/Л)      | `⌘ + CapsLock`      | `Ctrl + CapsLock`      | `Ctrl + CapsLock`      | ㅤㅤ✅    |

---

<h2 align="center">:: Особенности ::</h2>

### 🖥️ CLI Hub

- Запускайте несколько ИИ CLI рядом во встроенных терминалах [xterm.js](https://xtermjs.org/).
- Панель быстрого поиска для выбора агента; нажмите **F1**, чтобы сразу перейти к панели.
- Встроенные инструменты в каждой сессии:
  - **Prompt** — богатый редактор с упоминаниями файлов через `@`, вставкой изображений, чипами навыков (skills), проверкой орфографии в реальном времени и переводом на английский перед отправкой.
  - **Translator** — переводите любое выделение в терминале прямо на месте.
  - **Use** — просмотр использования / статуса каждого CLI.
  - **Keymaps** — справочник по горячим клавишам.
- **Voice** — чтение ответов вслух, плюс дополнительный звуковой сигнал "ding", когда агент заканчивает работу, пока вы заняты чем-то другим.

### 🧩 My Skills

- Устанавливайте навыки из маркетплейса — источники **All‑time**, **Trending (24h)**, **🔥 Flame** и **Official**.
- Создавайте навыки с помощью генераторов с подсказками для `AGENTS.md`, `CLAUDE.md` и `DESIGN.md`, а также быстрых шаблонов по категориям.
- Управляйте локальными и сохраненными навыками в каждом рабочем пространстве.

### 🧠 My Memory

- Генерируйте зафиксированную карту контекста проекта `.f1/`, чтобы любой CLI запускался с общим и легким контекстом.
- Переключатель для каждого проекта; файлы инструкций (`AGENTS.md` / `CLAUDE.md`) остаются привязанными к контексту.

## 🚀 Начало работы

1. Установите **F1** из [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=bastndev.f1).
2. Нажмите **`F1`**, чтобы открыть панель **CLI Hub**.
3. Выберите агента из списка (или **Custom CLI**, чтобы запустить свою команду).
4. Откройте **My Skills** на панели активности (**`Ctrl+3`**), чтобы установить или создать навыки.

> При первом запуске агента устанавливается его CLI, если его еще нет в вашем `PATH`.

<br>

---

## Установка

### Метод 1 — Быстрое открытие (Quick Open)

Запустите _Quick Open_ в зависимости от вашей операционной системы:

- <img src="https://www.kernel.org/theme/images/logos/favicon.png" width=16 height=16/> Linux `Ctrl+P`
- <img src="https://developer.apple.com/favicon.ico" width=16 height=16/> macOS `⌘P`
- <img src="https://www.microsoft.com/favicon.ico" width=16 height=16/> Windows `Ctrl+P`

Вставьте следующую команду и нажмите `Enter`:

```bash
ext install bastndev.f1
```

### Метод 2 — Вкладка "Расширения" (Extensions)

1. Откройте Расширения (`Ctrl+Shift+X` / `⌘+Shift+X`)
2. Найдите **"F1"** (издатель: `bastndev`)
3. Нажмите **Install**

<br>

---

## Обо мне

| [![gohitx](https://github.com/gohitx.png?size=100)](https://gohit.xyz) |
| :--------------------------------------------------------------------: |
|                  **[Gohit X](https://gohit.xyz/me)**                   |
|                         _Создатель & Мейнтейнер_                       |

- 🐦 **[X](https://x.com/intent/follow?screen_name=gohitx)** : Для вопросов и обсуждений.
- 🌱 **[IG](https://instagram.com/gohitx)** : **`новое`** – Превью проектов и новости из жизни.
- 🔴 **[YouTube](https://www.youtube.com/@gohitx?sub_confirmation=1)** : Код, программное обеспечение и инсайты разработки.

<br>

---

## Спонсоры

Спасибо всем, кто поддерживает этот проект! Ваши взносы делают возможными обновления и новые расширения.

<div align="center">
  <table>
    <tr>
      <td align="center" width="20%">
        <img src="https://avatars.githubusercontent.com/u/22199520?v=4" width="80" height="80" style="border-radius: 50%;" alt="Sponsor M"/>
        <br><b>M</b>
      </td>
    </tr>
  </table>
  <br>
  <em>Спасибо всем нашим замечательным спонсорам! 💖</em><br>
  <a href="https://github.com/sponsors/bastndev"><b>👉 Стать спонсором</b></a>
</div>

<br>

<h2 align="center">
  Дополнительные расширения 🧩 
</h2>

| Расширение                                                                                                                                                                                                         | Название                                                           | Описание                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [![Lynx Theme Pro](https://bastndev.gallerycdn.vsassets.io/extensions/bastndev/lynx-theme/5.0.1/1777191854738/Microsoft.VisualStudio.Services.Icons.Default)](https://open-vsx.org/extension/bastndev/lynx-theme) | [Lynx Theme Pro](https://github.com/bastndev/Lynx-Theme)       | Профессиональное расширение с шестью доступными темами: Dark, Light, Night, Ghibli, Coffee и Kiro—с интегрированными иконками. Каждая тема оптимизирована для более приятного визуального восприятия.                                       |
| [![Lynx Keymap Pro](https://open-vsx.org/api/bastndev/lynx-keymap/2.6.0/file/icon.png)](https://open-vsx.org/extension/bastndev/lynx-keymap)                                                                      | [Lynx Keymap Pro](https://github.com/bastndev/Lynx-Keymap-Pro) | Стандартизирует горячие клавиши во всех редакторах кода, предоставляя вам мгновенный доступ к любым функциям с помощью одной комбинации клавиш — улучшая ваш рабочий процесс. **`Теперь включает шорткаты для 75% клавиатур`** |
| [![ATM](https://open-vsx.org/api/bastndev/atm/1.9.4/file/icon.png)](https://open-vsx.org/extension/bastndev/atm)                                                                                                  | [ATM](https://github.com/bastndev/atm)                         | Набор инструментов "все-в-одном" 👻, который улучшает ваш рабочий процесс с помощью важных функций, таких как Error Lens, Git Blame, Env Protection и скриншоты кода в основных редакторах.                                                           |

<br>

<div align="center">
  
  **Наслаждайтесь 🎉 — (F1) теперь установлено!**  
  *Если вы найдете какие-либо ошибки или у вас есть отзывы, не стесняйтесь [открыть issue](https://github.com/bastndev/F1/issues/new).*

<sub>Сделано в 🇵🇪 <a href="https://gohit.xyz">Gohit X</a> · Лицензировано под <a href="https://github.com/bastndev/F1/blob/main/LICENSE">`MIT`</a></sub>

</div>

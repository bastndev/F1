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

**Inicie y gestione cada CLI de programación de IA desde un solo panel de VS Code.**

</div>

---

F1 convierte VS Code en un centro para agentes de programación de IA. Abra **Claude Code, Codex, Copilot, Cursor, Kiro, Kilo Code, OpenCode, Grok, Antigravity** — o cualquier CLI personalizado — en terminales integrados, cambie entre ellos instantáneamente, escriba mejores prompts, y mantenga el contexto de su proyecto fácil de cargar para cada agente.

## ⌨️ Atajos de teclado

| Comando                   | 🍎 macOS            | 🟦 Windows             | 🐧 Linux               | Soportado |
| :------------------------ | :------------------ | :--------------------- | :--------------------- | --------- |
| Enfocar el CLI            | `F1`                | `F1`                   | `F1`                   | ㅤㅤ✅    |
| Enfocar las Skills        | `⌘ + 3`             | `Ctrl + 3`             | `Ctrl + 3`             | ㅤㅤ✅    |
| Maximizar / Minimizar Panel | <code>⌘ + \`</code> | <code>Ctrl + \`</code> | <code>Ctrl + \`</code> | ㅤㅤ✅    |
| -                         | -                   | -                      | -                      |           |
| Panel Lateral (D/I)          | `⌘ + CapsLock`      | `Ctrl + CapsLock`      | `Ctrl + CapsLock`      | ㅤㅤ✅    |

---

<br>

<h2 align="center"> Características </h2>

### 🖥️ CLI Hub

- Ejecute múltiples CLIs de programación de IA lado a lado en terminales [xterm.js](https://xtermjs.org/) integrados.
- Lanzador de búsqueda difusa para elegir un agente; presione **F1** para saltar directamente al panel.
- Herramientas integradas junto a cada sesión:
  - **Prompt** — editor enriquecido con menciones `@`-file, pegado de imágenes, chips de skills, revisión ortográfica en vivo y traducción origen→Inglés antes de enviar.
  - **Translator** — traduzca cualquier selección del terminal en línea.
  - **Use** — vista de uso / estado por CLI.
  - **Keymaps** — referencia de atajos de teclado.
- **Voice** — lea las respuestas en voz alta, más un "ding" opcional cuando un agente termine mientras su atención está en otra parte.

### 🧩 My Skills

- Instale skills del marketplace — fuentes **All‑time**, **Trending (24h)**, **🔥 Flame** y **Official**.
- Cree skills con generadores guiados para `AGENTS.md`, `CLAUDE.md` y `DESIGN.md`, más plantillas rápidas por categoría.
- Gestione skills locales y guardadas por espacio de trabajo.

### 🧠 My Memory

- Genere un mapa de contexto del proyecto `.f1/` comprometido para que cualquier CLI inicie con un contexto compartido y barato.
- Activador por proyecto; los archivos de instrucciones (`AGENTS.md` / `CLAUDE.md`) se mantienen apuntados al contexto.

## 🚀 Empezando

1. Instale **F1** desde el [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=bastndev.f1).
2. Presione **`F1`** para abrir el panel **CLI Hub**.
3. Elija un agente desde el lanzador (o **Custom CLI** para ejecutar su propio comando).
4. Abra **My Skills** desde la barra de actividades (**`Ctrl+3`**) para instalar o crear skills.

> El primer inicio de un agente instala su CLI si aún no está en su `PATH`.

<br>

---

## Instalación

### Método 1 — Apertura Rápida

Inicie _Quick Open_ dependiendo de su sistema operativo:

- <img src="https://www.kernel.org/theme/images/logos/favicon.png" width=16 height=16/> Linux `Ctrl+P`
- <img src="https://developer.apple.com/favicon.ico" width=16 height=16/> macOS `⌘P`
- <img src="https://www.microsoft.com/favicon.ico" width=16 height=16/> Windows `Ctrl+P`

Pegue el siguiente comando y presione `Enter`:

```bash
ext install bastndev.f1
```

### Método 2 — Vista de Extensiones

1. Abra Extensiones (`Ctrl+Shift+X` / `⌘+Shift+X`)
2. Busque **"F1"** (editor: `bastndev`)
3. Haga clic en **Instalar**

<br>

---

## Sobre mí

| [![gohitx](https://github.com/gohitx.png?size=100)](https://gohit.xyz) |
| :--------------------------------------------------------------------: |
|                  **[Gohit X](https://gohit.xyz/me)**                   |
|                         _Creador y Mantenedor_                         |

- 🐦 **[X](https://x.com/intent/follow?screen_name=gohitx)** : Para preguntas y discusiones.
- 🌱 **[IG](https://instagram.com/gohitx)** : **`nuevo`** – Vistas previas de proyectos y actualizaciones de vida.
- 🔴 **[YouTube](https://www.youtube.com/@gohitx?sub_confirmation=1)** : Código, Software y perspectivas de desarrollo.

<br>

---

## Patrocinadores

¡Gracias a todos los que apoyan este proyecto! Sus contribuciones hacen posibles las actualizaciones y nuevas extensiones.

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
  <em>¡Gracias a todos nuestros increíbles patrocinadores! 💖</em><br>
  <a href="https://github.com/sponsors/bastndev"><b>👉 Conviértete en patrocinador</b></a>
</div>

<br>

<h2 align="center">
  Extensiones Complementarias 🧩 
</h2>

| Extensión                                                                                                                                                                                                         | Nombre                                                           | Descripción                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [![Lynx Theme Pro](https://open-vsx.org/api/bastndev/lynx-theme/5.0.0/file/icon.png)](https://open-vsx.org/extension/bastndev/lynx-theme) | [Lynx Theme Pro](https://github.com/bastndev/Lynx-Theme)       | Una extensión profesional con seis temas disponibles: Dark, Light, Night, Ghibli, Coffee y Kiro—con íconos integrados. Cada tema está optimizado para ofrecer una experiencia visual más placentera.                                       |
| [![Lynx Keymap Pro](https://open-vsx.org/api/bastndev/lynx-keymap/2.6.0/file/icon.png)](https://open-vsx.org/extension/bastndev/lynx-keymap)                                                                      | [Lynx Keymap Pro](https://github.com/bastndev/Lynx-Keymap-Pro) | Estandariza los atajos de teclado en todos los editores de código, dándote acceso instantáneo a cualquier funcionalidad con una sola combinación de teclas — mejorando tu flujo de trabajo y experiencia de desarrollo. **`Ahora incluye atajos para teclados del 75%`** |
| [![ATM](https://open-vsx.org/api/bastndev/atm/1.9.4/file/icon.png)](https://open-vsx.org/extension/bastndev/atm)                                                                                                  | [ATM](https://github.com/bastndev/atm)                         | Un kit de herramientas todo-en-uno 👻 que potencia tu flujo de trabajo con características esenciales como Error Lens, Git Blame, Env Protection y capturas de pantalla de código en los principales editores.                                                           |

<br>

<div align="center">
  
  **¡Disfruta! 🎉 — ¡(F1) ahora está instalado!**  
  *Si encuentras algún error o tienes comentarios, no dudes en [abrir un issue](https://github.com/bastndev/F1/issues/new).*

<sub>Hecho en 🇵🇪 por <a href="https://gohit.xyz">Gohit X</a> · Licenciado bajo <a href="https://github.com/bastndev/F1/blob/main/LICENSE">`MIT`</a></sub>

</div>

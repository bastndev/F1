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

**Inicie e gerencie cada CLI de codificação de IA a partir de um único painel do VS Code.**

</div>

---

O F1 transforma o VS Code em um hub para agentes de codificação de IA. Abra **Claude Code, Codex, Copilot, Cursor, Kiro, Kilo Code, OpenCode, Grok, Antigravity** — ou qualquer CLI personalizado — em terminais incorporados, alterne entre eles instantaneamente, escreva prompts melhores e mantenha o contexto do seu projeto leve para carregar para cada agente.

## ⌨️ Atalhos de teclado

| Comando                   | 🍎 macOS            | 🟦 Windows             | 🐧 Linux               | Suportado |
| :------------------------ | :------------------ | :--------------------- | :--------------------- | --------- |
| Focar o CLI               | `F1`                | `F1`                   | `F1`                   | ㅤㅤ✅    |
| Focar as Skills           | `⌘ + 3`             | `Ctrl + 3`             | `Ctrl + 3`             | ㅤㅤ✅    |
| Maximizar / Minimizar Painel | <code>⌘ + \`</code> | <code>Ctrl + \`</code> | <code>Ctrl + \`</code> | ㅤㅤ✅    |
| -                         | -                   | -                      | -                      |           |
| Painel Lateral (D/E)      | `⌘ + CapsLock`      | `Ctrl + CapsLock`      | `Ctrl + CapsLock`      | ㅤㅤ✅    |

---

<h2 align="center"> Recursos </h2>

### 🖥️ CLI Hub

- Execute várias CLIs de codificação de IA lado a lado em terminais [xterm.js](https://xtermjs.org/) incorporados.
- Lançador de pesquisa difusa para escolher um agente; pressione **F1** para ir direto para o painel.
- Ferramentas integradas ao lado de cada sessão:
  - **Prompt** — editor rico com menções de arquivo `@`, colagem de imagens, chips de skills, verificação ortográfica ao vivo e tradução da origem para o inglês antes do envio.
  - **Translator** — traduza qualquer seleção do terminal inline.
  - **Use** — visão de uso / status por CLI.
  - **Keymaps** — referência de atalhos de teclado.
- **Voice** — leia as respostas em voz alta, mais um "ding" opcional quando um agente termina enquanto sua atenção está em outro lugar.

### 🧩 My Skills

- Instale skills do marketplace — fontes **All‑time**, **Trending (24h)**, **🔥 Flame**, e **Official**.
- Crie skills com geradores guiados para `AGENTS.md`, `CLAUDE.md`, e `DESIGN.md`, além de modelos rápidos por categoria.
- Gerencie skills locais e salvas por espaço de trabalho.

### 🧠 My Memory

- Gere um mapa de contexto de projeto `.f1/` comprometido para que qualquer CLI inicie com um contexto compartilhado e leve.
- Alternância por projeto; arquivos de instrução (`AGENTS.md` / `CLAUDE.md`) permanecem apontados para o contexto.

## 🚀 Começando

1. Instale o **F1** no [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=bastndev.f1).
2. Pressione **`F1`** para abrir o painel **CLI Hub**.
3. Escolha um agente no lançador (ou **Custom CLI** para executar seu próprio comando).
4. Abra **My Skills** na barra de atividades (**`Ctrl+3`**) para instalar ou criar skills.

> A primeira inicialização de um agente instala sua CLI se ela ainda não estiver em seu `PATH`.

<br>

---

## Instalação

### Método 1 — Abertura Rápida

Inicie o _Quick Open_ dependendo do seu sistema operacional:

- <img src="https://www.kernel.org/theme/images/logos/favicon.png" width=16 height=16/> Linux `Ctrl+P`
- <img src="https://developer.apple.com/favicon.ico" width=16 height=16/> macOS `⌘P`
- <img src="https://www.microsoft.com/favicon.ico" width=16 height=16/> Windows `Ctrl+P`

Cole o seguinte comando e pressione `Enter`:

```bash
ext install bastndev.f1
```

### Método 2 — Visualização de Extensões

1. Abra as Extensões (`Ctrl+Shift+X` / `⌘+Shift+X`)
2. Pesquise por **"F1"** (editor: `bastndev`)
3. Clique em **Instalar**

<br>

---

## Sobre mim

| [![gohitx](https://github.com/gohitx.png?size=100)](https://gohit.xyz) |
| :--------------------------------------------------------------------: |
|                  **[Gohit X](https://gohit.xyz/me)**                   |
|                         _Criador & Mantenedor_                         |

- 🐦 **[X](https://x.com/intent/follow?screen_name=gohitx)** : Para dúvidas e discussões.
- 🌱 **[IG](https://instagram.com/gohitx)** : **`novo`** – Prévias de projetos & atualizações.
- 🔴 **[YouTube](https://www.youtube.com/@gohitx?sub_confirmation=1)** : Código, Software e insights de desenvolvimento.

<br>

---

## Patrocinadores

Obrigado a todos que apoiam este projeto! Suas contribuições tornam atualizações e novas extensões possíveis.

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
  <em>Obrigado a todos os nossos incríveis patrocinadores! 💖</em><br>
  <a href="https://github.com/sponsors/bastndev"><b>👉 Torne-se um patrocinador</b></a>
</div>

<br>

<h2 align="center">
  Extensões Complementares 🧩 
</h2>

| Extensão                                                                                                                                                                                                         | Nome                                                           | Descrição                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [![Lynx Theme Pro](https://bastndev.gallerycdn.vsassets.io/extensions/bastndev/lynx-theme/5.0.1/1777191854738/Microsoft.VisualStudio.Services.Icons.Default)](https://open-vsx.org/extension/bastndev/lynx-theme) | [Lynx Theme Pro](https://github.com/bastndev/Lynx-Theme)       | Uma extensão profissional com seis temas disponíveis: Dark, Light, Night, Ghibli, Coffee e Kiro—com ícones integrados. Cada tema é otimizado para oferecer uma experiência visual mais agradável.                                       |
| [![Lynx Keymap Pro](https://open-vsx.org/api/bastndev/lynx-keymap/2.6.0/file/icon.png)](https://open-vsx.org/extension/bastndev/lynx-keymap)                                                                      | [Lynx Keymap Pro](https://github.com/bastndev/Lynx-Keymap-Pro) | Padroniza atalhos de teclado em todos os editores de código, dando-lhe acesso instantâneo a qualquer funcionalidade com uma única combinação de teclas — melhorando seu fluxo de trabalho e experiência de desenvolvimento. **`Agora inclui atalhos para teclados de 75%`** |
| [![ATM](https://open-vsx.org/api/bastndev/atm/1.9.4/file/icon.png)](https://open-vsx.org/extension/bastndev/atm)                                                                                                  | [ATM](https://github.com/bastndev/atm)                         | Um kit de ferramentas completo 👻 que aprimora seu fluxo de trabalho com recursos essenciais como Error Lens, Git Blame, Env Protection e capturas de tela de código nos principais editores.                                                           |

<br>

<div align="center">
  
  **Aproveite 🎉 — (F1) agora está instalado!**  
  *Se você encontrar algum bug ou tiver feedback, sinta-se à vontade para [abrir um problema](https://github.com/bastndev/F1/issues/new).*

<sub>Feito no 🇵🇪 por <a href="https://gohit.xyz">Gohit X</a> · Licenciado sob <a href="https://github.com/bastndev/F1/blob/main/LICENSE">`MIT`</a></sub>

</div>

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

**하나의 VS Code 패널에서 모든 AI 코딩 CLI를 실행하고 관리하세요.**

</div>

---

F1은 VS Code를 AI 코딩 에이전트의 허브로 바꿉니다. 내장된 터미널에서 **Claude Code, Codex, Copilot, Cursor, Kiro, Kilo Code, OpenCode, Grok, Antigravity** — 또는 사용자 정의 CLI —를 열고 즉시 전환하며, 더 나은 프롬프트를 작성하고, 모든 에이전트가 저렴하게 불러올 수 있도록 프로젝트 컨텍스트를 유지하세요.

## ⌨️ 키보드 단축키

| 명령                    | 🍎 macOS            | 🟦 Windows             | 🐧 Linux               | 지원 |
| :------------------------ | :------------------ | :--------------------- | :--------------------- | --------- |
| CLI 포커스              | `F1`                | `F1`                   | `F1`                   | ㅤㅤ✅    |
| 스킬 포커스           | `⌘ + 3`             | `Ctrl + 3`             | `Ctrl + 3`             | ㅤㅤ✅    |
| 패널 최대화 / 최소화 | <code>⌘ + \`</code> | <code>Ctrl + \`</code> | <code>Ctrl + \`</code> | ㅤㅤ✅    |
| -                         | -                   | -                      | -                      |           |
| 측면 패널 (우/좌)        | `⌘ + CapsLock`      | `Ctrl + CapsLock`      | `Ctrl + CapsLock`      | ㅤㅤ✅    |

---

<h2 align="center"> 기능 </h2>

### 🖥️ CLI Hub

- 내장된 [xterm.js](https://xtermjs.org/) 터미널에서 여러 AI 코딩 CLI를 나란히 실행하세요.
- 퍼지 검색 런처를 사용하여 에이전트를 선택하세요. 패널로 바로 이동하려면 **F1**을 누르세요.
- 모든 세션 옆에 내장된 도구:
  - **Prompt** — `@`파일 멘션, 이미지 붙여넣기, 스킬 칩, 라이브 맞춤법 검사 및 전송 전 소스→영어 번역 기능이 있는 풍부한 편집기.
  - **Translator** — 터미널 선택 항목을 인라인으로 번역하세요.
  - **Use** — CLI별 사용량 / 상태 보기.
  - **Keymaps** — 키보드 단축키 참조.
  - **Voice** — 답장을 소리 내어 읽어줍니다. 다른 곳에 주의를 기울이는 동안 에이전트가 완료되면 선택적으로 "딩" 소리가 납니다.

### 🧩 My Skills

- 마켓플레이스에서 스킬 설치 — **All‑time**, **Trending (24h)**, **🔥 Flame**, **Official** 소스.
- `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`를 위한 안내된 생성기와 카테고리별 빠른 템플릿으로 스킬을 생성하세요.
- 작업 공간별로 로컬 및 저장된 스킬을 관리하세요.

### 🧠 My Memory

- 모든 CLI가 저렴한 공유 컨텍스트로 시작할 수 있도록 커밋된 `.f1/` 프로젝트 컨텍스트 맵을 생성하세요.
- 프로젝트별 토글; 명령어 파일(`AGENTS.md` / `CLAUDE.md`)은 계속해서 컨텍스트를 가리킵니다.

## 🚀 시작하기

1. [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=bastndev.f1)에서 **F1**을 설치하세요.
2. **`F1`**을 눌러 **CLI Hub** 패널을 여세요.
3. 런처에서 에이전트를 선택하세요 (또는 고유한 명령을 실행하려면 **Custom CLI**를 선택하세요).
4. 활동 막대에서 **My Skills**를 열어(**`Ctrl+3`**) 스킬을 설치하거나 생성하세요.

> 에이전트를 처음 실행할 때 `PATH`에 CLI가 아직 없으면 설치됩니다.

<br>

---

## 설치

### 방법 1 — 빠른 열기

운영 체제에 따라 _Quick Open_을 실행하세요:

- <img src="https://www.kernel.org/theme/images/logos/favicon.png" width=16 height=16/> Linux `Ctrl+P`
- <img src="https://developer.apple.com/favicon.ico" width=16 height=16/> macOS `⌘P`
- <img src="https://www.microsoft.com/favicon.ico" width=16 height=16/> Windows `Ctrl+P`

다음 명령을 붙여넣고 `Enter`를 누르세요:

```bash
ext install bastndev.f1
```

### 방법 2 — 확장 보기

1. 확장(`Ctrl+Shift+X` / `⌘+Shift+X`)을 엽니다.
2. **"F1"**을 검색합니다(게시자: `bastndev`).
3. **설치**를 클릭합니다.

<br>

---

## 나에 대해

| [![gohitx](https://github.com/gohitx.png?size=100)](https://gohit.xyz) |
| :--------------------------------------------------------------------: |
|                  **[Gohit X](https://gohit.xyz/me)**                   |
|                         _크리에이터 & 유지 관리자_                         |

- 🐦 **[X](https://x.com/intent/follow?screen_name=gohitx)** : 질문 및 토론용.
- 🌱 **[IG](https://instagram.com/gohitx)** : **`new`** – 프로젝트 미리보기 및 생활 업데이트.
- 🔴 **[YouTube](https://www.youtube.com/@gohitx?sub_confirmation=1)** : 코드, 소프트웨어 및 개발 통찰력.

<br>

---

## 후원자

이 프로젝트를 지원해주시는 모든 분들께 감사드립니다! 여러분의 기여로 업데이트와 새로운 확장이 가능해집니다.

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
  <em>놀라운 후원자 여러분, 감사합니다! 💖</em><br>
  <a href="https://github.com/sponsors/bastndev"><b>👉 후원자 되기</b></a>
</div>

<br>

<h2 align="center">
  보완 확장 🧩 
</h2>

| 확장                                                                                                                                                                                                         | 이름                                                           | 설명                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [![Lynx Theme Pro](https://bastndev.gallerycdn.vsassets.io/extensions/bastndev/lynx-theme/5.0.1/1777191854738/Microsoft.VisualStudio.Services.Icons.Default)](https://open-vsx.org/extension/bastndev/lynx-theme) | [Lynx Theme Pro](https://github.com/bastndev/Lynx-Theme)       | 6가지 사용 가능한 테마(Dark, Light, Night, Ghibli, Coffee, Kiro)와 아이콘이 통합된 전문 확장. 각 테마는 보다 쾌적한 시각적 경험을 제공하도록 최적화되었습니다.                                       |
| [![Lynx Keymap Pro](https://open-vsx.org/api/bastndev/lynx-keymap/2.6.0/file/icon.png)](https://open-vsx.org/extension/bastndev/lynx-keymap)                                                                      | [Lynx Keymap Pro](https://github.com/bastndev/Lynx-Keymap-Pro) | 모든 코드 편집기에서 키보드 단축키를 표준화하여 단일 키 조합으로 모든 기능에 즉시 액세스할 수 있도록 합니다 — 작업 흐름과 개발 경험을 향상시킵니다. **`이제 75% 키보드를 위한 단축키 포함`** |
| [![ATM](https://open-vsx.org/api/bastndev/atm/1.9.4/file/icon.png)](https://open-vsx.org/extension/bastndev/atm)                                                                                                  | [ATM](https://github.com/bastndev/atm)                         | Error Lens, Git Blame, Env Protection 및 주요 편집기간의 코드 스크린샷과 같은 필수 기능으로 작업 흐름을 강화하는 올인원 툴킷 👻.                                                           |

<br>

<div align="center">
  
  **즐기세요 🎉 — (F1) 이 설치되었습니다!**  
  *버그를 발견하거나 피드백이 있으면 언제든지 [이슈를 열어주세요](https://github.com/bastndev/F1/issues/new).*

<sub>페루 🇵🇪 에서 <a href="https://gohit.xyz">Gohit X</a> 에 의해 제작됨 · <a href="https://github.com/bastndev/F1/blob/main/LICENSE">`MIT`</a> 에 따라 라이선스 부여됨</sub>

</div>

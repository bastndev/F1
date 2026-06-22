# Claude Code — slash commands (authoritative reference)

**Source:** https://code.claude.com/docs/en/commands — fetched 2026-06-21
**Conventions:** `<arg>` = required, `[arg]` = optional. `data-cmd` = the bare token to insert.

> ⚠️ The docs note: *"Not every command appears for every user. Availability depends on your
> platform, plan, and environment."* So a valid command (e.g. `/workflows`, `/desktop`,
> `/setup-bedrock`) may not show in your build — that is **gating, not an outdated list**.
> The list below IS the current official set.

**❌ Removed — do NOT implement:** `/pr-comments` (removed v2.1.91) · `/vim` (removed v2.1.92).

Legend for the **Avail.** column: ✅ general · 🔢 needs a min version · 🧩 plan/account-gated ·
🖥️ platform/env-gated · 🪶 niche/cosmetic.

---

## Essentials (proposed top group)

| data-cmd | tag | purpose |
| :-- | :-- | :-- |
| /model | /model [model] | Switch the AI model and save it as default for new sessions. |
| /effort | /effort [level\|auto] | Set effort: low, medium, high, xhigh, max, ultracode. |
| /context | /context [all] | Visualize current context usage as a colored grid. |
| /compact | /compact [instructions] | Summarize the conversation to free up context. |
| /plan | /plan [description] | Enter plan mode before a large change. |
| /resume | /resume [session] | Resume a conversation by ID or name. (alias /continue) |
| /usage | /usage | Session cost, plan limits, and activity stats. (alias /cost, /stats) |
| /clear | /clear [name] | Start a fresh conversation, keep project memory. (alias /reset, /new) |

## Model & reasoning

| data-cmd | tag | purpose | alias | Avail. |
| :-- | :-- | :-- | :-- | :-- |
| /fast | /fast [on\|off] | Toggle fast mode on or off. | | ✅ |
| /advisor | /advisor [model\|off] | Consult a second model for guidance at key moments. | | 🔢 v2.1.98+ |

## Context & conversation

| data-cmd | tag | purpose | alias | Avail. |
| :-- | :-- | :-- | :-- | :-- |
| /btw | /btw &lt;question&gt; | Ask a quick side question without adding to history. | | ✅ |
| /rewind | /rewind | Roll back code and/or conversation to a checkpoint. | /checkpoint, /undo | ✅ |
| /recap | /recap | Generate a one-line summary of the current session. | | ✅ |
| /export | /export [filename] | Export the current conversation as plain text. | | ✅ |
| /copy | /copy [N] | Copy the last (or Nth-latest) assistant response. | | ✅ |
| /focus | /focus | Toggle the focus view (last prompt + summary + reply). | | 🖥️ fullscreen |

## Session management

| data-cmd | tag | purpose | alias | Avail. |
| :-- | :-- | :-- | :-- | :-- |
| /branch | /branch [name] | Branch the conversation here and switch into it. | | ✅ |
| /fork | /fork &lt;directive&gt; | Spawn a forked subagent that inherits the conversation. | | 🔢 v2.1.161+ |
| /rename | /rename [name] | Rename the current session. | | ✅ |
| /cd | /cd &lt;path&gt; | Move this session to a new working directory. | | 🔢 v2.1.169+ |
| /add-dir | /add-dir &lt;path&gt; | Add a working directory for file access this session. | | ✅ |
| /exit | /exit | Exit the CLI (detaches an attached background session). | /quit | ✅ |
| /stop | /stop | Stop the current background session. | | ✅ |

## Plan, code & review

| data-cmd | tag | purpose | alias | Avail. |
| :-- | :-- | :-- | :-- | :-- |
| /diff | /diff | Open an interactive diff viewer. | | ✅ |
| /code-review | /code-review [level] [--fix] [--comment] [target] | Review the diff for bugs and cleanups. (Skill) | | ✅ |
| /simplify | /simplify [target] | Cleanup-only review that applies fixes. (Skill) | | 🔢 v2.1.154+ |
| /review | /review [PR] | Review a pull request locally. | | ✅ |
| /security-review | /security-review | Scan pending changes for vulnerabilities. | | ✅ |
| /ultrareview | /ultrareview [PR] | Deep multi-agent cloud review. (= /code-review ultra) | | 🧩 credits |
| /ultraplan | /ultraplan &lt;prompt&gt; | Draft a plan in a cloud session, review in browser. | | 🧩 |
| /autofix-pr | /autofix-pr [prompt] | Cloud session that watches the PR and pushes fixes. | | 🧩 gh + web |

## Agents & parallel work

| data-cmd | tag | purpose | alias | Avail. |
| :-- | :-- | :-- | :-- | :-- |
| /agents | /agents | Manage subagent configurations. | | ✅ |
| /background | /background [prompt] | Detach the session as a background agent. | /bg | ✅ |
| /batch | /batch &lt;instruction&gt; | Decompose a large change into parallel worktrees. (Skill) | | ✅ |
| /tasks | /tasks | View and manage everything running in the background. | /bashes | ✅ |
| /goal | /goal [condition\|clear] | Keep working across turns until the condition is met. | | ✅ |
| /loop | /loop [interval] [prompt] | Run a prompt repeatedly while the session stays open. (Skill) | /proactive | ✅ |
| /schedule | /schedule [description] | Create/manage cloud routines on a schedule. | /routines | 🧩 |
| /workflows | /workflows | Open the workflow progress view. | | 🖥️ |
| /deep-research | /deep-research &lt;question&gt; | Fan out web searches and synthesize a cited report. (Workflow) | | ✅ |

## Skills & extensions

| data-cmd | tag | purpose | alias | Avail. |
| :-- | :-- | :-- | :-- | :-- |
| /skills | /skills | List available skills. | | ✅ |
| /reload-skills | /reload-skills | Re-scan skill and command directories. | | 🔢 v2.1.152+ |
| /plugin | /plugin [subcommand] | Manage Claude Code plugins. | | ✅ |
| /reload-plugins | /reload-plugins [--force] | Reload active plugins without restarting. | | ✅ |
| /mcp | /mcp [subcommand] | Manage MCP server connections and auth. | | ✅ |
| /hooks | /hooks | View hook configurations for tool events. | | ✅ |
| /claude-api | /claude-api [migrate\|managed-agents-onboard] | Load Claude API reference for your language. (Skill) | | ✅ |
| /fewer-permission-prompts | /fewer-permission-prompts | Build a read-only allowlist from your transcripts. (Skill) | | ✅ |

## Project config & memory

| data-cmd | tag | purpose | alias | Avail. |
| :-- | :-- | :-- | :-- | :-- |
| /init | /init | Initialize the project with a CLAUDE.md guide. | | ✅ |
| /memory | /memory | Edit CLAUDE.md memory files and auto-memory. | | ✅ |
| /permissions | /permissions | Manage allow/ask/deny rules for tools. | /allowed-tools | ✅ |
| /config | /config [key=value ...] | Open Settings or set a key directly. | /settings | ✅ |
| /theme | /theme | Change the color theme. | | ✅ |
| /color | /color [color\|default] | Set the prompt bar color for this session. | | ✅ |
| /statusline | /statusline | Configure the status line. | | ✅ |
| /keybindings | /keybindings | Open your keyboard shortcuts file. | | ✅ |
| /terminal-setup | /terminal-setup | Configure terminal keybindings (Shift+Enter, …). | | 🖥️ |
| /tui | /tui [default\|fullscreen] | Set the terminal UI renderer and relaunch. | | ✅ |
| /sandbox | /sandbox | Toggle sandbox mode. | | 🖥️ |

## Run & verify (Skills)

| data-cmd | tag | purpose | Avail. |
| :-- | :-- | :-- | :-- |
| /run | /run | Launch and drive your project's app. | 🔢 v2.1.145+ |
| /verify | /verify | Build, run, and observe to confirm a change works. | 🔢 v2.1.145+ |
| /run-skill-generator | /run-skill-generator | Author a per-project run/verify skill. | 🔢 v2.1.145+ |

## Account & plan

| data-cmd | tag | purpose | alias | Avail. |
| :-- | :-- | :-- | :-- | :-- |
| /login | /login | Sign in to your Anthropic account. | | ✅ |
| /logout | /logout | Sign out from your Anthropic account. | | ✅ |
| /usage-credits | /usage-credits | Configure usage credits to keep working at a limit. | | 🧩 |
| /upgrade | /upgrade | Open the upgrade page for a higher plan tier. | | 🧩 Pro/Max |
| /privacy-settings | /privacy-settings | View and update your privacy settings. | | 🧩 Pro/Max |
| /passes | /passes | Share a free week of Claude Code with friends. | | 🧩 eligibility |

## Integrations, remote & devices

| data-cmd | tag | purpose | alias | Avail. |
| :-- | :-- | :-- | :-- | :-- |
| /remote-control | /remote-control | Allow remote control of this session from claude.ai. | /rc | 🧩 |
| /remote-env | /remote-env | Choose the default environment for cloud agents. | | 🧩 |
| /teleport | /teleport | Pull a web session into this terminal. | /tp | 🧩 |
| /web-setup | /web-setup | Connect your GitHub account for Claude Code on the web. | | 🧩 gh |
| /install-github-app | /install-github-app | Set up the Claude GitHub Actions app. | | 🧩 |
| /install-slack-app | /install-slack-app | Install the Claude Slack app. | | 🧩 |
| /chrome | /chrome | Configure Claude in Chrome settings. | | 🖥️ |
| /desktop | /desktop | Continue the session in the Desktop app. | /app | 🖥️ mac/win |
| /mobile | /mobile | Show a QR code to download the mobile app. | /ios, /android | ✅ |
| /ide | /ide | Manage IDE integrations and show status. | | ✅ |

## Diagnostics, help & misc

| data-cmd | tag | purpose | alias | Avail. |
| :-- | :-- | :-- | :-- | :-- |
| /help | /help | Show help and available commands. | | ✅ |
| /doctor | /doctor | Diagnose and verify your installation and settings. | | ✅ |
| /debug | /debug [description] | Enable debug logging and troubleshoot. (Skill) | | ✅ |
| /status | /status | Open Settings on the Status tab (version, model, account). | | ✅ |
| /release-notes | /release-notes | View the changelog in a version picker. | | ✅ |
| /insights | /insights | Generate a report analyzing your sessions. | | ✅ |
| /team-onboarding | /team-onboarding | Generate a team onboarding guide from history. | | 🧩 |
| /feedback | /feedback [report] | Submit feedback, report a bug, or share. | /bug, /share | ✅ |
| /voice | /voice [hold\|tap\|off] | Toggle voice dictation. | | 🧩 Claude.ai |
| /powerup | /powerup | Interactive lessons that surface features. | | 🪶 |
| /heapdump | /heapdump | Write a heap snapshot for memory diagnosis. | | 🪶 |
| /scroll-speed | /scroll-speed | Adjust mouse-wheel scroll speed. | | 🖥️ fullscreen |
| /radio | /radio | Open Claude FM lo-fi radio in your browser. | | 🪶 |
| /stickers | /stickers | Order Claude Code stickers. | | 🪶 |
| /setup-bedrock | /setup-bedrock | Configure Amazon Bedrock auth/region/models. | | 🖥️ env |
| /setup-vertex | /setup-vertex | Configure Google Vertex AI auth/project/region. | | 🖥️ env |

---

## Notes for implementing into `components/claude/claude.html`

- The current `claude.html` is missing many of these (e.g. `/status`, `/branch`, `/fork`,
  `/goal`, `/schedule`, `/recap`, `/copy`, `/cd`, `/add-dir`, `/sandbox`, `/color`, run/verify,
  the account & integration commands).
- Suggested scope: implement everything marked ✅ / 🔢 (version-gated but real), plus the common
  🧩 ones. Consider **skipping** the 🪶 cosmetic ones (`/radio`, `/stickers`, `/heapdump`,
  `/powerup`) and the deeply env-gated `/setup-bedrock` / `/setup-vertex` unless you want full
  coverage.
- Keep the modal's existing category style: Essentials first, then Model · Context · Session ·
  Code &amp; Review · Agents · Skills &amp; Extensions · Config · Account &amp; Integrations · Diagnostics.

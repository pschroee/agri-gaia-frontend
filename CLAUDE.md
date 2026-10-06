<!--
SPDX-FileCopyrightText: 2026 Philipp Schröer
SPDX-FileContributor: Philipp Schröer

SPDX-License-Identifier: MIT
-->

# Agri-Gaia Frontend — fork `pschroee/agri-gaia-frontend`

Fork of [hsos-ai-lab/agri-gaia-frontend](https://github.com/hsos-ai-lab/agri-gaia-frontend), used as submodule
`services/frontend` of [pschroee/agri-gaia-platform](https://github.com/pschroee/agri-gaia-platform).

Branch model, commit style, REUSE headers and the deployment are described once in the platform fork's
[CLAUDE.md](https://github.com/pschroee/agri-gaia-platform/blob/ki-agents/CLAUDE.md). In short: `main` mirrors
upstream, `ki-agents` is the default and integration branch, feature branches come back by pull request into
`ki-agents` within this fork; commit messages in English, no secrets in the repository.

## Agent UI (`src/agent/`)

- Native MUI UI for the agent gateway, behind the build flag `VITE_AGENT_ENABLED`: floating button and right-hand
  context panel on every page, side-nav entry and page **`/ai-agent`** (tabs Chat, Activity and Status, `?tab=activity|status`). The route must not
  start with `/agent`: Traefik sends `/agent*` on the app host to the gateway.
- **Status tab:** `StatusView` shows the state of the agent service, like the gateway's own `#/status`: key figures,
  reachability (gateway with round trip and the signed-in user from `GET /me`; platform API, platform login and the
  last token exchange from `GET /platform`), the warm pool per variant (`GET /pool`: free, busy, starting, target,
  image, the user's chats with what the agent does; other users' chats only as a count), pending approvals oldest
  first with a link that opens the chat on the Chat tab, models (`GET /models`: provider, context window, prices per
  1M tokens in the tariff in effect now, peak hours in local time, thinking levels as far as the user's chats reported
  them) and variants with the English labels of `variantLabel`, plus defaults from `GET /config`. Everything reloads
  every 15 s and on the refresh button; a failed request empties only its section, a failed `GET /me` shows the error
  alert, and figures that could not be loaded show "–", not 0. `GET /platform` exists since gateway PR #6; an older
  gateway answers 404, shown as "Not reported by this gateway version". The probe is cached 10 s in the gateway, and
  the last exchange lives only in its memory. Derivations are pure in `src/agent/status.ts` (with a port of the
  gateway's `formatPeakWindows`), unit-tested. Render check: answer `pool`, `platform`, `variants`, `models`,
  `config`, `approvals` and drive the 15 s refresh with `page.clock`.
- Data comes from the gateway API on the same host, `/agent/api/…` (cookie session, path `/agent/`); types and calls
  are a subset of the gateway's `web/src/api`. On 401 a hidden iframe loads `/agent/oidc/login?prompt=none`, which
  reuses the platform's Keycloak session (`return` stays `/agent/`). The visible "Sign in" of `SignInNotice` passes the
  current platform location as `return` (`loginReturnTarget` in `src/agent/login.ts`, unit-tested), so the login ends
  on the page the user was on; since gateway PR #7 the gateway accepts any absolute path on the same host there
  (gateway API.md, *Return after login*), anything it would refuse falls back to `/agent/` already in the frontend.
- Render check without backend: run `npx vite` with `VITE_AGENT_ENABLED=true` and intercept requests in Playwright
  (serve a fake `keycloak-js` module for `/node_modules/.vite/deps/keycloak-js.js`, answer `api.<base>` and
  `/agent/api/**` with JSON). No mock code lives in the repository.
- **Queue:** while the agent works, the input stays usable and a sent message is queued by the gateway
  (`queued: true`). `QueueList` shows the open entries above the input, removable until delivered (409 afterwards);
  after an abort (`queue_held`) they wait for the next message or "Send now" (`POST …/queue/send`). The state logic
  is the pure reducer in `src/agent/queue.ts`, fed by `GET /chats/{id}` (`queue`) and the SSE event `queue`.
  The gateway steers user entries into pi right away (SSE `queue` with `change: "delivered"` milliseconds after
  `queued`), but pi reads them only after its current step, and the user message is stored only then. Delivered
  entries therefore stay in the list ("with the agent", greyed) until a later stored user message carries their text
  or has `trigger: "queue"`; `restored` reopens them, `dropped` clears them. A page reload in that window loses them
  (the gateway's queue no longer lists delivered entries).
- **Auto-scroll:** `useStickToBottom` (`src/agent/useStickToBottom.ts`) keeps the transcript of `ChatView` at its end
  while the user is within 32 px of the bottom. A ResizeObserver on the scrolling box and its content triggers it, so
  growing step lists and streamed text follow too, not only new messages. Only scrolling **up** releases the view
  (growing content never does); then a "Jump to latest · n new" button appears, n counted with `countEntries`
  (messages plus each tool call). Opening a chat (ChatView is keyed by chat id) and sending jump to the end. The
  decision logic is the pure `stickReducer`, unit-tested; measuring in a render check must wait for a painted frame
  (rAF, then `setTimeout`), because a measurement inside rAF runs before that frame's ResizeObserver.
- **Gateway notes:** user messages are split along the gateway's `sources` (`splitMessage` in `src/agent/transcript.ts`);
  a part with `audience: "agent"` (today the preferred browser language of the first message) is context for the model
  only and is cut out (`isAgentOnly`), never shown as user text. Decide by that mark, not by `type` or the text; the
  gateway fills it in for old rows too (gateway API.md, *Origin of instructions*).
- **Thinking:** thinking blocks of the model (`{type: "thinking"}` in stored assistant messages, live via
  `message_update` with `thinking_start|delta|end`) show as a collapsed muted line "Thinking · 4.2 s" between text and
  tool steps (`ThinkingBlock`), live as "Thinking … n s". The live message is assembled by the pure reducer
  `src/agent/live.ts` (text, thinking and tool calls by `contentIndex`); `liveParts` and `buildTranscript` turn live and
  stored messages into the same parts. **pi stores no timing per block:** the duration is measured only while the block
  streams, kept in memory by `timestamp:contentIndex`, and handed to the stored message; after a page reload, or for
  blocks never seen live, the header shows "Thinking" without a duration. Open state per block lives in
  `Conversation`, so it survives the switch from live to stored. "Always show thinking" (switch inside an expanded
  block) is stored per gateway user in `localStorage` (`agentAlwaysShowThinking:<sub>`, try/catch, memory fallback);
  switching it resets the per-block choices.
- **Stopped steps:** a tool call ended by the user's stop (abort of the run or "Stop" on a command) shows as
  "stopped by you" with a muted stop icon, not as "failed"; an answer that ended with the abort gets a muted
  "Stopped by you" instead of "Error: This operation was aborted". The decision is pure in `src/agent/transcript.ts`
  (`isAbortText` on the last line of the result: "This operation was aborted", "Request was aborted", "Command
  aborted", "Command stopped by the user"; `isAbortedAnswer`; `stepStatus`), unit-tested. The gateway does not record
  who aborted: its own aborts (maximum run time, turn or subagent limit) show the same way.
- **Panel header:** the run-state chip is the part that gives way (label ellipsized, icon and timer stay), the close
  button is `flex: none`; during a run the "Agent" label is hidden, so "needs approval · 1:15:03" fits at 400 px. The
  send button's tooltip is controlled (pure `sendTipReducer`, `src/agent/sendTooltip.ts`, unit-tested): closed on
  sending until the pointer has left the button (a disabled button fires no blur and its wrapper a fresh mouseover),
  and a hover counts only after a real mousemove, because the opening panel puts the send button under the pointer
  resting on the floating button and the browser fires a mouseover without movement. Keyboard focus still opens it.
- **Run control:** `RunStatus` above the input shows the run state of the open chat with a running timer and is the
  only place to stop the agent (`POST …/abort`; the input only sends) or to let an idle chat rest (`POST …/suspend`).
  The state comes from the pure `runStateOf` in `src/agent/runState.ts`: `working`, `waiting` (running with an open
  approval; the live approval list beats the chat's counter), `resuming`, `idle` (active, sandbox assigned) and
  `dormant` (shown as "resting"); the timer uses `running_since`, otherwise the last user message. After an abort the
  queue is held (`QueueList`, "Send now"). `suspend` answers 409 with an open approval or while running; the text
  comes from `suspendErrorText`. The open `ChatView` hands its chat to `updateChat` of the context, so the history
  list, the chat selector and the panel header chip follow live, not only every 15 s.
- **Resuming a dormant chat:** sending to a dormant chat resumes it; the response to `POST …/messages` comes only after
  resuming. The SSE event `resume` (`ResumeStep`, phases acquire → session → settings → workspace → inputs, then
  `ready` or `failed`) feeds the pure `applyResumeStep` in `src/agent/resume.ts`; `ResumeBlock` shows the steps live
  and collapses to "Resumed in a fresh sandbox · 1.7 s" after the triggering user message (`resumeAnchor`, by message
  `seq`, which transcript items now carry). The sent text shows greyed (`pending` in `useChatStream`) until its user
  message is stored. A lost `ready` is closed on the next pi event (`closeResumes`). The steps exist only live: after a
  page reload the block is gone. On `failed` the request fails and `ChatInput` puts the text back.
- **Model and thinking level:** `ModelEffortPicker` sits in the row below the input (small text buttons with menus,
  so they fit the 400 px panel; the approval hint shrinks to its lock icon there). Models come from `GET /models`
  (loaded once in `AgentContext`, with prices and tariff as hint). **The model list carries no thinking levels:** the
  gateway reports them per chat (`thinking_levels` for the chat's current model, empty until pi has been asked), so
  only those are offered, and the picker is disabled with fewer than two. While the chat runs or resumes, both are
  disabled with a tooltip (the gateway answers 409). A 409 with `code: "context_too_large"` and `details` opens
  `ContextTooLargeDialog`; "Compact first, then switch" posts `compact_first: true`, and `pending_model` shows
  "Compacting, then …" until the chat event brings the new model. The decisions are pure functions in
  `src/agent/modelChoice.ts`, unit-tested. **New chat:** `POST /chats` takes no thinking level; the dialog offers the
  levels other chats reported for the chosen model (`levelsByModel`), creates the chat without the first message,
  sets the level, then sends the message, so the first turn already runs with it.
- **Context, tokens and cost:** `ContextMeter` shows the chat's `context` (pi's usage, gateway API.md) as a ring with
  the percentage, a tick where auto-compaction starts (`threshold_tokens` = window minus reserve) and, on click, a
  popover with tokens, window, threshold, reserve and headroom plus the compaction settings (see *Chat settings*).
  The colour follows the distance to the threshold, not the share of the window: amber from 15 % of the window before it, red from 5 % (`contextLevel` in `src/agent/usage.ts`). After a
  compaction `tokens` is null until the next answer ("–"). A running compaction exists only live: SSE `pi`
  `compaction_start`/`compaction_end` (`compactingAfter`, also closed by `agent_start`); the open `ChatView` hands it to
  `setCompacting` of the context, so the panel header shows a spinner, and the transcript shows "Compacting the
  context …", later the stored entry (role `compaction`, with sizes and cost). `ChatCost` shows `cost` (LLM proxy,
  incl. subagents and compactions) with a split by `cost_other` and `llm_calls`. Each answer gets a muted line with
  tokens, cost and tariff from the stored assistant messages (`cost`, `peak`; pi's flat `usage.cost.total` only as
  "≈" fallback). Panel: ring and total cost in the header (the section chip then gives way; the input's placeholder
  names the section); `/ai-agent`: a chat header with title, ring, tokens and cost.
- **Slash commands:** typing `/` at the start of the input opens `SlashCommandMenu` (MUI Popper right above the field,
  as wide as it; focus stays in the field, which is an ARIA combobox). The list comes from `GET /chats/{id}/commands`
  (loaded with the chat and again whenever the input is exactly `/`), `/todos` (terminal only) is hidden; `/model` and
  `/effort` suggest values, with the chat's live model and the levels pi reports (`withLiveOptions`). Ranking: name
  prefix, then part of the name, then (from three characters) the description. Arrow keys move and wrap, Enter/Tab take
  the entry, Esc hides the list for the current text. The logic is pure in `src/agent/commands.ts` (`menuKey` is the
  key state machine), unit-tested; `useSlashCommands` holds the state. Every `/…` goes to `POST …/commands`. Built-in
  ones (`/compact`, `/autocompact`, `/rename`, `/model`, `/effort`) leave a note in the transcript (`CommandNotice`,
  only in this view, placed before the first message stored after it), then the chat is reloaded, so title and pickers
  follow; a failure (409 for `/compact` while the agent works, a missing argument checked before the call) is an error
  note and the text goes back into the input. `/model` with `context_too_large` opens the picker's "compact first"
  dialog (`tooLargeRequest`). Skills, templates and extensions go to pi like a message (pending bubble or queue).
- **Chat settings:** internet access, automatic compaction and "Compact now", as in the gateway's
  own UI. `useChatSettings` posts `…/internet`, `…/autocompact` (`{enabled}`) and `/compact`
  via `POST …/commands`; the returned chat goes to `updateChat` of the context (and, for controls inside `ChatView`, to
  `applyChat` of the stream), the gateway also publishes it as SSE `chat`. **Internet:** a globe (`InternetToggle`):
  in the panel it is itself the switch (`role="switch"`) next to the chat selector, because the panel header has no
  room left with a long run-state chip; on `/ai-agent` a labelled switch in the chat header. The tooltip says what on
  and off mean and that a dormant chat gets the change on resume. When the agent asks for internet (`agw-internet`,
  MCP `request_internet`) the approval of kind `internet_access` shows in `ApprovalCard` with its reason (the
  approval's `name`; the gateway's "(no reason given)" is hidden), who asks (agent or subagent by `session`) and
  "Allow internet" / "Reject". **Compaction:** switch and "Compact now" in the context popover; the button is locked
  while the agent works, resumes or compacts; a 409 is explained inline. **Subagents:** no control; the gateway fixes the limit
  at 5 subagents at the same time per chat (gateway API.md, *Limit for subagents*; issue #24 removed the former selector
  "Subagents 1 / 2" below the input). Running subagents show in the task strip; the Status tab names the limit
  (`subagentsAtOnce` in `src/agent/status.ts`, `max_subagents` of `GET /config`, falling back to an older gateway's
  default). Texts are pure functions in `src/agent/settings.ts`, unit-tested.
- **Files:** attachments, the chat's artifacts and display images, as in the gateway's own UI (API.md, *Attachments to
  messages*, *Display images*). **Attachments:** the paperclip in the field (`ChatInput`) and dropping files anywhere on the
  agent area upload them at once (`POST …/files`, multipart, field `file`); files above `artifact_max_mb` from
  `GET /config` are refused before uploading and named. Uploaded files sit as chips above the field until sent; sending
  posts their names as `attachments` with the text (text may be empty), also when the message is queued (the queue row
  names the files); a failed send puts text and chips back; a slash command leaves the chips for the next message.
  The gateway appends the block `[Attachments in /workspace/inputs/]` to the stored user message; `buildTranscript`
  splits it off (`splitAttachments`) and the user bubble shows the files below it (images as tiles that enlarge, others as
  chips downloading `…/artifacts/{name}?kind=input`). **Artifacts:** `ArtifactStrip` below the delegation strip (only with
  files), collapsed "Files 2 results · 1 upload", opened results and uploads with download; opening reloads
  `GET …/artifacts`, the SSE event `artifact` adds new ones. A pending approval of kind `artifact_upload` shows in
  `ApprovalCard` with name, size, type and the text preview (none for images), "Allow" / "Reject". **Display images:**
  `Markdown` renders `![alt](path)` through `src/agent/images.ts` (port of the gateway's `web/src/lib/images.ts`): local
  paths under `/workspace`, `/tmp`, `/home/agent` load from `GET …/images?path=…&msg=…` once the answer is stored (`msg`
  = `responseId`, else `ts-<timestamp>`, carried as `imageKey` on text parts); `data:` PNG/JPEG/GIF/WebP show directly;
  **foreign addresses and SVG are never loaded** (they would leak sandbox data without internet approval), they show as a
  muted note, as do local images of an answer still streaming. A click enlarges (`ImagePreview`, MUI Dialog with
  download). Images are split off a line before the other inline forms, so underscores in a path cannot start italics.
  `request` in `api.ts` sets the JSON content type only for string bodies; FormData brings its own boundary. The pure
  logic is in `src/agent/files.ts` and `images.ts`, unit-tested. **Drop area:** `AgentDropZone` covers the whole context panel (from its header down) and the chat tab of
  `/ai-agent` (history and chat); while files are dragged over it, an overlay "Drop files to upload" covers the area,
  and dropped files go to the open chat's `ChatInput` (registered through `useAgentDropTarget`), the same path as the
  paperclip. Without an open chat the area takes nothing; drags without files (text, links) pass through, so the text
  field still takes dropped text. Nested `dragenter`/`dragleave` are counted by the pure `dragReducer`
  (`src/agent/dropzone.ts`, unit-tested); a `dragleave` towards an element outside the area, `dragend` and `drop` on
  the window end it at once. A `ChatInput` outside a zone keeps its own drop target (`useFileDrop`). Render check: drop
  with a `DataTransfer` built in the page and `dispatchEvent('dragenter'|'dragleave'|'dragover'|'drop', {dataTransfer,
  relatedTarget})` on any element of `agent-drop-area`.
- **Mermaid diagrams:** ```` ```mermaid ```` blocks in answers render as diagrams (`MermaidDiagram`), as in the
  gateway's own UI (port of its `web/src/lib/mermaid.ts`). mermaid and DOMPurify are loaded only at the first diagram
  (dynamic import of `src/agent/mermaidLoad.ts`, separate chunks); the main bundle grew by about 10 kB for the UI code
  only. Config in `mermaidConfig` (`src/agent/mermaid.ts`): `securityLevel: 'strict'`, no HTML labels, theme `base`
  with colours from the platform (`MERMAID_THEME_VARIABLES`), a system font (the SVG is shown as `<img>`, which cannot
  use the page's web fonts, while mermaid measures labels in the page), compact spacing for the 400 px panel; `secure`
  stops `%%{init}%%` from changing any of it. The SVG is sanitized a second time (no script, no outside references)
  and shown as a `data:` `<img>`: it fits the width, a click or "Enlarge" opens a dialog (up to twice the natural size,
  SVG download), "Code" toggles the source. A render error shows the code with a short note (line number, full message
  as tooltip). While an answer streams (`streaming` on `Markdown`, the live `AgentBlock`), a block renders only once
  its closing fence has arrived (`readFence`, CommonMark rules: same character, at least as long); stored answers render
  unclosed blocks too. Large diagrams (over 4000 characters or 150 edges) and the sixth diagram of an answer onwards
  render only on click. Diagrams the agent renders itself with `mmdc` arrive as PNG display images (see *Files*).
  **TypeScript 4.9 cannot parse mermaid's types** (they pull in `@types/d3` with TypeScript 5 syntax): `mermaidLoad.ts`
  imports `mermaid/dist/mermaid.core.mjs` by path (the package's own ESM entry), typed by `src/agent/mermaid-module.d.ts`;
  importing `'mermaid'` breaks `tsc`. Render check: in the dev server the mermaid chunk only loads when a diagram
  appears; the first visit after the lockfile changed re-optimizes dependencies.
- **Subagents and background tasks:** as in the gateway's own UI (API.md, *Background tasks*). **Running
  commands:** a running `bash` step in `StepList` gets "Move to background" and "Stop" (`POST …/tools/{call}/background`,
  `…/stop`). Which calls are controllable is the pure `runningReducer` in `src/agent/background.ts`: bash executions
  seen as pi events (`tool_execution_start` until `_end`) plus the gateway's list `GET …/tools/running`, fetched with
  each load of a running chat and 400 ms after a bash start (the gateway registers the command a moment after pi reports
  it, so a live one stays until its end event). A failure (404: already ended, 409: too many background tasks) shows
  below the row. A step that started or became a background task carries a chip "bg-3 · running". **Background
  tasks** and **subagent runs** sit in `TaskStrip` below the files (only when there are any): collapsed "Tasks Background
  1 running · Subagents 1 running · 2 done" with a spinner while something runs; opened, the tasks (running first) with
  state, runtime, the last three lines of `tail` and Stop (`POST …/background/{bg}/stop`, 409 explained), and the runs
  with title (workflow label, else the task's first line), state, duration, tool count, agent and short run ID, and
  the cost recorded at the LLM proxy (`GET …/llm_calls`, matched by the `response_id` of the run's entries, loaded once
  subagents exist). A run opens to its own steps (`runItems`: task, step lists, text answers). Data: `background`,
  `subagent_entries`, `subagent_runs` of `GET /chats/{id}`, SSE `background` (a throttled `output` never overwrites an
  end), `subagent`, `subagent_run`, `llm_call`. A run's state comes from pi-subagents when known, otherwise it is
  estimated from its entries (`runStatus`, `src/agent/subagents.ts`). **Notes:** the gateway's note that a task ended
  (user message with a `background` source) shows as one muted line "Background task bg-3 finished · exit 0 · 0:08"
  (`BackgroundNoteLine`), opening to command, last lines and log path; queued notes are labelled from their header line.
  Render check: answer `tools/running`, `background`, `llm_calls` and the chat's `background`/`subagent_*` fields, drive
  SSE `pi` `tool_execution_start|end`, `background`, `subagent`, `subagent_run`.
- **Menus without scroll lock:** MUI's Popover (and Menu and Select) locks the page while open: `overflow: hidden`
  on body removes the document scrollbar and `padding-right` on body and `.mui-fixed` makes up for it. In-flow content
  and the app bar stay, but the context panel (fixed drawer at `right: 0`, no `.mui-fixed`) jumped right by the
  scrollbar width (15 px with classic scrollbars), so next to it the page seemed to move (issue #25). `AgentMenuTheme`
  wraps the panel layer and `/ai-agent` with the platform theme plus `MuiPopover.defaultProps.disableScrollLock`
  (`withoutPopoverScrollLock`, `src/agent/menuTheme.ts`, unit-tested), so every menu, select and popover there,
  including new ones, leaves the page alone; menus still close on outside click and Escape. The page can scroll
  under an open menu; menus of the panel stay put (fixed panel). Dialogs keep their modal lock (the panel still moves
  15 px behind the backdrop). Render check: launch Chromium with `ignoreDefaultArgs: ['--hide-scrollbars']`, else
  headless has no scrollbar and nothing moves; compare `getBoundingClientRect().left` of page and panel elements.
 `npm test` runs Vitest (`vitest.config.ts`, files `src/**/*.test.ts`, node environment). The
  config is separate from `vite.config.ts`, so `npm run build` is unaffected; `tsc` type-checks the test files too.
- **Write `package-lock.json` with the npm of the image** (`node:20-alpine`, npm 10.8.2), not with a newer local
  npm: `docker run --rm -v "$PWD":/app -w /app node:20-alpine npm install --package-lock-only`. A lock from npm 11
  left out peer dependencies (`@testing-library/dom` …) that npm 10 requires, and `npm ci` in the Docker build failed
  with EUSAGE (2026-10-05). Dev dependencies must also support Node 20 (Vitest 5 needs Node 22; Vitest 4 is used).
  Check with `docker build` (build args `VITE_PORTAINER_VERSION`, `PROJECT_BASE_URL`, `KEYCLOAK_REALM_NAME`).
- `npm run lint` runs `eslint --fix` over all files; to check without touching upstream files run
  `npx eslint 'src/agent/**/*.{ts,tsx}'`. `npm run build` leaves `dist/`, which is not ignored: delete it.

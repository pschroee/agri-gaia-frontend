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
  context panel on every page, side-nav entry and page **`/ai-agent`** (tabs Chat and Activity). The route must not
  start with `/agent`: Traefik sends `/agent*` on the app host to the gateway.
- Data comes from the gateway API on the same host, `/agent/api/…` (cookie session, path `/agent/`); types and calls
  are a subset of the gateway's `web/src/api`. On 401 a hidden iframe loads `/agent/oidc/login?prompt=none`, which
  reuses the platform's Keycloak session; the gateway only accepts `return` paths under `/agent/`.
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
- **Chat settings:** internet access, automatic compaction, "Compact now" and the subagent limit, as in the gateway's
  own UI. `useChatSettings` posts `…/internet`, `…/autocompact`, `…/subagents` (`{enabled}` / `{max}`) and `/compact`
  via `POST …/commands`; the returned chat goes to `updateChat` of the context (and, for controls inside `ChatView`, to
  `applyChat` of the stream), the gateway also publishes it as SSE `chat`. **Internet:** a globe (`InternetToggle`):
  in the panel it is itself the switch (`role="switch"`) next to the chat selector, because the panel header has no
  room left with a long run-state chip; on `/ai-agent` a labelled switch in the chat header. The tooltip says what on
  and off mean and that a dormant chat gets the change on resume. When the agent asks for internet (`agw-internet`,
  MCP `request_internet`) the approval of kind `internet_access` shows in `ApprovalCard` with its reason (the
  approval's `name`; the gateway's "(no reason given)" is hidden), who asks (agent or subagent by `session`) and
  "Allow internet" / "Reject". **Compaction:** switch and "Compact now" in the context popover; the button is locked
  while the agent works, resumes or compacts; a 409 is explained inline. **Subagents:** `SubagentLimitButton` in the
  row below the input ("Subagents 1 / 2", in the panel "1/2"), a popover with a stepper bounded by
  `max_subagents_limit` from `GET /config` (loaded once in `AgentContext`). Texts and bounds are pure functions in
  `src/agent/settings.ts`, unit-tested.
 `npm test` runs Vitest (`vitest.config.ts`, files `src/**/*.test.ts`, node environment). The
  config is separate from `vite.config.ts`, so `npm run build` is unaffected; `tsc` type-checks the test files too.
- **Write `package-lock.json` with the npm of the image** (`node:20-alpine`, npm 10.8.2), not with a newer local
  npm: `docker run --rm -v "$PWD":/app -w /app node:20-alpine npm install --package-lock-only`. A lock from npm 11
  left out peer dependencies (`@testing-library/dom` …) that npm 10 requires, and `npm ci` in the Docker build failed
  with EUSAGE (2026-10-05). Dev dependencies must also support Node 20 (Vitest 5 needs Node 22; Vitest 4 is used).
  Check with `docker build` (build args `VITE_PORTAINER_VERSION`, `PROJECT_BASE_URL`, `KEYCLOAK_REALM_NAME`).
- `npm run lint` runs `eslint --fix` over all files; to check without touching upstream files run
  `npx eslint 'src/agent/**/*.{ts,tsx}'`. `npm run build` leaves `dist/`, which is not ignored: delete it.

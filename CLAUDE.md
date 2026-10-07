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
  first with a link that opens the chat on the Chat tab, models (`GET /models`: provider, context window, thinking
  levels as far as the user's chats reported them; no prices or tariff, issue #43)
  and the connection of new chats (CLI, MCP, REST API or a combination, fixed by the gateway's `AGW_TOOLSETS`,
gateway issue #29: `toolsets` of `GET /config`, else the `active` entry of `GET /variants`; the pool card of that
combination says "new chats", others "older chats only"; a gateway without it still gets the old table of variants
with the English labels of `variantLabel`), plus defaults from `GET /config`. Everything reloads
  every 15 s and on the refresh button; a failed request empties only its section, a failed `GET /me` shows the error
  alert, and figures that could not be loaded show "–", not 0. `GET /platform` exists since gateway PR #6; an older
  gateway answers 404, shown as "Not reported by this gateway version". The probe is cached 10 s in the gateway, and
  the last exchange lives only in its memory. Derivations are pure in `src/agent/status.ts` (with a port of the
  gateway's `formatPeakWindows`), unit-tested. Render check: answer `pool`, `platform`, `variants`, `models`,
  `config`, `approvals` and drive the 15 s refresh with `page.clock`.
- **Activity tab:** `ActivityView` reads the gateway's `GET /activity` (gateway PR for issue #12): platform calls of all
  the user's chats in one request, newest first, in pages of 100 ("Load more" passes `next_before`), filtered by period
  (Today, 7 days (default), 30 days, All; `since` is local midnight sent in UTC) and result (`outcome`). The key figures
  come from the response's `summary` and cover the whole period, not only the loaded pages (calls, chats, agent runs,
  blocked, rejected, average and 95th percentile of the duration); "waiting for approval" still comes from
  `GET /approvals?state=pending`. The table shows the gateway's `outcome` and `duration_ms` (round trip to the platform,
  "–" when the call did not go out or predates the measurement); an expanded row shows the calls of the same tool call
  among the loaded ones plus the approval the gateway joined to the call. An older gateway answers 404, shown as a hint
  instead of the table. The view no longer loads chats one by one. Query, paging, rows and figures are pure in
  `src/agent/activity.ts`, unit-tested. Render check: answer `activity` by `before` and check the query parameters.
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
  or has `trigger: "queue"`; `restored` reopens them, `dropped` clears them. After a page reload the gateway lists
  them in `queue_delivered` of `GET /chats/{id}` (gateway PR for issue #21; `QueueDelivery`, same content as the
  `delivered` event plus the entries); the reducer action `delivered_loaded` adds them with the seq of the loaded
  messages as anchor, so they show and settle exactly as before the reload. An older gateway without the field
  changes nothing.
- **Auto-scroll:** `useStickToBottom` (`src/agent/useStickToBottom.ts`) keeps the transcript of `ChatView` at its end
  while the user is within 32 px of the bottom. A ResizeObserver on the scrolling box and its content triggers it, so
  growing step lists and streamed text follow too, not only new messages. Only scrolling **up** releases the view
  (growing content never does); then a "Jump to latest · n new" button appears, n counted with `countEntries`
  (messages plus each tool call). Opening a chat (ChatView is keyed by chat id) and sending jump to the end. The
  decision logic is the pure `stickReducer`, unit-tested; measuring in a render check must wait for a painted frame
  (rAF, then `setTimeout`), because a measurement inside rAF runs before that frame's ResizeObserver.
- **Idle chats are invisible (issue #31):** the gateway still lets an unused chat idle after `AGW_IDLE_TIMEOUT`
  (`state: "dormant"`), but the UI never shows it: `runStateOf` maps it to `idle` (shown nowhere, #35), there is no "resting" label, icon or
  hint and no manual "Let it rest" (suspend) button. Opening or selecting such a chat (panel, `/ai-agent`, also on page
  load) calls `POST /agent/api/chats/{id}/resume` (gateway PR for #31). The decision is taken once per opened view
  (`resumeOnOpen` in `src/agent/resume.ts`), after the first load of the chat with its messages and once the SSE stream
  has opened (or after 2 s without it): the gateway sends a "chat" event when the stream subscribes, which can arrive
  before the load, and a resume started then anchored its steps at seq 0, i.e. at the top of the transcript, out of
  view. A chat that was active when opened is never resumed by this view: when the gateway lets it idle while it is
  open, the next message resumes it (found live: deciding on every chat event woke such a chat at once). The steps come over SSE `resume` and show in
  `ResumeBlock` (live, then a collapsible "Resumed in … s"; a failed one stays with "Try again" on the latest block). A
  resume on opening is marked `opened` and sits before anything stored later, so a message typed meanwhile follows it;
  the message is sent at once and the gateway holds it until the sandbox is ready (`expectQueued` is only true while the
  agent runs). An older gateway without the route answers 404, which is ignored (the next message resumes as before).
- **No delegation in the UI (issue #32):** every chat runs as "no delegation": reading without asking, every change to
  the platform needs the user's approval (`ApprovalCard`). There is no `DelegationStrip`, no template list and no
  delegation row in the activity details; new chats send none. Chats that already carry a delegation keep it in the
  gateway (still enforced there, as are blocked paths and redaction), the UI just does not show it. Blocked calls still
  show on their step in the transcript.
- **Approvals badge (issue #32):** the floating button carries a red badge (white text) with the number of open
  approvals across all the user's chats while the panel is closed (no button on `/ai-agent`). The number comes from the
  gateway's stream across chats, `GET /agent/api/events` (gateway PR for #32: an `approvals` snapshot first, also after
  every reconnect, then `approval` events), kept in `AgentContext` (`pendingApprovals`, `pendingApprovalCount`,
  `approvalsLive`). `src/agent/approvalFeed.ts` holds the pure reducer and `startApprovalFeed` (EventSource with own
  reconnect when it gives up, backoff 2 s to 60 s; poll of `GET /approvals?state=pending` every 60 s while the stream is
  open and every 15 s while it is down; a poll answer is dropped when a stream event came in after it was sent), all
  unit-tested with a fake EventSource. An older gateway without the route answers 404 and the poll carries the count.
  Render check: a fake `EventSource` in an init script that exposes the `/agent/api/events` instance and emits events.
- **Approvals on the side navigation (issue #36):** the "Agent" entry of `SideNav` carries the same red count on its
  icon (`AgentNavIcon`, `useAgentNavBadge`, pure `navBadge` in `approvalFeed.ts`), on every page including `/ai-agent`,
  where there is no floating button. Unlike the button it stays visible while the panel is open: the panel shows the
  approvals of its selected chat only, so the entry is the one place that always counts all chats. It sits on the icon,
  so the collapsed (70 px, icon-only) navigation shows it too ("99+" still fits); hidden at 0. The entry's
  `aria-label` carries the count ("Agent · 2 approvals waiting"), the badge is `aria-hidden`. The change to the upstream
  `SideNav` is the icon and an optional `ariaLabel` per item. Render check: as for the button; MUI scales a badge in
  over 225 ms, so measure its box a moment after it appears.
- **Gateway notes:** user messages are split along the gateway's `sources` (`splitMessage` in `src/agent/transcript.ts`);
  a part with `audience: "agent"` (today the preferred browser language of the first message) is context for the model
  only and is cut out (`isAgentOnly`), never shown as user text. Decide by that mark, not by `type` or the text; the
  gateway fills it in for old rows too (gateway API.md, *Origin of instructions*).
- **Page context:** a message from the panel carries the platform page and the open or selected objects (issue #13,
  several since issue #45; gateway API.md, *Page context*): `pageContextOf` in `src/agent/pageContext.ts` maps the route
  to the gateway's page id (`/data` → `datasets`, `/models/7` → model 7, `/edge/3` → edge device 3; none on `/ai-agent`,
  debug pages or open data) and takes the objects from a detail route or from what the page publishes with
  `usePublishPageSelection` (`src/agent/pageSelection.tsx`, a no-op without the agent; one object or a list, the
  selection changes only when its content does): `DataManagement` publishes all checked datasets, `ModelDetails` and
  `EdgeDetails` the loaded object with its name. Ids must be canonical integers, names are cleaned of control and
  formatting characters and cut to 200 characters, each id once, at most 50 objects, otherwise the gateway answers 400.
  **The page goes with every message silently; there is no chip for it** (issue #45: the model read "Refers to
  Datasets" as the topic and asked about the page instead of answering a general question; the gateway's note now
  calls the context background). `ChatInput` shows a chip only for a selection (`hasSelection`): one object by name
  ("smarttail-bucht-3-kw31"), several as one chip with the count ("2 datasets", tooltip lists the names). Its cross
  leaves the selection out of the next message only (`visibleContext` then gives the page alone; the removal is keyed
  by page and ids and ends after a send, so the chip comes back while the selection stays). The placeholder is neutral
  ("Ask the agent …") or names the selection ("Ask about the 2 selected datasets …", `inputPlaceholder`); the panel
  passes no section placeholder any more. **Wire form** (`wireContext`): one object as `object` (every gateway since
  #13), several as `objects` (gateway PR for #45). A gateway before #45 answers 400 `unknown field "objects"`;
  `sendMessage` then sends the page alone once more (`isOldGatewayRefusal`), never one object of several. Read
  contexts from the gateway with `contextObjects` (`objects`, else the single `object` of older rows). Sent messages
  show a muted "Refers to …" above the bubble ("Refers to Datasets", "Refers to 2 datasets"), taken only from the
  structured `context` of the gateway's `page_context` source (the note itself is `audience: "agent"` and cut out);
  queued rows show it from `QueueEntry.context`. `sectionOf` uses the same route table. Slash commands carry no
  context. The context never grants rights; the delegation decides. Unit tests in `pageContext.test.ts`,
  `transcript.test.ts`, `queue.test.ts`. Render check: check boxes on `/data` with `/agent/api/**` and
  `api.<base>/datasets` mocked; no chip without a selection, the sent `context` per message.
- **Thinking:** thinking blocks of the model (`{type: "thinking"}` in stored assistant messages, live via
  `message_update` with `thinking_start|delta|end`) show as a collapsed muted line "Thinking · 4.2 s" between text and
  tool steps (`ThinkingBlock`), live as "Thinking … n s". The live message is assembled by the pure reducer
  `src/agent/live.ts` (text, thinking and tool calls by `contentIndex`); `liveParts` and `buildTranscript` turn live and
  stored messages into the same parts. **pi stores no timing per block:** the duration is measured only while the block
  streams, kept in memory by `timestamp:contentIndex`, and handed to the stored message; after a page reload, or for
  blocks never seen live, the header shows "Thinking" without a duration. Open state per block lives in
  `Conversation`, so it survives the switch from live to stored. Every block starts collapsed, also the one still
  streaming (its header counts the time; opened, the text grows live), and opens per block on click. There is no
  "Always show thinking" switch any more (issue #40); an old `agentAlwaysShowThinking:<sub>` value in `localStorage`
  is ignored.
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
- **Run control (issue #39):** Stop sits in the input field again, there is no status bar above it (it took two
  lines of the 400 px panel). While a turn runs (working or waiting for approval) the send arrow becomes Stop
  (`POST …/abort`, tooltip and label "Stop"); with text in the field the queue arrow takes the last place and Stop sits
  left of it, Enter queues ("Queue another message …"). The last place always fits the field's content, so a click
  there after typing never stops the agent by mistake. Escape never stops (it only closes the slash menu). The pure
  `inputControls` and `inputStatusText` in `src/agent/runState.ts` decide (unit-tested). The run state shows small in
  the row below the field next to model and thinking level ("Working · 12 s", "Needs approval · 12 s", "Stopping …"
  from the click until the turn has ended); there it gives way first (label ellipsized, dot and timer stay, the picker
  keeps its width because a fraction of a pixel less wraps it), and in the panel the lock icon of the approval hint
  steps aside meanwhile. A failed stop shows as one amber line above that row with a dismiss cross, until the state
  changes. The state comes from the pure `runStateOf`: `working`, `waiting` (running with an open approval; the live
  approval list beats the chat's counter), `starting`, `resuming` and `idle` (nothing running; the gateway's `dormant`
  counts as idle). The timer uses `running_since`, otherwise the last user message. After an abort the queue is held
  (`QueueList`, "Send now"). The open `ChatView` hands its chat to `updateChat` of the context, so the history list,
  the chat selector and the panel header chip follow live, not only every 15 s. Measured in the render check: the area
  below the transcript keeps its idle height while the agent works (panel 118 px, was 174; `/ai-agent` 82 px, was
  120), a failed stop adds one line (23 px).
- **A state shows only while something happens (issue #35):** `runStateText(state, place)` in `src/agent/runState.ts`
  (unit-tested) decides per place (`header`: panel header and the chat header of `/ai-agent`; `list`: history list and
  the panel's chat selector; `input`: the row below the input field, issue #39). A ready chat (idle, active or dormant)
  shows nothing anywhere, no "active", "Idle" or "ready". Starting and resuming show a muted "loading" chip in header
  and lists, their steps in the transcript (`ResumeBlock`, "Starting a sandbox …"), nothing below the input. Working
  and waiting show everywhere. `RunStateChip` renders nothing where the place has no text. The Status tab still names states (`activityText` in `status.ts`).
- **Resuming a dormant chat:** sending to a dormant chat resumes it; the response to `POST …/messages` comes only after
  resuming. The SSE event `resume` (`ResumeStep`, phases acquire → session → settings → workspace → inputs, then
  `ready` or `failed`) feeds the pure `applyResumeStep` in `src/agent/resume.ts`; `ResumeBlock` shows the steps live
  and collapses to "Resumed in a fresh sandbox · 1.7 s" after the triggering user message (`resumeAnchor`, by message
  `seq`, which transcript items now carry). The sent text shows greyed (`pending` in `useChatStream`) until its user
  message is stored. A lost `ready` is closed on the next pi event (`closeResumes`). The steps exist only live: after a
  page reload the block is gone. On `failed` the request fails and `ChatInput` puts the text back.
- **Model and thinking level:** `ModelEffortPicker` sits in the row below the input (small text buttons with menus,
  so they fit the 400 px panel; the approval hint shrinks to its lock icon there). Models come from `GET /models`
  (loaded once in `AgentContext`; each entry names the provider, no prices, issue #43). **The model list carries no
  thinking levels:** the
  gateway reports them per chat (`thinking_levels` for the chat's current model, empty until pi has been asked), so
  only those are offered, and the picker is disabled with fewer than two. While the chat runs or resumes, both are
  disabled with a tooltip (the gateway answers 409). A 409 with `code: "context_too_large"` and `details` opens
  `ContextTooLargeDialog`; "Compact first, then switch" posts `compact_first: true`, and `pending_model` shows
  "Compacting, then …" until the chat event brings the new model. The decisions are pure functions in
  `src/agent/modelChoice.ts`, unit-tested.
- **Chat row of the panel and long titles (issue #38):** below the panel header sit the chat selector, "New chat" as a
  plus (`NewChatButton compact`, tooltip and label "New chat") and the internet globe; plus and globe share
  `rowIconButtonSx` (`tokens.ts`, 32 × 32 px). The selector takes the remaining room and ellipsizes the title; its
  tooltip and the opened list show the full title (list left-aligned under the selector, at most 368 px wide, titles
  wrap with `overflow-wrap: anywhere`). **The row's wrapper is a grid with `minmax(0, 1fr)`:** an `auto` column grows
  to the title's min-content, and the old row ran past the 400 px panel although the `Select` had `minWidth: 0`
  (856 px wide for a 110-character title). On `/ai-agent` the chat header wraps its controls (state chip, internet,
  context, tokens) as one group onto a second line before the title gets narrower than 200 px; history items break
  words that are longer than the line (`overflow-wrap: anywhere`, else the line clamp only clips them) and carry the
  full title as `title`; the approvals table on the Status tab breaks the title too. `chatTitle` in
  `src/agent/format.ts` gives "Untitled chat" for an empty title. Render check: titles short, long and one word of
  230 characters; per element `scrollWidth` against `clientWidth` (an intended `ellipsis` with `nowrap` excepted, and
  MUI's switch, whose invisible checkbox is wider on purpose) and the box against its parent and the panel.
- **New chat (no dialog, issue #30):** "New chat" (`NewChatButton`, panel and `/ai-agent`) posts `POST /chats` with only
  `{async: true, language}` (`newChatRequest` in `src/agent/newChat.ts`, unit-tested): model, thinking level and
  bindings are the gateway's defaults (`AGW_DEFAULT_MODEL`, `AGW_TOOLSETS`), no delegation, the gateway names the chat
  after the first message. `startNewChat` in `AgentContext` adds and selects the chat and leaves a `freshChat` entry,
  which the chat's `ChatInput` takes once (focus, plus files); the button spins and ignores further clicks meanwhile,
  a failure shows as a closable alert below it (`NewChatError`). Model and level are switched below the input as in
  any chat. **Gateway `async`:** with a warm slot the chat comes back ready (gateway: tens of ms); with an empty pool it
  comes back at once with `starting` (and `resuming`) and gets its sandbox in the background. `runStateOf` then gives
  `starting` ("Starting · 12 s", spinner, timer from `created_at`), the transcript shows "Starting a sandbox for this
  chat … You can type already" until SSE `resume` steps with `start: true` arrive, which `ResumeBlock` shows at the top
  ("Started in a fresh sandbox · 16 s"). A message sent meanwhile is not expected to queue (`expectQueued`): the
  gateway holds it until the sandbox is there, so it shows as the greyed pending bubble. An older gateway without
  `async` answers 503 on an empty pool, shown as "No free agent sandbox right now". Render check: answer `POST chats`
  once with an active chat and once with `starting: true, resuming: true`, measure click → focused textarea.
- **No cost in the platform (issue #43):** the frontend shows tokens, never dollar amounts, prices or tariffs
  (peak/off-peak), not even in tooltips. The gateway still records and sends `cost`, `cost_other`, `peak`, `pricing`
  and `tariff` (measurement data for the thesis, visible in its own web UI); `types.ts` keeps those fields, nothing
  formats them. Render check: no `$`, "cost", "tariff" or "price" in the visible text or tooltips of the panel,
  `/ai-agent` chat, Activity and Status.
- **Context and tokens:** `ContextMeter` shows the chat's `context` (pi's usage, gateway API.md) as a ring with
  the percentage, a tick where auto-compaction starts (`threshold_tokens` = window minus reserve) and, on click, a
  popover with tokens, window, threshold, reserve and headroom plus the compaction settings (see *Chat settings*).
  The colour follows the distance to the threshold, not the share of the window: amber from 15 % of the window before it, red from 5 % (`contextLevel` in `src/agent/usage.ts`). After a
  compaction `tokens` is null until the next answer ("–"). A running compaction exists only live: SSE `pi`
  `compaction_start`/`compaction_end` (`compactingAfter`, also closed by `agent_start`); the open `ChatView` hands it to
  `setCompacting` of the context, so the panel header shows a spinner, and the transcript shows "Compacting the
  context …", later the stored entry (role `compaction`, with sizes). `ChatTokens` shows the chat's `tokens` (summed by the
  gateway over the stored answers and compactions of the main session) with a tooltip: input, output, from cache with
  its share, and `llm_calls` (LLM proxy, incl. subagents). Each answer gets a muted line "in · out · cache" from the
  stored assistant messages. Panel: ring and an "Open in agent page" button in the header, no tokens figure (issue #33;
  the section chip then gives way; the input's placeholder names the section). The button (`expandToAgentPage` in
  `src/agent/expand.ts`, unit-tested) selects the chat, closes the panel and navigates to `/ai-agent` (Chat tab) with
  react-router; without a selected chat there is no button. `/ai-agent`: a chat header with title, ring and tokens.
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
  in the panel it is itself the switch (`role="switch"`) at the end of the chat row, after the "New chat" plus, because the panel header has no
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
  `GET /config` are refused before uploading and named with their size; a 413 of the gateway (or a proxy) becomes a size
  message too (`uploadErrorText`). There is deliberately no `accept` filter: any type can be attached, the paperclip
  tooltip and the drop overlay name the formats the agent reads (`READABLE_FORMATS`: Office, PDF, CSV, text, HTML, EPUB,
  images; gateway skill `documents`, issue #42). Only the command-line binding converts Office files and PDF; with MCP
  or REST alone the agent says it cannot read them (gateway API.md, *Attachments to messages*). Uploaded files sit as tiles above the field until sent; sending
  posts their names as `attachments` with the text (text may be empty), also when the message is queued (the queue row
  names the files); a failed send puts text and chips back; a slash command leaves the chips for the next message.
  The gateway appends the block `[Attachments in /workspace/inputs/]` to the stored user message; `buildTranscript`
  splits it off (`splitAttachments`) and the user bubble shows the files below it as tiles (images enlarge, others
  download `…/artifacts/{name}?kind=input`). **Tiles (issue #41, as in the gateway's UI):** one look for staged files,
  a sent message and the results a tool call handed over (`ResultAttachments` below its steps, matched by
  `tool_call_id`, `artifactsOfCalls`): 158 px wide (two fit in the panel, also in a user message at 88 %), a
  36 px square with the thumbnail (only `previewKind` image: raster type **and** extension; a name the artifact list
  does not know yet never gets one) or a type icon (`fileTypeOf`: extension first, then content type; PDF, Word,
  spreadsheet, presentation, text incl. CSV, archive, image, file), the name truncated in the middle (`splitFileName`:
  the head ellipsizes, the last four stem characters and the extension stay, `MiddleName`), size, full name in the
  tooltip; staged tiles have the remove cross inside the tile and scroll after three rows. A file tile in the
  transcript is one download link (`::after` over the tile), an image's thumbnail opens `ImagePreview` (its `fallback`
  shows the type icon if loading fails). The opened `ArtifactStrip` uses the same icons and middle names. Render check:
  names short, long, 220 characters without spaces, an image, a PDF, SVG and a renamed `.png` (`text/html`), staged,
  sent and as results, panel and `/ai-agent`; no element wider than its box (the head's ellipsis and the clipped tail
  excepted), tail, size and cross inside the tile, no request for the SVG or the renamed file. **Artifacts:** `ArtifactStrip` on top of the chat (only with
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
  paperclip. Without an open chat, dropped files start a new chat
  (`startNewChat(files)`, overlay "A new chat starts with them") and its input takes them; drags without files (text, links) pass through, so the text
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
  the tokens recorded at the LLM proxy (`runUsage`, input plus output; `GET …/llm_calls`, matched by the `response_id` of the run's entries, loaded once
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
- **Fixed tooltips in the agent area:** MUI portals a tooltip into body with `position: absolute`, so it counts towards
  the document's scroll area. Closing the panel with its "x" left the "Close" tooltip open under the pointer; it
  followed the sliding button past the window edge, the document grew 11 to 14 px wider than the window and a
  horizontal scrollbar showed at the bottom for about 12 frames (issue #28; closing with the FAB never did, and
  opening never did, since the fixed panel itself adds nothing). `AgentMenuTheme` now also sets
  `MuiTooltip.defaultProps.PopperProps.popperOptions.strategy = 'fixed'` (`withFixedTooltips`, `agentAreaTheme` in
  `src/agent/menuTheme.ts`, unit-tested). A tooltip that passes its own `PopperProps` replaces the default and must
  repeat the strategy. Render check: start sampling with `window.__p = sample()` and read it after the click
  (`page.evaluate` awaits a returned promise, so sampling inside it runs before the click); per animation frame
  compare `scrollWidth` with `clientWidth` (with a vertical scrollbar `innerWidth` hides a 15 px overflow) and
  `innerHeight - clientHeight` (a horizontal scrollbar); hover the close button 500 ms before clicking it.
 `npm test` runs Vitest (`vitest.config.ts`, files `src/**/*.test.ts`, node environment). The
  config is separate from `vite.config.ts`, so `npm run build` is unaffected; `tsc` type-checks the test files too.
- **Write `package-lock.json` with the npm of the image** (`node:20-alpine`, npm 10.8.2), not with a newer local
  npm: `docker run --rm -v "$PWD":/app -w /app node:20-alpine npm install --package-lock-only`. A lock from npm 11
  left out peer dependencies (`@testing-library/dom` …) that npm 10 requires, and `npm ci` in the Docker build failed
  with EUSAGE (2026-10-05). Dev dependencies must also support Node 20 (Vitest 5 needs Node 22; Vitest 4 is used).
  Check with `docker build` (build args `VITE_PORTAINER_VERSION`, `PROJECT_BASE_URL`, `KEYCLOAK_REALM_NAME`).
- `npm run lint` runs `eslint --fix` over all files; to check without touching upstream files run
  `npx eslint 'src/agent/**/*.{ts,tsx}'`. `npm run build` leaves `dist/`, which is not ignored: delete it.

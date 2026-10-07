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
  **Internet switches (issue #37, gateway PR for #37):** the view asks `kind=all` (filter "Show": Everything, Platform
  calls, Internet switches) and shows the gateway's internet entries as rows of their own (`internetEvent`: "Internet
  requested by the agent / a subagent" with the reason, clamped to two lines, and "approved", "rejected by you", "no
  decision in time"; "Internet switched off by the agent"; "Internet switched on/off by you", via "UI"); an expanded
  row shows approval and who acted. The result filter belongs to platform calls: with a result the query asks
  `kind=platform`, and with "Internet switches" it is disabled. The key figures stay the platform `summary`, which the
  gateway never counts internet entries into; the footer counts platform calls and switches apart (`shownText`). A
  gateway before #37 ignores `kind` and sends entries without it: they count as platform calls, and "Internet
  switches" then shows an empty table, never platform calls (`activityRows` filters by `kindOf`).
- Data comes from the gateway API on the same host, `/agent/api/…` (cookie session, path `/agent/`); types and calls
  are a subset of the gateway's `web/src/api`. On 401 a hidden iframe loads `/agent/oidc/login?prompt=none`, which
  reuses the platform's Keycloak session (`return` stays `/agent/`). The visible "Sign in" of `SignInNotice` passes the
  current platform location as `return` (`loginReturnTarget` in `src/agent/login.ts`, unit-tested), so the login ends
  on the page the user was on; since gateway PR #7 the gateway accepts any absolute path on the same host there
  (gateway API.md, *Return after login*), anything it would refuse falls back to `/agent/` already in the frontend.
- Render check without backend: run `npx vite` with `VITE_AGENT_ENABLED=true` and intercept requests in Playwright
  (serve a fake `keycloak-js` module for `/node_modules/.vite/deps/keycloak-js.js`, answer `api.<base>` and
  `/agent/api/**` with JSON). No mock code lives in the repository.
- **Chat layout v2 (issue #54, design `prototyp/entwuerfe/agent-chat-panel-v2.dc.html` of the thesis repository):**
  the same building blocks in the panel and on `/ai-agent`. **Panel header** 48 px (design 56): symbol, "Agent" (hidden
  during a run, the state chip takes its place), context ring with percentage, "Open in agent page", close; the panel is
  white. **Chat row** (`ChatSelector.tsx`): an outlined field (44 px, design 48) with the floating label "Chat", the
  title (ellipsized, full title as hover tooltip while cut) and a drop-down arrow, then "New chat" and the internet globe
  as square outlined buttons of the same height (`rowIconButtonSx`, `CHAT_ROW_HEIGHT`). It opens a Popover (not a
  `Select`: typing in a Select's menu triggers its type-ahead) with **"Search chats"** on top (focused when the
  transition has entered; `autoFocus` loses against the Popover's focus trap, so `disableAutoFocus` plus
  `TransitionProps.onEntered`), the chats below (open one bold and tinted, state chip, "n waiting", titles wrap), Enter
  opens the first match. The search (`searchChats` in `src/agent/chatSearch.ts`, unit-tested) matches every word of the
  query in the title, over all chats (without a query the newest 20 plus an older selected one), and the open chat's
  subagents by title: the chat is listed for a matching subagent, and only the matching subagents show under it. The
  open chat's subagents come from its view (toggle "🤖 n ⌃/⌄", #48 behaviour). **Every other chat with `subagents > 0`
  has the same toggle (issue #60)**, in the panel and in the history of `/ai-agent`: the first expand loads the chat's
  short list `GET /agent/api/chats/{id}/subagent-runs` (gateway PR for #60; reads the database only, never opens or
  wakes the chat, so it must not go through `agentApi.chat` or `resume`), shown as "Loading subagents …" meanwhile,
  then cached in `AgentContext` (`chatRuns`, shared by panel and history) and loaded again only when the chat's
  `subagents` count changed or a run was live and the list is older than 15 s (`needsLoad`). Titles and states use
  the open chat's rules (`summaryRun` maps a short run onto `runTitle`/`runStatus`; `task_head` carries the first lines
  of the task so headings and tags are skipped as before). Clicking such a sub-entry calls `selectChat(chatId, runId)`,
  which opens the chat with that subagent's view; `ChatView` drops an unknown subagent only once the chat has been
  loaded (`dropUnknownSubagent`), otherwise the fresh view would drop it before its first load. "Search chats" also
  finds subagents of other chats once their list is loaded (`others` of `searchChats`). Pure logic in
  `src/agent/chatSubagents.ts`, unit-tested; open state per chat in `useChatSubagentGroups`. Render check: answer
  `…/subagent-runs` with a delay and check that neither `GET chats/{id}` nor `POST …/resume` of that chat goes out
  before a sub-entry is clicked. The list's maximum height is measured on opening (window height
  minus the row's bottom and the footer), otherwise MUI moves a long list up over the field. With a subagent open the
  field is violet (label "Subagent", 2 px border), a back arrow sits in it and the title reads "chat › 🤖 subagent".
  **Transcript:** empty chat with symbol and "No messages yet. Describe what you want to do." in the middle (only then
  the conversation fills the height; otherwise approvals follow right after the last answer). User messages are light
  green bubbles on the right (`agentColors.userBubble` `#e3efe8`, radius 16/16/4/16, 85 % in the panel), their
  attachments as file cards directly above. An answer (`AgentBlock`) shows its parts **in the order they happened and
  live** (issue #57, as before #54; the summary line "Thought 9 s · 3 tool calls" of #54 and its `ProcessLine` are
  gone, because it doubled the thinking blocks and hid the steps while they ran): text as Markdown without a bubble,
  each thinking block as one collapsed "Thinking · 3 s" (`ThinkingBlock`, one level), each run of tool calls as a
  `StepList` box with state icon, duration and the per-step controls (Stop, "Move to background"), and the files those
  calls sent as the agent's file message right below their step list (`outputsByStepPart` in `src/agent/files.ts`). Below the
  answer the subagents it started as one card (`SubagentCard`: robot, title, state, chevron; replaces the links under
  the `subagent` call), files placed by time only (`placeOutputs`) and, once the turn is over, a **Copy** button
  (Markdown of the text parts, `answerMarkdown` in `src/agent/answer.ts`; `copyText` in `src/agent/clipboard.ts` falls
  back to `execCommand('copy')`; the icon shows a tick for 1.2 s). The live message is joined to the stored answer of
  the same turn (`activeKey`: the live answer, else the last stored answer of a running chat with no user message after
  it), so a turn is one answer. Only while nothing of the running turn's answer shows yet, "The agent is working …"
  with the design's 4 px bar (`WorkingIndicator.tsx`) stands at the end, or "Waiting for your approval …" / "Resuming
  the chat …"; never in place of the steps. The subagent view shows it only while the run has no answer yet or is
  quiet. Approval cards, queue, "Jump to latest", compaction and background notes are unchanged.
  **Field** (`ChatInput`): selection chip above it (28 px pill tinted in the primary colour, kind icon, name in mono);
  an outlined box (radius 8, 2 px primary while focused via `:focus-within`) with the staged files as cards (168 px)
  above the text (`InputBase`, two rows), below paperclip, model, thinking level and a round 36 px send button (grey
  while empty or uploading). During a run Stop (round, outlined, red square) takes the send button's place, with text
  the queue arrow follows it (as #39). The input shows **no run state** any more (decision: the state stays in the
  header; `StatePlace` has no `input`). Placeholder "Message Agent … (/ for commands)", "Ask about this dataset …" with
  a selection, "Queue another message …" while queueing. Pasting files (a screenshot) attaches them (`pastedFiles`).
  Render check: mock as below plus a fake `XMLHttpRequest` subclass for `…/files` (progress held until released), a
  fake `EventSource`, clipboard permissions; compare the transcript's `clientHeight` with the `ki-agents` build (panel
  567 → 572 px, `/ai-agent` 462 → 480 px at 1440 × 900).
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
  ("Message Agent …", issue #54) or names the selection ("Ask about the 2 selected datasets …", `inputPlaceholder`); the panel
  passes no section placeholder any more. **Wire form** (`wireContext`): one object as `object` (every gateway since
  #13), several as `objects` (gateway PR for #45). A gateway before #45 answers 400 `unknown field "objects"`;
  `sendMessage` then sends the page alone once more (`isOldGatewayRefusal`), never one object of several. Read
  contexts from the gateway with `contextObjects` (`objects`, else the single `object` of older rows). **The transcript and the
  queue show no context** (issue #46): no "Refers to …" at sent or queued messages, in panel and `/ai-agent` alike.
  The data stays (`context` of a transcript user item from the gateway's `page_context` source, `QueueRow.context`
  from `QueueEntry.context`), and the gateway keeps storing it for the evaluation. `sectionOf` uses the same route table. Slash commands carry no
  context. The context never grants rights; the delegation decides. Unit tests in `pageContext.test.ts`,
  `transcript.test.ts`, `queue.test.ts`. Render check: check boxes on `/data` with `/agent/api/**` and
  `api.<base>/datasets` mocked; no chip without a selection, the sent `context` per message.
- **Thinking:** thinking blocks of the model (`{type: "thinking"}` in stored assistant messages, live via
  `message_update` with `thinking_start|delta|end`) show as collapsed muted lines "Thinking · 4.2 s" (`ThinkingBlock`)
  in the answer where they happened (issue #57), live as "Thinking … n s". The live message is assembled by the pure reducer
  `src/agent/live.ts` (text, thinking and tool calls by `contentIndex`); `liveParts` and `buildTranscript` turn live and
  stored messages into the same parts. **pi stores no timing per block:** the duration is measured only while the block
  streams, kept in memory by `timestamp:contentIndex`, and handed to the stored message; after a page reload, or for
  blocks never seen live, the header shows "Thinking" without a duration. Open state per block lives in
  `Conversation`, so it survives the switch from live to stored. Every block starts collapsed, also the one still
  streaming (its header counts the time; opened, the text grows live), and opens per block on click. There is no
  "Always show thinking" switch any more (issue #40); an old `agentAlwaysShowThinking:<sub>` value in `localStorage`
  is ignored.
- **Tool step details (issue #58):** a click (or Enter) on a step's row in `StepList` opens its details below it
  (`StepDetail.tsx`), a second click closes them; several can be open. The open state lives with the thinking blocks'
  record in `Conversation` (keys `step:<id>`, `stepOpenKey`), so it survives reloads of the transcript; the task strip
  keeps its own. Stop and "Move to background" sit in a wrapper that stops the click, so they never toggle the details.
  `buildTranscript` keeps per step the tool `name`, the parsed `args`, pi's `result` (text, `isError`), the gateway's
  `executions`, the platform calls of the socket log (`platformCalls`, op `platform`), the call's `approvals` and, while
  it runs, `partial` (pi's `tool_execution_update.partialResult`, kept in `useChatStream` and shown at most every
  250 ms, `partialsReducer`); subagent steps get args, result and the chat's executions by the call's ID. The mapping per
  tool is pure in `src/agent/stepDetail.ts` (unit-tested): **bash** exit code (gateway first, else "Command exited with
  code N"), duration, directory, timeout, the whole command (heredocs included), output from pi's result, else the
  output so far, else the gateway's `output_excerpt` with a note that only the excerpt exists; **read/write/edit/grep/
  find/ls** path and arguments, written content, each change as old and new, the start of the result; **platform calls**
  (`agw-platform` in a bash command, read with a small shell tokenizer, or `mcp_platform_*`) method, path, effect chip,
  status ("200 · ok", "404 · error", "rejected by you", "blocked: …"), duration, body (the approval's redacted preview
  wins over the command's text), the approval (pending: "Go to approval" scrolls to its card, `data-approval-id` on
  `ApprovalCard` items; decided: who and when plus a link to the Activity tab) and the response with its JSON
  indented; **other tools** arguments as indented JSON and the result. Errors are red; command, output, body and
  arguments have a copy button; long blocks show 20 lines or 3 000 characters with "Show all". Everything wraps
  (`pre-wrap`, `overflow-wrap: anywhere`): nothing scrolls sideways in the 400 px panel. Nothing is unredacted: the
  details show what the gateway delivered (the command text is the agent's own argument). Render check: mock
  `socket_calls`, `approvals` and `tool_executions` of a chat, emit `tool_execution_update`, open every step and compare
  each element's right edge with the transcript's.
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
- **Run control (issue #39, field since #54):** Stop sits in the input field, there is no status bar above it. While a
  turn runs (working or waiting for approval) the send arrow becomes Stop (`POST …/abort`, tooltip and label "Stop",
  a spinner while stopping); with text in the field the queue arrow takes the last place and Stop sits left of it,
  Enter queues ("Queue another message …"). The last place always fits the field's content, so a click there after
  typing never stops the agent by mistake. Escape never stops (it only closes the slash menu). The pure
  `inputControls` in `src/agent/runState.ts` decides (unit-tested). The run state shows in the header only (issue #54;
  before, small in the row below the field). A failed stop shows as one amber line below the field with a dismiss
  cross, until the state changes. The state comes from the pure `runStateOf`: `working`, `waiting` (running with an open approval; the live
  approval list beats the chat's counter), `starting`, `resuming` and `idle` (nothing running; the gateway's `dormant`
  counts as idle). The timer uses `running_since`, otherwise the last user message. After an abort the queue is held
  (`QueueList`, "Send now"). The open `ChatView` hands its chat to `updateChat` of the context, so the history list,
  the chat selector and the panel header chip follow live, not only every 15 s. A failed stop adds one line below the field.
- **A state shows only while something happens (issue #35):** `runStateText(state, place)` in `src/agent/runState.ts`
  (unit-tested) decides per place (`header`: panel header and the chat header of `/ai-agent`; `list`: history list and
  the panel's chat selector; the input field shows none since #54). A ready chat (idle, active or dormant)
  shows nothing anywhere, no "active", "Idle" or "ready". Starting and resuming show a muted "loading" chip in header
  and lists, their steps in the transcript (`ResumeBlock`, "Starting a sandbox …"). Working and waiting show in header
  and lists. `RunStateChip` renders nothing where the place has no text. The Status tab still names states (`activityText` in `status.ts`).
- **Resuming a dormant chat:** sending to a dormant chat resumes it; the response to `POST …/messages` comes only after
  resuming. The SSE event `resume` (`ResumeStep`, phases acquire → session → settings → workspace → inputs, then
  `ready` or `failed`) feeds the pure `applyResumeStep` in `src/agent/resume.ts`; `ResumeBlock` shows the steps live
  and collapses to "Resumed in a fresh sandbox · 1.7 s" after the triggering user message (`resumeAnchor`, by message
  `seq`, which transcript items now carry). The sent text shows greyed (`pending` in `useChatStream`) until its user
  message is stored. A lost `ready` is closed on the next pi event (`closeResumes`). The steps exist only live: after a
  page reload the block is gone. On `failed` the request fails and `ChatInput` puts the text back.
- **Model and thinking level:** `ModelEffortPicker` sits in the bottom row of the input field (small 28 px text
  buttons with menus, so they fit the 400 px panel). There is no approval hint in that row, neither the lock icon in the panel nor
  "Write actions need your approval." on `/ai-agent` (issue #47); approval cards and counters say it. Models come from `GET /models`
  (loaded once in `AgentContext`; each entry names the provider, no prices, issue #43). **The model list carries no
  thinking levels:** the
  gateway reports them per chat (`thinking_levels` for the chat's current model, empty until pi has been asked), so
  only those are offered, and the picker is disabled with fewer than two. While the chat runs or resumes, both are
  disabled with a tooltip (the gateway answers 409). A 409 with `code: "context_too_large"` and `details` opens
  `ContextTooLargeDialog`; "Compact first, then switch" posts `compact_first: true`, and `pending_model` shows
  "Compacting, then …" until the chat event brings the new model. The decisions are pure functions in
  `src/agent/modelChoice.ts`, unit-tested.
- **Chat row of the panel and long titles (issue #38, layout since #54 above):** below the panel header sit the chat
  selector, "New chat" as a plus (`NewChatButton compact`, tooltip and label "New chat") and the internet globe; plus
  and globe share `rowIconButtonSx` (`tokens.ts`, as high as the selector). The selector takes the remaining room and
  ellipsizes the title; its tooltip and the opened list show the full title (list as wide as the row, titles wrap with
  `overflow-wrap: anywhere`). **The row's wrapper is a grid with `minmax(0, 1fr)`:** an `auto` column grows
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
  its share, and `llm_calls` (LLM proxy, incl. subagents). Answers carry no token line in the transcript (issue #46;
  `buildTranscript` still sums `usage` per answer, nothing renders it). Panel: ring and an "Open in agent page" button in the header, no tokens figure (issue #33;
  the section chip then gives way; the input's placeholder names the section). The button (`expandToAgentPage` in
  `src/agent/expand.ts`, unit-tested) selects the chat, closes the panel (leaving the Chat tab carries it back, issue
  #50) and navigates to `/ai-agent` (Chat tab) with
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
  messages*, *Display images*). **Since issue #54 there is no "Files" strip**: every file stands at its message or
  answer. Inputs show above the user message that names them; outputs under the answer whose tool call handed them
  over, else (no or unknown `tool_call_id`) under the last answer that started before the file was stored, the first
  answer for older ones; the live answer takes files only by its calls (`placeOutputs` in `src/agent/files.ts`,
  unit-tested; transcript items carry `at`). Anything without an answer shows at the end of the transcript. Inputs that
  were uploaded but never sent with a message (removed from the field) no longer show anywhere. **Cards (#54):** 40 px
  square (image thumbnail, else a type icon: PDF red, image grey, others by kind), name truncated in the middle,
  "731 KB · PDF" (`fileMeta`, `fileTypeTag`), a download button; 220 px (at most 85 %) in the transcript, 168 px with a
  remove cross inside the field. **Uploads** go one request per file through `XMLHttpRequest` (`agentApi.uploadFile`,
  fetch cannot report upload progress); the staged state (`stagedReducer`) keeps files in flight with their progress
  ("Uploading 71%", 3 px bar at the bottom of the card), and sending waits until none is in flight. **Attachments:** the paperclip in the field (`ChatInput`) dropping files anywhere on the agent area and pasting
  files into the field upload them at once (`POST …/files`, multipart, field `file`); files above `artifact_max_mb` from
  `GET /config` are refused before uploading and named with their size; a 413 of the gateway (or a proxy) becomes a size
  message too (`uploadErrorText`). There is deliberately no `accept` filter: any type can be attached, the paperclip
  tooltip and the drop overlay name the formats the agent reads (`READABLE_FORMATS`: Office, PDF, CSV, text, HTML, EPUB,
  images; gateway skill `documents`, issue #42). Only the command-line binding converts Office files and PDF; with MCP
  or REST alone the agent says it cannot read them (gateway API.md, *Attachments to messages*). Uploaded files sit as cards inside the field until sent; sending
  posts their names as `attachments` with the text (text may be empty), also when the message is queued (the queue row
  names the files); a failed send puts text and chips back; a slash command leaves the chips for the next message.
  The gateway appends the block `[Attachments in /workspace/inputs/]` to the stored user message; `buildTranscript`
  splits it off (`splitAttachments`) and the user bubble shows the files above it as cards (images enlarge, every card
  downloads `…/artifacts/{name}?kind=input`). **Cards (issue #41, look since #54, see above):** one look for staged files, a sent
  message and the results of an answer: a square with the thumbnail (only `previewKind` image: raster type **and**
  extension; a name the artifact list does not know yet never gets one) or a type icon (`fileTypeOf`: extension first,
  then content type; PDF, Word, spreadsheet, presentation, text incl. CSV, archive, image, file), the name truncated in
  the middle (`splitFileName`: the head ellipsizes, the last four stem characters and the extension stay,
  `MiddleName`), full name in the tooltip; staged cards scroll after three rows. An image's thumbnail opens
  `ImagePreview` (its `fallback` shows the type icon if loading fails). Render check: names short, long, 220
  characters without spaces, an image, a PDF, SVG and a renamed `.png` (`text/html`), staged, sent and as results,
  panel and `/ai-agent`; no element wider than its box (the head's ellipsis and the clipped tail excepted), no request
  for the SVG or the renamed file. **Artifacts:** the chat's list comes with `GET /chats/{id}` and the SSE event
  `artifact`. **Files the agent sends (issue #62):** since gateway PR #29 the agent sends files without approval;
  each shows at once (SSE `artifact`) as the agent's **file message** (`AgentFileMessage`, `data-testid
  "agent-file-message"`): the cards of a user's attachments, left-aligned, right after the step list of the call that
  sent them (`outputsByStepPart`), never inside it; files without a call of that answer follow the answer
  (`placeOutputs`). In a subagent's view its own files show the same way (`outputsByCall`; subagent steps are keyed by
  their log entry, so `Step.callId` carries the tool call). Only an older gateway still sends a pending
  `artifact_upload` approval, which `ApprovalCard` shows with name, size, type and the text preview, "Allow" /
  "Reject"; decided ones stay readable in the step details ("Upload "x" · Approved by you"). Render check: a stored
  chat with two files of one call, an `artifact` event for a third, the subagent view with a file of a subagent call. **Display images:**
  `Markdown` renders `![alt](path)` through `src/agent/images.ts` (port of the gateway's `web/src/lib/images.ts`): local
  paths under `/workspace`, `/tmp`, `/home/agent` load from `GET …/images?path=…&msg=…` once the answer is stored (`msg`
  = `responseId`, else `ts-<timestamp>`, carried as `imageKey` on text parts); `data:` PNG/JPEG/GIF/WebP show directly;
  **foreign addresses and SVG are never loaded** (they would leak sandbox data without internet approval), they show as a
  muted note, as do local images of an answer still streaming. A click enlarges (`ImagePreview`, MUI Dialog with
  download). Images are split off a line before the other inline forms, so underscores in a path cannot start italics.
  **Links (issue #61 of the thesis repository):** the inline forms come from `inlineTokens` in `src/agent/inline.ts`
  (unit-tested). Markdown links and bare URLs (GFM autolink literal, also `<https://…>`) become links only for
  `http`/`https` with a host, always `target="_blank"` and `rel="noopener noreferrer"`; trailing punctuation and a
  closing bracket without an opening one inside the URL stay outside (`(see https://a.org/x).`), balanced ones stay
  in (`…/Poker_(card_game)`). Inline code and fenced blocks are never linked. Underscores inside a word do not start
  emphasis (CommonMark), so `Card_counting` in a URL or `snake_case` stays intact. Bare URLs break anywhere, so long
  addresses wrap in the 400 px panel.
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
  SVG download), "Code" toggles the source. A render error shows a short note (line number, full message as tooltip)
  with the source collapsed under "Show source" and a "Copy" button (issue #59). **HTML in flowchart labels is
  tolerated** (`tolerateHtmlLabels`, issue #59): `<br>`, `<br/>`, `<br />` in node labels (all shapes, subgraph titles)
  and `|…|` edge labels become a real line break of a quoted label, other tags are removed, nothing outside labels and
  nothing in other diagram types changes; if the adjusted source still fails, the original is rendered so the error's
  line number matches what the user sees. Measured with mermaid 12 in strict mode without HTML labels: `<br/>` alone
  already breaks lines and `<b>` shows literally; what fails to parse are brackets or quotes in unquoted labels
  (`A[Training (CPU)]`), which quoting the label fixes. `#quot;` renders literally as `&quot;`, so a stray `"` becomes
  `'`. While an answer streams (`streaming` on `Markdown`, the live `AgentBlock`), a block renders only once
  its closing fence has arrived (`readFence`, CommonMark rules: same character, at least as long); stored answers render
  unclosed blocks too. Large diagrams (over 4000 characters or 150 edges) and the sixth diagram of an answer onwards
  render only on click. Diagrams the agent renders itself with `mmdc` arrive as PNG display images (see *Files*).
  **TypeScript 4.9 cannot parse mermaid's types** (they pull in `@types/d3` with TypeScript 5 syntax): `mermaidLoad.ts`
  imports `mermaid/dist/mermaid.core.mjs` by path (the package's own ESM entry), typed by `src/agent/mermaid-module.d.ts`;
  importing `'mermaid'` breaks `tsc`. Render check: in the dev server the mermaid chunk only loads when a diagram
  appears; the first visit after the lockfile changed re-optimizes dependencies.
- **Acceptance reports (issue #53):** pi-subagents asks subagents with acceptance criteria to end with a fenced JSON
  block tagged `acceptance-report` (gateway `third_party/pi-subagents/src/runs/shared/acceptance.js`). `Markdown`
  renders fences tagged `acceptance-report`, `acceptance`, `acceptance_report` or `acceptanceReport` (case ignored) as
  `AcceptanceReportBlock`, wherever they appear (subagent view, main transcript, task strip); every other fence, `json`
  included, stays a code block. Collapsed it is one muted line "Acceptance report · 2/3 criteria satisfied · 4 files
  changed · 2 commands passed · 1 failed" (criteria in the error colour when one is not satisfied, failed commands as
  their own red piece; pieces wrap only at the separators, so in the panel a long line takes two rows). Opened: criteria
  with status and evidence, changed files, tests, commands with result and summary, validation, diff summary, review
  findings, residual risks ("none" dropped), notes, all wrapping (`overflow-wrap: anywhere`), plus "Show raw JSON"
  (pretty-printed, `pre-wrap`). A body that is not JSON, not an object or has no known field shows "not valid JSON,
  shown as code" and opens to the raw code, also wrapping; while an answer streams an unclosed block shows "being
  written …". Parsing follows pi-subagents (camelCase and snake_case fields, wrapper keys, status synonyms such as
  "met" or "ok") in the pure `src/agent/acceptance.ts`, unit-tested; it does not repeat pi-subagents' validation.
  Render check: a subagent entry of kind `text` with such a block; per element `scrollWidth` against `clientWidth`.
- **Subagents and background tasks:** as in the gateway's own UI (API.md, *Background tasks*). **Running
  commands:** a running `bash` step in `StepList` gets "Move to background" and "Stop" (`POST …/tools/{call}/background`,
  `…/stop`). Which calls are controllable is the pure `runningReducer` in `src/agent/background.ts`: bash executions
  seen as pi events (`tool_execution_start` until `_end`) plus the gateway's list `GET …/tools/running`, fetched with
  each load of a running chat and 400 ms after a bash start (the gateway registers the command a moment after pi reports
  it, so a live one stays until its end event). A failure (404: already ended, 409: too many background tasks) shows
  below the row. A step that started or became a background task carries a chip "bg-3 · running". **Background
  tasks** and **subagent runs** sit in `TaskStrip` on top of the chat (only when there are any): collapsed "Tasks Background
  1 running · Subagents 1 running · 2 done" with a spinner while something runs; opened, the tasks (running first) with
  state, runtime, the last three lines of `tail` and Stop (`POST …/background/{bg}/stop`, 409 explained), and the runs
  with title (workflow label, else the task's first line), state, duration, tool count, agent and short run ID, and
  the tokens recorded at the LLM proxy (`runUsage`, input plus output; `GET …/llm_calls`, matched by the `response_id` of the run's entries, loaded once
  subagents exist). A run opens to its own steps (`runItems`: task, step lists, text answers) and has a button that opens
  its read-only view (see *Looking into a subagent*). Data: `background`,
  `subagent_entries`, `subagent_runs` of `GET /chats/{id}`, SSE `background` (a throttled `output` never overwrites an
  end), `subagent`, `subagent_run`, `llm_call`. A run's state comes from pi-subagents when known, otherwise it is
  estimated from its entries (`runStatus`, `src/agent/subagents.ts`). **Notes:** the gateway's note that a task ended
  (user message with a `background` source) shows as one muted line "Background task bg-3 finished · exit 0 · 0:08"
  (`BackgroundNoteLine`), opening to command, last lines and log path; queued notes are labelled from their header line.
  Render check: answer `tools/running`, `background`, `llm_calls` and the chat's `background`/`subagent_*` fields, drive
  SSE `pi` `tool_execution_start|end`, `background`, `subagent`, `subagent_run`.
- **Looking into a subagent (issue #48):** every subagent run of the open chat can be opened read-only, with the
  transcript components of the chat (`runTranscript` in `src/agent/subagents.ts`: each task as a user bubble, text
  answers and tool calls as agent blocks with step lists, result done/failed/running/not finished), live through the
  SSE events `subagent` and `subagent_run`. No input and no stop per subagent; the chat's `ChatInput` stays mounted but
  hidden, so a draft and staged files survive. **Frame (issue #54):** on top of its transcript a state chip ("done",
  "running" …) and "Subagent log · read-only"; in place of the input "Subagents can't receive messages." with an
  outlined violet "Back to chat" (`SubagentReadOnlyBar`). Selection lives in `AgentContext` (`selectedSubagent`,
  `selectSubagent`, valid only for the selected chat; `selectChat`, also of the same chat, and "New chat" leave it; a
  run the loaded chat does not know falls back to the chat). The open `ChatView` publishes its runs
  (`openChatSubagents`), which `useSubagentNav` turns into sub-entries (robot, title, state). **Titles cost nothing:**
  `runTitle` gives the workflow label unless it is empty or only the agent's name (`worker`, `scout`, case ignored;
  issue #52), else the first meaningful line of the task (markdown marks, "Task:", tags such
  as "[Context]", bare headings such as "## Task" and punctuation-only lines skipped, whitespace collapsed, 70
  characters), else the agent; `subagentNav` adds the short run ID only for runs with neither, so "Subagent 1" never
  shows. **No task in tooltips (issue #52):** the task is the first message of the subagent's transcript; titles
  (breadcrumb, sub-entries, subagent card, task strip) are `EllipsisText`, whose one-line tooltip shows the title only
  while it is cut; the back arrow says just "Back to chat", and the panel's chat selector shows no tooltip while a
  subagent is open (at most one tooltip at a time). All of them open on hover only (`disableFocusListener`: the select
  gets focus back when its menu closes, which used to leave the tooltip open after a click outside), close on leave,
  press and Escape, and check `:hover` before opening (`isHovered`): React bubbles mouse events out of portals, so
  hovering the open menu or its backdrop started the select's enter timer and opened its tooltip after the menu
  closed. **Group:** open while a run is live, closed when all are done;
  the user's toggle holds until that default changes (`groupOpen`, `toggleGroup`), the group of the opened subagent is
  always open, and closing it goes back to the chat. **Panel:** the sub-entries sit indented under the open chat in
  the chat selector's list (badge "🤖 n" with the toggle on the chat's row, `stopPropagation` so it does not select the
  chat); a selected subagent turns the field violet with a back arrow in it and "chat › 🤖 subagent" as title (see
  *Chat layout v2*). **`/ai-agent`:** sub-entries under
  the selected chat in the history (grid `minmax(0, 1fr)`, else long titles widen the column), the breadcrumb in the
  chat header's title. Marking: robot icon, breadcrumb or violet field, the state chip on top and the footer in
  `agentColors.subagent` (no left border since #54). Second ways in: the answer whose `subagent` call started runs lists
  them as a card below its text (`SubagentCard`; `runsByCall`, after the gateway's `assignRuns`: the last answer with a
  subagent call before the run's start, the call naming the run's agent wins), and the runs in `TaskStrip` carry an
  open button. **In the panel, subagents alone open no task strip**
  (`subagentsElsewhere`): they are in the chat selector, and the transcript keeps the height it has without subagents
  (measured 573 px with and without; the strip took 46 px before); with background tasks the strip shows and lists
  the runs too. Render check: mock `subagent_entries`, `subagent_runs` and an SSE `subagent` event; compare the
  transcript height of a chat with and without subagents and the select's height with and without breadcrumb.
- **One current chat for page and panel (issue #50):** the selected chat lives once in `AgentContext`
  (`selectedChatId`, with the subagent opened in it), so `/ai-agent` and the panel always show the same chat; "Open in
  agent page" and the nav entry "Agent" land on the panel's chat. **The stream is shared too:** `SharedChatStreamProvider`
  (`src/agent/sharedChatStream.tsx`, inside `AgentProviderIfEnabled`) runs `useChatStream` for the selected chat in a
  host keyed by chat id, and `ChatView` takes it with `useSharedChatStream` (its own stream only outside the provider).
  Moving from page to panel therefore swaps the view, not the stream: no new `GET /chats/{id}`, no second
  `EventSource`, no second `…/resume` (the resume decision lives with the stream), and a streaming answer, its thinking
  times and resume steps keep going. The host runs where the chat is on screen (`chatShownAt`: every platform page,
  since the persistent drawer keeps the panel's `ChatView` mounted while closed, and the Chat tab of `/ai-agent`; not
  Activity or Status) and publishes each state in a layout effect, so a view mounted in the same commit has it before
  paint (`streamFor` hands a view only the stream of its own chat; until then it renders the idle stream). The unsent
  text goes along per chat (`DraftStore`, memory only; `ChatInput` `initialText`/`onTextChange`); staged files do not.
  **Panel rule** (`panelReducer` in `src/agent/panelCarry.ts`, unit-tested): `open` (the user's choice) plus `carry`.
  On `/ai-agent` the carry follows the page (`noteRoute` from the provider on every location and selection change):
  set on the Chat tab with a chat, cleared on Activity, Status or without a chat; on platform pages it stays. The panel
  shows when either is set, so after leaving the Chat tab it is open on the next page from the first frame (the drawer
  mounts open, no slide-in) and stays open between platform pages; × or the floating button set `open` and clear the
  carry, so a closed panel stays closed until the user comes from the Chat tab again. Both are kept in `localStorage`
  (`agentPanelOpen`, `agentPanelCarry`). Render check: a fake `EventSource` in an init script, emit `message_start`
  and `text_delta` on `/ai-agent`, type a draft, click "Datasets" in the side nav and sample the drawer's left edge per
  animation frame; count `GET /chats/{id}`, `…/resume` and `EventSource` instances before and after. The platform's
  "Model Training" page throws on mocked empty data (RJSF "Invalid schema"), use another page there.
- **Renaming in the history (issue #49):** each chat entry on `/ai-agent` has a "⋯" button (`HistoryEntryMenu` in
  `HistoryRename.tsx`; visible on hover and focus, always on the selected entry, its 24 px reserved so titles do not
  reflow) with "Rename"; double-click on the title and F2 on the entry do the same. Subagent sub-entries get no menu.
  The title becomes an inline field (`RenameField`), prefilled and selected: Enter or blur saves, Escape cancels; an
  empty or unchanged title (after collapsing whitespace) does nothing; at most 120 characters, the gateway's
  `maxTitle` (`MAX_TITLE`, `normalizeTitle`, `renameDecision`, `renameReducer` in `src/agent/rename.ts`,
  unit-tested; `useRenameChat` holds the state). Saving goes through `/rename` (`POST …/commands`): in the gateway it
  only stores the title (`title_source: user`, no automatic naming afterwards) and publishes the chat event; it neither
  resumes a dormant chat nor takes a slot, so no extra route was needed. The title shows at once through `updateChat`
  (history, chat header, panel's chat selector); a failure puts the old title back and shows "Rename failed: …" under
  the entry. **The menu opens the field only after it has closed** (`TransitionProps.onExited`, `disableRestoreFocus`):
  opened while the menu still traps the focus, the field lost it at once and the blur saved. The menu is portalled but
  React events bubble to the entry, so it stops click, keydown and double-click, else it selects the chat. Opening via
  the menu never selects the chat (no resume); a double-click on an unselected entry selects it with its first click,
  which resumes a dormant chat as any opening does (#31). The gateway moves a renamed chat to the top of the list on the
  next refresh (`updated_at`). Render check: mock `POST …/commands`, hover for the button's opacity, wait about 400 ms
  for the menu's transition before a screenshot, check focus and selection of the field and that no `…/resume` follows.
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

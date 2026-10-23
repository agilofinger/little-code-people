# Little Code People: design

How the house works: where the session data comes from, how it reaches the browser, how the
little people decide what to do, and how it is kept safe. For running it, see the README.

## 1. What it is

A side-view cutaway of a three-storey house on a C64-style screen. Every running Claude Code
session is one little person living in it.

| Real world                            | In the house                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| New session starts                    | Doorbell rings. The person waits outside with a suitcase, the door opens, they walk in, look around. |
| Session ends                          | They pick up the suitcase, walk calmly to the door, wave and leave. The door closes.                 |
| Session busy with tools               | They go to the object that matches the tool and work there (see §5).                                 |
| Session idle                          | Idle routine: piano, TV, records and dancing, fireplace, cooking, reading, sleeping at night.        |
| Session waits for permission or input | They walk to the front of the screen and knock on the glass.                                         |
| Assistant writes text                 | A speech balloon above the head; the full text in the printer log.                                   |
| End-of-turn summary                   | They type a letter. It lands in the mailbox.                                                         |
| Session A messages session B          | A balloon, and an envelope travels between them.                                                     |
| Session spawns a subagent             | A little kid, cat or dog runs around the house on its errand, then trots back to its parent.         |
| Session is thinking                   | Thinking pose. Click it for a thought cloud with the thinking and the last answer.                   |
| Tool error, failed tests              | Mood drops: sad face, slumped walk. Praise lifts it again.                                           |
| 10th session moves in                 | A "FULL" sign goes up on the door, and you get a notification.                                       |
| An 11th session starts                | It rings, nobody opens, and it waits on the doorstep until someone leaves.                           |

Two ways to run it:
1. **Local** (the standard): one command starts a small bridge process and opens the game.
2. **Hosted** (optional): the same static game served online. It shows a demo house, and connects
   to a viewer's own local bridge only when they open it with their key.

## 2. Where the session data lives

Verified with Claude Code 2.1.30x. None of this is a documented, stable interface; it can change
with any release.
- **Live session registry**: `~/.claude/sessions/<pid>.json`, one file per running session.
  Fields used: `pid`, `sessionId`, `cwd`, `name`, `status`, `waitingFor`, `startedAt`,
  `procStart`, `messagingSocketPath`, `kind`. Status values: `busy`, `shell`, `idle`, `waiting`.
  The `sessionId` changes on `/clear`, so a person's identity is the **process** (`pid` plus
  `procStart`). A crashed session can leave a stale file, so the bridge checks that the pid is
  alive.
- **Transcripts**: `~/.claude/projects/<cwd-slug>/<sessionId>.jsonl`, appended live. Record types
  used: `assistant` (`text`, `thinking`, `tool_use`), `user` (prompts and `tool_result`),
  `attachment`.
- **Subagents**: `~/.claude/projects/<cwd-slug>/<sessionId>/subagents/agent-<id>.meta.json`.
- **Messages between sessions**: an outgoing `SendMessage` tool call addresses
  `uds:/tmp/cc-socks/<pid>.sock` (the receiver's `messagingSocketPath`). The receiver gets an
  `attachment` of type `queued_command` with `origin.kind = "peer"`. The bridge only reads; it
  never talks to these sockets.

All knowledge of these formats lives in one adapter (`packages/bridge/src/sources/claude-fs/`)
behind a normalized protocol, so the game never sees raw records. Anonymised fixture transcripts
plus tests catch format changes after a Claude Code update. Claude Code hooks are a possible
second source later, but they only reach sessions started after they are configured and carry no
assistant text, so the files stay the primary source.

## 3. Architecture

```
 ~/.claude/sessions/*.json ──┐
 ~/.claude/projects/**.jsonl ├─► BRIDGE (Node, local only) ──WebSocket──► GAME (static, browser)
 subagents/*.meta.json ──────┘    adapters → normalizer          JSON events   simulation + renderer
                                  → session store → server                     + audio + UI
```

### 3.1 Bridge (`packages/bridge`)

- Node 22, TypeScript run by `tsx`. Libraries: `ws`, `sirv`, `zod`, `open`, `env-paths`.
- **Polling** instead of file watchers: the registry once a second, each transcript every
  400 ms, subagent folders every 1.5 s. Cheap for a dozen small files, and identical on every
  platform.
- **Transcript tailer**: follows each JSONL by byte offset, handles partial lines, and sends only a
  short backlog on connect, never the whole history.
- **Message correlator**: matches a sender's `SendMessage` with the receiver's incoming message and
  emits one `session.message`.
- **Redaction**: common secret patterns (API keys, tokens, passwords, connection strings) are
  masked before anything leaves the bridge.
- **Strictly read-only**: it never writes into Claude Code's files or sockets. The only file it
  writes is its own access key.

### 3.2 Security model

The server binds to `127.0.0.1` and puts three locks, all required, in front of the event stream:
- **Host** must be `127.0.0.1` or `localhost` (stops DNS rebinding).
- **Origin**, when a browser sends one, must be on an exact allow-list: the bridge's own page, the
  Vite dev server with `--dev`, and hosted copies named with `--allow-origin` or
  `LCP_ALLOWED_ORIGINS` (https only, no wildcards).
- **Access key**: every connection must present it (`?token=`, compared in constant time). It
  keeps out other users of the same computer and pages that were never given the link. It is
  stored with mode 0600 in the bridge's config directory, survives restarts, and is replaced with
  `--new-token`. A wrong key gets close code 4401, so the page can ask for the link instead of
  retrying.

The bridge prints `http://127.0.0.1:6464/#token=…` (plus `&bridge=…` for a hosted copy on another
port). The fragment never reaches a server. The page stores the key and removes it from the
address bar.

In the page, session text only ever becomes DOM text (`engine/dom.ts`), never HTML. One security
policy (`packages/game/security.ts`) is sent by the bridge as headers, and by the build as a meta
tag and a `_headers` file for static hosts: scripts, styles and fonts only from the page itself,
connections only to the page's own origin and to local bridges, no framing.

### 3.3 Protocol (`packages/protocol`)

Shared zod schemas and types. Every event is validated in the browser.

```ts
hello            { version, host, sessions: SessionSnapshot[] }   // info + recent log + activity + subagents
session.joined   { session: SessionSnapshot }
session.updated  { session: SessionInfo }        // status busy|shell|idle|waiting, waitingFor, name
session.left     { id, reason: 'closed' | 'crashed' }
session.activity { id, activity: { kind, tool?, label, at } }
session.log      { entry: { kind: user|speech|thinking|tool|error|message-out|message-in|helper|system,
                            text, final?, tool?, peer?, peerName? } }   // speech+final = a letter
session.mood     { id, delta, reason }
session.message  { from, to, preview, at }
subagent.started { parentId, subagent: { id, label, critter: 'kid'|'cat'|'dog' } }
subagent.finished{ parentId, subagentId }
```

The bridge reports every live session. Capacity and the doorstep queue are game rules. A
person's look is a hash of their process identity, so a session keeps its face across reloads and
`/clear`.

### 3.4 Game (`packages/game`)

- Vite and TypeScript, no UI framework, Canvas 2D. The only runtime libraries are zod and the
  font.
- **Display**: a 320×200 screen with the 16-colour C64 palette (Pepto's Colodore values) and
  2:1 wide pixels like multicolor mode, scaled by whole numbers without smoothing.
- **Simulation** at a fixed 50 Hz (the PAL rate), animation at 8 fps.
- **World**: floors linked by stairs; rooms are segments; objects are spots with an occupant and
  a pose. Pathfinding is a small search over floors and stair flights.
- **People**: a script of walk, wait and do steps, chosen by a small brain from session status,
  activity, time of day and mood. Activity changes are debounced so a burst of tool calls never
  makes anyone sprint between rooms. Walking is 22 px/s, climbing 14 px/s.
- **Text**: the canvas uses a 3×5 pixel font drawn for this project; the DOM panels use Press
  Start 2P (SIL Open Font License). Balloons show the newest text, a few lines at a time.
- **Command line**: typed requests like `HELLO PIXEL` or `PLEASE PLAY PIANO`. Manners matter:
  each PLEASE adds 4 to a request's priority and a happy mood adds 3; at 8 or more it happens now,
  at 4–7 later, below 4 never. Requests only move the little people, never the real sessions.
- **Capacity**: at most 10 people inside. Helpers don't count. Extra sessions wait on the doorstep
  in arrival order.
- **Helpers (subagents)**: kids, cats and dogs, picked by a hash of the subagent ID. At most six
  are visible; the rest are counted.
- **Thought cloud**: the current thinking on top (or a funny stand-in when it was not stored,
  which is most of the time), the last answer in full below, scrollable.
- **Seasons**: on AUTO the house follows the calendar. Christmas is all of December, Halloween
  October 17–31, Easter from Palm Sunday to Easter Monday, otherwise the four meteorological
  seasons (northern hemisphere). The THEME button picks one by hand or switches decorations off.
- **Audio**: a small SID-style Web Audio synth with pulse, triangle, saw and noise voices.
  Original tunes, plus the public-domain "Jingle Bells" at Christmas.
- **Connection**: served by the bridge (or the dev server), the page uses its own origin. A hosted
  page connects to `ws://127.0.0.1:6464/events` only once it has a key. Without a bridge it runs
  the demo house and keeps retrying; when real sessions arrive, the demo people vanish.

### 3.5 Art pipeline

Sprites are palette-indexed text grids in TypeScript modules (`packages/game/src/art/`),
rasterized once into cached canvases. People are composed at runtime from a body frame, one of
five head styles and a per-person colour set, so every session gets a distinct, stable person.
If a pixel artist joins, the pipeline moves to Aseprite sheets in one migration and the grids go.

## 4. Repository layout

```
little-code-people/
  README.md  SECURITY.md  LICENSE  docs/DESIGN.md  hosting/
  packages/
    protocol/   zod schemas and types for bridge ⇄ game events, the link format
    bridge/     src/sources/claude-fs/ (paths, registry, tailer, normalize, subagents),
                hub.ts, server.ts, auth.ts, origins.ts, redact.ts, cli.ts
      test/     normalizer, hub and server tests; anonymised fixtures per Claude Code version
    game/       security.ts (page policy)
                src/engine/  palette, sprites, 3×5 font, DOM builder, markdown → plain text
                src/art/     people, critters, furniture as pixel grids
                src/world/   layout, navigation, house renderer, seasons
                src/sim/     person, brain, critter, world (events, capacity, queue)
                src/render/  scene (people, balloons, emotes, envelopes, hats)
                src/ui/      strip, thought cloud, printer, mailbox, command parser
                src/audio/   SID-style synth, sound effects and music
                src/net/     bridge client, demo source
```

Tooling: npm workspaces, TypeScript 7 (strict), Vitest, Biome. CI runs lint, typecheck, tests
and the build on every push and pull request.

## 5. Mapping session activity to the house

| Session signal                         | Activity     | Object                                                      |
| -------------------------------------- | ------------ | ----------------------------------------------------------- |
| `Bash`, status `shell`                 | shell        | one of two computers in the computer corner                 |
| `Edit`, `Write`, `NotebookEdit`        | edit         | typewriter in the attic                                     |
| `Read`                                 | read         | armchair with the newspaper, or the bookshelf               |
| `Grep`, `Glob`, `ToolSearch`           | search       | filing cabinet, or the bookshelf                            |
| `WebFetch`, `WebSearch`, browser tools | web          | telephone in the living room, or the TV                     |
| other MCP tools                        | tool         | filing cabinet, telephone or computer                       |
| `thinking`, model generating           | think        | stays put, hand on chin, a little cloud                     |
| `Agent` / subagent start               | subagent     | a kid, cat or dog runs around until the subagent finishes   |
| `SendMessage` / incoming peer message  | message      | a balloon and a flying envelope                             |
| status `waiting`                       | waiting      | walks to the front and knocks on the glass                  |
| status `idle`                          | idle routine | piano, TV, records, cooking, cards, fireplace, bed at night |
| `tool_result` with error               | mood −       | sad face, slumped walk                                      |
| End of turn with text                  | letter       | a letter in the mailbox                                     |

## 6. Hosting and privacy

- The hosted site is only static files. Session content never goes to any server.
- A hosted page without a stored key never contacts the visitor's computer and shows the demo.
- With a key, it connects from the browser to the bridge on the visitor's own machine. Chrome and
  Firefox allow this (Chrome asks once for local network access). Safari may block it; then the
  local address is the way in.
- Whoever controls a hosted origin can read your sessions while you have it open with your key, so
  only allow origins you control. See hosting/README.md.
- Watching sessions from another device would need a relay service that ships transcripts off the
  machine. That is deliberately not part of this project.

## 7. Out of scope

- Sending prompts or commands into real sessions from the game.
- Showing sessions from other machines.
- Windows: the bridge resolves `~/.claude` portably, but it is tested on macOS.

## 8. Inspiration and naming

The idea is an homage to the "house on a disk" games of the mid-1980s, above all Activision's
_Little Computer People_ (1985): a cutaway house, a little person with routines and moods,
polite typed requests and letters. Those are ideas; everything you see and hear here, from the
pixel art and the tunes to the font and the code, was made from scratch for this project. No code,
graphics, sound or text from any original game is used.

The name avoids other people's trademarks: no "Claude" in the product name (it only says what it
works with), and a different word in the middle of the homage title.

## 9. Status and next steps

Built: the bridge, the house, people, words, social life, sound, seasons, hardening and an
optional hosted copy.

Next:
- Test the hosted copy against a local bridge in Chrome, Firefox and Safari.
- Footsteps, lighting inside the rooms at night, and a browser smoke test in CI.
- Possibly publish the bridge to npm (`npx little-code-people`), with provenance publishing from
  CI.
- An art pass by a pixel artist.

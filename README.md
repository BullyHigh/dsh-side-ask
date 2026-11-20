# Side ask (侧边提问)

Ask a read-only side question about the current conversation while that
conversation keeps working. The side question runs in its own session, shown in
a right-sidebar tab. The tab starts on an empty page (the copied history is not
displayed) but the model carries the whole conversation, including a turn that
is still running, and the main composer's unsent draft comes along. Closing the
tab stops and archives the side session.

A DSH plugin bundle (`dsh.bundle`) for DeepSeek Harness 0.2.2-rc.5 and newer
0.2.x. No dependencies, no build step: the package ships the finished Host and
browser halves.

## Install

- **Desktop app** — open **Plugins**, choose **Add plugin** (or the arrow →
  **Install a third-party plugin**), and paste `github:BullyHigh/dsh-side-ask`.
  The Desktop profile is managed by the app, so the CLI cannot install into it.

- **CLI** — for a web or npm-style profile, name the profile you run:

  ```sh
  dsh plugin --profile web add github:BullyHigh/dsh-side-ask
  ```

- **Tarball** — download the `dsh-side-ask-<version>.tgz` asset from
  [Releases](https://github.com/BullyHigh/dsh-side-ask/releases) and pick the
  file in **Add plugin** (CLI: `dsh plugin --profile <name> add
  /absolute/path/dsh-side-ask-<version>.tgz`).

- **Source folder** — point **Add plugin** at a clone of this repository; that
  installs a link, so keep the folder where it is.

Restart DSH if the Plugins page reports that a restart is required. The plugin
only uses DSH Client services and slots plus one internal slash command; a
different DSH release may change those and need an update.

## Usage

- **Header button** — the speech-bubble button beside the conversation title.
- **Shortcut** — `Alt+Q` on Desktop, `Ctrl+Alt+Q` (`Cmd+Alt+Q` on macOS) in the
  browser. Change it under **Settings → Shortcuts** (`sideAsk.open`). Pressing
  it again reuses the existing side question for that conversation instead of
  creating another.
- **Selection menu** — select text in the transcript and the floating menu
  offers **Quote text** and **Ask on the side**. The side-ask action opens (or
  reveals) the side question and puts the selection into its composer as a
  quote, ready for your question.
- **Right Sidebar's add menu** — the guide page lists an **Ask on the side**
  card next to the shipped tools.

The selection menu is the host's own Quote interaction with this plugin's
surface drawn in front of it: quoting keeps the host's behaviour, and unloading
the plugin restores the host's own button.
- The right-sidebar tab hosts the ordinary conversation UI (scroll, stop,
  permission control) with a **Read-only** badge in its tab header. It opens on
  an empty transcript: only the turns you ask in the side session appear.
- The main composer's unsent text is moved into the side composer when a new
  side question is created (text only; staged attachments stay in the main
  composer).
- Closing the tab stops any running work in the side session and archives it
  silently. Find archived side questions under **Show archived** in the
  session list and unarchive one to continue.

## How it works

1. The conversation is forked at its current durable tail (`ctx.sessions.fork`
   with the latest event seq), so the side question sees history up to the
   moment you click — including a turn that is still running. Only a
   conversation with no durable events at all falls back to a blank session.
2. The child is titled `Side ask · <original title>` and the Host's internal
   `/side-ask-readonly <session-id>` command appends `sandbox/mode = read-only`
   and `approval/policy = ask` to its session log.
3. The parent's live draft is read through `ctx.conversation.input.for(scope)`
   and written into the child with `requestDraftInitialization`; the parent
   draft is cleared only after the tab opened, and only while it still holds the
   moved text.
4. The tab body renders the shipped `conversation.content` factory. A scoped
   rule hides every Turn number the fork inherited (recorded as `?quiet=<n>` on
   the tab's resource address) plus the older-history edge, so the transcript
   looks empty; turns created in the side session are numbered after the fork
   and stay visible.
5. Closing the tab archives the child with `stopActivity: true`. If archiving
   fails, an error notice offers **Reopen**; the parent → child mapping is
   kept so the same child comes back instead of a new fork.

The internal command appears in the `/` command list of this DSH version, but
its transcript row is hidden. It only accepts the id of the session it runs in,
so running it in an ordinary conversation changes nothing.

## Limits

- The empty transcript is a display rule, not a context cut: the hidden turns
  are still in the side session and the model can refer to and quote them.
- The fork captures durable events. Assistant text that is still streaming at
  the moment you click is not part of the copy until it settles.
- Attachments staged in the main composer are not moved; only the text draft is.
- Both sessions share one working folder. The read-only sandbox is the only
  write barrier, and it governs file operations only — not network, processes,
  or credentials.
- The model can still request a temporary sandbox escalation
  (`sandbox_permissions`); `approval/policy = ask` forces that through a human
  approval.
- Archiving is not deletion: the log, index, and spill files remain on disk.
  Archived sessions may still appear in search with an unarchive action.
- An archived session cannot be opened directly; unarchive it first.
- Archiving accumulates; DSH has no bulk delete. Unarchive one at a time, or
  remove storage files yourself (unsupported, risky).
- The tool set matches the source session (the fork reuses its preset), so web
  search, file reads, and read-only commands work; only writes are refused.
- The fork uses the current default model, which may differ from the model the
  source session used.
- The side session carries its own copy of the source conversation's goal, with
  automatic continuation disarmed, so it never runs extra rounds on its own.
- Reloading the page or disabling the plugin does not archive a side ask; the
  child stays in the list until you open it again or archive it there.

## License

[MIT](LICENSE) © Yi Zhang

/**
 * Side ask — browser half.
 *
 * One "side ask" button in the conversation header (and the `Alt+Q` command)
 * forks the current conversation at its current durable tail — so the fork
 * carries everything the model knows, including a turn that is still running —
 * forces the child into the read-only sandbox through the Host's internal
 * command, and shows the child's ordinary Conversation in a right-sidebar tab.
 * The tab hides the inherited transcript (the side ask starts on an empty page)
 * and moves the parent composer's unsent text into the side composer. Closing
 * the tab stops and archives the child, so the side question leaves every list
 * but stays recoverable under "Show archived".
 *
 * Everything here uses public Client services and slot props only: the tab
 * type, the resource protocol, the `sidebar.right.pane.tab` body, the tab
 * title seat, the header action list, the frame overlay, and the shortcut
 * registry. The Conversation itself is not re-implemented — the body renders
 * the shipped `conversation.content` factory, exactly as the subagent sidebar
 * chat does.
 */

window.__ModuleLoader__.load({
  id: 'dsh-side-ask',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'sideAsk'
    /** Tab-type identity; also the key of the body and title seats. */
    const TAB_ID = 'dsh-side-ask'
    /** Tab kind recorded in the sidebar layout. */
    const KIND = 'sideask'
    /** Resource protocol of one side-ask occurrence. */
    const PROTOCOL = 'sideask'
    /** Canonical resource address prefix (`dsh-resource://` is mandatory). */
    const ADDRESS_PREFIX = `dsh-resource://${PROTOCOL}/session/`
    /** Host command that writes the child's read-only sandbox and approval policy. */
    const COMMAND_NAME = 'side-ask-readonly'
    /** Child slot this plugin declares under its tab body for the Conversation. */
    const ASK_SLOT = 'side.ask.conversation'
    /** Persistent parent → child mapping, so `Alt+Q` reuses an existing side ask. */
    const MAP_STORAGE_KEY = 'dsh.side-ask.mapping.v2'
    /** Address query parameter naming the last turn inherited from the fork. */
    const QUIET_PARAM = 'quiet'
    /** Reference source tag reported by `sessions.retainInfo`. */
    const SOURCE = 'sideAsk'
    /** At most this many notices are stacked at once. */
    const MAX_TOASTS = 4

    const en = {
      'button.label': 'Side ask',
      'button.busy': 'Preparing a side question…',
      'button.disabled.archived': 'This conversation is archived',
      'command.open': 'Side ask',
      'command.openAlias': 'Ask on the side',
      'tab.title': 'Side ask',
      'tab.readonly': 'Read-only',
      'tab.loading': 'Opening the side question…',
      'tab.failed': 'Cannot open this side question: {reason}',
      'session.title': 'Side ask · {title}',
      'toast.archiveFailed': 'Could not archive the side question: {reason}',
      'toast.failed': 'Could not open a side question: {reason}',
      'toast.migration': 'Open this conversation once before asking on the side',
      'toast.sessionSwitched': 'The conversation changed, so the side question was cancelled',
      'toast.noSession': 'No conversation is open',
      'toast.reopen': 'Reopen',
      'toast.reopenArchived': 'The side question was archived; find it under “Show archived”.',
      'toast.reopenSwitched': 'Switch back to that conversation to reopen the side question.',
    }

    const zh = {
      'button.label': '侧边提问',
      'button.busy': '正在准备提问…',
      'button.disabled.archived': '当前对话已归档',
      'command.open': '侧边提问',
      'command.openAlias': '提问',
      'tab.title': '提问',
      'tab.readonly': '只读',
      'tab.loading': '正在打开提问…',
      'tab.failed': '无法打开提问：{reason}',
      'session.title': '提问 · {title}',
      'toast.archiveFailed': '归档失败：{reason}',
      'toast.failed': '侧边提问创建失败：{reason}',
      'toast.migration': '请先打开一次当前对话再提问',
      'toast.sessionSwitched': '已切换对话，本次侧边提问已取消',
      'toast.noSession': '当前没有打开的对话',
      'toast.reopen': '重新打开',
      'toast.reopenArchived': '提问已归档，可在「仅显示已归档」中找到它',
      'toast.reopenSwitched': '切回该对话后可重新打开提问',
    }

    /** Injected stylesheet; component-local styling without a build step. */
    const CSS = `
.dsh-side-ask-trigger {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 6px;
  border: 0;
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  line-height: 1;
  cursor: pointer;
}
@media (hover: hover) {
  .dsh-side-ask-trigger:hover:not(:disabled) {
    background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
  }
}
.dsh-side-ask-trigger:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.dsh-side-ask-trigger:disabled {
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));
  cursor: default;
  opacity: 0.6;
}
.dsh-side-ask-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.dsh-side-ask-status {
  padding: 16px 18px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.dsh-side-ask-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
.dsh-side-ask-title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-side-ask-badge {
  flex: none;
  padding: 0 5px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
  line-height: 15px;
  letter-spacing: 0.02em;
}
.dsh-side-ask-trigger-wrap {
  display: inline-flex;
  flex: none;
  align-items: center;
}
.dsh-side-ask-trigger[data-busy="true"] svg {
  animation: dsh-side-ask-pulse 1.1s ease-in-out infinite;
}
@keyframes dsh-side-ask-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
.dsh-side-ask-toasts {
  position: fixed;
  left: 16px;
  bottom: 48px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  max-width: min(420px, calc(100vw - 32px));
  pointer-events: none;
}
.dsh-side-ask-toast {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
  background: var(--dsw-alias-bg-overlay);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 18px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
}
.dsh-side-ask-toast[data-level="error"] {
  border-color: var(--dsw-alias-state-error-primary);
}
.dsh-side-ask-toast > span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.dsh-side-ask-toast-action {
  flex: none;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-brand-primary);
  font: inherit;
  cursor: pointer;
  pointer-events: auto;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.dsh-side-ask-toast-action:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
`
    /** The single runtime instance this plugin generation created. */
    let runtime

    /**
     * Parse one canonical side-ask address.
     * @param {string} value - possible resource address.
     * @returns {string|undefined} the encoded child Session id.
     */
    function parseAddress(value) {
      if (typeof value !== 'string' || !value.startsWith(ADDRESS_PREFIX)) return undefined
      try {
        const url = new URL(value)
        if (url.protocol !== 'dsh-resource:' || url.hostname.toLowerCase() !== PROTOCOL) return undefined
        const parts = url.pathname.split('/').filter(Boolean)
        if (parts.length !== 2 || parts[0] !== 'session') return undefined
        const childId = decodeURIComponent(parts[1])
        return childId === '' ? undefined : childId
      } catch {
        return undefined
      }
    }

    /**
     * Address one child Session as a sidebar resource.
     * @param {string} childId - child Session id.
     * @param {number} quietTurn - last Turn inherited from the fork; hidden in the tab.
     * @returns {string} canonical address.
     */
    function addressOf(childId, quietTurn) {
      const base = `${ADDRESS_PREFIX}${encodeURIComponent(childId)}`
      return typeof quietTurn === 'number' && Number.isSafeInteger(quietTurn) && quietTurn > 0
        ? `${base}?${QUIET_PARAM}=${quietTurn}`
        : base
    }

    /**
     * The inherited Turn count recorded on one address.
     * @param {string} value - possible resource address.
     * @returns {number} last hidden Turn, or 0 when the address hides nothing.
     */
    function quietTurnOf(value) {
      if (typeof value !== 'string') return 0
      try {
        const url = new URL(value)
        const raw = url.searchParams.get(QUIET_PARAM)
        if (raw === null) return 0
        const turn = Number.parseInt(raw, 10)
        return Number.isSafeInteger(turn) && turn > 0 ? turn : 0
      } catch {
        return 0
      }
    }

    /**
     * Render any failure as one readable line.
     * @param {unknown} error - thrown value or Remote failure.
     * @returns {string} message text.
     */
    function messageOf(error) {
      if (error === undefined || error === null) return 'unknown error'
      if (typeof error === 'string') return error
      if (typeof error === 'object') {
        const record = error
        if (typeof record.message === 'string' && record.message !== '') return record.message
        if (typeof record.code === 'string') return record.code
      }
      try {
        return String(error)
      } catch {
        return 'unknown error'
      }
    }

    /** Resolve once the signal aborts. */
    function waitForAbort(signal) {
      if (signal.aborted) return Promise.resolve()
      return new Promise((resolve) => {
        signal.addEventListener('abort', () => { resolve() }, { once: true })
      })
    }

    /**
     * One small observable notice list for the frame overlay.
     * @param {number} limit - maximum stacked notices.
     * @returns {object} snapshot source plus push/dismiss.
     */
    function createToastStore(limit) {
      let items = []
      let nextId = 1
      const listeners = new Set()
      const publish = () => {
        for (const listener of [...listeners]) {
          try {
            listener()
          } catch {
            // A broken listener must not break notice delivery.
          }
        }
      }
      return {
        getSnapshot: () => items,
        subscribe(listener) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        push(level, text, action) {
          const item = { id: nextId, level, text, action }
          nextId += 1
          items = [...items, item].slice(-limit)
          publish()
          setTimeout(() => {
            const next = items.filter(candidate => candidate.id !== item.id)
            if (next.length === items.length) return
            items = next
            publish()
          }, level === 'error' ? 7000 : 5000)
        },
        dismiss(id) {
          const next = items.filter(candidate => candidate.id !== id)
          if (next.length === items.length) return
          items = next
          publish()
        },
      }
    }

    /**
     * Build this plugin generation's state and behavior.
     * @param {object} ctx - Client root context.
     * @returns {object} runtime shared by the components and registrations.
     */
    function createRuntime(ctx) {
      const t = ctx.locale.bind(NS)
      const toasts = createToastStore(MAX_TOASTS)
      /** Addresses whose retained reference has not been claimed by the provider yet. */
      const pending = new Map()
      /** Parents with an open-request in flight, so a double trigger creates one child. */
      const opening = new Set()

      const notify = (level, text, action) => { toasts.push(level, text, action) }

      /**
       * The effective shortcut of this command, for its tooltip and ARIA.
       * @returns {{keys: string, aria: string|undefined}|undefined} display keys and the ARIA shortcut.
       */
      function shortcutBinding() {
        const row = ctx.shortcuts.catalog.getSnapshot().find(entry => entry.id === 'sideAsk.open')
        if (row === undefined) return undefined
        const keys = Array.isArray(row.keys) && row.keys.length > 0 ? row.keys.join('') : undefined
        const aria = typeof row.aria === 'string' && row.aria !== '' ? row.aria : undefined
        if (keys === undefined && aria === undefined) return undefined
        return { keys: keys ?? aria, aria }
      }


      /**
       * Read the persisted parent → child mapping.
       * @returns {Record<string, string>} mapping (possibly empty).
       */
      function readMap() {
        try {
          const raw = window.localStorage.getItem(MAP_STORAGE_KEY)
          if (raw === null || raw === '') return {}
          const parsed = JSON.parse(raw)
          return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : {}
        } catch {
          return {}
        }
      }

      /** Persist the mapping, ignoring storage failures. */
      function writeMap(map) {
        try {
          window.localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(map))
        } catch {
          // Storage can be unavailable (private mode, quota); reuse degrades to fresh forks.
        }
      }

      /** Drop every mapping row that points at one child. */
      function forgetChild(childId) {
        const map = readMap()
        let changed = false
        for (const [parentId, mapped] of Object.entries(map)) {
          if (parseAddress(mapped) === childId) {
            delete map[parentId]
            changed = true
          }
        }
        if (changed) writeMap(map)
      }

      /** Whether the workspace registry currently marks a Session archived. */
      function isArchived(sessionId) {
        const workspaces = ctx.get('workspaces')
        const snapshot = workspaces === undefined ? undefined : workspaces.list.getSnapshot()
        const archived = snapshot === undefined ? undefined : snapshot.archivedSessionIds
        return Array.isArray(archived) && archived.includes(sessionId)
      }

      /**
       * The mapped side-ask address, when its child still exists and is not archived.
       * @param {string} sessionId - parent Session id.
       * @returns {string|undefined} reusable resource address.
       */
      function reusableChild(sessionId) {
        const map = readMap()
        const address = map[sessionId]
        if (typeof address !== 'string') return undefined
        const childId = parseAddress(address)
        const listed = childId !== undefined && ctx.sessions.list.getSnapshot().byId[childId] !== undefined
        if (childId === undefined || !listed || isArchived(childId)) {
          delete map[sessionId]
          writeMap(map)
          return undefined
        }
        return address
      }

      /** Archive a child the user never got to see, so no half-configured Session leaks. */
      function discardChild(childId) {
        forgetChild(childId)
        ctx.uiWorkspace.archiveSession(childId, { stopActivity: true }).catch((error) => {
          notify('error', t('toast.archiveFailed', { reason: messageOf(error) }))
        })
      }

      /** The RPC code behind a failed fork, when it has one. */
      function forkFailureCode(error) {
        const record = typeof error === 'object' && error !== null ? error : undefined
        const rpc = record === undefined ? undefined : record.rpcError
        return (rpc !== undefined && typeof rpc === 'object' && rpc !== null ? rpc.code : undefined)
          ?? (record === undefined ? undefined : record.code)
      }

      /** Localized explanation for a failed fork. */
      function describeForkFailure(error) {
        if (forkFailureCode(error) === 'session/migration-required') return t('toast.migration')
        return t('toast.failed', { reason: messageOf(error) })
      }

      /**
       * Give a conversation that is still publishing its first window a moment
       * to expose its tail events, so the fork can include the running turn.
       * @param {object} binding - the parent's retained Session binding.
       * @returns {Promise<void>} completion of the bounded wait.
       */
      async function waitForEntries(binding) {
        for (let attempt = 0; attempt < 8; attempt += 1) {
          if (binding.eventSource.getSnapshot().entries.length > 0) return
          await new Promise((resolve) => { setTimeout(resolve, 60) })
        }
      }

      /**
       * The fork cut of one conversation: its latest durable event, so the child
       * inherits everything the model knows, including a turn still running.
       * @param {object} binding - the parent's retained Session binding.
       * @returns {{atSeq: number|undefined, turn: number}} cut seq and last inherited Turn.
       */
      function forkBoundaryOf(binding) {
        let atSeq
        let turn = 0
        const entries = binding.eventSource.getSnapshot().entries
        for (const entry of entries) {
          if (entry.type !== 'event') continue
          const event = entry.event
          if (event === undefined || typeof event.seq !== 'number') continue
          if (atSeq === undefined || event.seq > atSeq) atSeq = event.seq
          const data = event.data
          const candidate = data !== null && typeof data === 'object' ? data.turn : undefined
          if (typeof candidate === 'number' && candidate > turn) turn = candidate
        }
        return { atSeq, turn }
      }

      /** The last Turn that finished in one conversation, for the completed-prefix fallback. */
      function lastCompletedTurn(binding) {
        let turn = 0
        for (const entry of binding.eventSource.getSnapshot().entries) {
          if (entry.type !== 'event') continue
          const event = entry.event
          if (event === undefined || event.type !== 'turn/end') continue
          const candidate = event.data === null || typeof event.data !== 'object' ? undefined : event.data.turn
          if (typeof candidate === 'number' && candidate > turn) turn = candidate
        }
        return turn
      }

      /** The workspace that lists one Session, when the registry knows it. */
      function workspaceOf(sessionId) {
        const workspaces = ctx.get('workspaces')
        const snapshot = workspaces === undefined ? undefined : workspaces.list.getSnapshot()
        const items = snapshot === undefined ? undefined : snapshot.items
        if (!Array.isArray(items)) return undefined
        for (const item of items) {
          if (Array.isArray(item.sessionIds) && item.sessionIds.includes(sessionId)) return item.workspaceId
        }
        return undefined
      }

      /** Create a blank child where a fork has nothing to copy (a brand-new conversation). */
      function createBlankChild(sessionId, summary) {
        const target = workspaceOf(sessionId)
        const cwd = typeof summary.cwd === 'string' && summary.cwd !== '' ? summary.cwd : undefined
        const preset = summary.projectionValues === undefined ? undefined : summary.projectionValues.agentPreset
        const options = {}
        if (target !== undefined) options.workspaceId = target
        else if (cwd !== undefined) options.cwd = cwd
        if (typeof preset === 'string') options.agentPreset = preset
        return ctx.sessions.create(options)
      }

      /**
       * The parent's live composer draft, read and written through the public
       * conversation input service.
       * @param {string} sessionId - parent Session id.
       * @returns {object|undefined} the Session's input facade.
       */
      function parentInput(sessionId) {
        const conversation = ctx.get('conversation')
        if (conversation === undefined) return undefined
        const scope = ctx.sessions.scope(sessionId)
        if (scope === undefined) return undefined
        try {
          return conversation.input.for(scope)
        } catch {
          return undefined
        }
      }

      /**
       * Put the parent's unsent text into the child's composer.
       * @param {object} binding - the child's retained Session binding.
       * @param {string} text - the parent draft.
       * @returns {boolean} whether the child took the text.
       */
      function seedChildDraft(binding, text) {
        if (text === '') return false
        const conversation = ctx.get('conversation')
        if (conversation === undefined) return false
        try {
          return conversation.input.requestDraftInitialization(binding, { prompt: text }) === 'applied'
        } catch {
          return false
        }
      }

      /**
       * Clear the parent composer only while it still holds the moved text, so
       * anything typed during the open request is never lost.
       * @param {string} sessionId - parent Session id.
       * @param {string} expected - text that was moved.
       */
      function clearParentDraft(sessionId, expected) {
        if (expected === '') return
        const input = parentInput(sessionId)
        if (input === undefined) return
        try {
          if (input.state.getSnapshot().draft !== expected) return
          input.setDraft('')
        } catch {
          // The draft stays where the user can still see it.
        }
      }

      /** How often the focus hand-off asks the side composer to take the caret. */
      const FOCUS_ATTEMPTS = 12
      /** Milliseconds between two focus attempts. */
      const FOCUS_INTERVAL_MS = 60

      /**
       * Hand the keyboard to the side composer.
       *
       * The embedded Conversation mounts after the tab opens, and a composer
       * never takes focus from another control on its own — so opening a side
       * ask leaves the caret in the main composer, or nowhere. `SessionInput.focus()`
       * is the public way to move it. Mounting is asynchronous and the right
       * Sidebar focuses the pane once its DOM commits, so this keeps asking for
       * a bounded window instead of once: the last ask wins.
       * @param {string} childId - the side Session whose composer should take focus.
       */
      function focusSideComposer(childId) {
        if (typeof childId !== 'string' || childId === '') return
        if (typeof document === 'undefined') return
        const conversation = ctx.get('conversation')
        if (conversation === undefined) return
        let tries = 0
        const attempt = () => {
          tries += 1
          const scope = ctx.sessions.scope(childId)
          if (scope !== undefined) {
            try {
              conversation.input.for(scope).focus()
            } catch {
              // No mounted composer on this attempt; the next one asks again.
            }
          }
          if (tries < FOCUS_ATTEMPTS) setTimeout(attempt, FOCUS_INTERVAL_MS)
        }
        attempt()
      }

      /**
       * Open the side ask of one conversation: reuse the mapped child or create
       * one, then reveal its tab. Never throws; failures surface as notices.
       * @param {string} sessionId - the conversation asking the side question.
       * @returns {Promise<void>} completion of the whole sequence.
       */
      async function openAsk(sessionId) {
        if (typeof sessionId !== 'string' || sessionId === '') {
          notify('info', t('toast.noSession'))
          return
        }
        const mounted = () => ctx.sidebarRight.mounted.getSnapshot()
        if (mounted() !== sessionId) {
          notify('info', t('toast.sessionSwitched'))
          return
        }
        if (opening.has(sessionId)) return
        opening.add(sessionId)
        try {
          const reusable = reusableChild(sessionId)
          if (reusable !== undefined) {
            ctx.sidebarRight.openResource(reusable, { kind: KIND, preferNewPane: true })
            focusSideComposer(parseAddress(reusable))
            return
          }
          await createAndOpen(sessionId, mounted)
        } catch (error) {
          notify('error', t('toast.failed', { reason: messageOf(error) }))
        } finally {
          opening.delete(sessionId)
        }
      }

      /**
       * Fork at the current durable tail, rename, force read-only, carry the
       * unsent draft over, and reveal the new child on an empty page.
       * @param {string} sessionId - parent Session id.
       * @param {() => string|undefined} mounted - current on-screen Session reader.
       * @returns {Promise<void>} completion.
       */
      async function createAndOpen(sessionId, mounted) {
        const summary = ctx.sessions.list.getSnapshot().byId[sessionId]
        if (summary === undefined) {
          notify('info', t('toast.noSession'))
          return
        }
        const binding = ctx.sessions.binding(sessionId)
        if (binding !== undefined) await waitForEntries(binding)
        const boundary = binding === undefined ? { atSeq: undefined, turn: 0 } : forkBoundaryOf(binding)
        const input = parentInput(sessionId)
        const draft = input === undefined ? '' : input.state.getSnapshot().draft
        let childId
        let quietTurn = boundary.turn
        try {
          if (boundary.atSeq !== undefined) {
            childId = await ctx.sessions.fork({ sessionId, atSeq: boundary.atSeq })
          } else {
            quietTurn = binding === undefined ? 0 : lastCompletedTurn(binding)
            try {
              childId = await ctx.sessions.fork({ sessionId })
            } catch (error) {
              if (forkFailureCode(error) !== 'session/fork-unavailable') throw error
              childId = await createBlankChild(sessionId, summary)
              quietTurn = 0
            }
          }
        } catch (error) {
          notify('error', describeForkFailure(error))
          return
        }
        if (mounted() !== sessionId) {
          discardChild(childId)
          notify('info', t('toast.sessionSwitched'))
          return
        }
        const reference = ctx.sessions.retain(childId, { source: SOURCE })
        let movedDraft = false
        try {
          await reference.ready
          const renamed = await reference.binding.session.rename(t('session.title', { title: summary.displayTitle }))
          if (!renamed.ok) throw new Error(`${renamed.error.code}: ${renamed.error.message}`)
          movedDraft = seedChildDraft(reference.binding, draft)
          const ran = await reference.binding.session.command(`/${COMMAND_NAME} ${childId}`)
          if (!ran.ok) throw new Error(`${ran.error.code}: ${ran.error.message}`)
          if (ran.value.matched !== true) throw new Error(`this deployment offers no /${COMMAND_NAME} command`)
        } catch (error) {
          reference.release()
          discardChild(childId)
          notify('error', t('toast.failed', { reason: messageOf(error) }))
          return
        }
        const address = addressOf(childId, quietTurn)
        pending.set(address, reference)
        if (mounted() !== sessionId) {
          pending.delete(address)
          reference.release()
          discardChild(childId)
          notify('info', t('toast.sessionSwitched'))
          return
        }
        try {
          ctx.sidebarRight.openResource(address, { kind: KIND, preferNewPane: true })
        } catch (error) {
          pending.delete(address)
          reference.release()
          discardChild(childId)
          notify('error', t('toast.failed', { reason: messageOf(error) }))
          return
        }
        const map = readMap()
        map[sessionId] = address
        writeMap(map)
        if (movedDraft) clearParentDraft(sessionId, draft)
        focusSideComposer(childId)
      }

      /**
       * Re-open a side ask whose archive failed. The tab closing gesture is
       * already committed by the column before a synchronous close handler can
       * refuse, so recovery is explicit: the notice offers the tab back.
       * @param {string} parentId - Session the tab belonged to.
       * @param {string} address - the tab's resource address.
       */
      function reopenAfterFailure(parentId, address) {
        const childId = parseAddress(address)
        if (childId === undefined) return
        if (isArchived(childId)) {
          notify('info', t('toast.reopenArchived'))
          return
        }
        if (ctx.sidebarRight.mounted.getSnapshot() !== parentId) {
          notify('info', t('toast.reopenSwitched'))
          return
        }
        try {
          ctx.sidebarRight.openResource(address, { kind: KIND, preferNewPane: true })
        } catch (error) {
          notify('error', t('toast.failed', { reason: messageOf(error) }))
        }
      }

      /**
       * Closing the tab stops any running work and archives the child, without a
       * confirmation: closing this tab is the archive intent, and archive is
       * reversible. A successful close stays silent; only a failure reports.
       * @param {string} sessionId - Session owning the tab (the parent).
       * @param {object} tab - the closing tab record.
       */
      function closeHandler(sessionId, tab) {
        const childId = parseAddress(tab.contentId)
        if (childId === undefined) return
        const address = tab.contentId
        ctx.uiWorkspace.archiveSession(childId, { stopActivity: true }).then(
          () => { forgetChild(childId) },
          (error) => {
            // The mapping survives a failed archive, so the same child can be
            // revealed again instead of stranding it in the list.
            notify('error', t('toast.archiveFailed', { reason: messageOf(error) }), {
              label: t('toast.reopen'),
              run: () => { reopenAfterFailure(sessionId, address) },
            })
          },
        )
      }

      /** The resource provider behind one side-ask tab occurrence. */
      function resourceProvider() {
        return {
          protocol: PROTOCOL,
          async *open(address, { signal }) {
            const childId = parseAddress(address)
            if (childId === undefined) {
              yield { ok: false, error: { code: 'gateway/bad-request', message: `dsh-side-ask: invalid resource address "${address}"` } }
              return
            }
            if (signal.aborted) return
            let reference = pending.get(address)
            if (reference !== undefined) {
              pending.delete(address)
            } else {
              try {
                reference = ctx.sessions.retain(childId, { source: SOURCE, signal })
              } catch (error) {
                // A failure is a frame, not a throw: the tab shows its reason.
                yield { ok: false, error: { code: 'session/not-found', message: messageOf(error) } }
                return
              }
            }
            try {
              yield { ok: true, value: { reference } }
              await waitForAbort(signal)
            } finally {
              reference.release()
            }
          },
        }
      }

      /** Release any reference still waiting for its tab and drop state. */
      function dispose() {
        for (const reference of pending.values()) reference.release()
        pending.clear()
      }

      return {
        ctx,
        t,
        toasts,
        notify,
        shortcutBinding,
        openAsk,
        closeHandler,
        resourceProvider,
        dispose,
      }
    }

    /** The side-ask glyph: a speech bubble whose trailing edge is a side panel. */
    function SideAskGlyph({ size = 16 }) {
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block', flex: '0 0 auto' },
      },
      h('path', {
        d: 'M2.6 3.1h10.8c0.72 0 1.3 0.58 1.3 1.3v6.2c0 0.72-0.58 1.3-1.3 1.3H7.3l-3.1 2.4v-2.4H2.6c-0.72 0-1.3-0.58-1.3-1.3V4.4c0-0.72 0.58-1.3 1.3-1.3Z',
        stroke: 'currentColor',
        strokeWidth: '1.1',
        strokeLinejoin: 'round',
      }),
      h('path', { d: 'M10.5 3.4v8.2', stroke: 'currentColor', strokeWidth: '1.1' }),
      h('path', {
        d: 'M12.15 5.6h0.9M12.15 8.2h0.9',
        stroke: 'currentColor',
        strokeWidth: '1.1',
        strokeLinecap: 'round',
      }))
    }

    /** Header action: open (or reveal) the current conversation's side ask. */
    function SideAskButton(props) {
      const { sessionId, useSession, useSessions, t } = props
      const session = useSession(value => value)
      const summary = useSessions(state => state.byId[sessionId])
      const [busy, setBusy] = React.useState(false)
      const [binding, setBinding] = React.useState(() => runtime.shortcutBinding())
      React.useEffect(() => runtime.ctx.shortcuts.catalog.subscribe(() => {
        setBinding(runtime.shortcutBinding())
      }), [])
      const removed = session !== undefined && session.removed === true
      const unknown = session === undefined || summary === undefined
      const unavailable = removed || unknown
      const chord = binding === undefined ? '' : ` (${binding.keys})`
      const hint = busy ? t('button.busy')
        : removed ? t('button.disabled.archived')
          : `${t('button.label')}${chord}`
      return h('span', { className: 'dsh-side-ask-trigger-wrap', title: hint },
        h('button', {
          type: 'button',
          className: 'dsh-side-ask-trigger',
          'data-side-ask': '',
          'data-busy': busy ? 'true' : undefined,
          'aria-label': `${t('button.label')}${chord}`,
          'aria-keyshortcuts': binding === undefined ? undefined : binding.aria,
          'aria-busy': busy ? 'true' : undefined,
          title: hint,
          disabled: busy || unavailable,
          onClick: (event) => {
            event.preventDefault()
            event.stopPropagation()
            if (busy) return
            setBusy(true)
            runtime.openAsk(sessionId).catch(() => {}).finally(() => { setBusy(false) })
          },
        }, h(SideAskGlyph, { size: 15 })))
    }

    /**
     * The fork's inherited Turns stay out of the tab: the side ask opens on an
     * empty page while the model still carries the full context. One scoped rule
     * hides every Turn the fork copied; Turns the side ask creates itself are
     * numbered after them and stay visible.
     */
    function SideAskQuietTurns({ turns, scope }) {
      React.useEffect(() => {
        if (typeof document === 'undefined' || turns < 1) return
        const selectors = []
        for (let turn = 1; turn <= turns; turn += 1) {
          selectors.push(`[data-side-ask-scope="${scope}"] [data-chat-turn="${turn}"]`)
        }
        selectors.push(`[data-side-ask-scope="${scope}"] [data-chat-history]`)
        // The turn rail is chrome outside the transcript rows; its marks all
        // point at hidden Turns, so it would only show dead navigation.
        selectors.push(`[data-side-ask-scope="${scope}"] div:has(> nav[aria-label])`)
        const style = document.createElement('style')
        style.setAttribute('data-dsh-side-ask-quiet', scope)
        style.textContent = `${selectors.join(',')}{display:none !important}`
        document.head.appendChild(style)
        return () => { style.remove() }
      }, [turns, scope])
      return null
    }

    /** The side-ask tab body: bind the child reference, then host its Conversation. */
    function SideAskTabBody(props) {
      const { useResource, useTabInfo, SessionProvider, renderSlot, t } = props
      const info = useTabInfo()
      const tab = info === undefined || info === null ? undefined : info.tab
      const contentId = tab === undefined ? undefined : tab.contentId
      const resource = useResource(typeof contentId === 'string' ? contentId : '')
      const scope = typeof contentId === 'string' ? parseAddress(contentId) : undefined
      const quiet = typeof contentId === 'string' ? quietTurnOf(contentId) : 0
      const hiding = quiet >= 1 && scope !== undefined
      const [shown, setShown] = React.useState(!hiding)
      React.useEffect(() => {
        if (!shown) setShown(true)
      }, [shown])
      if (contentId === undefined) return null
      if (resource === undefined || resource.value === undefined) {
        const reason = resource !== undefined && resource.failure !== undefined
          ? messageOf(resource.failure)
          : undefined
        return h('div', { className: 'dsh-side-ask-status', 'data-side-ask-status': '' },
          reason === undefined ? t('tab.loading') : t('tab.failed', { reason }))
      }
      return h('div', {
        className: 'dsh-side-ask-body',
        'data-side-ask-body': '',
        'data-side-ask-scope': scope,
        style: hiding && !shown ? { visibility: 'hidden' } : undefined,
      },
      hiding ? h(SideAskQuietTurns, { turns: quiet, scope }) : null,
      h(SessionProvider, { session: resource.value.reference },
        renderSlot(ASK_SLOT, {})))
    }

    /** The side-ask chip: glyph, short title, and the read-only badge. */
    function SideAskTabTitle(props) {
      const { useTabInfo, t } = props
      const info = useTabInfo()
      const tab = info === undefined || info === null ? undefined : info.tab
      const title = tab === undefined ? t('tab.title') : tab.title
      return h('span', { className: 'dsh-side-ask-title' },
        h(SideAskGlyph, { size: 14 }),
        h('span', { className: 'dsh-side-ask-title-text' }, title),
        h('span', { className: 'dsh-side-ask-badge' }, t('tab.readonly')))
    }

    /** Fixed Conversation selection used inside the tab: the Chat view only. */
    function SideAskChatView(props) {
      return props.renderSlot('conversation.session', { view: 'chat' })
    }

    /**
     * The internal read-only command has no user-facing card: its durable
     * effect is the `sandbox/mode` record, which the Chat flow renders through
     * the permission control rather than as a command row.
     */
    function SideAskHiddenCommandRow() {
      return null
    }

    /**
     * The tab's Conversation body, rendered through the shipped content factory.
     * The hero is never used: a side ask has no welcome home, only the empty
     * transcript and the composer.
     */
    function SideAskConversation(props) {
      const { sessionId, useSession, useConversation, useSessions, renderFactorySlot } = props
      const session = useSession(value => value)
      const conversation = useConversation(value => value)
      const summaryBlank = useSessions(state => state.byId[sessionId] === undefined
        ? undefined
        : state.byId[sessionId].blank)
      if (session === undefined || conversation === undefined) return null
      const settling = session.openState === 'loading' && summaryBlank !== true
      return renderFactorySlot(
        'conversation.content',
        { variant: 'embedded', phase: settling ? 'settling' : 'active', hero: false },
        { slots: { views: SideAskChatView } },
      )
    }

    /** Frame-wide notices owned by this plugin. */
    function SideAskToasts() {
      const [items, setItems] = React.useState(runtime.toasts.getSnapshot())
      React.useEffect(() => runtime.toasts.subscribe(() => {
        setItems(runtime.toasts.getSnapshot())
      }), [])
      if (items.length === 0) return null
      return h('div', {
        className: 'dsh-side-ask-toasts',
        'data-side-ask-toasts': '',
        role: 'status',
        'aria-live': 'polite',
      }, items.map(item => h('div', {
        key: item.id,
        className: 'dsh-side-ask-toast',
        'data-level': item.level,
      },
      h('span', { key: 'text' }, item.text),
      item.action === undefined ? null : h('button', {
        key: 'action',
        type: 'button',
        className: 'dsh-side-ask-toast-action',
        onClick: () => {
          runtime.toasts.dismiss(item.id)
          try {
            item.action.run()
          } catch {
            // An action failure surfaces through its own notice.
          }
        },
      }, item.action.label))))
    }

    return {
      inject: [
        'sessions', 'resources', 'sidebarRight', 'sidebarRightTabs',
        'slots', 'locale', 'shortcuts', 'uiWorkspace',
      ],

      /**
       * Register the stylesheet, dictionaries, tab type, resource protocol, slots,
       * close handler, and shortcut command.
       * @param {object} ctx - Client root context.
       */
      apply(ctx) {
        runtime = createRuntime(ctx)
        const { t } = runtime

        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'side-ask: dictionaries')
        ctx.effect(() => {
          if (typeof document === 'undefined') return
          const style = document.createElement('style')
          style.setAttribute('data-dsh-side-ask', '')
          style.textContent = CSS
          document.head.appendChild(style)
          return () => { style.remove() }
        }, 'side-ask: styles')
        ctx.effect(() => ctx.resources.register(runtime.resourceProvider()), 'side-ask: resource protocol')
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: TAB_ID,
          kind: KIND,
          patterns: [`dsh-resource://${PROTOCOL}/**`],
          priority: 'builtin',
          canOpen: address => parseAddress(address) !== undefined,
          title: () => t('tab.title'),
        }), 'side-ask: tab type')
        ctx.effect(
          () => ctx.sidebarRight.registerCloseHandler(KIND, runtime.closeHandler),
          'side-ask: close handler',
        )
        ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_ID,
          locale: NS,
          children: { [ASK_SLOT]: { kind: 'single', scope: 'session' } },
        }, SideAskTabBody))
        ctx.slots.inject(ASK_SLOT, () => ctx.slots.register({
          name: ASK_SLOT,
          locale: NS,
        }, SideAskConversation))
        ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab.title',
          key: TAB_ID,
          locale: NS,
        }, SideAskTabTitle))
        ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
          name: 'conversation.session.header.actions',
          id: 'side-ask',
          order: -5,
          locale: NS,
        }, SideAskButton))
        ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({
          name: 'conversation.chat.commandview',
          key: COMMAND_NAME,
        }, SideAskHiddenCommandRow))
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'side-ask-toasts',
          order: 1_000,
        }, SideAskToasts))

        // A conflicting or unavailable shortcut must not take the whole plugin
        // down: the button and the reuse path stay usable without the chord.
        try {
          ctx.effect(() => ctx.shortcuts.register({
            id: 'sideAsk.open',
            label: () => t('command.open'),
            aliases: [t('command.openAlias')],
            defaults: {
              'desktop:windows': { code: 'KeyQ', modifiers: ['alt'] },
              'desktop:macos': { code: 'KeyQ', modifiers: ['alt'] },
              'desktop:linux': { code: 'KeyQ', modifiers: ['alt'] },
              'web:windows': { code: 'KeyQ', modifiers: ['primary', 'alt'] },
              'web:macos': { code: 'KeyQ', modifiers: ['primary', 'alt'] },
            },
            regions: ['page', 'editable'],
            modals: [],
            resolve: () => {
              const sessionId = ctx.sidebarRight.mounted.getSnapshot()
              return {
                status: 'handled',
                run: () => {
                  if (sessionId === undefined) {
                    runtime.notify('info', t('toast.noSession'))
                    return
                  }
                  runtime.openAsk(sessionId).catch(() => {})
                },
              }
            },
          }), 'side-ask: shortcut')
        } catch (error) {
          console.error('side-ask: shortcut registration failed', error)
        }

        ctx.effect(() => () => { runtime.dispose() }, 'side-ask: retained references')
      },
    }
  },
})

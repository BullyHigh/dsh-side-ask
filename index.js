/**
 * Side ask — Host half.
 *
 * The Client half can fork, rename, open a right-sidebar tab, and archive, all
 * through the public Client services. The one thing it cannot do is change the
 * child Session's sandbox: that is one durable `sandbox/mode` record written on
 * the Host Session. This half therefore owns exactly one internal slash command
 * that the Client runs against the freshly forked child:
 *
 *   /side-ask-readonly <child-session-id>
 *
 * The command accepts only the Session it is executed on, so typing it in an
 * ordinary conversation is a no-op unless that conversation's own id is passed.
 * It appends `sandbox/mode = read-only` and `approval/policy = ask`, which the
 * sandbox policy and approval services fold into every confined call of that
 * Session. Nothing else is stored: the Session log stays the source of truth.
 */

/** The Client discovers the command only through the Host command registry. */
export const inject = ['commands']

/** Internal name; the Client builds the exact line and hides the transcript row. */
const COMMAND_NAME = 'side-ask-readonly'

/**
 * Switch one Session to the read-only sandbox with interactive approvals.
 * @param {object} invocation - the command registry's invocation record.
 * @param {object} invocation.agent - the receiving Agent; its Session is the target.
 * @param {string} invocation.rawInput - everything after the command name.
 * @returns {{kind: 'success'|'error', text: string}} the settled command result.
 */
function switchToReadOnly({ agent, rawInput }) {
  const session = agent.session
  const target = rawInput.trim()
  if (target !== session.id) {
    return {
      kind: 'error',
      text: `side-ask: expected the executing session id "${session.id}", received "${target === '' ? '(empty)' : target}"`,
    }
  }
  // No direct API dependency: these are the two durable records the policy
  // owners already fold (`dsh-sandbox-policy/session-mode`, `dsh-user-approval`).
  session.append('sandbox/mode', { mode: 'read-only' })
  session.append('approval/policy', { policy: 'ask' })
  return { kind: 'success', text: 'read-only sandbox enabled' }
}

/**
 * Host plugin body: register the internal read-only command.
 * @param {object} ctx - Host Cordis context carrying `commands`.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.commands.register({
    name: COMMAND_NAME,
    description: 'Internal: switch this side-ask session to a read-only sandbox.',
    input: { hint: '<session-id>' },
    // The Session's own `sandbox/mode` record is the authoritative payload.
    recordInput: false,
    handler: switchToReadOnly,
  }), 'side-ask: read-only command')
}

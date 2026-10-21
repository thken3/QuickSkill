import type { EngineInterface, Register } from 'claude-code'

// The hint's tail (the usagebar mod's meter, or any other mod's text) is drawn in this color.
// Blue from the theme so it suits light and dark terminals. Swap for 'blue' or a hex like '#4f8ff7'.
const COLOR = 'suggestion'

// Cut the tail to the room left, at a " │ " so no meter is half shown.
const fit = (text: string, room: number) => {
  if (text.length <= room) return text
  const cut = text.slice(0, room)
  return cut.slice(0, Math.max(0, cut.lastIndexOf(' │ ')))
}

// caveman is not a plugin: it is a rule in ~/.claude/CLAUDE.md, filtered out of the prompt when off.
const isCavemanOn = async ($: EngineInterface) => (await $.store.get('caveman')) !== false

const userPlugins = async ($: EngineInterface) =>
  ((await $.settings.read({ source: 'user' })).enabledPlugins ?? {}) as Record<string, boolean>

const short = (id: string) => id.replace(/@.*/, '')

// A clicked state drawn at once, while `claude plugin` (a few seconds) catches up.
const optimistic = new Map<string, boolean>()

const rows = async ($: EngineInterface) =>
  [
    ['caveman', await isCavemanOn($)] as const,
    ...Object.entries(await userPlugins($)).map(([id, enabled]) => [short(id), enabled] as const),
  ].map(([name, enabled]) => [name, optimistic.get(name) ?? enabled] as const)

// Names left out of the footer. Stored as hidden, not shown, so a new plugin shows by default.
const MENU = 'fav-menu'
const hiddenNames = async ($: EngineInterface) => ((await $.store.get('hidden')) ?? []) as string[]

// Notes for the model from footer presses, sent with the next prompt.
// ponytail: module variable, lost on hot reload; fine for a toggle note.
const pending: string[] = []

async function toggle($: EngineInterface, name: string, want?: string): Promise<{ text: string; note?: string }> {
  if (name === 'caveman') {
    const turnOn = want ? want === 'on' : !(await isCavemanOn($))
    await $.store.set('caveman', turnOn)
    $.ui.invalidate('prompt.context')
    return {
      text: `caveman ${turnOn ? 'on' : 'off'}`,
      note: turnOn
        ? 'The user turned caveman mode ON with /fav. Invoke the caveman skill (level full) now and keep it active.'
        : 'The user turned caveman mode OFF with /fav. Stop caveman: write normal prose from now on and ignore the CLAUDE.md rule to invoke it.',
    }
  }

  const plugins = await userPlugins($)
  const id = Object.keys(plugins).find(k => k === name || short(k) === name)
  if (!id) return { text: `Unknown: ${name}. Run /fav to see the list.` }
  const turnOn = want ? want === 'on' : !plugins[id]
  const run = await $.process.run(['claude', 'plugin', turnOn ? 'enable' : 'disable', id, '--scope', 'user'])
  if (run.exitCode !== 0) return { text: `${short(id)}: ${(run.stderr || run.stdout).trim()}` }
  // No /reload-plugins: it prints to the transcript. The note below changes behavior now; skills and hooks follow next session.
  return {
    text: `${short(id)} ${turnOn ? 'on' : 'off'}`,
    note: turnOn
      ? `The user enabled the ${short(id)} plugin with /fav. Follow its behavior from now on and use its skills as they apply.`
      : `The user disabled the ${short(id)} plugin with /fav. Ignore the instructions it injected earlier in this session and do not use its skills.`,
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'fav',
      description: 'Choose which favorites the footer shows, or /fav <name> [on|off]',
      argumentHint: '[name] [on|off]',
    })
    return next(e)
  })

  on('command.run', { command: 'fav' }, async ($, e) => {
    const [name, want] = e.args.trim().split(/\s+/).filter(Boolean)
    if (!name) {
      const count = (await rows($)).length
      await $.ui.open({ id: MENU, title: 'Show in footer', focus: true, closeOnEscape: true, rows: count + 3 })
      return { text: 'Footer menu opened.' }
    }
    if (want && want !== 'on' && want !== 'off') return { text: 'Usage: /fav <name> [on|off]' }
    const { text, note } = await toggle($, name, want)
    return note ? { text, context: [note] } : { text }
  })

  on('ui.render', { component: 'Pane', requestId: MENU }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await rows($)
    const hidden = await hiddenNames($)
    const flip = (name: string) => async () => {
      const now = await hiddenNames($)
      await $.store.set('hidden', now.includes(name) ? now.filter(n => n !== name) : [...now, name])
      $.ui.invalidate('ui.render')
    }

    return (
      <Box flexDirection="column">
        {list.map(([name], i) => (
          <Button key={name} plain hotkey={i < 9 ? String(i + 1) : undefined} label={`${hidden.includes(name) ? '[ ]' : '[x]'} ${name}`} onPress={flip(name)} />
        ))}
        <Text dimColor>Click or press the number. Esc closes.</Text>
      </Box>
    )
  })

  // The footer line: the engine's hint ("auto mode on ..."), its tail (the usage meter), then the buttons.
  // ponytail: the hint is redrawn as plain text, so its pills are not separately styled.
  // ponytail: a tail added by a mod that runs beneath this one is not seen; fine while usagebar runs above.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const hidden = await hiddenNames($)
    const list = (await rows($)).filter(([name]) => !hidden.includes(name))
    const usage = e.props.tail ?? ''
    if (list.length === 0) return next(e)
    const press = (name: string, enabled: boolean) => async () => {
      optimistic.set(name, !enabled)
      $.ui.invalidate('ui.render')
      const { text, note } = await toggle($, name, enabled ? 'off' : 'on')
      optimistic.delete(name)
      if (note) pending.push(note)
      $.ui.toast(text)
      $.ui.invalidate('ui.render')
    }

    const buttons = list.map(([name, enabled]) => (
      <Button key={name} plain dimColor={!enabled} label={`${enabled ? '●' : '○'} ${name} `} onPress={press(name, enabled)} />
    ))

    // Claude Code draws its mode label ("⏵⏵ auto mode on") left of this tree; reserve its width.
    // ponytail: fixed 20-column guess for that label; read it from the engine if it ever says.
    const columns = (e.viewport?.columns ?? 80) - 20
    const buttonsWidth = list.reduce((n, [name]) => n + name.length + 3, 0)
    // Always one row (the footer has no room for two). Drop the hint first, then meters from the end.
    const room = columns - buttonsWidth
    const isHintShown = e.props.hint.length + 2 + (usage ? usage.length + 2 : 0) <= room
    const shown = fit(usage, room - (isHintShown ? e.props.hint.length + 2 : 0) - 2)

    return (
      <Box flexDirection="row">
        {isHintShown && <Text dimColor>{e.props.hint}  </Text>}
        {shown && <Text color={COLOR}>{shown}  </Text>}
        {buttons}
      </Box>
    )
  })

  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    if (result.drop !== undefined || pending.length === 0) return result
    return { ...result, context: [...(result.context ?? []), ...pending.splice(0)] }
  })

  on('prompt.context', async ($, e, next) => {
    if (!e.instructionFiles || (await isCavemanOn($))) return next(e)
    const strip = (text: string) => text.split(/\n\s*\n/).filter(p => !/caveman/i.test(p)).join('\n\n')
    return next({ ...e, instructionFiles: e.instructionFiles.map(f => (f.kind === 'user' ? { ...f, content: strip(f.content) } : f)) })
  })
}

import { expect, test } from 'claude-code/testing'

const RUN = { command: 'fav', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const
const CLAUDE_MD = '# Global\n\n## Response style\n\nInvoke the `caveman` skill\nat start.\n\nKeep tests small.'

test('/fav caveman off strips the caveman rule from the user CLAUDE.md', async ($, on) => {
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('settings.read', () => ({ value: { enabledPlugins: { 'ponytail@ponytail': true } } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('prompt.context', (_, e) => ({ blocks: e.blocks, instructionFiles: e.instructionFiles }))
  const context = () =>
    $.prompt.context({ blocks: [], instructionFiles: [{ path: '/u/CLAUDE.md', kind: 'user', content: CLAUDE_MD }] })

  expect((await context()).instructionFiles?.[0]?.content).toBe(CLAUDE_MD)

  const off = await $.command.run({ ...RUN, args: 'caveman off' })
  expect(off.text).toBe('caveman off')
  expect((await context()).instructionFiles?.[0]?.content).toBe('# Global\n\n## Response style\n\nKeep tests small.')

  expect((await $.command.run({ ...RUN, args: 'caveman' })).text).toBe('caveman on')
  expect((await context()).instructionFiles?.[0]?.content).toBe(CLAUDE_MD)
})

test('the footer button flips caveman', async ($, on) => {
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('settings.read', () => ({ value: { enabledPlugins: { 'ponytail@ponytail': true } } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))

  const ui = await $.ui.mount({
    plugin: 'fav',
    component: 'PromptHint',
    surface: 'terminal',
    viewport: { columns: 160, rows: 10 },
    props: { isDraft: false, isWorking: false, hint: 'auto mode on (shift+tab to cycle)', tail: '5h ▓▓▓░░░ 42% │ ctx 31%' },
  })
  expect((await ui.find({ key: 'caveman', type: 'Button' }))?.text).toMatch(/● caveman/)
  expect(await ui.find({ type: 'Text', text: /auto mode on/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /5h ▓▓▓░░░ 42%/ }))?.props?.color).toBe('suggestion')
  await ui.press({ key: 'caveman' })
  expect(store.get('caveman')).toBe(false)
  await ui.unmount()
})

test('the menu hides caveman from the footer', async ($, on) => {
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('settings.read', () => ({ value: { enabledPlugins: { 'ponytail@ponytail': true } } }))
  on('ui.invalidate', () => ({ value: undefined }))

  const menu = await $.ui.mount({
    plugin: 'fav',
    component: 'Pane',
    requestId: 'fav-menu',
    surface: 'terminal',
    props: { title: 'Show in footer', isFocused: true, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
  })
  expect((await menu.find({ key: 'caveman', type: 'Button' }))?.text).toMatch(/\[x\] caveman/)
  await menu.press({ key: 'caveman' })
  expect(store.get('hidden')).toEqual(['caveman'])
  await menu.unmount()

  const footer = await $.ui.mount({
    plugin: 'fav',
    component: 'PromptHint',
    surface: 'terminal',
    props: { isDraft: false, isWorking: false, hint: 'auto mode on' },
  })
  expect(await footer.find({ key: 'caveman', type: 'Button' })).toBeUndefined()
  expect(await footer.find({ key: 'ponytail', type: 'Button' })).toBeDefined()
  await footer.unmount()
})

test('a narrow footer stays one row, dropping the hint and meters that do not fit', async ($, on) => {
  on('store.get', () => ({ value: undefined }))
  on('settings.read', () => ({ value: { enabledPlugins: { 'ponytail@ponytail': true } } }))

  const ui = await $.ui.mount({
    plugin: 'fav',
    component: 'PromptHint',
    surface: 'terminal',
    viewport: { columns: 60, rows: 10 },
    props: { isDraft: false, isWorking: false, hint: 'auto mode on (shift+tab to cycle)', tail: '5h ▓▓▓░░░ 51% │ wk 10% │ ctx 20%' },
  })
  const rows = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  // 60 columns, 20 kept for the mode label, 21 for the two buttons: room for the 5h meter alone.
  expect(rows).toEqual(['5h ▓▓▓░░░ 51%  '])
  expect(await ui.find({ key: 'ponytail', type: 'Button' })).toBeDefined()
  await ui.unmount()
})

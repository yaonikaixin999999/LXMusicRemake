const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const ts = require('typescript')

function load(file, imports = {}, globals = {}) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (name in imports) return imports[name]
    throw new Error(`Unexpected import ${name}`)
  }, __dirname, process, setTimeout, clearTimeout, ...globals })
  return module.exports
}

const plain = value => JSON.parse(JSON.stringify(value))
const common = load('src/common/windowClose.ts')

function fixture({ action = 'ask', enabled = true, ready = true, trayFailure = false } = {}) {
  let win
  let tray = false
  let saveError = false
  let nativeAnswer
  const calls = { hidden: 0, quit: 0, closed: 0, sends: [], saved: [], nativeOptions: null }
  const appSetting = { 'common.closeAction': action, 'tray.enable': enabled, 'common.windowSizeId': 3, 'tray.themeId': 0 }
  const globals = {
    envParams: { cmdParams: {} }, staticPath: 'static',
    lx: { isSkipTrayQuit: false, appSetting, theme: { theme: { colors: {} } }, event_app: {
      main_window_close: () => { calls.closed++ }, main_window_created: () => {}, main_window_focus: () => {}, main_window_blur: () => {}, main_window_fullscreen: () => {}, main_window_show: () => {}, main_window_hide: () => {},
      update_config: patch => { if (saveError) throw new Error('storage failed'); calls.saved.push(plain(patch)); Object.assign(appSetting, patch) },
    } },
  }
  class Window extends EventEmitter {
    constructor(options) { super(); win = this; this.options = options; this.visible = true; this.destroyed = false; this.fullscreen = false; this.webContents = new EventEmitter(); this.webContents.isDestroyed = () => false }
    loadURL() { return Promise.resolve() }
    close() { const event = { prevented: false, preventDefault() { this.prevented = true } }; this.emit('close', event); if (!event.prevented) this.destroy() }
    destroy() { this.destroyed = true; this.emit('closed') }
    isVisible() { return this.visible }
    isMinimized() { return false }
    isMaximized() { return false }
    isFullScreen() { return this.fullscreen }
    isDestroyed() { return this.destroyed }
    setFullScreen(value) { this.fullscreen = value; this.emit(value ? 'enter-full-screen' : 'leave-full-screen') }
    hide() { calls.hidden++; this.visible = false; this.emit('hide') }
    show() { this.visible = true; this.emit('show') }
    focus() {}
    setProgressBar() {}
    setThumbarButtons() {}
  }
  const main = load('src/main/modules/winMain/main.ts', {
    electron: { BrowserWindow: Window, session: { fromPartition: () => ({ setProxy: async() => {} }) }, dialog: { showMessageBox: async(_window, options) => { calls.nativeOptions = plain(options); return new Promise(resolve => { nativeAnswer = resolve }) } } },
    'node:path': path,
    './utils': { createTaskBarButtons: () => [], getWindowSizeInfo: () => ({ width: 1000, height: 700 }) },
    '@common/utils': { getOSVersion: () => 'test', getPlatform: () => 'win32', isWin: true },
    '@main/utils': { getProxy: () => null },
    '@common/mainIpc': { mainSend: (_window, name, params) => { calls.sends.push({ name, params }) } },
    './rendererEvent': { sendFocus: () => {}, sendTaskbarButtonClick: () => {} },
    '@common/utils/electron': { encodePath: value => value },
    '@common/windowClose': common,
    '@main/app': { quitApp: () => { calls.quit++; globals.lx.isSkipTrayQuit = true; win.close() } },
    '@main/modules/tray': { createTray: () => { if (!trayFailure) tray = appSetting['tray.enable'] }, isTrayAvailable: () => tray },
  }, { global: globals })
  main.createWindow()
  if (ready) main.prepareCloseDialog()
  return { main, win, calls, appSetting, globals, failSave() { saveError = true }, nativeAnswer(value) { nativeAnswer(value) } }
}

test('new installs default to asking on close with background playback and tray enabled', () => {
  const defaults = load('src/common/defaultSetting.ts', { 'node:path': path, 'node:os': require('node:os') }).default
  assert.equal(defaults['tray.enable'], true)
  assert.equal(defaults['common.closeAction'], 'ask')
  const { win } = fixture()
  assert.equal(win.options.webPreferences.backgroundThrottling, false)
})

test('old tray defaults migrate once and subsequent deliberate close choices are retained', () => {
  const old = { 'tray.enable': false, 'player.volume': 0.5 }
  const migrated = common.migrateWindowCloseSetting(old)
  assert.deepEqual(plain(migrated), { ...old, 'tray.enable': true, 'common.closeAction': 'ask' })
  assert.equal(old['tray.enable'], false)
  for (const action of ['ask', 'tray', 'quit']) {
    const preference = { 'common.closeAction': action, 'tray.enable': false }
    assert.equal(common.migrateWindowCloseSetting(preference), preference)
  }
  assert.equal(common.migrateWindowCloseSetting(undefined), undefined)
})

test('native close and titlebar close share one prompt; cancel keeps the renderer and lyrics running', () => {
  const { main, win, calls } = fixture()
  win.close() // Alt+F4/native close.
  main.closeWindow() // Titlebar IPC, while the same prompt is open.
  assert.equal(calls.sends.filter(call => call.name === common.WINDOW_CLOSE_EVENT_NAME.requested).length, 1)
  assert.equal(win.destroyed, false)
  assert.equal(calls.closed, 0)
  main.respondToClose({ action: 'cancel', remember: true })
  assert.equal(calls.saved.length, 0)
  assert.equal(calls.hidden, 0)
  main.closeWindow()
  assert.equal(calls.sends.filter(call => call.name === common.WINDOW_CLOSE_EVENT_NAME.requested).length, 2)
})

test('SPA navigation retains the ready renderer dialog; full reload and crash fall back safely', () => {
  const state = fixture()
  state.win.webContents.emit('did-start-navigation', {}, '#/list', true, true)
  state.win.webContents.emit('did-start-navigation', {}, 'https://cover.example', false, false)
  state.main.closeWindow()
  assert.equal(state.calls.nativeOptions, null)
  assert.equal(state.calls.sends.filter(call => call.name === common.WINDOW_CLOSE_EVENT_NAME.requested).length, 1)
  state.main.respondToClose({ action: 'cancel', remember: false })
  state.win.webContents.emit('did-start-navigation', {}, 'file://index.html', false, true)
  state.main.closeWindow()
  assert.equal(state.calls.nativeOptions.title, '关闭 LinkLine 窗口？')
  const crashed = fixture()
  crashed.win.webContents.emit('render-process-gone')
  crashed.main.closeWindow()
  assert.equal(crashed.calls.nativeOptions.title, '关闭 LinkLine 窗口？')
})

test('choosing the tray keeps playback and desktop lyrics alive and can remember future closes', () => {
  const { main, win, calls, appSetting } = fixture({ enabled: false })
  win.fullscreen = true
  main.closeWindow()
  main.respondToClose({ action: 'tray', remember: true })
  assert.equal(win.destroyed, false)
  assert.equal(win.visible, false)
  assert.equal(win.fullscreen, false)
  assert.equal(calls.quit, 0)
  assert.equal(calls.closed, 0)
  assert.equal(appSetting['tray.enable'], true)
  assert.equal(appSetting['common.closeAction'], 'tray')
  main.showWindow()
  main.closeWindow()
  assert.equal(calls.hidden, 2)
  assert.equal(calls.sends.filter(call => call.name === common.WINDOW_CLOSE_EVENT_NAME.requested).length, 1)
})

test('tray without remembering still asks on the next close', () => {
  const { main, calls, appSetting } = fixture()
  main.closeWindow()
  main.respondToClose({ action: 'tray', remember: false })
  assert.equal(appSetting['common.closeAction'], 'ask')
  main.showWindow()
  main.closeWindow()
  assert.equal(calls.sends.filter(call => call.name === common.WINDOW_CLOSE_EVENT_NAME.requested).length, 2)
})

test('confirmed exit remembers its choice and bypasses the close prompt during app quit', () => {
  const { main, win, calls, appSetting } = fixture()
  main.closeWindow()
  main.respondToClose({ action: 'quit', remember: true })
  assert.equal(appSetting['common.closeAction'], 'quit')
  assert.equal(calls.quit, 1)
  assert.equal(calls.closed, 1)
  assert.equal(win.destroyed, true)
  assert.equal(calls.sends.filter(call => call.name === common.WINDOW_CLOSE_EVENT_NAME.requested).length, 1)
})

test('remembered exit closes immediately, and a real tray exit does not open the dialog', () => {
  const remembered = fixture({ action: 'quit' })
  remembered.main.closeWindow()
  assert.equal(remembered.calls.quit, 1)
  assert.equal(remembered.win.destroyed, true)
  const exiting = fixture()
  exiting.globals.lx.isSkipTrayQuit = true // app before-quit / tray Exit.
  exiting.win.close()
  assert.equal(exiting.win.destroyed, true)
  assert.equal(exiting.calls.closed, 1)
  assert.equal(exiting.calls.sends.filter(call => call.name === common.WINDOW_CLOSE_EVENT_NAME.requested).length, 0)
})

test('disabled or unavailable tray never leaves an inaccessible hidden process', () => {
  const disabled = fixture({ action: 'tray', enabled: false })
  disabled.main.closeWindow()
  assert.equal(disabled.calls.hidden, 0)
  assert.equal(disabled.calls.sends.filter(call => call.name === common.WINDOW_CLOSE_EVENT_NAME.requested).length, 1)
  const unavailable = fixture({ trayFailure: true })
  unavailable.main.closeWindow()
  assert.throws(() => unavailable.main.respondToClose({ action: 'tray', remember: false }), /无法创建托盘图标/)
  assert.equal(unavailable.calls.hidden, 0)
  assert.equal(unavailable.win.destroyed, false)
  unavailable.main.respondToClose({ action: 'quit', remember: false })
  assert.equal(unavailable.calls.quit, 1)
})

test('saving failures leave the prompt actionable and do not quit or hide', () => {
  const { main, win, calls, failSave } = fixture()
  main.closeWindow()
  failSave()
  assert.throws(() => main.respondToClose({ action: 'quit', remember: true }), /storage failed/)
  assert.equal(win.destroyed, false)
  assert.equal(calls.quit, 0)
  assert.equal(calls.hidden, 0)
  main.respondToClose({ action: 'cancel', remember: false })
  assert.equal(main.prepareCloseDialog(), false)
})

test('closing before renderer initialization has a usable native prompt and no duplicate dialog', async() => {
  const { main, win, calls, nativeAnswer } = fixture({ ready: false })
  main.closeWindow()
  assert.equal(calls.nativeOptions.title, '关闭 LinkLine 窗口？')
  assert.deepEqual(calls.nativeOptions.buttons, ['取消', '退出应用', '最小化到托盘'])
  assert.equal(main.prepareCloseDialog(), false)
  nativeAnswer({ response: 2, checkboxChecked: false })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(calls.hidden, 1)
  assert.equal(win.destroyed, false)
})

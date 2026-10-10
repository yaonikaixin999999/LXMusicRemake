const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const ts = require('typescript')

function load(file, requireModule, globals) {
  const target = { exports: {} }
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    module: target, exports: target.exports, require: requireModule, global: globals, __dirname,
    process: { env: { NODE_ENV: 'production' } }, setInterval, clearInterval,
  })
  return target.exports
}

function setup() {
  let area = { x: -1280, y: 40, width: 1280, height: 960 }
  const screen = new EventEmitter()
  screen.getDisplayMatching = () => ({ workArea: area })
  screen.getDisplayNearestPoint = () => ({ workArea: area })
  screen.getCursorScreenPoint = () => ({ x: -700, y: 450 })
  const appSetting = { 'desktopLyric.isLockScreen': true, 'desktopLyric.isLock': false, 'desktopLyric.isAlwaysOnTop': false, 'desktopLyric.width': 450, 'desktopLyric.height': 300, 'desktopLyric.x': null, 'desktopLyric.y': null }
  const globals = { envParams: { workAreaSize: { width: 1920, height: 1040 } }, lx: { appSetting, theme: { shouldUseDarkColors: false, theme: {} }, event_app: { update_config: (config) => Object.assign(appSetting, config), desktop_lyric_window_created: () => {} } } }
  const utils = load('src/main/modules/winLyric/utils.ts', (name) => { assert.equal(name, 'electron'); return { screen } }, globals)
  return { screen, appSetting, globals, utils, setArea(value) { area = value } }
}

const plain = value => JSON.parse(JSON.stringify(value))

test('desktop lyrics open within the current display work area, including monitors left of primary', () => {
  const { utils } = setup()
  assert.deepEqual(plain(utils.initWindowSize(null, null, 450, 300)), { x: -865, y: 676, width: 450, height: 300 })
  assert.deepEqual(plain(utils.initWindowSize(-1000, 70, 450, 300)), { x: -1000, y: 70, width: 450, height: 300 })
})

test('reopening recovers a disconnected-display position even when screen locking is disabled', () => {
  const { utils, appSetting, setArea } = setup()
  appSetting['desktopLyric.isLockScreen'] = false
  setArea({ x: 0, y: 0, width: 1920, height: 1040 })
  assert.deepEqual(plain(utils.initWindowSize(-1200, 1800, 450, 300)), { x: 0, y: 740, width: 450, height: 300 })
  assert.deepEqual(plain(utils.initWindowSize(4000, -300, 4000, 3000)), { x: 0, y: 0, width: 1920, height: 1040 })
})

test('malformed saved geometry gets usable dimensions and a visible position', () => {
  const { utils } = setup()
  assert.deepEqual(plain(utils.initWindowSize(NaN, Infinity, NaN, Infinity)), { x: -865, y: 676, width: 450, height: 300 })
})

test('dragging and minimum-size resizing preserve negative display coordinates and fixed opposite edges', () => {
  const { utils } = setup()
  assert.deepEqual(plain(utils.getLyricWindowBounds({ x: -1000, y: 100, width: 360, height: 220 }, { x: 90, y: 90, w: 270, h: 130 })), { x: -960, y: 140, width: 320, height: 180 })
  assert.deepEqual(plain(utils.getLyricWindowBounds({ x: -1000, y: 100, width: 360, height: 220 }, { x: -900, y: -900, w: 360, h: 220 })), { x: -1280, y: 40, width: 360, height: 220 })
})

test('opening brings lyrics above other windows without focus or changing an existing pin preference', () => {
  const { screen, globals, utils, appSetting, setArea } = setup()
  const calls = []
  let win
  class Window extends EventEmitter {
    constructor(options) { super(); win = this; this.options = options; this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height } }
    loadURL() { return Promise.resolve() }
    getBounds() { return this.bounds }
    setBounds(bounds) { this.bounds = bounds; calls.push('setBounds') }
    isDestroyed() { return false }
    showInactive() { calls.push('showInactive') }
    moveTop() { calls.push('moveTop') }
    setIgnoreMouseEvents() {}
    close() { this.emit('closed') }
  }
  const main = load('src/main/modules/winLyric/main.ts', (name) => {
    if (name === 'node:path') return path
    if (name === 'electron') return { BrowserWindow: Window, screen }
    if (name === '@common/utils') return { debounce: callback => callback, getPlatform: () => 'win32', isWin: true, isLinux: false }
    if (name === './utils') return utils
    if (name === '@common/mainIpc') return { mainSend: () => {} }
    if (name === '@common/utils/electron') return { encodePath: value => value }
    throw new Error(name)
  }, globals)
  main.createWindow()
  win.emit('ready-to-show')
  assert.deepEqual(calls.slice(-2), ['showInactive', 'moveTop'])
  assert.equal(win.options.alwaysOnTop, false)
  assert.equal(appSetting['desktopLyric.isAlwaysOnTop'], false)
  setArea({ x: 0, y: 0, width: 1920, height: 1040 })
  screen.emit('display-removed')
  assert.equal(win.bounds.x, 0)
  assert.ok(win.bounds.y + win.bounds.height <= 1040)
  main.closeWindow()
  assert.equal(screen.listenerCount('display-removed'), 0)
  assert.equal(screen.listenerCount('display-metrics-changed'), 0)
})

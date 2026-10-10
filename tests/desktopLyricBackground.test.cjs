const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')

const root = path.resolve(__dirname, '..')
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
const plain = value => JSON.parse(JSON.stringify(value))
function loadSource(source, imports, extra = {}) {
  const module = { exports: {} }
  vm.runInNewContext(compile(source), { module, exports: module.exports, require: name => {
    if (name in imports) return imports[name]
    if (name.endsWith('.vue')) return {}
    throw new Error('Unexpected import: ' + name)
  }, Number, process, ...extra })
  return module.exports
}
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
function script(file) { return read(file).match(/<script setup(?: lang="ts")?>([\s\S]*?)<\/script>/)[1] }

function fixture() {
  const state = loadSource(read('src/renderer-lyric/store/state.ts'), { '@common/utils/vueTools': vue })
  const imports = {
    vue: { ...vue, onMounted() {} },
    '@lyric/store/state': state,
    '@lyric/useApp/useWindowSize': () => ({ startResize() {} }),
    '@lyric/useApp/useHoverHide': () => vue.ref(false),
    '@lyric/useApp/useCommon': () => {},
    '@lyric/useApp/useLyric': () => {},
    '@lyric/useApp/useTheme': () => {},
    '@lyric/useApp/usePauseHide': () => vue.ref(false),
    '@lyric/core/lyric': { init() {} },
    '@lyric/utils/ipc': { sendConnectMainWindowEvent() {} },
    '../renderer/composables/useAppearance': { useAppearance() {} },
    './ui/useDesktopDrag': () => () => {},
  }
  const app = loadSource(script('src/renderer-lyric/App.vue') + '\nmodule.exports = { backgroundStyle };', imports)
  return { ...state, ...app }
}

test('background alpha preserves fully transparent and opaque endpoints without changing text opacity', () => {
  const { setting, backgroundStyle } = fixture()
  assert.equal(setting['desktopLyric.style.backgroundOpacity'], 100)
  assert.deepEqual(plain(backgroundStyle.value), { '--lyric-background-opacity': 1 })
  const text = setting['desktopLyric.style.opacity']
  for (const [saved, alpha] of [[0, 0], [35, 0.35], [100, 1], [-3, 0], [105, 1], [NaN, 1]]) {
    setting['desktopLyric.style.backgroundOpacity'] = saved
    assert.equal(backgroundStyle.value['--lyric-background-opacity'], alpha)
    assert.equal(setting['desktopLyric.style.opacity'], text)
    setting['desktopLyric.isLock'] = true
    assert.equal(backgroundStyle.value['--lyric-background-opacity'], alpha)
    setting['desktopLyric.isLock'] = false
  }
})

test('toolbar saves background slider through configuration IPC and never overwrites text preference', async() => {
  const { setting, isPlay, musicInfo } = fixture()
  const saved = []
  const toolbar = loadSource(script('src/renderer-lyric/ui/LyricToolbar.vue') + '\nmodule.exports = { number };', {
    vue: { ...vue, watch() {} },
    '@lyric/store/state': { setting, isPlay, musicInfo },
    '@lyric/utils/ipc': { updateSetting: async config => { saved.push(plain(config)); Object.assign(setting, config) }, sendPlayerControl() {} },
    '../../renderer/composables/useAppearance': { appearance: {}, resolvedAppearanceMode: vue.ref('light') },
  })
  await toolbar.number('desktopLyric.style.backgroundOpacity', { target: { value: '0' } })
  await toolbar.number('desktopLyric.style.backgroundOpacity', { target: { value: '100' } })
  assert.deepEqual(saved, [{ 'desktopLyric.style.backgroundOpacity': 0 }, { 'desktopLyric.style.backgroundOpacity': 100 }])
  assert.equal(setting['desktopLyric.style.opacity'], 95)
})

test('native configuration forwards saved background alpha for initial load and live changes', () => {
  const utils = loadSource(read('src/main/modules/winLyric/utils.ts'), { electron: { screen: {} } })
  assert.ok(utils.watchConfigKeys.includes('desktopLyric.style.backgroundOpacity'))
  const initial = { 'desktopLyric.style.backgroundOpacity': 0, 'desktopLyric.style.opacity': 78, 'common.isAgreePact': true }
  assert.deepEqual(plain(utils.buildLyricConfig(initial)), { 'desktopLyric.style.backgroundOpacity': 0, 'desktopLyric.style.opacity': 78 })
  const sent = []
  const config = loadSource(read('src/main/modules/winLyric/config.ts'), {
    '@common/utils': { isLinux: false },
    './main': { isExistWindow: () => true },
    './rendererEvent': { sendConfigChange: patch => sent.push(plain(patch)) },
    './utils': utils,
    './mouseCheckTools': {},
  }, { global: { lx: { appSetting: initial } } })
  config.setLrcConfig(['desktopLyric.style.backgroundOpacity'], { 'desktopLyric.style.backgroundOpacity': 65 })
  assert.deepEqual(sent, [{ 'desktopLyric.style.backgroundOpacity': 65 }])
})

test('main settings validate the full range and retain transparent background in backup restore', () => {
  const defaults = loadSource(read('src/common/defaultSetting.ts'), { 'node:path': path, 'node:os': require('node:os') }).default
  const quality = loadSource(read('src/common/platformPlayback.ts'), {})
  const schema = loadSource(read('src/renderer/ui/settings/schema.ts'), {
    '@common/defaultSetting': { default: defaults, __esModule: true },
    '@common/config': { windowSizeList: [] },
    '@root/lang': { langList: [] },
    '@common/platformPlayback': quality,
    './labels.json': { default: require('../src/renderer/ui/settings/labels.json'), __esModule: true },
  })
  const field = schema.settingFields.find(field => field.key === 'desktopLyric.style.backgroundOpacity')
  assert.equal(field.category, 'lyrics')
  assert.equal(field.min, 0)
  assert.equal(field.max, 100)
  assert.equal(defaults[field.key], 100)
  assert.equal(schema.parseSettingValue(field, '0'), 0)
  assert.equal(schema.parseSettingValue(field, '100'), 100)
  assert.throws(() => schema.parseSettingValue(field, '-1'))
  assert.throws(() => schema.parseSettingValue(field, '101'))
  assert.deepEqual(plain(schema.validateSettingBackup({ [field.key]: 0 })), { [field.key]: 0 })
})

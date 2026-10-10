const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')

const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
function load(file, imports = {}, globals = {}, source = read(file)) {
  const module = { exports: {} }
  vm.runInNewContext(compile(source), {
    module, exports: module.exports, Error, console, process, CSS: { supports: () => true },
    require: name => { if (name in imports) return imports[name]; throw new Error(`Unexpected import ${name} in ${file}`) },
    ...globals,
  }, { filename: file })
  return module.exports
}
const common = load('src/common/platformPlayback.ts')
const defaults = load('src/common/defaultSetting.ts', { 'node:path': path, 'node:os': require('node:os') }).default
const schema = load('src/renderer/ui/settings/schema.ts', {
  '@common/defaultSetting': { default: defaults, __esModule: true }, '@common/platformPlayback': common,
  '@common/config': { windowSizeList: [] }, '@root/lang': { langList: [] },
  './labels.json': { __esModule: true, default: JSON.parse(read('src/renderer/ui/settings/labels.json')) },
})
const plain = value => JSON.parse(JSON.stringify(value))
const track = { id: 'wy_1', source: 'wy', name: 'Fixture', singer: 'Artist', meta: { qualitys: [{ type: '128k' }, { type: '320k' }], _qualitys: { '128k': {}, '320k': {} } } }

function fixture({ legacy, persisted = '192k', saveError } = {}) {
  const disk = { ...defaults, 'player.playQuality': persisted }
  const storage = new Map(legacy === undefined ? [] : [['linkline.playback-quality.v1', legacy]])
  const saves = [], requests = []
  const window = { lxData: {} }
  const failSave = saveError
  let settings
  const ipc = { updateSetting: async(patch) => {
    structuredClone(patch)
    saves.push(plain(patch))
    if (failSave) throw failSave
    Object.assign(disk, patch)
    // Mirror the main-process config notification arriving before invoke resolves.
    if (settings) settings.mergeSetting(patch)
  } }
  settings = load('src/renderer/store/setting.ts', {
    '@common/utils/vueTools': vue, '@common/defaultSetting': { default: defaults, __esModule: true },
    '@common/platformPlayback': common, '@renderer/utils/ipc': ipc,
  }, { window, localStorage: { getItem: key => storage.get(key), removeItem: key => storage.delete(key) } })
  const player = { playMusicInfo: { musicInfo: track } }
  const service = load('src/renderer/ui/services/platformPlayback.ts', {
    vue, '@common/platformPlayback': common, '@renderer/store/player/state': player,
    '@renderer/store/setting': settings, '@renderer/utils/ipc': ipc,
    electron: { ipcRenderer: { invoke: async(channel, payload) => {
      requests.push({ channel, payload })
      if (channel === 'platform_playback_qualitys') return ['128k', '320k', 'flac']
      return { platform: 'netease', musicInfo: payload.track, url: `https://audio.test/${payload.quality}`, type: common.legacyQuality(payload.quality), quality: payload.quality }
    } } },
  })
  const imports = {
    vue: { ...vue, onMounted() {}, onBeforeUnmount() {} }, '@renderer/store/setting': settings,
    '@renderer/store/list/state': {}, '@renderer/store/list/action': {}, '@renderer/store': { userApi: {}, sync: {}, versionInfo: {} },
    '@renderer/utils/ipc': ipc, '@renderer/core/apiSource': {}, '@renderer/core/player/utils': {}, '@renderer/plugins/player': {},
    '@renderer/utils': {}, '@common/utils/nodejs': {}, '@common/utils/common': {}, '@common/utils/migrateSetting': {},
    '@renderer/composables/useAppearance': {}, '@renderer/store/dislikeList': { dislikeInfo: { rules: '' } },
    '@renderer/core/dislikeList': {}, './schema': schema, '@renderer/ui/services/platformPlayback': service,
    '@common/localMusic': { LOCAL_LIBRARY_ID: 'userlist_linkline_local' },
    '../services/localLibrary': { reconcileLocalLibraryAfterRestore: async() => {} },
  }
  const useSettings = load('src/renderer/ui/settings/useSettings.ts', imports).useSettings()
  const componentSource = read('src/renderer/ui/components/QualityControl.vue').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const props = vue.reactive({ track })
  const quality = load('src/renderer/ui/components/QualityControl.vue', {
    vue: { ...vue, onBeforeUnmount() {} }, '@common/platformPlayback': common,
    '@renderer/store': { sourceNames: vue.ref({ wy: '网易云音乐' }) }, '../services/platformPlayback': service, './UiIcon.vue': {},
  }, {
    defineProps: () => props, crypto: { randomUUID: () => 'fixture' }, document: { removeEventListener() {} }, window: { removeEventListener() {} },
  }, `${componentSource}\nmodule.exports = { choose, changing, error, options };`)
  return { disk, storage, saves, requests, settings, service, useSettings, quality }
}

test('default requests account-highest quality and obsolete playback-bar values cannot replace it', async() => {
  assert.equal(defaults['player.playQuality'], 'auto')
  for (const legacy of [undefined, '128k', 'flac', 'jymaster', 'constructor', 'unavailable']) {
    const state = fixture({ legacy, persisted: defaults['player.playQuality'] })
    state.settings.initSetting(state.disk)
    assert.equal(state.service.preferredQuality.value, 'auto')
    await state.service.resolvePlatformStream(track, false, true)
    assert.equal(state.requests.at(-1).payload.quality, 'auto')
    assert.equal(state.disk['player.playQuality'], 'auto')
    assert.equal(state.saves.length, 0)
    assert.equal(state.storage.size, 0)
  }
})

test('obsolete playback-bar cleanup preserves subsequent manual settings across restart', async() => {
  for (const legacy of [undefined, 'auto', '128k', 'flac', 'constructor', 'unavailable']) {
    const state = fixture({ legacy, persisted: 'ape' })
    state.settings.initSetting(state.disk)
    assert.equal(state.service.preferredQuality.value, 'ape')
    assert.equal(state.saves.length, 0)
    assert.equal(state.storage.size, 0)
    const restarted = fixture({ persisted: state.disk['player.playQuality'] })
    restarted.settings.initSetting(restarted.disk)
    assert.equal(restarted.service.preferredQuality.value, 'ape')
  }
})

test('missing or invalid persisted quality uses the account-highest default', async() => {
  for (const persisted of [undefined, 'constructor', 'unavailable']) {
    const state = fixture({ persisted, legacy: '128k' })
    if (persisted === undefined) delete state.disk['player.playQuality']
    state.settings.initSetting(state.disk)
    assert.equal(state.service.preferredQuality.value, 'auto')
    await state.service.resolvePlatformStream(track, false, true)
    assert.equal(state.requests.at(-1).payload.quality, 'auto')
    assert.equal(state.storage.size, 0)
  }
})

test('real Vue settings and playback bar share one value, persist through IPC and reload once per change', async(t) => {
  const state = fixture()
  await state.settings.initSetting(state.disk)
  let reloads = 0
  t.after(state.service.bindQualityReload(async() => {
    reloads++
    await state.service.resolvePlatformStream(track, true, true)
  }))
  const field = schema.settingFields.find(field => field.key === 'player.playQuality')
  await state.useSettings.setPreference(field, '128k')
  assert.equal(state.service.preferredQuality.value, '128k')
  assert.equal(reloads, 1)
  assert.equal(state.requests.at(-1).payload.quality, '128k')
  await state.quality.choose('320k')
  assert.equal(state.settings.appSetting['player.playQuality'], '320k')
  assert.equal(state.disk['player.playQuality'], '320k')
  assert.equal(reloads, 2)
  assert.equal(state.requests.at(-1).payload.quality, '320k')
  assert.deepEqual(state.saves, [{ 'player.playQuality': '128k' }, { 'player.playQuality': '320k' }])
})

test('backup import accepts all platform qualities and triggers the same single reload', async(t) => {
  const state = fixture()
  await state.settings.initSetting(state.disk)
  let reloads = 0
  t.after(state.service.bindQualityReload(async() => { reloads++ }))
  const field = schema.settingFields.find(field => field.key === 'player.playQuality')
  assert.deepEqual(plain(field.options.map(option => option.value)), Object.keys(common.qualityLabels))
  for (const preference of Object.keys(common.qualityLabels)) {
    const backup = schema.validateSettingBackup({ 'player.playQuality': preference })
    assert.equal(backup['player.playQuality'], preference)
    const previous = state.service.preferredQuality.value
    const before = reloads
    await state.useSettings.saveRecord(backup)
    await vue.nextTick()
    assert.equal(state.service.preferredQuality.value, preference)
    assert.equal(state.disk['player.playQuality'], preference)
    assert.equal(reloads, before + (previous === preference ? 0 : 1))
  }
})

test('quality reload failure is visible and selecting the same preference retries it', async(t) => {
  const state = fixture()
  await state.settings.initSetting(state.disk)
  let calls = 0
  t.after(state.service.bindQualityReload(async() => { if (++calls === 1) throw new Error('Stream unavailable') }))
  await state.quality.choose('flac')
  assert.equal(state.quality.error.value, 'Stream unavailable')
  assert.equal(state.quality.changing.value, false)
  assert.equal(state.service.preferredQuality.value, 'flac')
  await state.quality.choose('flac')
  assert.equal(calls, 2)
  assert.equal(state.quality.error.value, '')
  assert.equal(state.quality.changing.value, false)
  assert.equal(state.saves.length, 1)
})

test('failed quality persistence leaves the selection and current playback unchanged', async(t) => {
  const state = fixture({ saveError: new Error('Disk unavailable') })
  await state.settings.initSetting(state.disk)
  let reloads = 0
  t.after(state.service.bindQualityReload(async() => { reloads++ }))
  await state.quality.choose('flac')
  assert.equal(state.service.preferredQuality.value, '192k')
  assert.equal(state.disk['player.playQuality'], '192k')
  assert.equal(state.quality.error.value, 'Disk unavailable')
  assert.equal(reloads, 0)
})

test('an obsolete failed quality request cannot replace a newer successful preference or its status', async(t) => {
  const state = fixture()
  await state.settings.initSetting(state.disk)
  let rejectOld
  const pending = new Promise((_resolve, reject) => { rejectOld = reject })
  let calls = 0
  t.after(state.service.bindQualityReload(async() => { if (++calls === 1) await pending }))
  const old = state.service.setPreferredQuality('flac').catch(error => error)
  await Promise.resolve()
  await Promise.resolve()
  await state.service.setPreferredQuality('320k')
  rejectOld(new Error('Old request failed'))
  await old
  assert.equal(state.service.preferredQuality.value, '320k')
  assert.equal(state.service.qualityChangeError.value, '')
  assert.equal(state.service.qualityChanging.value, false)
})

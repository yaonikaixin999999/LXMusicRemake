const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')

const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
function load(file, imports = {}, globals = {}, source = read(file)) {
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(output, {
    module, exports: module.exports, Error, URL, console,
    process: { versions: { app: '1.0.0' } },
    require: name => { if (name in imports) return imports[name]; throw new Error(`Unexpected import: ${name}`) },
    ...globals,
  }, { filename: file })
  return module.exports
}
const common = load('src/common/appUpdate.ts')
const plain = value => JSON.parse(JSON.stringify(value))
const sourceKey = 'linkline.update-source.v1'
const asset = (patch = {}) => ({ name: 'LinkLine-v1.1.0-x64-Setup.exe', url: `${common.LINKLINE_RELEASES_URL}/download/v1.1.0/LinkLine-v1.1.0-x64-Setup.exe`, size: 1024 * 1024, sha256: 'a'.repeat(64), ...patch })
const release = (assets = [asset()]) => ({ version: '1.1.0', name: 'LinkLine v1.1.0', body: 'New version notes', publishedAt: '2026-10-10T00:00:00Z', pageUrl: `${common.LINKLINE_RELEASES_URL}/tag/v1.1.0`, assets })
const result = (source = 'mirror', patch = {}) => ({ status: 'available', currentVersion: '1.0.0', latestRelease: release(), history: [], checkedAt: Date.now(), source, requestedSource: source, usedFallback: false, sourceLabel: common.UPDATE_SOURCES[source].label, error: null, ...patch })

function fixture({ stored, storageError } = {}) {
  const storage = new Map(stored == null ? [] : [[sourceKey, stored]])
  const localStorage = {
    getItem: key => { if (storageError) throw storageError; return storage.get(key) ?? null },
    setItem: (key, value) => { if (storageError) throw storageError; storage.set(key, value) },
  }
  const preferences = load('src/renderer/ui/services/updatePreferences.ts', { vue, '@common/appUpdate': common }, { localStorage })
  const requests = [], opened = []
  const service = load('src/renderer/ui/services/appUpdate.ts', {
    vue, '@common/appUpdate': common, './updatePreferences': preferences,
    '@common/rendererIpc': { rendererInvoke: (channel, payload) => {
      structuredClone(payload)
      let resolve, reject
      const promise = new Promise((yes, no) => { resolve = yes; reject = no })
      requests.push({ channel, payload: plain(payload), resolve, reject })
      return promise
    } },
  })
  const component = read('src/renderer/ui/components/UpdateCenterPanel.vue').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const panel = load('src/renderer/ui/components/UpdateCenterPanel.vue', {
    vue: { ...vue, onMounted() {} }, '@common/appUpdate': common,
    '@common/utils/electron': { openUrl: async(url) => { opened.push(url) } },
    '@renderer/store': { versionInfo: { version: '1.0.0' } },
    '@renderer/assets/images/linkline-logo.svg': { default: 'logo.svg' }, './UiIcon.vue': {}, './UiSelect.vue': {},
    '@renderer/ui/services/appUpdate': service, '@renderer/ui/services/updatePreferences': preferences,
  }, {}, `${component}\nmodule.exports = { installer, downloadInstaller, downloadBackup, installerChecksum, actualSourceLabel, fallbackMessage, openOfficialPage };`)
  return { storage, preferences, service, requests, panel, opened }
}

test('update-source defaults to domestic acceleration, validates storage, and persists across restarts', async() => {
  assert.equal(fixture().preferences.preferredUpdateSource.value, 'mirror')
  assert.equal(fixture({ stored: 'unknown' }).preferences.preferredUpdateSource.value, 'mirror')
  const state = fixture()
  const changed = state.service.selectUpdateSource('github')
  assert.equal(state.storage.get(sourceKey), 'github')
  assert.equal(state.requests[0].payload.source, 'github')
  state.requests[0].resolve(result('github'))
  await changed
  assert.equal(fixture({ stored: state.storage.get(sourceKey) }).preferences.preferredUpdateSource.value, 'github')
  await state.service.selectUpdateSource('untrusted')
  assert.equal(state.requests.length, 1)
})

test('unavailable preference storage keeps the chosen source for this session and reports save failure', async() => {
  const state = fixture({ storageError: new Error('Storage unavailable') })
  const changed = state.service.selectUpdateSource('github')
  assert.equal(state.preferences.preferredUpdateSource.value, 'github')
  assert.match(state.preferences.updateSourceSaveError.value, /未能保存/)
  state.requests[0].resolve(result('github'))
  await changed
})

test('startup, settings, and title-bar checks share one in-flight request using the saved source', async() => {
  const state = fixture({ stored: 'github' })
  state.service.checkUpdateOnStartup()
  state.service.checkUpdateOnStartup()
  state.service.openUpdateCenter()
  const completion = state.service.checkAppUpdate(true)
  assert.equal(state.requests.length, 1)
  assert.deepEqual(state.requests[0].payload, { force: false, source: 'github' })
  assert.equal(state.service.updateCenterOpen.value, true)
  state.requests[0].resolve(result('github'))
  await completion
  assert.equal(state.service.updateAvailable.value, true)
  assert.equal(state.service.updateChecking.value, false)
})

test('switching sources invalidates display and ignores a late response from the previous source', async() => {
  const state = fixture()
  const oldCheck = state.service.checkAppUpdate()
  const changed = state.service.selectUpdateSource('github')
  assert.equal(state.requests.length, 2)
  assert.equal(state.service.updateResult.value, null)
  state.requests[1].resolve(result('github', { status: 'latest' }))
  await changed
  state.requests[0].resolve(result('mirror'))
  await oldCheck
  assert.equal(state.service.updateResult.value.requestedSource, 'github')
  assert.equal(state.service.updateResult.value.status, 'latest')
  assert.equal(state.service.updateAvailable.value, false)
})

test('rapidly switching back reuses the original request without allowing intervening source results to overwrite it', async() => {
  const state = fixture()
  const first = state.service.checkAppUpdate()
  const second = state.service.selectUpdateSource('github')
  const third = state.service.selectUpdateSource('mirror')
  assert.equal(state.requests.length, 2)
  state.requests[0].resolve(result('mirror'))
  await Promise.all([first, third])
  state.requests[1].resolve(result('github', { status: 'error', error: 'Connection failed' }))
  await second
  assert.equal(state.service.updateResult.value.requestedSource, 'mirror')
  assert.equal(state.service.updateAvailable.value, true)
  assert.equal(state.service.updateChecking.value, false)
})

test('failed recheck keeps readable notes while disabling stale installers and opening the official release list', async() => {
  const state = fixture()
  const first = state.service.checkAppUpdate()
  state.requests[0].resolve(result())
  await first
  assert.ok(state.panel.installer.value)
  const retry = state.service.checkAppUpdate(true)
  assert.equal(state.panel.installer.value, null)
  state.requests[1].resolve(result('mirror', { status: 'error', latestRelease: null, error: 'Offline' }))
  await retry
  assert.equal(state.service.updateResult.value.latestRelease.body, 'New version notes')
  assert.equal(state.service.updateAvailable.value, false)
  assert.equal(state.panel.installer.value, null)
  await state.panel.downloadInstaller()
  await state.panel.openOfficialPage()
  assert.deepEqual(state.opened, [common.LINKLINE_RELEASES_URL])
  const changed = state.service.selectUpdateSource('github')
  state.requests[2].resolve(result('github', { status: 'error', latestRelease: null }))
  await changed
  assert.equal(state.service.updateResult.value.latestRelease, null)
})

test('metadata fallback retains the selected domestic download route, with a backup and SHA-256', async() => {
  const state = fixture()
  const completion = state.service.checkAppUpdate()
  state.requests[0].resolve(result('github', { requestedSource: 'mirror', usedFallback: true }))
  await completion
  assert.match(state.panel.actualSourceLabel.value, /GitHub/)
  assert.match(state.panel.fallbackMessage.value, /国内加速未响应/)
  assert.equal(state.panel.installerChecksum.value, 'a'.repeat(64))
  await state.panel.downloadInstaller()
  await state.panel.downloadBackup()
  assert.deepEqual(state.opened, [`${common.LINKLINE_DOWNLOAD_MIRROR}${asset().url}`, `${common.LINKLINE_BACKUP_MIRROR}${asset().url}`])
})

test('installer selection rejects portable files and assets from another repository', async() => {
  const state = fixture()
  const completion = state.service.checkAppUpdate()
  state.requests[0].resolve(result('mirror', { latestRelease: release([asset({ name: 'LinkLine-v1.1.0-x64-portable.exe' })]) }))
  await completion
  assert.equal(state.panel.installer.value, null)
  const retry = state.service.checkAppUpdate(true)
  state.requests[1].resolve(result('mirror', { latestRelease: release([asset({ url: 'https://github.com/other/repo/releases/download/v1.1.0/LinkLine-v1.1.0-x64-Setup.exe' })]) }))
  await retry
  assert.equal(state.panel.installer.value, null)
  const wrongVersion = state.service.checkAppUpdate(true)
  state.requests[2].resolve(result('mirror', { latestRelease: release([asset({ name: 'LinkLine-v1.0.0-x64-Setup.exe' })]) }))
  await wrongVersion
  assert.equal(state.panel.installer.value, null)
})

test('official-source installer uses the official direct asset with no domestic backup', async() => {
  const state = fixture({ stored: 'github' })
  const completion = state.service.checkAppUpdate()
  state.requests[0].resolve(result('github', { latestRelease: release([asset({ downloadUrl: asset().url })]) }))
  await completion
  await state.panel.downloadInstaller()
  await state.panel.downloadBackup()
  assert.deepEqual(state.opened, [asset().url])
  assert.equal(state.panel.installer.value.backupUrl, null)
})

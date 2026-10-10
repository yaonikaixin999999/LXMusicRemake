const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')

const root = path.resolve(__dirname, '..')
const migrationKey = 'linkline.player-progress-style.v1'
function load(file, imports, globals = {}) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (name in imports) return imports[name]
    throw new Error(`Unexpected import ${name}`)
  }, ...globals })
  return module.exports
}
function fixture(style = 'mini', storage = new Map(), save = async() => {}) {
  const appSetting = vue.reactive({ 'common.playBarProgressStyle': style })
  const calls = []
  const preferences = load('src/renderer/ui/services/preferences.ts', {
    '@renderer/store/setting': { appSetting },
    '@renderer/utils/ipc': { updateSetting: async(setting) => { calls.push(JSON.parse(JSON.stringify(setting))); await save(setting) } },
  }, {
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  })
  return { preferences, appSetting, calls, storage }
}

test('new installations default to the full player progress layout', () => {
  const settings = load('src/common/defaultSetting.ts', { 'node:path': require('node:path'), 'node:os': require('node:os') }, { process })
  assert.equal(settings.default['common.playBarProgressStyle'], 'full')
})

test('the old mini layout migrates to full and saves only once per renderer', async() => {
  const state = fixture()
  await state.preferences.migratePlayerProgressStyle()
  await state.preferences.migratePlayerProgressStyle()
  assert.equal(state.appSetting['common.playBarProgressStyle'], 'full')
  assert.deepEqual(state.calls, [{ 'common.playBarProgressStyle': 'full' }])
  assert.equal(state.storage.get(migrationKey), '1')
})

test('after migration a deliberate mini choice survives application restart', async() => {
  const storage = new Map()
  const first = fixture('mini', storage)
  await first.preferences.migratePlayerProgressStyle()
  const restarted = fixture('mini', storage)
  await restarted.preferences.migratePlayerProgressStyle()
  assert.equal(restarted.appSetting['common.playBarProgressStyle'], 'mini')
  assert.deepEqual(restarted.calls, [])
})

test('existing middle and full layouts are retained and later mini choices remain available', async() => {
  for (const style of ['middle', 'full']) {
    const storage = new Map()
    const first = fixture(style, storage)
    await first.preferences.migratePlayerProgressStyle()
    assert.equal(first.appSetting['common.playBarProgressStyle'], style)
    assert.deepEqual(first.calls, [])
    first.appSetting['common.playBarProgressStyle'] = 'mini'
    await first.preferences.migratePlayerProgressStyle()
    assert.equal(first.appSetting['common.playBarProgressStyle'], 'mini')
    const restarted = fixture('mini', storage)
    await restarted.preferences.migratePlayerProgressStyle()
    assert.equal(restarted.appSetting['common.playBarProgressStyle'], 'mini')
    assert.deepEqual(restarted.calls, [])
  }
})

test('failed setting persistence does not mark migration complete and can retry on restart', async() => {
  const storage = new Map()
  const first = fixture('mini', storage, async() => { throw new Error('IPC unavailable') })
  await first.preferences.migratePlayerProgressStyle()
  assert.equal(first.appSetting['common.playBarProgressStyle'], 'mini')
  assert.equal(storage.has(migrationKey), false)
  const restarted = fixture('mini', storage)
  await restarted.preferences.migratePlayerProgressStyle()
  assert.equal(restarted.appSetting['common.playBarProgressStyle'], 'full')
  assert.equal(storage.get(migrationKey), '1')
})

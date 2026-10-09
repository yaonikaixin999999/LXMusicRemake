const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const Module = require('node:module')
const ts = require('typescript')

function loadTypeScript(relativePath) {
  const filename = path.resolve(__dirname, '..', relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = module.paths
  loaded._compile(output, filename)
  return loaded.exports
}
const { prepareUserDataDirectory } = loadTypeScript('src/main/utils/userDataDirectory.ts')
const { URL_SCHEME_RXP } = loadTypeScript('src/common/constants.ts')

function fixture(t) {
  const appDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'linkline-profile-test-'))
  t.after(() => { fs.rmSync(appDataPath, { recursive: true, force: true }) })
  let locks = 0
  let releases = 0
  return {
    appDataPath,
    env: {},
    acquireLegacyLock() { locks++; return true },
    releaseLegacyLock() { releases++ },
    counts: () => ({ locks, releases }),
  }
}
function seedLegacy(options) {
  const legacy = path.join(options.appDataPath, 'LX Studio')
  fs.mkdirSync(path.join(legacy, 'LxDatas'), { recursive: true })
  fs.mkdirSync(path.join(legacy, 'Local Storage', 'leveldb'), { recursive: true })
  fs.writeFileSync(path.join(legacy, 'LxDatas', 'lx.data.db'), Buffer.from([0, 1, 254, 255]))
  fs.writeFileSync(path.join(legacy, 'LxDatas', 'lx.data.db-wal'), 'saved-playlist-in-wal')
  fs.writeFileSync(path.join(legacy, 'LxDatas', 'lx.data.db-shm'), 'saved-playlist-shm')
  fs.writeFileSync(path.join(legacy, 'LxDatas', 'config.json'), JSON.stringify({ volume: 0.37, theme: 'dark' }))
  fs.writeFileSync(path.join(legacy, 'Local Storage', 'leveldb', '001.log'), 'appearance-preferences')
  fs.writeFileSync(path.join(legacy, 'Local Storage', 'leveldb', 'lockfile'), 'user-data-file')
  return legacy
}

test('new LinkLine profile is selected without creating or touching legacy data', t => {
  const options = fixture(t)
  const result = prepareUserDataDirectory(options)
  assert.equal(result.userDataPath, path.join(options.appDataPath, 'LinkLine'))
  assert.equal(result.migration, 'none')
  assert.deepEqual(options.counts(), { locks: 0, releases: 0 })
})

test('first migration copies SQLite/WAL, settings and Chromium preferences while keeping the original', t => {
  const options = fixture(t)
  const legacy = seedLegacy(options)
  const result = prepareUserDataDirectory(options)
  assert.equal(result.migration, 'copied')
  for (const file of ['LxDatas/lx.data.db', 'LxDatas/lx.data.db-wal', 'LxDatas/lx.data.db-shm', 'LxDatas/config.json', 'Local Storage/leveldb/001.log', 'Local Storage/leveldb/lockfile']) {
    assert.deepEqual(fs.readFileSync(path.join(result.userDataPath, file)), fs.readFileSync(path.join(legacy, file)))
  }
  assert(!fs.existsSync(path.join(result.userDataPath, 'SingletonCookie')))
  assert(!fs.existsSync(path.join(result.userDataPath, 'lockfile')))
  assert(!fs.readdirSync(options.appDataPath).some(name => name.startsWith('.LinkLine-migration-')))
  assert.deepEqual(options.counts(), { locks: 1, releases: 1 })
  fs.writeFileSync(path.join(result.userDataPath, 'LxDatas', 'config.json'), 'new-settings')
  assert.equal(prepareUserDataDirectory(options).migration, 'none')
  assert.equal(fs.readFileSync(path.join(result.userDataPath, 'LxDatas', 'config.json'), 'utf8'), 'new-settings')
})

test('existing LinkLine profile wins and is never merged or overwritten', t => {
  const options = fixture(t)
  seedLegacy(options)
  const target = path.join(options.appDataPath, 'LinkLine')
  fs.mkdirSync(target)
  fs.writeFileSync(path.join(target, 'own-list.json'), 'current-user-data')
  assert.equal(prepareUserDataDirectory(options).migration, 'none')
  assert.equal(fs.readFileSync(path.join(target, 'own-list.json'), 'utf8'), 'current-user-data')
  assert(!fs.existsSync(path.join(target, 'LxDatas')))
  assert.deepEqual(options.counts(), { locks: 0, releases: 0 })
})

test('active legacy instance prevents copying and keeps compatibility with its data path', t => {
  const options = fixture(t)
  const legacy = seedLegacy(options)
  options.acquireLegacyLock = () => false
  assert.deepEqual(prepareUserDataDirectory(options), { userDataPath: legacy, migration: 'legacy-in-use' })
  assert(!fs.existsSync(path.join(options.appDataPath, 'LinkLine')))
  assert.equal(options.counts().releases, 0)
})

test('an active or unknown process lock prevents migration before any singleton probe', t => {
  const options = fixture(t)
  const legacy = seedLegacy(options)
  for (const name of ['lockfile', 'SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    fs.writeFileSync(path.join(legacy, name), 'process-lock')
    assert.deepEqual(prepareUserDataDirectory(options), { userDataPath: legacy, migration: 'legacy-in-use' })
    assert(!fs.existsSync(path.join(options.appDataPath, 'LinkLine')))
    fs.unlinkSync(path.join(legacy, name))
  }
  assert.deepEqual(options.counts(), { locks: 0, releases: 0 })
})

test('LinkLine environment override takes precedence and old QA variable still works', t => {
  const options = fixture(t)
  seedLegacy(options)
  options.env = { LINKLINE_DATA_DIR: path.join(options.appDataPath, 'new-qa'), LX_STUDIO_DATA_DIR: path.join(options.appDataPath, 'old-qa') }
  assert.equal(prepareUserDataDirectory(options).userDataPath, options.env.LINKLINE_DATA_DIR)
  options.env.LINKLINE_DATA_DIR = ''
  assert.equal(prepareUserDataDirectory(options).userDataPath, options.env.LX_STUDIO_DATA_DIR)
  delete options.env.LINKLINE_DATA_DIR
  assert.equal(prepareUserDataDirectory(options).userDataPath, options.env.LX_STUDIO_DATA_DIR)
  assert.deepEqual(options.counts(), { locks: 0, releases: 0 })
})

test('portable profiles are selected before single-instance locking, with explicit override first', t => {
  const options = fixture(t)
  options.portablePath = path.join(options.appDataPath, 'portable')
  fs.mkdirSync(options.portablePath)
  assert.deepEqual(prepareUserDataDirectory(options), { userDataPath: path.join(options.portablePath, 'userData'), appDataPath: options.portablePath, migration: 'none' })
  options.env.LINKLINE_DATA_DIR = path.join(options.appDataPath, 'isolated')
  assert.equal(prepareUserDataDirectory(options).userDataPath, options.env.LINKLINE_DATA_DIR)
})

test('copy failure leaves the previous profile usable and removes only its temporary staging directory', t => {
  const options = fixture(t)
  const legacy = seedLegacy(options)
  const originalCopy = fs.cpSync
  const originalWarn = console.warn
  fs.cpSync = (_source, target) => { fs.writeFileSync(path.join(target, 'partial-copy'), 'partial'); throw new Error('simulated disk copy failure') }
  console.warn = () => {}
  try {
    assert.deepEqual(prepareUserDataDirectory(options), { userDataPath: legacy, migration: 'legacy-copy-failed' })
    assert(fs.existsSync(path.join(legacy, 'LxDatas', 'lx.data.db')))
    assert(!fs.existsSync(path.join(options.appDataPath, 'LinkLine')))
    assert(!fs.readdirSync(options.appDataPath).some(name => name.startsWith('.LinkLine-migration-')))
    assert.equal(options.counts().releases, 1)
  } finally { fs.cpSync = originalCopy; console.warn = originalWarn }
})

test('temporary cleanup failure keeps startup on the original profile and still releases its lock', t => {
  const options = fixture(t)
  const legacy = seedLegacy(options)
  const originalCopy = fs.cpSync
  const originalRemove = fs.rmSync
  const originalWarn = console.warn
  fs.cpSync = () => { throw new Error('simulated copy failure') }
  fs.rmSync = () => { throw new Error('simulated cleanup sharing violation') }
  console.warn = () => {}
  try {
    assert.deepEqual(prepareUserDataDirectory(options), { userDataPath: legacy, migration: 'legacy-copy-failed' })
    assert.equal(options.counts().releases, 1)
    assert(fs.existsSync(path.join(legacy, 'LxDatas', 'lx.data.db')))
  } finally { fs.cpSync = originalCopy; fs.rmSync = originalRemove; console.warn = originalWarn }
})

test('new and legacy protocols are recognized consistently without matching other URL schemes', () => {
  for (const scheme of ['linkline', 'LinkLine', 'lxstudio', 'lxmusic']) {
    const url = `${scheme}://music/play/kw/12345`
    assert(URL_SCHEME_RXP.test(url))
    assert.equal(url.replace(URL_SCHEME_RXP, ''), 'music/play/kw/12345')
  }
  assert(!URL_SCHEME_RXP.test('https://example.com'))
  assert(!URL_SCHEME_RXP.test('mylinkline://music/play'))
})

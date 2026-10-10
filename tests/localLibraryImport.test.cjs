const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const listIpcFixture = require('./helpers/listIpcFixture.cjs')

function load(filename, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', filename), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, require: name => name in imports ? imports[name] : require(name), process, setTimeout, console, ...imports.globals })
  return module.exports
}
const localMusic = load('src/common/localMusic.ts')
const { LocalAudioScanner } = load('src/common/utils/localAudioScan.ts', { '../localMusic': localMusic })
const track = filePath => ({ id: filePath, source: 'local', name: path.basename(filePath), singer: '', interval: '00:01', meta: { albumName: '', filePath, songId: filePath, picUrl: '', ext: path.extname(filePath).slice(1) } })

async function temporary(t) {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'linkline-local-import-'))
  t.after(() => fsp.rm(directory, { recursive: true, force: true }))
  return directory
}

test('recursive scanning imports every file across many batches, skips overlap and excluded paths, and never follows links', async t => {
  const dir = await temporary(t)
  const nested = path.join(dir, '音乐', '子目录')
  await fsp.mkdir(nested, { recursive: true })
  const files = Array.from({ length: 1205 }, (_, i) => path.join(i % 2 ? nested : dir, `song-${i}.${i % 3 ? 'mp3' : 'FLAC'}`))
  await Promise.all(files.map(file => fsp.writeFile(file, 'fixture')))
  await fsp.writeFile(path.join(nested, 'cover.jpg'), 'not music')
  await fsp.symlink(dir, path.join(nested, 'loop'), process.platform === 'win32' ? 'junction' : 'dir')
  const scanner = new LocalAudioScanner([dir, nested, files[4], path.join(dir, 'missing.mp3')], [files[0]])
  t.after(() => scanner.close())
  const found = []
  let result
  let batches = 0
  do {
    result = await scanner.next()
    found.push(...result.files)
    assert(result.files.length <= 100, 'only transport batches are bounded')
    batches++
  } while (!result.done)
  assert.equal(found.length, 1204)
  assert.equal(new Set(found).size, found.length)
  assert.equal(found.includes(files[0]), false)
  assert(batches > 12)
  assert.equal(result.discovered, 1204)
  assert(result.skipped >= 5)
  assert.equal(result.failed, 1)
  assert(result.errors[0].endsWith('missing.mp3'))
})

test('scan close releases its directory and finishes without importing remaining entries', async t => {
  const dir = await temporary(t)
  await Promise.all(Array.from({ length: 121 }, (_, i) => fsp.writeFile(path.join(dir, `${i}.wav`), 'fixture')))
  const scanner = new LocalAudioScanner([dir])
  const first = await scanner.next()
  assert.equal(first.files.length, 100)
  assert.equal(first.done, false)
  await scanner.close()
  const last = await scanner.next()
  assert.equal(last.done, true)
  assert.equal(last.files.length, 0)
})

function libraryFixture() {
  const h = listIpcFixture()
  const worker = load('src/renderer/worker/main/localMusic.ts', {
    '@common/utils/localAudioScan': { LocalAudioScanner },
    '@renderer/utils/music': { createLocalMusicInfo: async filePath => filePath.includes('broken') ? null : track(filePath) },
  })
  const service = load('src/renderer/ui/services/localLibrary.ts', {
    '@common/localMusic': localMusic,
    '@renderer/store/list/state': h.state,
    '@renderer/store/list/action': h.actions,
    globals: { window: { lx: { worker: { main: worker } } } },
  })
  return { h, worker, ...service }
}

test('real metadata parsing rejects renamed text audio and accepts a valid WAV without requiring tags', async t => {
  const dir = await temporary(t)
  const bad = path.join(dir, 'broken.mp3')
  const good = path.join(dir, 'valid.wav')
  const bytes = Buffer.alloc(44 + 16000)
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(16000, 40)
  await fsp.writeFile(good, bytes)
  await fsp.writeFile(bad, 'this file has no audio data')
  const { createLocalMusicInfo } = load('src/renderer/utils/music.ts', {
    '@common/utils/nodejs': { checkPath: async file => fsp.access(file).then(() => true).catch(() => false), extname: path.extname, basename: path.basename },
    '@common/utils/common': { formatPlayTime: () => '00:01' },
    '@common/utils/lyricUtils/kg': {},
  })
  assert.equal(await createLocalMusicInfo(bad), null)
  const valid = await createLocalMusicInfo(good)
  assert.equal(valid.source, 'local')
  assert.equal(valid.meta.filePath, good)
  assert.equal(valid.name, 'valid')
})

test('local library initializes once under concurrency and copies prior local songs without changing playlists or favorites', async t => {
  const { h, ensureLocalLibrary } = libraryFixture()
  t.after(h.dispose)
  const first = track('/fixture/a.mp3')
  const second = track('/fixture/b.wav')
  await h.actions.addListMusics('default', [first])
  await h.actions.addListMusics('love', [first])
  await h.actions.createUserList({ id: 'user-existing', name: '原歌单', list: [second, { ...track('online'), source: 'wy' }] })
  await Promise.all([ensureLocalLibrary(), ensureLocalLibrary(), ensureLocalLibrary()])
  assert.deepEqual(h.remoteLists.get(localMusic.LOCAL_LIBRARY_ID).map(item => item.id), [first.id, second.id])
  assert.deepEqual(h.remoteLists.get('default'), [first])
  assert.deepEqual(h.remoteLists.get('love'), [first])
  assert.equal(h.remoteLists.get('user-existing').length, 2)
  assert.equal(h.state.userLists.filter(item => item.id === localMusic.LOCAL_LIBRARY_ID).length, 1)
  await ensureLocalLibrary()
  assert.equal(h.remoteLists.get(localMusic.LOCAL_LIBRARY_ID).length, 2)
  assert.equal(h.state.userLists.find(item => item.id === localMusic.LOCAL_LIBRARY_ID).sourceListId, undefined)
})

test('an interrupted first migration resumes idempotently and retains all original tracks', async t => {
  const { h } = libraryFixture()
  t.after(h.dispose)
  const originals = Array.from({ length: 205 }, (_, i) => track(`/fixture/retry-${i}.mp3`))
  await h.actions.addListMusics('default', originals)
  let writes = 0
  const service = load('src/renderer/ui/services/localLibrary.ts', {
    '@common/localMusic': localMusic,
    '@renderer/store/list/state': h.state,
    '@renderer/store/list/action': { ...h.actions, addListMusics: async(...args) => {
      writes++
      if (writes === 2) throw new Error('Fixture interrupted database write')
      return h.actions.addListMusics(...args)
    } },
  })
  await assert.rejects(service.ensureLocalLibrary(), /interrupted database write/)
  assert.equal(h.remoteLists.get(localMusic.LOCAL_LIBRARY_ID).length, 100)
  assert.equal(h.state.userLists.find(item => item.id === localMusic.LOCAL_LIBRARY_ID).sourceListId, 'linkline_local_migration_pending')
  await service.ensureLocalLibrary()
  assert.equal(h.remoteLists.get(localMusic.LOCAL_LIBRARY_ID).length, 205)
  assert.deepEqual(h.remoteLists.get('default'), originals)
  assert.equal(h.state.userLists.find(item => item.id === localMusic.LOCAL_LIBRARY_ID).sourceListId, undefined)
})

test('restoring an old backup reconciles new local music into an existing library and regular initialization does not resurrect removals', async t => {
  const { h, ensureLocalLibrary, reconcileLocalLibraryAfterRestore } = libraryFixture()
  t.after(h.dispose)
  const first = track('/fixture/old.mp3')
  const restored = track('/fixture/from-restored.mp3')
  await h.actions.addListMusics('default', [first])
  await ensureLocalLibrary()
  await h.actions.overwriteListFull({ defaultList: [restored], loveList: [], userList: [{ ...h.state.userLists[0], list: [first] }] })
  await reconcileLocalLibraryAfterRestore()
  assert.deepEqual(h.remoteLists.get(localMusic.LOCAL_LIBRARY_ID).map(item => item.id), [first.id, restored.id])
  assert.deepEqual(h.remoteLists.get('default'), [restored])
  await h.actions.removeListMusics({ listId: localMusic.LOCAL_LIBRARY_ID, ids: [restored.id] })
  await ensureLocalLibrary()
  assert.deepEqual(h.remoteLists.get(localMusic.LOCAL_LIBRARY_ID).map(item => item.id), [first.id])
})

test('settings backup import preserves the current dedicated library and unions restored local-list entries', async t => {
  const { h, reconcileLocalLibraryAfterRestore, ensureLocalLibrary } = libraryFixture()
  t.after(h.dispose)
  const previous = track('/fixture/current.mp3')
  const backedUp = track('/fixture/backup.mp3')
  const fromDefault = track('/fixture/backup-default.mp3')
  await h.actions.addListMusics('default', [previous])
  await ensureLocalLibrary()
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/ui/settings/useSettings.ts'), 'utf8')
  const start = source.indexOf('  async function importLists(')
  const end = source.indexOf('  function prepareSettings(', start)
  const module = { exports: {} }
  const code = ts.transpileModule(`${source.slice(start, end)}\nmodule.exports = { importLists }`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const dedupe = list => list.filter((item, index) => list.findIndex(other => other.id === item.id) === index)
  vm.runInNewContext(code, {
    module, exports: module.exports,
    allLists: async() => [{ id: 'default', name: '试听列表', list: await h.actions.getListMusics('default') }, { id: 'love', name: '我的收藏', list: await h.actions.getListMusics('love') }, ...await Promise.all(h.state.userLists.map(async info => ({ ...info, list: await h.actions.getListMusics(info.id) })))],
    filterMusicList: dedupe, fixNewMusicInfoQuality: item => item, LOCAL_LIBRARY_ID: localMusic.LOCAL_LIBRARY_ID,
    overwriteListFull: h.actions.overwriteListFull, defaultList: h.state.defaultList, loveList: h.state.loveList,
  })
  await module.exports.importLists([{ id: localMusic.LOCAL_LIBRARY_ID, name: '本地音乐', list: [backedUp, previous] }, { id: 'default', name: '试听列表', list: [fromDefault] }], false)
  await reconcileLocalLibraryAfterRestore()
  assert.deepEqual(h.remoteLists.get(localMusic.LOCAL_LIBRARY_ID).map(item => item.id), [previous.id, backedUp.id, fromDefault.id])
  assert.deepEqual(h.remoteLists.get('default'), [fromDefault])
})

test('folder import writes all batches through production list IPC, reports a damaged track and skips reimports', async t => {
  const dir = await temporary(t)
  const { h, importLocalAudio } = libraryFixture()
  t.after(h.dispose)
  const paths = Array.from({ length: 351 }, (_, i) => path.join(dir, `audio-${i}.mp3`))
  await Promise.all(paths.map(file => fsp.writeFile(file, 'fixture')))
  await fsp.writeFile(path.join(dir, 'broken.mp3'), 'damaged')
  const progress = []
  const result = await importLocalAudio([dir], item => progress.push(item), () => false)
  assert.equal(result.imported, 351)
  assert.equal(result.metadataFailed, 1)
  assert.equal(result.failed, 0)
  assert.equal(h.remoteLists.get(localMusic.LOCAL_LIBRARY_ID).length, 351)
  assert(progress.some(item => item.imported === 100))
  assert(progress.at(-1).errors[0].endsWith('broken.mp3'))
  const repeat = await importLocalAudio([dir], () => {}, () => false)
  assert.equal(repeat.imported, 0)
  assert.equal(repeat.skipped, 351)
  assert.equal(repeat.metadataFailed, 1)
  assert.equal(h.remoteLists.get(localMusic.LOCAL_LIBRARY_ID).length, 351)
  await h.music.playTrack(h.remoteLists.get(localMusic.LOCAL_LIBRARY_ID)[150], localMusic.LOCAL_LIBRARY_ID)
  assert.deepEqual(h.plays.at(-1), { listId: localMusic.LOCAL_LIBRARY_ID, index: 150 })
})

test('cancelled import keeps completed batches and closes scanning state', async t => {
  const dir = await temporary(t)
  const { h, importLocalAudio } = libraryFixture()
  t.after(h.dispose)
  await Promise.all(Array.from({ length: 240 }, (_, i) => fsp.writeFile(path.join(dir, `${i}.mp3`), 'fixture')))
  let cancelled = false
  const result = await importLocalAudio([dir], item => { if (item.imported >= 100) cancelled = true }, () => cancelled)
  assert.equal(result.cancelled, true)
  assert.equal(result.imported, 100)
  assert.equal(h.remoteLists.get(localMusic.LOCAL_LIBRARY_ID).length, 100)
  const remaining = await importLocalAudio([dir], () => {}, () => false)
  assert.equal(remaining.imported, 140)
  assert.equal(h.remoteLists.get(localMusic.LOCAL_LIBRARY_ID).length, 240)
})

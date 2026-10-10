const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const modules = new Map()
function load(file) {
  if (modules.has(file)) return modules.get(file).exports
  const target = { exports: {} }
  modules.set(file, target)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code, { module: target, exports: target.exports, Date, Error, require: name => load(path.join(__dirname, '../src/common', `${name.slice(8)}.ts`)) })
  return target.exports
}
const { createPlaybackResolver } = load(path.join(__dirname, '../src/main/modules/platformAccounts/playback.ts'))
const track = (source, id, extras = {}) => ({ id: `${source}_${id}`, source, name: 'Song', singer: 'Artist', interval: '03:30', meta: { songId: id, albumName: 'Album', qualitys: [], _qualitys: {} }, ...extras })
const stream = (quality = '320k') => ({ url: 'https://audio.test/full.mp3', type: quality, quality })
function state(source, id, musicUrl, extras = {}) {
  return { provider: { source, id, name: id, musicUrl, search: async() => [] }, account: { connected: true, profile: { id: 'account' } }, tracks: [], context: {}, generation: 1, ...extras }
}

test('unavailable original song resolves a confirmed recording on another signed-in platform', async() => {
  const original = track('wy', 1)
  const alternate = track('tx', 2)
  let selected
  const states = [state('wy', 'netease', async() => { throw new Error('No rights') }), state('tx', 'qq', async(_context, info, quality) => { selected = { info, quality }; return stream() }, { tracks: [alternate] })]
  const result = await createPlaybackResolver(() => states).resolve(original, 'auto')
  assert.equal(result.musicInfo.id, alternate.id)
  assert.equal(result.platform, 'qq')
  assert.equal(selected.quality, 'auto')
  assert.equal(result.quality, '320k')
})

test('search cannot substitute a live version, different artist, or an ambiguous recording', async() => {
  const candidates = [track('tx', 2, { name: 'Song (Live)' }), track('tx', 3, { singer: 'Other' }), track('tx', 4, { interval: '04:00' })]
  let requested = 0
  const other = state('tx', 'qq', async() => { requested++; return stream() })
  other.provider.search = async() => candidates
  const resolver = createPlaybackResolver(() => [other])
  await assert.rejects(resolver.resolve(track('wy', 1)))
  assert.equal(requested, 0)
  other.provider.search = async() => [track('tx', 5), track('tx', 6)]
  await assert.rejects(resolver.resolve(track('wy', 1)))
  assert.equal(requested, 0)
})

test('source switching can be disabled and it does not call other platform searches', async() => {
  const original = state('wy', 'netease', async() => { throw new Error('No rights') })
  const other = state('tx', 'qq', async() => { throw new Error('Must not request') }, { tracks: [track('tx', 2)] })
  other.provider.search = async() => { throw new Error('Must not search') }
  await assert.rejects(createPlaybackResolver(() => [original, other]).resolve(track('wy', 1), 'auto', false, false), /No rights/)
})

test('signed streams cache briefly by quality and account, refreshing after logout or expiry', async() => {
  let calls = 0
  const account = state('wy', 'netease', async(_context, _info, quality) => { calls++; return { ...stream(quality === 'auto' ? '320k' : quality), expires: 31 } })
  const resolver = createPlaybackResolver(() => [account])
  const info = track('wy', 1)
  await resolver.resolve(info, 'auto')
  await resolver.resolve(info, 'auto')
  assert.equal(calls, 1)
  await resolver.resolve(info, '128k')
  assert.equal(calls, 2)
  await resolver.resolve(info, 'auto', true)
  assert.equal(calls, 3)
  account.generation++
  await resolver.resolve(info, 'auto')
  assert.equal(calls, 4)
  const now = Date.now
  Date.now = () => now() + 2000
  try { await resolver.resolve(info, 'auto'); assert.equal(calls, 5) } finally { Date.now = now }
})

test('an account switch during URL lookup discards the old account stream', async() => {
  let finish
  const account = state('wy', 'netease', () => new Promise(resolve => { finish = resolve }))
  const pending = createPlaybackResolver(() => [account]).resolve(track('wy', 1), 'auto', false, false)
  account.generation++
  finish(stream())
  await assert.rejects(pending, /账号已更改/)
})

test('quality lookup uses the song platform and retains extra platform-specific levels', async() => {
  const account = state('wy', 'netease', async() => stream())
  account.provider.musicQualitys = async() => ['128k', 'flac24bit', 'jymaster']
  const result = await createPlaybackResolver(() => [account]).qualitys(track('wy', 1))
  assert.deepEqual(Array.from(result), ['128k', 'flac24bit', 'jymaster'])
})

test('replacing an audio stream seeks after metadata and preserves pause state; stale restores are cancelled', () => {
  let audio
  class FakeAudio extends EventTarget {
    constructor() { super(); audio = this; this.currentTime = 0; this.duration = 200; this.autoplay = true }
    pause() { this.paused = true }
    removeAttribute() {}
  }
  const target = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/renderer/plugins/player/index.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code.replaceAll('import.meta.url', "'file:///player/index.js'"), { exports: target.exports, module: target, window: { Audio: FakeAudio } })
  const player = target.exports
  player.createAudio()
  player.setResource('https://audio.test/128.mp3', { time: 42, autoplay: false })
  audio.dispatchEvent(new Event('loadedmetadata'))
  assert.equal(audio.currentTime, 42)
  assert.equal(audio.autoplay, false)
  assert.equal(audio.paused, true)
  player.setResource('https://audio.test/320.mp3', { time: 99, autoplay: true })
  player.setResource('https://audio.test/next.mp3')
  audio.currentTime = 0
  audio.dispatchEvent(new Event('loadedmetadata'))
  assert.equal(audio.currentTime, 0)
  assert.equal(audio.autoplay, true)
})

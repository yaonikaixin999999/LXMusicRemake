const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const { EventEmitter } = require('node:events')

const root = path.resolve(__dirname, '..')
const track = (id = 'wy_1', source = 'wy') => ({
  id, source, name: 'Song', singer: 'Artist', interval: '03:30',
  meta: { songId: id, albumName: 'Original Album', qualitys: [{ type: '128k' }, { type: 'flac24bit' }], _qualitys: { '128k': {}, flac24bit: {} } },
})
const stream = (url, musicInfo, quality = '320k', platform = '网易云音乐') => ({ url, musicInfo, type: quality, quality, platform })
function deferred() {
  let resolve, reject
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}
async function flush() { for (let index = 0; index < 24; index++) await Promise.resolve() }
function load(file, imports = {}, globals = {}) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText.replaceAll('import.meta.url', "'file:///fixture/player.js'")
  vm.runInNewContext(code, {
    module, exports: module.exports, Error, console, URL, URLSearchParams, Headers, Response, AbortSignal,
    require: name => { if (name in imports) return imports[name]; throw new Error(`Unexpected import ${name} in ${file}`) },
    ...globals,
  }, { filename: file })
  return module.exports
}
function fakeTimers() {
  let now = 0, nextId = 0
  const timers = new Map()
  const setTimeout = (callback, delay = 0) => { const id = ++nextId; timers.set(id, { callback, due: now + delay }); return id }
  const clearTimeout = id => timers.delete(id)
  const advance = async(milliseconds) => {
    const end = now + milliseconds
    while (true) {
      const entry = [...timers.entries()].filter(([, value]) => value.due <= end).sort((a, b) => a[1].due - b[1].due)[0]
      if (!entry) break
      timers.delete(entry[0])
      now = entry[1].due
      entry[1].callback()
      await flush()
    }
    now = end
  }
  return { setTimeout, clearTimeout, advance }
}

// Real player, URL resolution, display-state transactions, and native event bridge;
// only the media element, IPC/network, Vue lifetime, and clock are substituted.
function fixture({ resolve = async(info) => stream('https://audio.test/default.mp3', info), customQualitys = ['128k'], customUrl } = {}) {
  const timers = fakeTimers()
  const state = { isPlay: { value: false }, playedList: [], playInfo: {}, playMusicInfo: { musicInfo: track() }, tempPlayList: [], musicInfo: { id: 'wy_1' } }
  const statuses = [], calls = [], customCalls = [], resources = []
  const setting = { appSetting: vue.reactive({ 'player.autoSkipOnError': true, 'player.playQuality': 'auto' }) }
  setting.mergeSetting = patch => Object.assign(setting.appSetting, patch)
  const events = new EventEmitter()
  const appEvent = new Proxy(events, { get: (target, name) => name in target ? (typeof target[name] === 'function' ? target[name].bind(target) : target[name]) : (...args) => target.emit(name, ...args) })
  const lifetime = { onBeforeUnmount() {}, watch() {} }
  let audio
  class FakeAudio extends EventTarget {
    constructor() { super(); audio = this; this._src = ''; this.currentTime = 0; this.duration = 210; this.paused = true }
    set src(value) { this._src = value; this.currentTime = 0; if (value) resources.push(value) }
    get src() { return this._src }
    removeAttribute(name) { if (name === 'src') this._src = '' }
    pause() { const wasPaused = this.paused; this.paused = true; if (!wasPaused) this.dispatchEvent(new Event('pause')) }
    async play() { this.paused = false; this.dispatchEvent(new Event('playing')) }
    fire(name) { this.dispatchEvent(new Event(name)) }
  }
  const window = { Audio: FakeAudio, lx: { isPlayedStop: false, apiInitPromise: [Promise.resolve(true)] }, app_event: appEvent, i18n: { t: key => key } }
  const globals = { window, document: { hidden: false }, ...timers, setImmediate: callback => timers.setTimeout(callback) }
  const player = load('src/renderer/plugins/player/index.ts', {}, globals)
  player.createAudio()
  events.on('play', () => { state.isPlay.value = true })
  events.on('pause', () => { state.isPlay.value = false })
  events.on('error', () => { state.isPlay.value = false })
  events.on('stop', () => { state.isPlay.value = false; player.setStop() })
  const common = load('src/common/platformPlayback.ts')
  const storage = new Map()
  const service = load('src/renderer/ui/services/platformPlayback.ts', {
    electron: { ipcRenderer: { invoke: async(_channel, { track: info, quality, isRefresh }) => { calls.push({ info, quality, isRefresh }); return resolve(info, quality, isRefresh) } } },
    vue,
    '@common/platformPlayback': common, '@renderer/store/player/state': state,
    '@renderer/store/setting': setting, '@renderer/utils/ipc': { updateSetting: async() => {} },
  }, { localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } })
  const ipc = { getMusicUrl: async() => null, saveMusicUrl() {} }
  const requestMsg = { tooManyRequests: 'Too many requests', cancelRequest: 'Cancelled' }
  const sdk = { wy: { getMusicUrl: (info, quality) => {
    customCalls.push({ info, quality })
    return { promise: Promise.resolve().then(() => {
      if (!customQualitys.includes(quality)) throw new Error(`Unsupported quality ${quality}`)
      if (customUrl) return { url: customUrl, type: quality }
      throw new Error('No custom source')
    }) }
  } }, findMusic: async() => [] }
  const musicUtils = load('src/renderer/core/music/utils.ts', {
    '@renderer/store': { qualityList: { value: { wy: customQualitys } } },
    '@common/platformPlayback': common,
    '@renderer/store/utils': { assertApiSupport: () => true }, '@renderer/utils/musicSdk': sdk,
    '@renderer/utils/ipc': ipc, '@renderer/store/setting': setting,
    '@renderer/utils': { toOldMusicInfo: info => info, toNewMusicInfo: info => info },
    '@renderer/utils/message': { requestMsg }, '@renderer/utils/musicSdk/api-source': {},
  }, globals)
  const online = load('src/renderer/core/music/online.ts', {
    '@renderer/store/list/action': {}, '@common/platformPlayback': common,
    '@renderer/ui/services/platformPlayback': service, '@renderer/utils/ipc': ipc, './utils': musicUtils,
  }, globals)
  const actions = { setAllStatus: value => statuses.push(value) }
  const action = load('src/renderer/core/player/action.ts', {
    '@renderer/plugins/player': player, '@renderer/store/player/state': state, '@renderer/store/player/action': actions,
    '@renderer/store/setting': setting, '../music/index': { getMusicUrl: online.getMusicUrl }, './utils': {},
    '@renderer/utils/message': { requestMsg }, '@renderer/utils/index': { getRandom: () => 2 },
    '@renderer/ui/services/platformAccounts': {}, '@renderer/ui/services/platformPlayback': service, '@renderer/core/dislikeList': {},
  }, globals)
  load('src/renderer/core/useApp/usePlayer/usePlayEvent.ts', {
    '@common/utils/vueTools': lifetime, '@renderer/plugins/i18n': { useI18n: () => key => key },
    '@renderer/store/player/state': state, '@renderer/plugins/player': player, '@renderer/core/player': action,
    '@renderer/store/player/action': actions, '@renderer/store/setting': setting,
  }, globals).default()
  load('src/renderer/core/useApp/usePlayer/usePlayerEvent.ts', {
    '@common/utils/vueTools': lifetime, '@renderer/plugins/player': player,
  }, globals).default()
  return { action, audio, player, state, service, online, calls, customCalls, resources, statuses, timers }
}

test('stopping an in-flight address lookup discards the stream and permits replaying the same song', async() => {
  const old = deferred()
  const current = deferred()
  const state = fixture({ resolve: () => state.calls.length === 1 ? old.promise : current.promise })
  state.action.play()
  await flush()
  state.action.stop()
  await state.timers.advance(0)
  old.resolve(stream('https://audio.test/old.mp3', state.state.playMusicInfo.musicInfo))
  await flush()
  assert.equal(state.audio.src, '')
  assert.equal(state.service.activeStream.value, null)
  state.action.play()
  await flush()
  assert.equal(state.calls.length, 2)
  current.resolve(stream('https://audio.test/new.mp3', state.state.playMusicInfo.musicInfo))
  await flush()
  assert.equal(state.audio.src, 'https://audio.test/new.mp3')
  assert.equal(state.service.activeStream.value.url, state.audio.src)
})

test('an old stopped lookup cannot replace a newer resource or its platform display', async() => {
  const old = deferred()
  const state = fixture({ resolve: info => state.calls.length === 1 ? old.promise : stream('https://audio.test/new.mp3', info, '128k', 'QQ 音乐') })
  state.action.play()
  await flush()
  state.action.stop()
  await state.timers.advance(0)
  state.action.play()
  await flush()
  const displayed = state.service.activeStream.value
  old.resolve(stream('https://audio.test/old.mp3', state.state.playMusicInfo.musicInfo, 'flac'))
  await flush()
  assert.equal(state.audio.src, 'https://audio.test/new.mp3')
  assert.equal(state.service.activeStream.value, displayed)
  assert.equal(state.service.activeStream.value.platform, 'QQ 音乐')
})

test('stop cancels a scheduled address retry and does not start another platform request', async() => {
  const state = fixture({ resolve: async() => { throw new Error('Too many requests') } })
  state.action.play()
  await flush()
  assert.equal(state.calls.length, 1)
  state.action.stop()
  await state.timers.advance(110000)
  assert.equal(state.calls.length, 1)
  assert.equal(state.audio.src, '')
})

test('paused quality replacement restores progress and remains paused after media readiness and 25 seconds', async() => {
  const state = fixture()
  state.action.pause()
  state.audio.currentTime = 42
  await state.action.reloadCurrentQuality()
  state.audio.fire('loadstart')
  state.audio.fire('loadedmetadata')
  state.audio.fire('loadeddata')
  state.audio.fire('canplay')
  await state.timers.advance(30000)
  assert.equal(state.audio.currentTime, 42)
  assert.equal(state.audio.autoplay, false)
  assert.equal(state.audio.paused, true)
  assert.equal(state.calls.length, 1)
  assert.equal(state.statuses.at(-1), '')
})

test('unified preference reload uses the selected IPC quality and preserves pause and progress exactly once', async(t) => {
  const state = fixture({ resolve: async(info, quality) => stream(`https://audio.test/${quality}.mp3`, info, quality) })
  t.after(state.service.bindQualityReload(state.action.reloadCurrentQuality))
  state.action.pause()
  state.audio.currentTime = 42
  await state.service.setPreferredQuality('128k')
  state.audio.fire('loadstart')
  state.audio.fire('loadedmetadata')
  state.audio.fire('canplay')
  await state.timers.advance(30000)
  assert.equal(state.calls.length, 1)
  assert.equal(state.calls[0].quality, '128k')
  assert.equal(state.audio.src, 'https://audio.test/128k.mp3')
  assert.equal(state.audio.currentTime, 42)
  assert.equal(state.audio.paused, true)
  assert.equal(state.audio.autoplay, false)
  assert.equal(state.service.activeStream.value.requested, '128k')
})

test('paused quality replacement never retries or skips when the media fails before canplay', async() => {
  const state = fixture()
  state.action.pause()
  await state.action.reloadCurrentQuality()
  state.audio.fire('loadstart')
  await state.timers.advance(30000)
  assert.equal(state.calls.length, 1)
  state.audio.error = { code: 2 }
  state.audio.fire('error')
  await state.timers.advance(100000)
  assert.equal(state.calls.length, 1)
  assert.equal(state.audio.autoplay, false)
  assert.equal(state.audio.src, '')
})

test('pausing after loadstart cancels the retry intent even if canplay never arrives', async() => {
  const state = fixture()
  state.action.play()
  await flush()
  state.audio.fire('loadstart')
  state.action.pause()
  await state.timers.advance(30000)
  assert.equal(state.calls.length, 1)
  assert.equal(state.audio.autoplay, false)
})

test('quality switching during buffering preserves the user play intent and latest progress', async() => {
  const replacement = deferred()
  const state = fixture({ resolve: info => state.calls.length === 1 ? stream('https://audio.test/original.mp3', info) : replacement.promise })
  state.action.play()
  await flush()
  await state.audio.play()
  state.audio.currentTime = 42
  state.audio.fire('waiting')
  assert.equal(state.state.isPlay.value, false, 'buffering updates presentation state')
  assert.equal(state.audio.autoplay, true, 'buffering keeps the user play intent')
  const pending = state.action.reloadCurrentQuality()
  state.audio.currentTime = 63
  replacement.resolve(stream('https://audio.test/replacement.mp3', state.state.playMusicInfo.musicInfo))
  await pending
  state.audio.fire('loadedmetadata')
  assert.equal(state.audio.currentTime, 63)
  assert.equal(state.audio.autoplay, true)
})

test('pausing while the quality URL is resolving preserves the pause and latest playback position', async() => {
  const replacement = deferred()
  const state = fixture({ resolve: info => state.calls.length === 1 ? stream('https://audio.test/original.mp3', info) : replacement.promise })
  state.action.play()
  await flush()
  await state.audio.play()
  state.audio.currentTime = 42
  const pending = state.action.reloadCurrentQuality()
  state.audio.currentTime = 74
  state.action.pause()
  replacement.resolve(stream('https://audio.test/replacement.mp3', state.state.playMusicInfo.musicInfo))
  await pending
  state.audio.fire('loadedmetadata')
  assert.equal(state.audio.currentTime, 74)
  assert.equal(state.audio.autoplay, false)
  assert.equal(state.audio.paused, true)
})

test('resuming a paused replacement before metadata arrives does not restore the older pause intent', async() => {
  const state = fixture()
  state.action.pause()
  state.audio.currentTime = 42
  await state.action.reloadCurrentQuality()
  assert.equal(state.audio.autoplay, false)
  state.action.play()
  assert.equal(state.audio.paused, false)
  state.audio.fire('loadedmetadata')
  assert.equal(state.audio.currentTime, 42)
  assert.equal(state.audio.autoplay, true)
  assert.equal(state.audio.paused, false)
})

test('stopping an unresolved quality replacement prevents it from restoring audio or display state', async() => {
  const replacement = deferred()
  const state = fixture({ resolve: () => replacement.promise })
  const pending = state.action.reloadCurrentQuality()
  state.action.stop()
  await state.timers.advance(0)
  replacement.resolve(stream('https://audio.test/stopped-quality.mp3', state.state.playMusicInfo.musicInfo))
  await pending
  assert.equal(state.audio.src, '')
  assert.equal(state.service.activeStream.value, null)
})

test('same-song preload caches an alternative stream without changing the currently playing platform', async() => {
  const state = fixture({ resolve: info => state.calls.length === 1 ? stream('https://audio.test/current.mp3', info, 'flac') : stream('https://audio.test/preload.mp3', track('tx_2', 'tx'), '128k', 'QQ 音乐') })
  state.action.play()
  await flush()
  const displayed = state.service.activeStream.value
  const preloaded = await state.online.getMusicUrl({ musicInfo: state.state.playMusicInfo.musicInfo, isRefresh: true })
  assert.equal(preloaded, 'https://audio.test/preload.mp3')
  assert.equal(state.audio.src, 'https://audio.test/current.mp3')
  assert.equal(state.service.activeStream.value, displayed)
  assert.equal(state.service.activeStream.value.quality, 'flac')
})

test('highest-quality preference falls back to the actual maximum supported by a 128K custom source', async() => {
  const state = fixture({ resolve: async() => { throw new Error('Original platform has no rights') }, customQualitys: ['128k'], customUrl: 'https://audio.test/custom128.mp3' })
  state.action.play()
  await flush()
  assert.equal(state.service.preferredQuality.value, 'auto')
  assert.equal(state.customCalls.length, 1)
  assert.equal(state.customCalls[0].quality, '128k')
  assert.equal(state.audio.src, 'https://audio.test/custom128.mp3')
  assert.equal(state.service.activeStream.value.platform, '自定义音源')
  assert.equal(state.service.activeStream.value.quality, '128k')
})

for (const quality of ['192k', 'ape', 'wav']) {
  test(`explicit ${quality} preference retains the supported custom-source quality and reports its actual platform`, async() => {
    const state = fixture({ resolve: async() => { throw new Error('Original platform has no rights') }, customQualitys: ['128k', quality], customUrl: `https://audio.test/custom-${quality}` })
    const info = state.state.playMusicInfo.musicInfo
    info.meta.qualitys.push({ type: quality })
    info.meta._qualitys[quality] = {}
    await state.service.setPreferredQuality(quality)
    state.action.play()
    await flush()
    assert.equal(state.customCalls.length, 1)
    assert.equal(state.customCalls[0].quality, quality)
    assert.equal(state.audio.src, `https://audio.test/custom-${quality}`)
    assert.equal(state.service.activeStream.value.requested, quality)
    assert.equal(state.service.activeStream.value.type, quality)
    assert.equal(state.service.activeStream.value.quality, quality)
    assert.equal(state.service.activeStream.value.platform, '自定义音源')
  })
}

test('QQ search preserves explicit re-recording subtitles and matching refuses the original recording', async() => {
  const { qqProvider } = load('src/main/modules/platformAccounts/providers/qq.ts', { 'node:crypto': require('node:crypto') })
  const { chooseMatch } = load('src/common/platformMatching.ts')
  const context = { cookies: async() => ({}), session: { fetch: async() => new Response(JSON.stringify({ code: 0, req: { code: 0, data: { body: { song: { list: [{ mid: 'recorded', title: 'Song', subtitle: '2025重新录制版', interval: 210, singer: [{ name: 'Artist' }], album: { name: '2025重录' } }] } } } } })) } }
  const candidates = await qqProvider.search(context, track())
  assert.equal(candidates[0].meta.recordingVersion, '2025重新录制版')
  assert.equal(chooseMatch(track(), candidates).status, 'unmatched')
})

test('ordinary QQ descriptive subtitles do not prevent matching the same recording', async() => {
  const { qqProvider } = load('src/main/modules/platformAccounts/providers/qq.ts', { 'node:crypto': require('node:crypto') })
  const { chooseMatch } = load('src/common/platformMatching.ts')
  const context = { cookies: async() => ({}), session: { fetch: async() => new Response(JSON.stringify({ code: 0, req: { code: 0, data: { body: { song: { list: [{ mid: 'original', title: 'Song', subtitle: '电影主题曲', interval: 210, singer: [{ name: 'Artist' }], album: { name: 'Original Album' } }] } } } } })) } }
  const candidates = await qqProvider.search(context, track())
  assert.equal(chooseMatch(track(), candidates).status, 'matched')
})

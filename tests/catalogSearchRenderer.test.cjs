const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const listIpcFixture = require('./helpers/listIpcFixture.cjs')
const entity = (id, source = 'wy', kind = 'album') => ({ id, source, kind, name: `Entity ${id}`, img: '', author: 'Artist' })
const track = id => ({ id: `wy_${id}`, source: 'wy', name: `Track ${id}`, singer: 'Artist', interval: '03:30', meta: { songId: id, albumName: 'Album', qualitys: [], _qualitys: {} } })
const response = (list, total = list.length) => ({ list, total, limit: 18, allPage: Math.max(1, Math.ceil(total / 18)) })
const defer = () => { let resolve; let reject; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail }); return { resolve, reject, promise } }
const settle = async() => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)) }

function fixture(t, { search = async(source, kind) => response([entity('one', source, kind)]), works = async() => ({ list: [track('one')], total: 60, limit: 30, allPage: 2 }) } = {}) {
  const listIpc = listIpcFixture()
  t.after(listIpc.dispose)
  const navigation = []
  const calls = []
  const route = { path: '/search', query: { text: 'Fixture', type: 'album', source: 'wy' }, fullPath: '/search?text=Fixture' }
  const code = fs.readFileSync(path.join(__dirname, '../src/renderer/ui/views/Search.vue'), 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const output = ts.transpileModule(`${code}\nmodule.exports = { load, readRoute, openEntity, closeEntity, loadEntity, changeEntityPage, playEntityPage, playOne, navigate, submit, changeKind, kind, source, keyword, page, catalog, selectedEntity, entityTracks, entityLoading, entityError, entityPage, entityPages, entityTotal, error, loading, total, partialFailure, sourceNotice };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const imports = {
    vue: { ...vue, onMounted() {}, onUnmounted() {}, watch() {} },
    'vue-router': { useRoute: () => route, useRouter: () => ({ push: query => { navigation.push(query); return Promise.resolve() } }) },
    '../services/catalogSearch': { getCatalogSources: kind => kind === 'album' ? ['wy', 'tx', 'kg', 'kw'] : ['wy', 'tx', 'kg', 'kw', 'mg'], searchMusicCatalog: (...args) => { calls.push(args); return search(...args) }, readCatalogTracks: works },
    '../services/music': listIpc.music,
    '@renderer/utils/musicSdk': { default: {} },
    '@renderer/utils': { deduplicationList: value => value, toNewMusicInfo: value => value },
    '@renderer/store/search/music/state': { sources: ['wy', 'tx', 'all'] },
    '@renderer/store/search/songlist/state': { sources: ['wy', 'tx', 'all'] },
    '@renderer/store/search/state': { historyList: vue.ref([]) },
    '@renderer/store/search/action': { addHistoryWord: async() => {}, clearHistoryList() {}, getHistoryList: async() => {}, removeHistoryWord() {}, setSearchText() {} },
    '@renderer/store': { sourceNames: vue.ref({ wy: '网易云音乐', tx: 'QQ 音乐', kg: '酷狗音乐', kw: '酷我音乐', mg: '咪咕音乐' }) },
    '@renderer/store/setting': { appSetting: {} },
    '@renderer/utils/data': { getSearchSetting: async() => null, setSearchSetting: async() => {} },
  }
  const module = { exports: {} }
  vm.runInNewContext(output, { module, exports: module.exports, require: name => {
    if (name in imports) return imports[name]
    if (name.endsWith('.vue')) return {}
    throw new Error(`Unexpected import ${name}`)
  } })
  module.exports.kind.value = 'album'
  module.exports.source.value = 'wy'
  module.exports.keyword.value = 'Fixture'
  return { ...module.exports, listIpc, route, calls, navigation }
}

test('album/artist all-platform search retains usable results and identifies failed platform', async t => {
  const state = fixture(t, { search: async(source, kind, text, page, limit) => {
    assert.equal(kind, 'artist')
    assert.equal(text, 'Fixture')
    assert.equal(page, 2)
    assert.equal(limit, 15)
    if (source === 'tx') throw new Error('Offline')
    return response([entity(source, source, kind)], 60)
  } })
  state.kind.value = 'artist'
  state.source.value = 'all'
  state.page.value = 2
  await state.load()
  assert.equal(state.calls.length, 5)
  assert.equal(state.catalog.value.length, 4)
  assert.equal(state.total.value, 240)
  assert.match(state.partialFailure.value, /QQ 音乐/)
  assert.equal(state.error.value, '')
})

test('a delayed search response cannot replace a later query result or loading state', async t => {
  const first = defer()
  const second = defer()
  const state = fixture(t, { search: (source, kind, text) => text === 'First' ? first.promise : second.promise })
  state.keyword.value = 'First'
  const pendingFirst = state.load()
  state.keyword.value = 'Second'
  const pendingSecond = state.load()
  second.resolve(response([entity('second')]))
  await pendingSecond
  first.resolve(response([entity('first')]))
  await pendingFirst
  assert.equal(state.catalog.value[0].id, 'second')
  assert.equal(state.loading.value, false)
})

test('an outdated entity response cannot restore a closed panel or replace new artist works', async t => {
  const first = defer()
  const state = fixture(t, { works: item => item.id === 'first' ? first.promise : Promise.resolve({ list: [track('second')], total: 1, limit: 30, allPage: 1 }) })
  const pending = state.openEntity(entity('first'))
  await state.openEntity(entity('second', 'wy', 'artist'))
  first.resolve({ list: [track('first')], total: 30, limit: 30, allPage: 1 })
  await pending
  assert.equal(state.selectedEntity.value.id, 'second')
  assert.equal(state.entityTracks.value[0].id, 'wy_second')
  state.closeEntity()
  assert.equal(state.selectedEntity.value, null)
  assert.equal(state.entityTracks.value.length, 0)
})

test('artist works page 2 passes the entity ID and song click crosses real list IPC to playback', async t => {
  const calls = []
  const state = fixture(t, { works: async(item, page, limit) => {
    calls.push({ id: item.id, page, limit })
    return { list: [track(`page-${page}`)], total: 60, limit: 30, allPage: 2 }
  } })
  await state.openEntity(entity('artist-id', 'wy', 'artist'))
  state.changeEntityPage(2)
  await settle()
  assert.deepEqual(calls, [{ id: 'artist-id', page: 1, limit: 30 }, { id: 'artist-id', page: 2, limit: 30 }])
  await state.playOne(state.entityTracks.value[0])
  assert.equal(state.listIpc.plays.length, 1)
  const played = state.listIpc.plays[0]
  assert.equal(state.listIpc.remoteLists.get(played.listId)[played.index].id, 'wy_page-2')
})

test('catalogue play button loads its real songs and queues them through list IPC', async t => {
  const state = fixture(t)
  await state.openEntity(entity('album-id'), true)
  assert.equal(state.listIpc.plays.length, 1)
  await state.playEntityPage()
  assert.equal(state.listIpc.plays.length, 2)
  assert.equal(state.entityError.value, '')
})

test('unsupported source falls back explicitly, and repeated query leaves works panel', async t => {
  const state = fixture(t)
  state.route.query.source = 'bi'
  state.readRoute()
  await settle()
  assert.equal(state.source.value, 'all')
  assert.match(state.sourceNotice.value, /未提供/)
  await state.openEntity(entity('album-id'))
  state.submit('Fixture', 'album')
  await settle()
  assert.equal(state.selectedEntity.value, null)
  assert.equal(state.catalog.value.length, 4)
})

function playerFixture(source = 'wy', singer = 'AC/DC / Artist', album = 'Fixture album') {
  const routeCalls = []
  const closed = []
  const sourceText = fs.readFileSync(path.join(__dirname, '../src/renderer/ui/PlayerDetail.vue'), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1]
  const output = ts.transpileModule(`${sourceText}\nmodule.exports = { artistNames, searchMetadata, commentsOpen };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const imports = {
    vue: { ...vue, watch() {} },
    'vue-router': { useRouter: () => ({ push: value => { routeCalls.push(value); return Promise.resolve() } }) },
    './services/catalogSearch': { getCatalogSources: () => ['wy', 'tx', 'kg', 'kw'] },
    '@renderer/store/player/state': { musicInfo: vue.reactive({ singer, album }), playMusicInfo: vue.reactive({ musicInfo: track('playing') }), isShowPlayerDetail: vue.ref(true) },
    '@renderer/store/player/action': { setShowPlayerDetail: value => closed.push(value) },
    '@renderer/store/player/lyric': { lyric: {} },
    '@renderer/core/lyric': {},
    '@renderer/store/setting': {},
    '@common/utils/electron': {},
  }
  imports['@renderer/store/player/state'].playMusicInfo.musicInfo.source = source
  const module = { exports: {} }
  vm.runInNewContext(output, { module, exports: module.exports, require: name => {
    if (name in imports) return imports[name]
    if (name.endsWith('.vue')) return {}
    throw new Error(`Unexpected import ${name}`)
  } })
  return { ...module.exports, routeCalls, closed }
}

test('lyric artist/album links hide player detail and preserve supported origin and complete artist names', () => {
  const state = playerFixture()
  assert.deepEqual(Array.from(state.artistNames.value), ['AC/DC', 'Artist'])
  state.commentsOpen.value = true
  state.searchMetadata('artist', 'AC/DC')
  state.searchMetadata('album', 'Fixture album')
  assert.deepEqual(state.closed, [false, false])
  assert.equal(state.commentsOpen.value, false)
  assert.equal(state.routeCalls[0].query.type, 'artist')
  assert.equal(state.routeCalls[0].query.text, 'AC/DC')
  assert.equal(state.routeCalls[0].query.source, 'wy')
  assert.equal(state.routeCalls[1].query.type, 'album')
  assert.equal(state.routeCalls[1].query.text, 'Fixture album')
})

test('local-file metadata links use all supported platforms; empty metadata does not navigate', () => {
  const state = playerFixture('local')
  state.searchMetadata('album', 'Fixture album')
  assert.equal(state.routeCalls[0].query.source, 'all')
  state.searchMetadata('artist', '')
  assert.equal(state.routeCalls.length, 1)
})

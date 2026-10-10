const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const listIpcFixture = require('./helpers/listIpcFixture.cjs')

const makeTrack = (id, source = 'wy') => ({ id, source, name: `Track ${id}`, singer: 'Fixture Artist', interval: '03:00', meta: { songId: id, albumName: 'Fixture Album', qualitys: [], _qualitys: {} } })

function fixture(page, { failCollection = false } = {}) {
  const listIpc = listIpcFixture()
  const list = [makeTrack('first', page === 'Charts' ? 'kw' : 'wy'), makeTrack('second')]
  const all = [...list, makeTrack('third')]
  const route = { path: page === 'Charts' ? '/leaderboard' : '/songList/detail', query: { source: 'wy', id: 'fixture' }, fullPath: '/fixture' }
  const calls = { collection: 0, queues: [], plays: [] }
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/renderer/ui/views', `${page}.vue`), 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const expose = page === 'Charts'
    ? "boardId.value = 'wy__fixture'; tracks.value = fixtures; module.exports = { playCollection, message, busy };"
    : "loadedKey = 'wy__fixture'; detail.value = { list: fixtures, total: 200, limit: 30, info: {} }; module.exports = { playCollection, message, busy };"
  const output = ts.transpileModule(`${source}\n${expose}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  const requestCollection = async() => {
    calls.collection++
    if (failCollection) throw new Error('Remaining pages unavailable')
    return all
  }
  const imports = {
    vue: { ...vue, watch() {}, onMounted() {}, onUnmounted() {} },
    'vue-router': { useRoute: () => route, useRouter: () => ({ push() {} }) },
    '@renderer/store/songList/action': { getListDetailAll: requestCollection },
    '@renderer/store/leaderboard/action': { getListDetailAll: requestCollection },
    '@renderer/store/songList/state': { sources: ['wy', 'kw'] },
    '@renderer/store/leaderboard/state': { sources: ['wy', 'kw'] },
    '@renderer/store/list/action': listIpc.actions,
    '@renderer/store/list/state': listIpc.state,
    '@renderer/store': { sourceNames: vue.ref({ wy: '网易云音乐', kw: '酷我音乐' }) },
    '@renderer/utils': {},
    '@renderer/utils/data': {},
    '@common/constants': { LIST_IDS: { TEMP: 'temp' } },
    '../services/music': listIpc.music,
  }
  vm.runInNewContext(output, { module, exports: module.exports, fixtures: list, require: name => {
    if (name in imports) return imports[name]
    if (name.endsWith('.vue')) return {}
    throw new Error(`Unexpected import ${name}`)
  } })
  Object.defineProperty(calls, 'queues', { get: () => listIpc.writes.filter(item => item.channel === listIpc.events.list_music_overwrite).map(item => ({ tracks: item.params.musicInfos })) })
  Object.defineProperty(calls, 'plays', { get: () => listIpc.plays.map(item => ({ track: listIpc.remoteLists.get(item.listId)[item.index], listId: item.listId })) })
  return { ...module.exports, calls, list, all, dispose: listIpc.dispose }
}

for (const page of ['SongListDetail', 'Charts']) {
  test(`${page}: clicking an already loaded reactive song crosses real list IPC and plays immediately`, async t => {
    const state = fixture(page, { failCollection: true })
    t.after(state.dispose)
    await state.playCollection(state.list[1])
    assert.equal(state.calls.collection, 0)
    assert.deepEqual(state.calls.queues[0].tracks, state.list)
    assert.equal(state.calls.plays[0].track.id, 'second')
    assert.equal(state.calls.plays[0].listId, 'temp')
    assert.equal(state.message.value, '')
    assert.equal(state.busy.value, '')
  })

  test(`${page}: full collection playback falls back to visible songs when another page fails`, async t => {
    const state = fixture(page, { failCollection: true })
    t.after(state.dispose)
    await state.playCollection()
    assert.equal(state.calls.collection, 1)
    assert.deepEqual(state.calls.queues[0].tracks, state.list)
    assert.equal(state.calls.plays[0].track.id, 'first')
    assert.match(state.message.value, /当前页/)
  })

  test(`${page}: full collection playback retains all songs when loading succeeds`, async t => {
    const state = fixture(page)
    t.after(state.dispose)
    await state.playCollection()
    assert.deepEqual(state.calls.queues[0].tracks, state.all)
    assert.equal(state.calls.plays[0].track.id, 'first')
    assert.equal(state.message.value, '')
  })
}

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const listIpcFixture = require('./helpers/listIpcFixture.cjs')

const track = (id, source = 'wy') => ({
  id, source, name: `Track ${id}`, singer: 'Fixture Artist', interval: '03:30',
  meta: { songId: id, albumName: 'Fixture Album', qualitys: [{ type: '128k', size: '3 MB' }], _qualitys: { '128k': { size: '3 MB' } }, recordingVersion: 'Live' },
})
const plain = value => JSON.parse(JSON.stringify(value))

test('temporary playback reaches the real list IPC boundary with deep reactive and mapped tracks', async t => {
  const h = listIpcFixture()
  t.after(h.dispose)
  const wrapped = vue.ref([track('first'), track('second')])
  const tracks = wrapped.value.filter(item => item.source !== 'local')
  assert(!vue.isProxy(tracks))
  assert(vue.isProxy(tracks[0].meta.qualitys[0]))
  assert.throws(() => structuredClone(vue.toRaw(tracks)), { name: 'DataCloneError' })
  await h.actions.setTempList('platform_playlist__fixture', tracks)
  await h.music.playTrack(tracks[1], 'temp')
  assert.deepEqual(h.remoteLists.get('temp'), plain(tracks))
  assert.deepEqual(h.plays, [{ listId: 'temp', index: 1 }])
  assert.equal(h.state.tempListMeta.id, 'platform_playlist__fixture')
  assert(vue.isProxy(tracks[0].meta.qualitys[0]))
  assert(!vue.isProxy((await h.actions.getListMusics('temp'))[0].meta))
})

test('search playback and user-list imports clone nested metadata and preserve list placement', async t => {
  const h = listIpcFixture()
  t.after(h.dispose)
  const input = [track('nested'), track('second', 'tx')]
  input[0].meta = vue.reactive(input[0].meta)
  assert.throws(() => structuredClone(input), { name: 'DataCloneError' })
  await h.music.playTracks(input, 1)
  assert.deepEqual(h.plays, [{ listId: 'default', index: 1 }])
  await h.actions.createUserList({ name: 'Imported Playlist', id: 'user-fixture', source: 'wy', sourceListId: 'platform-list', position: 0, list: vue.reactive(input) })
  assert.deepEqual(h.remoteLists.get('user-fixture'), plain(input))
  assert.equal(h.state.userLists[0].sourceListId, 'platform-list')
  assert.equal(typeof h.state.userLists[0].locationUpdateTime, 'number')
  assert.equal(h.writes.find(item => item.channel === h.events.list_add).params.position, 0)
  assert(vue.isProxy(input[0].meta))
})

test('all list write operations unwrap payloads and preserve sort, source, and optional metadata', async t => {
  const h = listIpcFixture()
  t.after(h.dispose)
  const infos = vue.reactive([track('first'), track('second')])
  await h.actions.getListMusics('default')
  await h.actions.getListMusics('love')
  const cases = [
    ['createUserList', { position: 3, listInfos: [{ id: 'created', name: 'List', source: 'tx', sourceListId: 'qq-list', locationUpdateTime: 456 }] }],
    ['updateUserList', [{ id: 'created', name: 'Renamed', source: 'tx', sourceListId: 'qq-list', locationUpdateTime: 789 }]],
    ['updateUserListPosition', { position: 4, ids: ['created'] }],
    ['addListMusics', { id: 'love', musicInfos: infos, addMusicLocationType: 'top' }],
    ['moveListMusics', { fromId: 'love', toId: 'default', musicInfos: infos, addMusicLocationType: 'bottom' }],
    ['removeListMusics', { listId: 'default', ids: ['first'] }],
    ['updateListMusics', [{ id: 'default', musicInfo: infos[0] }]],
    ['updateListMusicsPosition', { listId: 'default', position: 1, ids: ['second', 'first'] }],
    ['overwriteListMusics', { listId: 'temp', musicInfos: infos }],
    ['clearListMusics', ['temp']],
    ['removeUserList', ['created']],
  ]
  for (const [method, input] of cases) {
    const wrapped = vue.reactive(input)
    const before = plain(wrapped)
    await h.manager[method](wrapped)
    assert.deepEqual(plain(h.writes.at(-1).params), before, method)
    assert.deepEqual(plain(wrapped), before, `${method} must not mutate the caller`)
  }
  assert.equal(h.workerCalls.length, 1)
  assert.equal(h.workerCalls[0].position, 1)
  assert.deepEqual(h.workerCalls[0].ids, ['second', 'first'])
  const full = vue.reactive({ defaultList: infos, loveList: [], tempList: infos, userList: [{ id: 'u', name: 'List', source: 'wy', sourceListId: 'original', locationUpdateTime: null, list: infos }] })
  const before = plain(full)
  await h.actions.overwriteListFull(full)
  assert.deepEqual(plain(h.writes.at(-1).params), before)
  assert.deepEqual(plain(full), before)
  assert(vue.isProxy(full.defaultList))
  assert(vue.isProxy(full.userList[0].list[0].meta))
})

test('platform-created Library playlists play through the real queue and IPC without a clone error', async t => {
  const h = listIpcFixture()
  t.after(h.dispose)
  const fixtures = [track('first', 'tx'), track('second', 'tx')]
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/ui/views/Library.vue'), 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const expose = "tracks.value = fixtures; loading.value = false; module.exports = { playTrack, actionError, tracks };"
  const output = ts.transpileModule(`${source}\n${expose}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  const imports = {
    vue: { ...vue, watch() {}, onMounted() {}, onBeforeUnmount() {} },
    'vue-router': { useRoute: () => ({ query: { id: 'platform-fixture' } }), useRouter: () => ({ replace() {} }) },
    '@renderer/store/list/state': h.state,
    '@renderer/store/list/action': h.actions,
    '@common/constants': { LIST_IDS: h.LIST_IDS },
    '@common/localMusic': { LOCAL_LIBRARY_ID: 'userlist_linkline_local', LOCAL_AUDIO_EXTENSIONS: [] },
    '../services/localLibrary': {},
    '@renderer/core/player': { playList: (listId, index) => h.plays.push({ listId, index }) },
    '@renderer/utils/ipc': {}, '@renderer/utils/data': {}, '@renderer/utils': {},
    '../services/platformAccounts': { platformPlaylists: vue.ref([{ id: 'platform-fixture', name: 'Fixture', platform: 'qq' }]), favoritePending: vue.ref(new Set()), platformName: () => 'QQ 音乐' },
  }
  vm.runInNewContext(output, { module, exports: module.exports, fixtures, require: name => {
    if (name in imports) return imports[name]
    if (name.endsWith('.vue')) return {}
    throw new Error(`Unexpected import ${name}`)
  } })
  const page = module.exports
  assert(vue.isProxy(page.tracks.value[0].meta))
  await page.playTrack(page.tracks.value[1])
  assert.equal(page.actionError.value, '')
  assert.deepEqual(h.remoteLists.get('temp'), fixtures)
  assert.deepEqual(h.plays, [{ listId: 'temp', index: 1 }])
})

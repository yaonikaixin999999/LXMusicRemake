const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const ts = require('typescript')
const vue = require('vue')

const root = path.resolve(__dirname, '..')
const importedKey = 'linkline.platform-favorites.imported.v1'
const compile = filename => ts.transpileModule(fs.readFileSync(path.join(root, filename), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const matchingModule = { exports: {} }
vm.runInNewContext(compile('src/common/platformMatching.ts'), { module: matchingModule, exports: matchingModule.exports, require })
const matching = matchingModule.exports
const copy = value => structuredClone(value)
const track = (id, source = 'wy', name = `Recording ${id}`) => ({
  id, source, name, singer: 'Fixture Artist', interval: '03:30',
  meta: {
    songId: id, albumName: 'Fixture Album', picUrl: 'https://fixture.invalid/cover.jpg',
    qualitys: [{ type: '128k', size: '3 MB' }], _qualitys: { '128k': { size: '3 MB' } },
  },
})
const account = (platform, count) => ({
  platform, name: platform, connected: true, profile: { id: `fixture-${platform}`, nickname: 'Fixture User', avatar: '' },
  count, lastSync: 1, error: '',
})
const snapshot = (qq = [], netease = []) => ({
  accounts: [account('qq', qq.length), account('netease', netease.length)],
  favorites: matching.aggregateFavorites([{ platform: 'qq', tracks: qq }, { platform: 'netease', tracks: netease }]),
})
const settle = async() => { for (let index = 0; index < 8; index++) await new Promise(resolve => setImmediate(resolve)) }

function fixture(t, { initial = [], remote = snapshot(), storage = new Map(), unavailable = false } = {}) {
  const appEvent = new EventEmitter()
  const ipc = new EventEmitter()
  const list = copy(initial)
  const listWrites = []
  const remoteWrites = []
  let current = copy(remote)
  let failure = false
  let activeWrites = 0
  let maximumWrites = 0
  ipc.invoke = async(channel, input) => {
    const params = copy(input)
    if (channel === 'platform_accounts_snapshot') {
      if (unavailable) throw new Error('Snapshot unavailable')
      return copy(current)
    }
    if (channel === 'platform_accounts_sync') return copy(current)
    if (channel === 'platform_accounts_logout') {
      current.accounts = current.accounts.map(item => item.platform === params ? { ...item, connected: false, profile: null, count: 0 } : item)
      current.favorites = current.favorites.flatMap(item => {
        const platforms = item.platforms.filter(source => source.platform !== params)
        return platforms.length ? [{ ...item, track: platforms[0].track, platforms }] : []
      })
      ipc.emit('platform_accounts_changed', {}, copy(current))
      return copy(current)
    }
    if (channel === 'platform_accounts_like') {
      if (unavailable) throw new Error('Account service unavailable')
      activeWrites++
      maximumWrites = Math.max(maximumWrites, activeWrites)
      remoteWrites.push(params)
      await new Promise(resolve => setImmediate(resolve))
      const collections = current.accounts.map(item => ({
        platform: item.platform,
        tracks: current.favorites.flatMap(favorite => favorite.platforms.filter(source => source.platform === item.platform).map(source => source.track)),
      }))
      for (const collection of collections) {
        if (collection.platform === 'netease' && failure) continue
        collection.tracks = collection.tracks.filter(item => !matching.sameRecording(item, params.track))
        if (params.liked) collection.tracks.push(params.track)
      }
      current.favorites = matching.aggregateFavorites(collections)
      ipc.emit('platform_accounts_changed', {}, copy(current))
      activeWrites--
      return copy(current.accounts.filter(item => item.connected).map(item => ({
        platform: item.platform, status: item.platform === 'netease' && failure ? 'failed' : 'success',
        message: item.platform === 'netease' && failure ? 'Fixture rejection' : 'Updated', track: params.track,
      })))
    }
    throw new Error(`Unexpected IPC ${channel}`)
  }
  const listActions = {
    getListMusics: async() => list,
    // Match the production action's shallow toRaw before Electron clones its payload.
    addListMusics: async(id, tracks) => {
      const payload = copy({ id, musicInfos: vue.toRaw(tracks) })
      listWrites.push(payload)
      for (const info of payload.musicInfos) if (!list.some(item => item.id === info.id)) list.push(info)
      appEvent.emit('myListUpdate', ['love'])
    },
    removeListMusics: async(input) => {
      const { ids } = copy(input)
      for (let index = list.length - 1; index >= 0; index--) if (ids.includes(list[index].id)) list.splice(index, 1)
      appEvent.emit('myListUpdate', ['love'])
    },
  }
  const loaded = { exports: {} }
  const injectedRequire = name => {
    if (name === 'electron') return { ipcRenderer: ipc }
    if (name === 'vue') return vue
    if (name === '@common/platformMatching') return matching
    if (name === '@common/platformAccounts') {
      const accountModule = { exports: {} }
      vm.runInNewContext(compile('src/common/platformAccounts.ts'), { module: accountModule, exports: accountModule.exports })
      return accountModule.exports
    }
    if (name === '@common/utils/vueTools') return { toRaw: vue.toRaw }
    if (name === '@renderer/store/list/action') return listActions
    if (name === '@renderer/store/list/state') return { loveList: { id: 'love' } }
    throw new Error(`Unexpected dependency ${name}`)
  }
  vm.runInNewContext(compile('src/renderer/ui/services/platformAccounts.ts'), {
    module: loaded, exports: loaded.exports, require: injectedRequire, Error, console,
    window: { app_event: appEvent },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  })
  const service = loaded.exports
  t.after(() => service.disposePlatformAccounts())
  return {
    service, list, listWrites, remoteWrites, storage, ipc,
    failNetease: () => { failure = true }, maximumWrites: () => maximumWrites,
    async publish(next) { current = copy(next); ipc.emit('platform_accounts_changed', {}, copy(current)); await settle() },
  }
}

test('real Vue deep refs reproduce the nested Proxy clone failure behind empty favorites', () => {
  const original = snapshot([], [track('regression')])
  const wrapped = vue.ref(original)
  const missing = wrapped.value.favorites.map(item => item.track)
  assert(vue.isProxy(missing[0]))
  assert(vue.isProxy(missing[0].meta))
  assert.throws(() => copy(vue.toRaw(missing)), { name: 'DataCloneError' })
})

test('805 aggregated favorites cross the real Vue and IPC clone boundary, deduplicate and preserve local favorites', async t => {
  const netease = Array.from({ length: 809 }, (_, index) => track(`wy-${index}`, 'wy', `Recording ${index < 805 ? index : index - 805}`))
  const qq = Array.from({ length: 20 }, (_, index) => track(`qq-${index}`, 'tx', `Recording ${index}`))
  const local = track('local-only', 'local', 'Local Favorite')
  const shared = track('local-shared', 'local', 'Recording 0')
  const remote = snapshot(qq, netease)
  assert.equal(remote.favorites.length, 805)
  const h = fixture(t, { initial: [local, shared], remote })
  await h.service.initializePlatformAccounts()
  assert.equal(h.service.platformError.value, '')
  assert.equal(h.list.length, 806)
  assert.equal(h.service.favoriteTracks.value.length, 806)
  assert.equal(h.listWrites.length, 1)
  assert.equal(h.listWrites[0].musicInfos.length, 804)
  assert(h.list.some(item => item.id === local.id))
  assert(h.list.some(item => item.id === shared.id))
  assert.equal(h.remoteWrites.length, 0)
  assert(!vue.isProxy(h.service.platformSnapshot.value.favorites[0].track.meta))
  assert.equal(copy(h.service.platformSnapshot.value).favorites.length, 805)
  assert.equal(JSON.parse(h.storage.get(importedKey)).length, 804)
  await h.publish(remote)
  assert.equal(h.listWrites.length, 1)
  assert.equal(h.list.length, 806)
})

test('a plain track carrying nested Vue proxies can be favorited through both clone boundaries', async t => {
  const h = fixture(t)
  await h.service.initializePlatformAccounts()
  const input = track('nested-proxy')
  input.meta = vue.reactive(input.meta)
  assert(!vue.isProxy(input))
  assert(vue.isProxy(input.meta._qualitys['128k']))
  assert.throws(() => copy(vue.toRaw(input)), { name: 'DataCloneError' })
  const expected = JSON.parse(JSON.stringify(input))
  const results = await h.service.setFavorite(input, true)
  assert(results.every(item => item.status === 'success'))
  assert.deepEqual(h.remoteWrites[0], { track: expected, liked: true })
  assert.deepEqual(h.list[0], expected)
  assert.equal(h.service.favoritePending.value.size, 0)
  assert.equal(h.service.favoriteNotice.value.localUpdated, true)
  assert.equal(h.service.favoriteNotice.value.pending, false)
  assert.equal(h.service.platformError.value, '')
})

test('logout preserves locally owned and overlapping favorites until the last source is removed', async t => {
  const local = track('local', 'local', 'Local Favorite')
  const localShared = track('local-shared', 'local', 'Shared Favorite')
  const qqShared = track('qq-shared', 'tx', 'Shared Favorite')
  const qqOnly = track('qq-only', 'tx', 'QQ Only')
  const qqOverlap = track('qq-overlap', 'tx', 'Overlap')
  const neteaseOverlap = track('wy-overlap', 'wy', 'Overlap')
  const h = fixture(t, { initial: [local, localShared], remote: snapshot([qqShared, qqOnly, qqOverlap], [neteaseOverlap]) })
  await h.service.initializePlatformAccounts()
  assert.equal(h.list.length, 4)
  await h.service.logoutPlatform('qq')
  assert.equal(h.list.length, 3)
  assert(h.list.some(item => matching.sameRecording(item, qqOverlap)))
  assert(!h.list.some(item => item.id === qqOnly.id))
  await h.service.logoutPlatform('netease')
  assert.deepEqual(h.list.map(item => item.id), [local.id, localShared.id])
  assert.deepEqual(JSON.parse(h.storage.get(importedKey)), [])
  assert.equal(h.remoteWrites.length, 0)
})

test('persisted import ownership is restored and stale imports are removed without deleting local songs', async t => {
  const old = track('old-import')
  const kept = track('kept-import')
  const local = track('local', 'local', 'Local Favorite')
  const storage = new Map([[importedKey, JSON.stringify([`wy:${old.id}`, `wy:${kept.id}`])]])
  const h = fixture(t, { initial: [local, old, kept], remote: snapshot([], [kept]), storage })
  await h.service.initializePlatformAccounts()
  assert.deepEqual(h.list.map(item => item.id), [local.id, kept.id])
  assert.deepEqual(JSON.parse(storage.get(importedKey)), [`wy:${kept.id}`])
  assert.equal(h.listWrites.length, 0)
})

test('unavailable account service preserves saved imports and completes the local favorite before reporting failure', async t => {
  const imported = track('saved-import')
  const local = track('local', 'local', 'Local Favorite')
  const storage = new Map([[importedKey, JSON.stringify([`wy:${imported.id}`])]])
  const h = fixture(t, { initial: [imported], unavailable: true, storage })
  await h.service.initializePlatformAccounts()
  assert.match(h.service.platformError.value, /unavailable/)
  assert.equal(h.list.length, 1)
  await assert.rejects(h.service.setFavorite(vue.reactive(local), true), /Account service unavailable/)
  assert(h.list.some(item => item.id === imported.id))
  assert(h.list.some(item => item.id === local.id))
  assert.deepEqual(JSON.parse(storage.get(importedKey)), [`wy:${imported.id}`])
  assert.equal(h.service.favoriteNotice.value.localUpdated, true)
  assert.match(h.service.favoriteNotice.value.error, /unavailable/)
  assert.equal(h.service.favoriteNotice.value.pending, false)
})

test('explicitly favoriting an import adopts local ownership and concurrent commands remain ordered', async t => {
  const imported = track('imported')
  const h = fixture(t, { remote: snapshot([], [imported]) })
  await h.service.initializePlatformAccounts()
  await h.service.setFavorite(h.service.favoriteTracks.value[0], true)
  await h.service.logoutPlatform('netease')
  assert(h.list.some(item => item.id === imported.id))
  const local = track('ordered', 'local', 'Ordered Favorite')
  await Promise.all([h.service.setFavorite(vue.reactive(local), false), h.service.setFavorite(vue.reactive(local), true)])
  assert.equal(h.maximumWrites(), 1)
  assert.deepEqual(h.remoteWrites.slice(-2).map(item => item.liked), [false, true])
  assert(h.list.some(item => item.id === local.id))
  assert.equal(h.service.favoritePending.value.size, 0)
})

test('partial platform unlike failure remains visible and retains the surviving remote favorite', async t => {
  const info = track('partial')
  const h = fixture(t, { remote: snapshot([track('qq-partial', 'tx', info.name)], [info]) })
  await h.service.initializePlatformAccounts()
  h.failNetease()
  const results = await h.service.setFavorite(vue.reactive(info), false)
  assert.deepEqual(results.map(item => item.status), ['success', 'failed'])
  assert.equal(h.service.favoriteNotice.value.results[1].status, 'failed')
  assert(h.list.some(item => matching.sameRecording(item, info)))
  h.service.disposePlatformAccounts()
  assert.equal(h.ipc.listenerCount('platform_accounts_changed'), 0)
})

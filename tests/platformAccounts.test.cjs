const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const { test } = require('node:test')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const copy = value => JSON.parse(JSON.stringify(value))
const profile = (id, suffix = 'A') => ({ id: `${id}-${suffix}`, nickname: `${id} ${suffix}`, avatar: '' })
const track = (source, id, overrides = {}) => ({
  id: `${source}_${id}`,
  source,
  name: 'The Same Recording',
  singer: 'Artist One / Artist Two',
  interval: '03:30',
  meta: { songId: id, albumName: 'Studio Album', albumId: 'album-1', picUrl: '', qualitys: [], _qualitys: {} },
  ...overrides,
})
const authCookies = id => id === 'qq'
  ? [{ name: 'qqmusic_key', value: 'test-key', domain: '.qq.com', path: '/' }, { name: 'qqmusic_uin', value: '10001', domain: '.qq.com', path: '/' }]
  : [{ name: 'MUSIC_U', value: 'test-key', domain: '.music.163.com', path: '/' }]
const account = (snapshot, id) => snapshot.accounts.find(item => item.platform === id)
const cachedAccount = (id, tracks) => ({ platform: id, profile: profile(id), lastSync: 123456, tracks })

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

async function flush() {
  for (let index = 0; index < 8; index++) await new Promise(resolve => setImmediate(resolve))
}

function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'linkline-accounts-test-'))
  const cacheFile = path.join(directory, 'platform-favorites.json')
  if (options.cached) fs.writeFileSync(cacheFile, JSON.stringify(options.cached))
  const sessions = new Map()
  const behaviors = {
    qq: { profile: profile('qq'), likes: [], search: [], available: true },
    netease: { profile: profile('netease'), likes: [], search: [], available: true },
  }
  const calls = { qq: [], netease: [] }
  const runtimes = []

  function getSession(partition) {
    if (sessions.has(partition)) return sessions.get(partition)
    const id = partition.endsWith('-qq') ? 'qq' : 'netease'
    const cookies = new EventEmitter()
    const ses = {
      cookieData: copy(options.connected?.includes(id) ? authCookies(id) : []),
      cookies,
      clearCount: 0,
      setPermissionRequestHandler(handler) { this.permissionHandler = handler },
      async clearStorageData() { this.clearCount++; this.cookieData = [] },
    }
    cookies.get = async(filter = {}) => {
      let values = ses.cookieData
      if (filter.url) {
        const url = new URL(filter.url)
        values = values.filter(cookie => {
          const domain = cookie.domain.replace(/^\./, '')
          return (url.hostname === domain || url.hostname.endsWith(`.${domain}`)) && url.pathname.startsWith(cookie.path)
        })
      }
      return copy(values)
    }
    sessions.set(partition, ses)
    return ses
  }

  function createRuntime() {
    const handlers = new Map()
    const events = []
    const notifications = new EventEmitter()
    const windows = []
    const timers = new Map()
    let timerId = 0
    const schedule = (callback, delay, repeating) => {
      const id = ++timerId
      timers.set(id, { callback, delay, repeating })
      return id
    }
    class FakeWindow extends EventEmitter {
      constructor(options) {
        super()
        this.options = options
        this.destroyed = false
        this.loadedUrls = []
        this.webContents = new EventEmitter()
        this.webContents.session = options.webPreferences.session
        this.webContents.setWindowOpenHandler = handler => { this.popupHandler = handler }
        windows.push(this)
      }

      isDestroyed() { return this.destroyed }
      focus() { this.focused = true }
      async loadURL(url) { this.loadedUrls.push(url) }
      close() {
        if (this.destroyed) return
        this.destroyed = true
        this.emit('closed')
      }
    }
    const ipcMain = {
      handle(name, handler) { handlers.set(name, handler) },
      handleOnce(name, handler) { handlers.set(name, handler) },
    }
    const electron = { app: { getPath: () => directory }, BrowserWindow: FakeWindow, session: { fromPartition: getSession }, ipcMain }
    const providers = Object.fromEntries(['qq', 'netease'].map(id => {
      const provider = {
        id,
        name: id,
        loginUrl: id === 'qq' ? 'https://graph.qq.com/oauth2.0/authorize' : 'https://music.163.com/#/my/',
        cookieUrl: id === 'qq' ? 'https://y.qq.com/' : undefined,
        domains: id === 'qq' ? ['qq.com', 'gtimg.cn'] : ['music.163.com', '163.com', '126.com', 'netease.com'],
      }
      for (const method of ['profile', 'likes', 'search', 'available', 'like']) {
        provider[method] = async(...args) => {
          calls[id].push({ method, args })
          if (method === 'profile' && !args[0].session.cookieData.length) throw new Error('login required')
          const behavior = behaviors[id][method]
          if (typeof behavior === 'function') return behavior(...args)
          if (behavior instanceof Error) throw behavior
          return behavior == null ? undefined : copy(behavior)
        }
      }
      return [id, provider]
    }))
    const modules = new Map()
    const globals = {
      console, URL, URLSearchParams, Buffer, Error, setImmediate,
      setTimeout: (callback, delay) => schedule(callback, delay, false),
      setInterval: (callback, delay) => schedule(callback, delay, true),
      clearTimeout: id => timers.delete(id),
      clearInterval: id => timers.delete(id),
    }
    function loadTypeScript(filename) {
      if (modules.has(filename)) return modules.get(filename).exports
      const loaded = { exports: {} }
      modules.set(filename, loaded)
      const source = fs.readFileSync(filename, 'utf8')
      const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
      function injectedRequire(name) {
        if (name === 'electron') return electron
        if (name === '@main/modules/winMain/main') return { sendEvent: (name, value) => { events.push({ name, value: copy(value) }); notifications.emit('snapshot', value) }, showWindow() {} }
        if (name === './providers/qq') return { qqProvider: providers.qq }
        if (name === './providers/netease') return { neteaseProvider: providers.netease }
        if (name.startsWith('@common/')) return loadTypeScript(path.join(root, 'src/common', `${name.slice(8)}.ts`))
        if (name.startsWith('.')) return loadTypeScript(path.resolve(path.dirname(filename), `${name}.ts`))
        return require(name)
      }
      const wrapper = vm.runInNewContext(`(function(require, module, exports) {\n${output}\n})`, globals, { filename })
      wrapper(injectedRequire, loaded, loaded.exports)
      return loaded.exports
    }
    loadTypeScript(path.join(root, 'src/main/modules/platformAccounts/index.ts')).default()
    const runtime = {
      events, windows, timers,
      navigation: loadTypeScript(path.join(root, 'src/main/modules/platformAccounts/navigation.ts')),
      async invoke(name, params) {
        const handler = handlers.get(`platform_accounts_${name}`)
        assert(handler, `Missing platform IPC ${name}`)
        return copy(await handler({}, params))
      },
      async pollLogin() {
        for (const timer of [...timers.values()].filter(timer => timer.repeating)) timer.callback()
        await flush()
      },
      waitForSnapshot(predicate) {
        const observed = events.find(event => predicate(event.value))
        if (observed) return Promise.resolve(observed.value)
        return new Promise(resolve => {
          const onSnapshot = value => { if (predicate(value)) { notifications.off('snapshot', onSnapshot); resolve(value) } }
          notifications.on('snapshot', onSnapshot)
        })
      },
      close() { windows.forEach(window => window.close()); timers.clear() },
    }
    runtimes.push(runtime)
    return runtime
  }
  t.after(() => { runtimes.forEach(runtime => runtime.close()); fs.rmSync(directory, { recursive: true, force: true }) })
  return {
    runtime: createRuntime(), behaviors, calls,
    session: id => getSession(`persist:linkline-account-${id}`),
    authenticate(id) { const ses = getSession(`persist:linkline-account-${id}`); ses.cookieData = copy(authCookies(id)) },
    restart: createRuntime,
    disk: () => JSON.parse(fs.readFileSync(cacheFile, 'utf8')),
  }
}

test('persisted authenticated partitions restore both accounts and keep favorites across restart', async t => {
  const qqTrack = track('tx', 'cached-qq')
  const neteaseTrack = track('wy', 'cached-netease', { name: 'Another Recording' })
  const h = fixture(t, { connected: ['qq', 'netease'], cached: [cachedAccount('qq', [qqTrack]), cachedAccount('netease', [neteaseTrack])] })
  const restored = await h.runtime.invoke('snapshot')
  assert(restored.accounts.every(item => item.connected))
  assert.equal(restored.favorites.length, 2)
  const next = track('tx', 'new-qq', { name: 'New Recording' })
  const results = await h.runtime.invoke('like', { track: next, liked: true })
  assert.equal(results.find(item => item.platform === 'qq').status, 'success')
  h.runtime.close()
  const restarted = await h.restart().invoke('snapshot')
  assert(restarted.accounts.every(item => item.connected))
  assert.equal(account(restarted, 'qq').count, 2)
  assert.equal(account(restarted, 'netease').count, 1)
})

test('expired authentication preserves offline favorites but disables platform writes', async t => {
  const h = fixture(t, { connected: ['qq'], cached: [cachedAccount('qq', [track('tx', 'saved')])] })
  h.behaviors.qq.profile = new Error('login expired')
  const restored = await h.runtime.invoke('snapshot')
  assert.equal(account(restored, 'qq').connected, false)
  assert.equal(account(restored, 'qq').count, 1)
  assert.match(account(restored, 'qq').error, /expired/)
  assert.deepEqual(await h.runtime.invoke('like', { track: track('tx', 'saved'), liked: false }), [{ platform: 'qq', status: 'failed', message: '账号未连接，请重新登录后同步红心' }])
  assert(!h.calls.qq.some(call => call.method === 'like'))
})

test('startup account switching persists the new profile and removes the previous user cache', async t => {
  const h = fixture(t, { connected: ['qq'], cached: [cachedAccount('qq', [track('tx', 'private-A')])] })
  h.behaviors.qq.profile = profile('qq', 'B')
  const restored = await h.runtime.invoke('snapshot')
  assert.equal(account(restored, 'qq').profile.id, 'qq-B')
  assert.equal(account(restored, 'qq').count, 0)
  assert.equal(restored.favorites.length, 0)
  const saved = h.disk().find(item => item.platform === 'qq')
  assert.equal(saved.profile.id, 'qq-B')
  assert.deepEqual(saved.tracks, [])
})

test('failed favorites sync after account switching cannot associate A favorites with B', async t => {
  const h = fixture(t, { connected: ['qq'], cached: [cachedAccount('qq', [track('tx', 'private-A')])] })
  await h.runtime.invoke('snapshot')
  h.behaviors.qq.profile = profile('qq', 'B')
  h.behaviors.qq.likes = new Error('favorites endpoint unavailable')
  const synced = await h.runtime.invoke('sync', 'qq')
  assert.equal(account(synced, 'qq').profile.id, 'qq-B')
  assert.equal(account(synced, 'qq').count, 0)
  assert.equal(account(synced, 'qq').lastSync, null)
  assert.equal(synced.favorites.length, 0)
  const saved = h.disk().find(item => item.platform === 'qq')
  assert.equal(saved.profile.id, 'qq-B')
  assert.deepEqual(saved.tracks, [])
  assert.equal((await h.restart().invoke('snapshot')).favorites.length, 0)
})

test('logout invalidates a slow login check before it can restore the account', { timeout: 3000 }, async t => {
  const h = fixture(t)
  await h.runtime.invoke('login', 'qq')
  h.authenticate('qq')
  const pending = deferred()
  const started = deferred()
  h.behaviors.qq.profile = async() => { started.resolve(); return pending.promise }
  await h.runtime.pollLogin()
  await started.promise
  const logout = h.runtime.invoke('logout', 'qq')
  await flush()
  pending.resolve(profile('qq'))
  const loggedOut = await logout
  assert.equal(account(loggedOut, 'qq').connected, false)
  assert.equal(account(loggedOut, 'qq').profile, null)
  assert.equal(loggedOut.favorites.length, 0)
  assert.equal(h.session('qq').clearCount, 1)
  assert.equal(h.session('qq').cookies.listenerCount('changed'), 0)
  assert(h.runtime.windows[0].isDestroyed())
  assert.equal(h.runtime.timers.size, 0)
  assert(!h.runtime.events.some(event => account(event.value, 'qq').connected))
  assert.deepEqual(h.disk().find(item => item.platform === 'qq').tracks, [])
})

test('login waits quietly for platform authentication instead of accepting QQ identity cookies', async t => {
  const h = fixture(t)
  await h.runtime.invoke('login', 'qq')
  h.session('qq').cookieData = [{ name: 'ptcz', value: 'identity-only', domain: '.qq.com', path: '/' }]
  await h.runtime.pollLogin()
  const waiting = account(await h.runtime.invoke('snapshot'), 'qq')
  assert.equal(waiting.connected, false)
  assert.equal(waiting.error, '')
  assert.equal(h.runtime.windows[0].isDestroyed(), false)
  assert(!h.calls.qq.some(call => call.method === 'profile'))
})

test('authenticated login closes its window before favorites finish and still imports the response', { timeout: 3000 }, async t => {
  const h = fixture(t)
  await h.runtime.invoke('login', 'qq')
  h.authenticate('qq')
  const pending = deferred()
  const started = deferred()
  h.behaviors.qq.likes = async() => { started.resolve(); return pending.promise }
  await h.runtime.pollLogin()
  await started.promise
  assert.equal(h.runtime.windows[0].isDestroyed(), true)
  assert.equal(h.runtime.timers.size, 0)
  assert.equal(h.session('qq').cookies.listenerCount('changed'), 0)
  assert.equal(account(await h.runtime.invoke('snapshot'), 'qq').connected, true)
  pending.resolve([track('tx', 'after-close')])
  const synced = await h.runtime.waitForSnapshot(value => account(value, 'qq').count === 1)
  assert.equal(account(synced, 'qq').count, 1)
  assert.equal(synced.favorites.length, 1)
  assert.equal(h.disk().find(item => item.platform === 'qq').tracks.length, 1)
})

test('authenticated profile errors are visible and keep the login page open', async t => {
  const h = fixture(t)
  await h.runtime.invoke('login', 'qq')
  h.authenticate('qq')
  h.behaviors.qq.profile = new Error('QQ music profile request failed')
  await h.runtime.pollLogin()
  const failed = account(await h.runtime.invoke('snapshot'), 'qq')
  assert.equal(failed.connected, false)
  assert.match(failed.error, /profile request failed/)
  assert.equal(h.runtime.windows[0].isDestroyed(), false)
  assert(h.runtime.events.some(event => account(event.value, 'qq').error))
})

test('favorites failure after login returns to the app and exposes the synchronization error', { timeout: 3000 }, async t => {
  const h = fixture(t)
  await h.runtime.invoke('login', 'netease')
  h.authenticate('netease')
  h.behaviors.netease.likes = new Error('favorites request timed out')
  await h.runtime.pollLogin()
  const failed = account(await h.runtime.waitForSnapshot(value => /favorites request timed out/.test(account(value, 'netease').error)), 'netease')
  assert.equal(failed.connected, true)
  assert.match(failed.error, /favorites request timed out/)
  assert.equal(h.runtime.windows[0].isDestroyed(), true)
  assert.equal(h.runtime.timers.size, 0)
})

test('closing and reopening login discards the old request without closing the new window', { timeout: 3000 }, async t => {
  const h = fixture(t)
  await h.runtime.invoke('login', 'qq')
  h.authenticate('qq')
  const pending = deferred()
  const started = deferred()
  h.behaviors.qq.profile = async() => { started.resolve(); return pending.promise }
  await h.runtime.pollLogin()
  await started.promise
  h.runtime.windows[0].close()
  await h.runtime.invoke('login', 'qq')
  pending.resolve(profile('qq'))
  await flush()
  assert.equal(account(await h.runtime.invoke('snapshot'), 'qq').connected, false)
  assert.equal(h.runtime.windows[1].isDestroyed(), false)
  assert.equal(h.session('qq').cookies.listenerCount('changed'), 1)
  assert(!h.runtime.events.some(event => account(event.value, 'qq').connected))
})

test('logout discards favorites returned by an already running sync', { timeout: 3000 }, async t => {
  const h = fixture(t, { connected: ['qq'] })
  await h.runtime.invoke('snapshot')
  const pending = deferred()
  const started = deferred()
  h.behaviors.qq.likes = async() => { started.resolve(); return pending.promise }
  const sync = h.runtime.invoke('sync', 'qq')
  await started.promise
  const logout = h.runtime.invoke('logout', 'qq')
  await flush()
  pending.resolve([track('tx', 'late-private-track')])
  await sync
  const loggedOut = await logout
  assert.equal(account(loggedOut, 'qq').profile, null)
  assert.equal(loggedOut.favorites.length, 0)
  assert(!h.runtime.events.some(event => event.value.favorites.length))
})

test('successful matching likes and unlikes both providers and aggregates their recording', async t => {
  const h = fixture(t, { connected: ['qq', 'netease'] })
  const original = track('kw', 'original')
  h.behaviors.qq.search = [track('tx', 'qq-match')]
  h.behaviors.netease.search = [track('wy', 'netease-match', { singer: 'Artist Two / Artist One', interval: '03:32' })]
  const results = await h.runtime.invoke('like', { track: original, liked: true })
  assert.deepEqual(results.map(item => item.status), ['success', 'success'])
  const liked = await h.runtime.invoke('snapshot')
  assert.equal(liked.favorites.length, 1)
  assert.deepEqual(liked.favorites[0].platforms.map(item => item.platform), ['qq', 'netease'])
  assert.equal(account(liked, 'qq').count, 1)
  assert.equal(account(liked, 'netease').count, 1)
  assert.deepEqual((await h.runtime.invoke('like', { track: original, liked: false })).map(item => item.status), ['success', 'success'])
  assert.equal((await h.runtime.invoke('snapshot')).favorites.length, 0)
  for (const id of ['qq', 'netease']) assert.equal(h.calls[id].filter(call => call.method === 'like').length, 2)
})

test('unmatched and unavailable songs produce separate platform outcomes without writes', async t => {
  const h = fixture(t, { connected: ['qq', 'netease'] })
  h.behaviors.qq.search = []
  h.behaviors.netease.search = [track('wy', 'match')]
  h.behaviors.netease.available = false
  const results = await h.runtime.invoke('like', { track: track('kw', 'original'), liked: true })
  assert.deepEqual(results.map(item => item.status), ['unmatched', 'unavailable'])
  assert.equal((await h.runtime.invoke('snapshot')).favorites.length, 0)
  for (const id of ['qq', 'netease']) assert(!h.calls[id].some(call => call.method === 'like'))
})

test('ambiguous recordings and provider write failure stay distinct and never report success', async t => {
  const h = fixture(t, { connected: ['qq', 'netease'] })
  h.behaviors.qq.search = [track('tx', 'version-1'), track('tx', 'version-2')]
  h.behaviors.netease.search = [track('wy', 'match')]
  h.behaviors.netease.like = new Error('write request timed out')
  const results = await h.runtime.invoke('like', { track: track('kw', 'original'), liked: true })
  assert.deepEqual(results.map(item => item.status), ['ambiguous', 'failed'])
  assert.match(results[1].message, /timed out/)
  assert(!h.calls.qq.some(call => call.method === 'like'))
  assert.equal((await h.runtime.invoke('snapshot')).favorites.length, 0)
})

test('account switching during an unmatched like persists the cleared cache and notifies the UI', async t => {
  const h = fixture(t, { connected: ['qq'], cached: [cachedAccount('qq', [track('tx', 'private-A', { name: 'Private A Recording' })])] })
  await h.runtime.invoke('snapshot')
  h.behaviors.qq.profile = profile('qq', 'B')
  const results = await h.runtime.invoke('like', { track: track('kw', 'unmatched'), liked: true })
  assert.equal(results[0].status, 'unmatched')
  assert.equal(account(await h.runtime.invoke('snapshot'), 'qq').profile.id, 'qq-B')
  const saved = h.disk().find(item => item.platform === 'qq')
  assert.equal(saved.profile.id, 'qq-B')
  assert.deepEqual(saved.tracks, [])
  assert(h.runtime.events.some(event => account(event.value, 'qq').profile?.id === 'qq-B' && !event.value.favorites.length))
})

test('malformed cache records are skipped while another valid platform still restores', async t => {
  const valid = track('wy', 'saved-netease')
  const h = fixture(t, { connected: ['netease'], cached: [null, cachedAccount('qq', [null, { id: 'bad' }]), cachedAccount('netease', [valid])] })
  const restored = await h.runtime.invoke('snapshot')
  assert.equal(account(restored, 'netease').connected, true)
  assert.equal(account(restored, 'netease').count, 1)
  assert.equal(restored.favorites[0].track.id, valid.id)
})

test('account navigation allows only registered HTTPS domains with proper hostname boundaries', async t => {
  const h = fixture(t)
  await h.runtime.invoke('snapshot')
  const navigation = h.runtime.navigation
  const qq = h.session('qq')
  for (const url of ['https://y.qq.com/', 'https://ssl.ptlogin2.qq.com/', 'https://y.gtimg.cn/image']) assert(navigation.canNavigateAccount(qq, url), url)
  for (const url of ['http://y.qq.com/', 'https://qq.com.evil.test/', 'https://notqq.com/', 'https://evil.test/?redirect=qq.com', 'file:///C:/secret', 'javascript:alert(1)', 'invalid']) assert.equal(navigation.canNavigateAccount(qq, url), false, url)
  assert.equal(navigation.canNavigateAccount({}, 'https://y.qq.com/'), false)
  assert.equal(navigation.isAccountSession(qq), true)
  assert.equal(navigation.isAccountSession({}), false)
})

test('login popup URLs stay in the same guarded window and external domains are denied', async t => {
  const h = fixture(t)
  await h.runtime.invoke('login', 'qq')
  const window = h.runtime.windows[0]
  assert.deepEqual(copy(window.popupHandler({ url: 'https://ssl.ptlogin2.qq.com/login' })), { action: 'deny' })
  await flush()
  assert.equal(window.loadedUrls.at(-1), 'https://ssl.ptlogin2.qq.com/login')
  const count = window.loadedUrls.length
  assert.deepEqual(copy(window.popupHandler({ url: 'https://evil.test/' })), { action: 'deny' })
  assert.equal(window.loadedUrls.length, count)
  assert.equal(h.runtime.windows.length, 1)
  let denied = false
  window.webContents.emit('will-navigate', { preventDefault() { denied = true } }, 'https://evil.test/')
  assert.equal(denied, true)
})

test('login server redirects cannot leave the registered provider domains', async t => {
  const h = fixture(t)
  await h.runtime.invoke('login', 'qq')
  const window = h.runtime.windows[0]
  let denied = false
  window.webContents.emit('will-redirect', { preventDefault() { denied = true } }, 'https://evil.test/callback')
  assert.equal(denied, true)
  denied = false
  window.webContents.emit('will-redirect', { preventDefault() { denied = true } }, 'https://ssl.ptlogin2.qq.com/callback')
  assert.equal(denied, false)
})

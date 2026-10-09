import { app, BrowserWindow, session } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { PlatformAccount, PlatformId, PlatformLikeResult, PlatformSnapshot } from '@common/platformAccounts'
import { mainHandle } from '@common/mainIpc'
import { sendEvent, showWindow } from '@main/modules/winMain/main'
import { aggregateFavorites, chooseMatch } from './matching'
import { qqProvider } from './providers/qq'
import { neteaseProvider } from './providers/netease'
import type { PlatformProvider, ProviderContext } from './providers/types'
import { canNavigateAccount, registerAccountSession } from './navigation'

interface ProviderState {
  provider: PlatformProvider
  context: ProviderContext
  account: PlatformAccount
  tracks: LX.Music.MusicInfoOnline[]
  window: BrowserWindow | null
  busy: Promise<unknown>
  generation: number
}
const providers = [qqProvider, neteaseProvider]
const states = new Map<PlatformId, ProviderState>()
let initialized: Promise<void> | undefined
let saveQueue = Promise.resolve()
const cachePath = () => path.join(app.getPath('userData'), 'platform-favorites.json')
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '平台请求失败，请重试'
const hasAuthentication = (id: PlatformId, cookies: Record<string, string>) => Boolean(id === 'qq' ? cookies.qqmusic_key || cookies.qm_keyst : cookies.MUSIC_U)
const snapshot = (): PlatformSnapshot => ({
  accounts: [...states.values()].map(state => ({ ...state.account })),
  favorites: aggregateFavorites([...states.values()].map(state => ({ platform: state.provider.id, tracks: state.tracks }))),
})
const notify = () => sendEvent('platform_accounts_changed', snapshot())
const save = async() => {
  const data = JSON.stringify([...states.values()].map(state => ({ platform: state.provider.id, profile: state.account.profile, lastSync: state.account.lastSync, tracks: state.tracks })))
  saveQueue = saveQueue.catch(() => {}).then(async() => {
    const target = cachePath()
    await fs.writeFile(`${target}.tmp`, data, 'utf8')
    await fs.rename(`${target}.tmp`, target)
  }).catch(error => { console.warn('LinkLine platform favorites cache could not be saved:', error) })
  return saveQueue
}
const init = async() => {
  initialized ??= (async() => {
    for (const provider of providers) {
      const ses = session.fromPartition(`persist:linkline-account-${provider.id}`)
      registerAccountSession(ses, provider.domains)
      ses.setPermissionRequestHandler((_contents, _permission, allow) => { allow(false) })
      states.set(provider.id, {
        provider,
        context: { session: ses, cookies: async() => Object.fromEntries((await ses.cookies.get({ url: provider.cookieUrl ?? `${new URL(provider.loginUrl).origin}/` })).map(cookie => [cookie.name, cookie.value])) },
        account: { platform: provider.id, name: provider.name, connected: false, profile: null, lastSync: null, count: 0, error: '' },
        tracks: [],
        window: null,
        busy: Promise.resolve(),
        generation: 0,
      })
    }
    try {
      const cached = JSON.parse(await fs.readFile(cachePath(), 'utf8'))
      if (Array.isArray(cached)) {
        for (const item of cached) {
          if (item == null || typeof item !== 'object') continue
          const state = states.get(item.platform)
          if (!state || !Array.isArray(item.tracks)) continue
          state.tracks = item.tracks.filter((track: any) => track != null && typeof track === 'object' && typeof track.id === 'string' && typeof track.name === 'string' && typeof track.singer === 'string' && track.meta != null && typeof track.meta.songId !== 'undefined')
          state.account.profile = item.profile && typeof item.profile.id === 'string' ? item.profile : null
          state.account.lastSync = typeof item.lastSync === 'number' ? item.lastSync : null
          state.account.count = state.tracks.length
        }
      }
    } catch {}
    await Promise.all([...states.values()].map(async(state) => {
      try {
        const cookies = await state.context.cookies()
        if (!hasAuthentication(state.provider.id, cookies)) return
        try {
          acceptProfile(state, await state.provider.profile(state.context))
          state.account.connected = true
        } catch (error) { state.account.error = errorMessage(error) }
      } catch (error) { state.account.error = errorMessage(error) }
    }))
    await save()
  })()
  await initialized
}
const getState = async(id: PlatformId) => {
  await init()
  const state = states.get(id)
  if (!state) throw new Error('不支持的音乐平台')
  return state
}
const exclusive = async<T>(state: ProviderState, action: () => Promise<T>): Promise<T> => {
  const operation = state.busy.catch(() => {}).then(action)
  state.busy = operation.catch(() => {})
  return operation
}
const acceptProfile = (state: ProviderState, profile: PlatformAccount['profile']) => {
  if (state.account.profile?.id !== profile?.id) {
    state.tracks = []
    state.account.count = 0
    state.account.lastSync = null
  }
  state.account.profile = profile
}
const refreshState = async(state: ProviderState, generation: number) => {
  try {
    const profile = await state.provider.profile(state.context)
    if (generation !== state.generation) return
    acceptProfile(state, profile)
    state.account.connected = true
    const tracks = await state.provider.likes(state.context, profile)
    if (generation !== state.generation) return
    state.tracks = tracks
    state.account.lastSync = Date.now()
    state.account.count = state.tracks.length
    state.account.error = ''
  } catch (error) {
    if (generation !== state.generation) return
    state.account.error = errorMessage(error)
    if (/登录|login/i.test(state.account.error)) state.account.connected = false
  }
  await save()
  notify()
}
const syncState = async(state: ProviderState) => {
  const generation = state.generation
  await exclusive(state, async() => { if (generation === state.generation) await refreshState(state, generation) })
}
const openLogin = async(id: PlatformId) => {
  const state = await getState(id)
  if (state.window && !state.window.isDestroyed()) { state.window.focus(); return snapshot() }
  const window = new BrowserWindow({
    title: `${state.provider.name} · 登录 LinkLine`,
    width: 1080,
    height: 760,
    minWidth: 780,
    minHeight: 600,
    autoHideMenuBar: true,
    webPreferences: { session: state.context.session, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  })
  state.window = window
  const generation = ++state.generation
  const loginStatus = { checking: false }
  let authenticated = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const checkLogin = async() => {
    if (loginStatus.checking || window.isDestroyed()) return
    loginStatus.checking = true
    try {
      await exclusive(state, async() => {
        if (generation !== state.generation || window.isDestroyed()) return
        if (!hasAuthentication(id, await state.context.cookies())) return
        const profile = await state.provider.profile(state.context)
        if (generation !== state.generation || window.isDestroyed()) return
        acceptProfile(state, profile)
        state.account.connected = true
        state.account.error = ''
        authenticated = true
        window.close()
        showWindow()
        notify()
        await refreshState(state, generation)
      })
    } catch (error) {
      if (generation === state.generation) {
        state.account.error = errorMessage(error)
        notify()
      }
    } finally { loginStatus.checking = false }
  }
  const onCookie = () => { clearTimeout(timer); timer = setTimeout(() => { void checkLogin() }, 1500) }
  state.context.session.cookies.on('changed', onCookie)
  window.webContents.on('did-finish-load', onCookie)
  window.webContents.on('will-navigate', (event, url) => { if (!canNavigateAccount(state.context.session, url)) event.preventDefault() })
  window.webContents.on('will-redirect', (event, url) => { if (!canNavigateAccount(state.context.session, url)) event.preventDefault() })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (canNavigateAccount(state.context.session, url)) void window.loadURL(url).catch(() => {})
    return { action: 'deny' }
  })
  const interval = setInterval(() => { void checkLogin() }, 5000)
  window.on('closed', () => {
    clearTimeout(timer)
    clearInterval(interval)
    state.context.session.cookies.removeListener('changed', onCookie)
    state.window = null
    // A successful login continues syncing after its window closes.
    if (!authenticated) ++state.generation
  })
  await window.loadURL(state.provider.loginUrl).catch(() => { state.account.error = '登录页面加载失败，请检查网络后重试'; notify() })
  return snapshot()
}

const setLike = async(track: LX.Music.MusicInfo, liked: boolean): Promise<PlatformLikeResult[]> => {
  await init()
  if (!track || typeof track.id !== 'string' || typeof track.name !== 'string' || typeof track.singer !== 'string' || !track.meta) throw new Error('无效的歌曲信息')
  const connected = [...states.values()].filter(state => state.account.connected)
  const offline: PlatformLikeResult[] = [...states.values()].filter(state => !state.account.connected && state.account.profile).map(state => ({ platform: state.provider.id, status: 'failed', message: '账号未连接，请重新登录后同步红心' }))
  const results = await Promise.all(connected.map(async(state): Promise<PlatformLikeResult> => exclusive(state, async() => {
    const platform = state.provider.id
    try {
      const profile = await state.provider.profile(state.context)
      acceptProfile(state, profile)
      await save()
      const source = platform === 'qq' ? 'tx' : 'wy'
      const cached = chooseMatch(track, state.tracks)
      const match = track.source === source ? { status: 'matched' as const, track: track as LX.Music.MusicInfoOnline } : cached.status === 'matched' ? cached : chooseMatch(track, await state.provider.search(state.context, track))
      if (match.status !== 'matched') { await save(); notify(); return { platform, status: match.status, message: match.status === 'ambiguous' ? '有多个同名版本，未自动操作' : '没有找到可确认的同版本歌曲' } }
      if (!await state.provider.available(state.context, match.track)) { await save(); notify(); return { platform, status: 'unavailable', message: '该平台暂无此歌曲版权' } }
      await state.provider.like(state.context, profile, match.track, liked)
      state.tracks = state.tracks.filter(item => item.id !== match.track.id)
      if (liked) state.tracks.unshift(match.track)
      state.account.count = state.tracks.length
      state.account.error = ''
      await save()
      notify()
      return { platform, status: 'success', message: liked ? '已加红心' : '已取消红心', track: match.track }
    } catch (error) {
      state.account.error = errorMessage(error)
      if (/登录|login/i.test(state.account.error)) state.account.connected = false
      await save()
      notify()
      return { platform, status: 'failed', message: state.account.error }
    }
  })))
  return [...results, ...offline]
}

export default () => {
  mainHandle<PlatformSnapshot>('platform_accounts_snapshot', async() => { await init(); return snapshot() })
  mainHandle<PlatformId, PlatformSnapshot>('platform_accounts_login', async({ params }) => openLogin(params))
  mainHandle<PlatformId | null, PlatformSnapshot>('platform_accounts_sync', async({ params }) => {
    await init()
    await Promise.all((params ? [await getState(params)] : [...states.values()]).map(syncState))
    return snapshot()
  })
  mainHandle<PlatformId, PlatformSnapshot>('platform_accounts_logout', async({ params }) => {
    const state = await getState(params)
    ++state.generation
    state.window?.close()
    await exclusive(state, async() => {
      await state.context.session.clearStorageData()
      state.account = { platform: state.provider.id, name: state.provider.name, connected: false, profile: null, lastSync: null, count: 0, error: '' }
      state.tracks = []
      await save()
      notify()
    })
    return snapshot()
  })
  mainHandle<{ track: LX.Music.MusicInfo, liked: boolean }, PlatformLikeResult[]>('platform_accounts_like', async({ params }) => setLike(params.track, Boolean(params.liked)))
}

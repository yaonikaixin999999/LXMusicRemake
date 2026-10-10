import { app, BrowserWindow, session } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { PlatformAccount, PlatformId, PlatformLikeResult, PlatformPlaylist, PlatformPlaylistDetail, PlatformSnapshot } from '@common/platformAccounts'
import { mainHandle } from '@common/mainIpc'
import { sendEvent, showWindow } from '@main/modules/winMain/main'
import { aggregateFavorites, chooseMatch } from './matching'
import { qqProvider } from './providers/qq'
import { neteaseProvider } from './providers/netease'
import { miguProvider } from './providers/migu'
import { bilibiliProvider } from './providers/bilibili'
import { kugouProvider } from './providers/kugou'
import { kuwoProvider } from './providers/kuwo'
import type { PlatformProvider, ProviderContext } from './providers/types'
import { canNavigateAccount, registerAccountSession } from './navigation'
import { createPlaybackResolver } from './playback'
import type { PlatformQuality, ResolvedPlatformStream } from '@common/platformPlayback'

interface ProviderState {
  provider: PlatformProvider
  context: ProviderContext
  account: PlatformAccount
  tracks: LX.Music.MusicInfoOnline[]
  playlists: Array<{ playlist: PlatformPlaylist, tracks: LX.Music.MusicInfoOnline[] }>
  window: BrowserWindow | null
  busy: Promise<unknown>
  generation: number
}
const providers = [qqProvider, neteaseProvider, kugouProvider, kuwoProvider, miguProvider, bilibiliProvider]
const states = new Map<PlatformId, ProviderState>()
let initialized: Promise<void> | undefined
let saveQueue = Promise.resolve()
const cachePath = () => path.join(app.getPath('userData'), 'platform-favorites.json')
const errorMessage = (error: unknown) => error instanceof Error ? error.message : '平台请求失败，请重试'
const hasAuthentication = (provider: PlatformProvider, cookies: Record<string, string>) => provider.authenticated?.(cookies) ?? Boolean(provider.id === 'qq' ? cookies.qqmusic_key || cookies.qm_keyst : provider.id === 'netease' ? cookies.MUSIC_U : Object.keys(cookies).length)
const playback = createPlaybackResolver(() => [...states.values()])
const snapshot = (): PlatformSnapshot => ({
  accounts: [...states.values()].map(state => ({ ...state.account })),
  favorites: aggregateFavorites([...states.values()].map(state => ({ platform: state.provider.id, tracks: state.tracks }))),
  playlists: [...states.values()].flatMap(state => state.playlists.map(item => ({ ...item.playlist }))),
})
const notify = () => sendEvent('platform_accounts_changed', snapshot())
const save = async() => {
  const data = JSON.stringify([...states.values()].map(state => ({ platform: state.provider.id, profile: state.account.profile, lastSync: state.account.lastSync, tracks: state.tracks, playlists: state.playlists })))
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
        account: { platform: provider.id, name: provider.name, connected: false, profile: null, lastSync: null, count: 0, error: '', canSync: !provider.webOnly && provider.syncSupported !== false, notice: provider.notice ?? '' },
        tracks: [],
        playlists: [],
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
          if (Array.isArray(item.playlists) && state.account.profile) {
            state.playlists = item.playlists.filter((entry: any) => {
              const playlist = entry?.playlist
              return playlist && playlist.platform === state.provider.id && playlist.ownerId === state.account.profile?.id && typeof playlist.remoteId === 'string' && playlist.id === `${state.provider.id}:${playlist.remoteId}` && typeof playlist.name === 'string' && Array.isArray(entry.tracks)
            }).map((entry: any) => ({
              playlist: { ...entry.playlist, loaded: Boolean(entry.playlist.loaded), count: Math.max(0, Number(entry.playlist.count) || 0), lastSync: typeof entry.playlist.lastSync === 'number' ? entry.playlist.lastSync : null },
              tracks: entry.tracks.filter((track: any) => track && typeof track.id === 'string' && typeof track.name === 'string' && typeof track.singer === 'string' && track.meta && typeof track.meta.songId !== 'undefined'),
            }))
          }
          state.account.lastSync = typeof item.lastSync === 'number' ? item.lastSync : null
          state.account.count = state.tracks.length
        }
      }
    } catch {}
    await Promise.all([...states.values()].map(async(state) => {
      try {
        const cookies = await state.context.cookies()
        if (state.provider.webOnly === true || !hasAuthentication(state.provider, cookies)) return
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
    state.playlists = []
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
    const [favorites, playlists] = await Promise.allSettled([
      state.provider.likes(state.context, profile),
      state.provider.playlists?.(state.context, profile) ?? Promise.resolve(null),
    ])
    if (generation !== state.generation) return
    if (favorites.status === 'fulfilled') {
      state.tracks = favorites.value
      state.account.lastSync = Date.now()
    }
    if (playlists.status === 'fulfilled' && playlists.value) {
      state.playlists = playlists.value.filter(playlist => playlist.platform === state.provider.id && playlist.ownerId === profile.id).map(playlist => {
        const previous = state.playlists.find(item => item.playlist.id === playlist.id && item.playlist.ownerId === profile.id)
        return { playlist: { ...playlist, loaded: false, lastSync: previous?.playlist.lastSync ?? null }, tracks: previous?.tracks ?? [] }
      })
    }
    state.account.count = state.tracks.length
    state.account.error = [favorites, playlists].flatMap(result => result.status === 'rejected' ? [errorMessage(result.reason)] : []).join('；')
    if (/登录|login/i.test(state.account.error)) state.account.connected = false
  } catch (error) {
    if (generation !== state.generation) return
    state.account.error = errorMessage(error)
    if (/登录|login/i.test(state.account.error)) state.account.connected = false
  }
  await save()
  notify()
}
const syncState = async(state: ProviderState) => {
  if (state.account.canSync === false) return
  const generation = state.generation
  await exclusive(state, async() => { if (generation === state.generation) await refreshState(state, generation) })
}

const getPlaylist = async(params: { id: string, refresh?: boolean }): Promise<PlatformPlaylistDetail> => {
  await init()
  if (!params || typeof params.id !== 'string') throw new Error('无效的平台歌单')
  const state = [...states.values()].find(item => item.playlists.some(entry => entry.playlist.id === params.id))
  if (!state) throw new Error('歌单不存在，请先同步平台歌单')
  const generation = state.generation
  return exclusive(state, async() => {
    if (generation !== state.generation) throw new Error('平台账号已更改，请重新打开歌单')
    try {
      if (state.account.connected) {
        const profile = await state.provider.profile(state.context)
        if (generation !== state.generation) throw new Error('平台账号已更改，请重新打开歌单')
        acceptProfile(state, profile)
      }
      const entry = state.playlists.find(item => item.playlist.id === params.id && item.playlist.ownerId === state.account.profile?.id)
      if (!entry) throw new Error('歌单不属于当前账号，请重新同步')
      if (!params.refresh && entry.playlist.loaded) return { ...entry, cached: true }
      if (!state.account.connected) {
        if (entry.playlist.lastSync != null && !params.refresh) return { ...entry, cached: true }
        throw new Error('请重新登录平台后加载此歌单')
      }
      if (!state.provider.playlistTracks) throw new Error('此平台暂不支持读取歌单')
      const profile = state.account.profile
      if (!profile) throw new Error('请重新登录平台后加载此歌单')
      const tracks = await state.provider.playlistTracks(state.context, profile, entry.playlist)
      if (generation !== state.generation) throw new Error('平台账号已更改，请重新打开歌单')
      entry.tracks = tracks
      entry.playlist = { ...entry.playlist, count: tracks.length, loaded: true, lastSync: Date.now() }
      await save()
      notify()
      return { ...entry, cached: false }
    } catch (error) {
      await save()
      notify()
      throw error
    }
  })
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
    if (state.provider.webOnly === true || loginStatus.checking || window.isDestroyed()) return
    loginStatus.checking = true
    try {
      await exclusive(state, async() => {
        if (generation !== state.generation || window.isDestroyed()) return
        if (!hasAuthentication(state.provider, await state.context.cookies())) return
        const profile = await state.provider.profile(state.context)
        if (generation !== state.generation || window.isDestroyed()) return
        acceptProfile(state, profile)
        state.account.connected = true
        state.account.error = ''
        authenticated = true
        window.close()
        showWindow()
        notify()
        if (state.account.canSync !== false) await refreshState(state, generation)
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
  const connected = [...states.values()].filter(state => state.account.connected && state.account.canSync !== false)
  const offline: PlatformLikeResult[] = [...states.values()].filter(state => (!state.account.connected || state.account.canSync === false) && state.account.profile).map(state => ({ platform: state.provider.id, status: 'failed', message: state.account.canSync === false ? state.account.notice || '平台未提供网页收藏同步接口' : '账号未连接，请重新登录后同步红心' }))
  const results = await Promise.all(connected.map(async(state): Promise<PlatformLikeResult> => exclusive(state, async() => {
    const platform = state.provider.id
    try {
      const profile = await state.provider.profile(state.context)
      acceptProfile(state, profile)
      await save()
      const source = state.provider.source
      const cached = chooseMatch(track, state.tracks)
      const match = track.source === source ? { status: 'matched' as const, track } : cached.status === 'matched' ? cached : chooseMatch(track, await state.provider.search(state.context, track))
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

const getMusicUrl = async(params: { source: LX.OnlineSource, songId: string | number, mediaMid?: string, albumId?: string, id?: number, quality?: PlatformQuality }) => {
  await init()
  const state = [...states.values()].find(state => state.provider.source === params.source)
  if (!state) throw new Error('此平台暂不支持直接播放')
  if (!state.provider.musicUrl) throw new Error(`${state.provider.name}暂不支持直接播放`)
  const songId = String(params.songId ?? '')
  if (!songId) throw new Error('歌曲缺少平台 ID')
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const track = {
    id: `${params.source}_${songId}`,
    source: params.source,
    name: '',
    singer: '',
    interval: null,
    meta: { songId, albumName: '', qualitys: [], _qualitys: {}, strMediaMid: params.mediaMid ?? '', albumId: params.albumId ?? '', id: params.id },
  } as LX.Music.MusicInfoOnline
  return state.provider.musicUrl(state.context, track, params.quality ?? '128k')
}

export default () => {
  mainHandle<{ track: LX.Music.MusicInfoOnline, quality?: PlatformQuality, isRefresh?: boolean, allowToggleSource?: boolean }, ResolvedPlatformStream>('platform_playback_resolve', async({ params }) => {
    await init()
    return playback.resolve(params.track, params.quality ?? 'auto', Boolean(params.isRefresh), params.allowToggleSource !== false)
  })
  mainHandle<LX.Music.MusicInfoOnline, PlatformQuality[]>('platform_playback_qualitys', async({ params }) => { await init(); return playback.qualitys(params) })
  mainHandle<PlatformSnapshot>('platform_accounts_snapshot', async() => { await init(); return snapshot() })
  mainHandle<PlatformId, PlatformSnapshot>('platform_accounts_login', async({ params }) => openLogin(params))
  mainHandle<PlatformId | null, PlatformSnapshot>('platform_accounts_sync', async({ params }) => {
    await init()
    await Promise.all((params ? [await getState(params)] : [...states.values()].filter(state => state.account.connected || state.account.profile != null)).map(syncState))
    return snapshot()
  })
  mainHandle<{ id: string, refresh?: boolean }, PlatformPlaylistDetail>('platform_accounts_playlist', async({ params }) => getPlaylist(params))
  mainHandle<PlatformId, PlatformSnapshot>('platform_accounts_logout', async({ params }) => {
    const state = await getState(params)
    ++state.generation
    state.window?.close()
    await exclusive(state, async() => {
      await state.provider.logout?.(state.context)
      await state.context.session.clearStorageData()
      state.account = { platform: state.provider.id, name: state.provider.name, connected: false, profile: null, lastSync: null, count: 0, error: '', canSync: !state.provider.webOnly && state.provider.syncSupported !== false, notice: state.provider.notice ?? '' }
      state.tracks = []
      state.playlists = []
      await save()
      notify()
    })
    return snapshot()
  })
  mainHandle<{ track: LX.Music.MusicInfo, liked: boolean }, PlatformLikeResult[]>('platform_accounts_like', async({ params }) => setLike(params.track, Boolean(params.liked)))
  mainHandle<{ source: LX.OnlineSource, songId: string | number, mediaMid?: string, albumId?: string, id?: number, quality?: PlatformQuality }, { url: string, type: LX.Quality }>('platform_accounts_music_url', async({ params }) => getMusicUrl(params))
}

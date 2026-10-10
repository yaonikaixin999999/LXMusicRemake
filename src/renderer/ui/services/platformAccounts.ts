import { ipcRenderer } from 'electron'
import { computed, ref, shallowRef } from 'vue'
import type { PlatformId, PlatformLikeResult, PlatformPlaylistDetail, PlatformSnapshot } from '@common/platformAccounts'
import { platformNames } from '@common/platformAccounts'
import { sameRecording } from '@common/platformMatching'
import { addListMusics, getListMusics, removeListMusics } from '@renderer/store/list/action'
import { loveList } from '@renderer/store/list/state'

const importedKey = 'linkline.platform-favorites.imported.v1'
const imported = new Set<string>()
try {
  const saved: unknown = JSON.parse(localStorage.getItem(importedKey) ?? '[]')
  if (Array.isArray(saved)) for (const id of saved) if (typeof id === 'string') imported.add(id)
} catch {}

export const platformSnapshot = shallowRef<PlatformSnapshot>({ accounts: [], favorites: [] })
export const platformLoading = ref(false)
export const platformError = ref('')
export const platformBusy = ref(new Set<PlatformId>())
export const favoriteTracks = ref<LX.Music.MusicInfo[]>([])
export const favoritePending = ref(new Set<string>())
export const favoriteNotice = ref<{ title: string, results: PlatformLikeResult[], error: string, pending: boolean, localUpdated: boolean } | null>(null)
export const connectedPlatforms = computed(() => platformSnapshot.value.accounts.filter(account => account.connected))
export const platformPlaylists = computed(() => platformSnapshot.value.playlists ?? [])
export async function loadPlatformPlaylist(id: string, refresh = false): Promise<PlatformPlaylistDetail> {
  return ipcRenderer.invoke('platform_accounts_playlist', { id, refresh })
}

let initialized: Promise<void> | null = null
let stopped = false
let snapshotReady = false
let writing = 0
let queue = Promise.resolve()
const persistImported = () => { localStorage.setItem(importedKey, JSON.stringify([...imported])) }
const describeError = (error: unknown) => error instanceof Error ? error.message : '操作失败，请稍后重试。'
const importKey = (track: LX.Music.MusicInfo) => `${track.source}:${track.id}`
const enqueue = async<T>(task: () => Promise<T>): Promise<T> => {
  const next = queue.then(task)
  queue = next.then(() => {}, () => {})
  return next
}

export const refreshFavorites = async() => { favoriteTracks.value = [...await getListMusics(loveList.id)] }
export const isFavorite = (track: LX.Music.MusicInfo | null) => Boolean(track && favoriteTracks.value.some(item => sameRecording(track, item)))

async function mergePlatformFavorites() {
  if (!snapshotReady) return
  const snapshot = platformSnapshot.value
  const saved = [...await getListMusics(loveList.id)]
  const remote = snapshot.favorites.map(item => item.track)
  const removed = saved.filter(item => imported.has(importKey(item)) && !remote.some(track => sameRecording(item, track)))
  if (removed.length) {
    await removeListMusics({ listId: loveList.id, ids: removed.map(item => item.id) })
    for (const item of removed) imported.delete(importKey(item))
  }
  const ready = saved.filter(item => !removed.some(track => track.id === item.id))
  const missing: LX.Music.MusicInfoOnline[] = []
  for (const track of remote) {
    if (ready.some(item => sameRecording(item, track)) || missing.some(item => sameRecording(item, track))) continue
    missing.push(track)
  }
  if (missing.length) {
    await addListMusics(loveList.id, missing)
    for (const track of missing) imported.add(importKey(track))
  }
  for (const id of imported) if (!ready.some(track => importKey(track) === id) && !missing.some(track => importKey(track) === id)) imported.delete(id)
  persistImported()
  favoriteTracks.value = [...ready, ...missing]
}

function acceptSnapshot(snapshot: PlatformSnapshot) {
  if (stopped) return
  platformSnapshot.value = snapshot
  snapshotReady = true
  if (!writing) void enqueue(mergePlatformFavorites).catch(error => { platformError.value = describeError(error) })
}
const onSnapshot = (_event: Electron.IpcRendererEvent, snapshot: PlatformSnapshot) => { acceptSnapshot(snapshot) }
const onListUpdate = (ids: string[]) => { if (ids.includes(loveList.id)) void refreshFavorites().catch(() => {}) }

export async function initializePlatformAccounts(): Promise<void> {
  if (initialized) return initialized
  stopped = false
  platformLoading.value = true
  ipcRenderer.on('platform_accounts_changed', onSnapshot)
  window.app_event.on('myListUpdate', onListUpdate)
  initialized = (async() => {
    try {
      await refreshFavorites()
      acceptSnapshot(await ipcRenderer.invoke('platform_accounts_snapshot'))
      await queue
    } catch (error) { platformError.value = describeError(error) } finally { platformLoading.value = false }
  })()
  return initialized
}

export function disposePlatformAccounts() {
  stopped = true
  ipcRenderer.removeListener('platform_accounts_changed', onSnapshot)
  window.app_event.off('myListUpdate', onListUpdate)
  initialized = null
}

async function accountAction(channel: string, platform: PlatformId | null) {
  const ids = platform ? [platform] : platformSnapshot.value.accounts.map(account => account.platform)
  if (ids.some(id => platformBusy.value.has(id))) return
  platformBusy.value = new Set([...platformBusy.value, ...ids])
  platformError.value = ''
  try {
    acceptSnapshot(await ipcRenderer.invoke(channel, platform))
    await queue
  } catch (error) { platformError.value = describeError(error) } finally { platformBusy.value = new Set([...platformBusy.value].filter(id => !ids.includes(id))) }
}
export const loginPlatform = async(platform: PlatformId) => accountAction('platform_accounts_login', platform)
export const syncPlatforms = async(platform: PlatformId | null = null) => accountAction('platform_accounts_sync', platform)
export const logoutPlatform = async(platform: PlatformId) => accountAction('platform_accounts_logout', platform)

export async function setFavorite(track: LX.Music.MusicInfo, liked: boolean): Promise<PlatformLikeResult[]> {
  // Music records are JSON data; detach nested Vue proxies before Electron IPC.
  const info: LX.Music.MusicInfo = JSON.parse(JSON.stringify(track))
  favoritePending.value = new Set([...favoritePending.value, info.id])
  return enqueue(async() => {
    writing++
    const notice = { title: `${liked ? '收藏' : '取消收藏'} · ${info.name}`, results: [] as PlatformLikeResult[], error: '', pending: true, localUpdated: false }
    favoriteNotice.value = notice
    try {
      const saved = [...await getListMusics(loveList.id)]
      const equivalent = saved.filter(item => sameRecording(item, info))
      if (liked) {
        if (!equivalent.length) await addListMusics(loveList.id, [info])
        for (const item of equivalent) imported.delete(importKey(item))
      } else if (equivalent.length) {
        await removeListMusics({ listId: loveList.id, ids: equivalent.map(item => item.id) })
        for (const item of equivalent) imported.delete(importKey(item))
      }
      persistImported()
      await refreshFavorites()
      notice.localUpdated = true
      const results = await ipcRenderer.invoke('platform_accounts_like', { track: info, liked }) as PlatformLikeResult[]
      notice.results = results
      return results
    } catch (error) {
      notice.error = describeError(error)
      throw error
    } finally {
      writing--
      notice.pending = false
      favoriteNotice.value = { ...notice }
      favoritePending.value = new Set([...favoritePending.value].filter(id => id !== info.id))
      await mergePlatformFavorites().catch(error => { platformError.value = describeError(error) })
    }
  })
}

export async function setFavorites(tracks: LX.Music.MusicInfo[], liked: boolean) {
  const unique: LX.Music.MusicInfo[] = []
  for (const track of tracks) if (!unique.some(item => sameRecording(item, track))) unique.push(track)
  const results: PlatformLikeResult[] = []
  const errors: string[] = []
  for (const track of unique) {
    try { results.push(...await setFavorite(track, liked)) } catch (error) { errors.push(`${track.name}：${describeError(error)}`) }
  }
  if (unique.length > 1) {
    const summary: PlatformLikeResult[] = []
    for (const platform of Object.keys(platformNames) as PlatformId[]) {
      const items = results.filter(item => item.platform === platform)
      if (!items.length) continue
      const counts = (['success', 'unavailable', 'unmatched', 'ambiguous', 'failed'] as const).map(status => ({ status, count: items.filter(item => item.status === status).length })).filter(item => item.count)
      const labels = { success: liked ? '加心' : '取消', unavailable: '无版权', unmatched: '无匹配', ambiguous: '版本待确认', failed: '失败' }
      summary.push({ platform, status: counts.some(item => item.status !== 'success') ? 'failed' : 'success', message: counts.map(item => `${labels[item.status]} ${item.count} 首`).join(' · ') })
    }
    favoriteNotice.value = { title: `${liked ? '收藏' : '取消收藏'} · ${unique.length} 首歌曲`, results: summary, error: errors.join('；'), pending: false, localUpdated: !errors.length }
  }
}

export const requestFavorite = (track: LX.Music.MusicInfo, liked: boolean) => { void setFavorite(track, liked).catch(() => {}) }
export const platformName = (platform: PlatformId) => platformNames[platform] ?? platform

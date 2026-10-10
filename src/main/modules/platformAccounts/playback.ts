import { chooseMatch } from '@common/platformMatching'
import type { PlatformAccount } from '@common/platformAccounts'
import type { PlatformQuality, PlatformStream, ResolvedPlatformStream } from '@common/platformPlayback'
import type { PlatformProvider, ProviderContext } from './providers/types'

export interface PlaybackState {
  provider: PlatformProvider
  context: ProviderContext
  account: PlatformAccount
  tracks: LX.Music.MusicInfoOnline[]
  generation: number
}

export const createPlaybackResolver = (getStates: () => PlaybackState[]) => {
  const cache = new Map<string, { stream: ResolvedPlatformStream, until: number }>()
  const pending = new Map<string, Promise<PlatformStream>>()
  const streamFor = async(state: PlaybackState, track: LX.Music.MusicInfoOnline, quality: PlatformQuality, refresh: boolean): Promise<ResolvedPlatformStream> => {
    const generation = state.generation
    const key = `${state.provider.id}:${generation}:${state.account.profile?.id ?? ''}:${track.id}:${quality}`
    const saved = cache.get(key)
    if (!refresh && saved && saved.until > Date.now()) return saved.stream
    if (!state.provider.musicUrl) throw new Error('平台未提供播放接口')
    let request = pending.get(key)
    if (!request) {
      request = state.provider.musicUrl(state.context, track, quality)
      pending.set(key, request)
    }
    let stream: PlatformStream
    try { stream = await request } finally { if (pending.get(key) === request) pending.delete(key) }
    if (state.generation !== generation) throw new Error('平台账号已更改，请重新播放')
    if (!/^https?:\/\//.test(stream.url)) throw new Error('平台未返回有效播放地址')
    const resolved = { ...stream, platform: state.provider.name, musicInfo: track }
    if (cache.size > 100) cache.clear()
    cache.set(key, { stream: resolved, until: Date.now() + Math.max(0, Math.min(300, (stream.expires ?? 300) - 30)) * 1000 })
    return resolved
  }
  const validate = (track: LX.Music.MusicInfoOnline) => {
    if (!track || typeof track.id !== 'string' || typeof track.name !== 'string' || typeof track.singer !== 'string' || track.meta?.songId == null) throw new Error('无效的歌曲信息')
  }
  const resolve = async(track: LX.Music.MusicInfoOnline, quality: PlatformQuality = 'auto', refresh = false, allowToggleSource = true): Promise<ResolvedPlatformStream> => {
    validate(track)
    const states = getStates().filter(state => state.provider.musicUrl)
    const original = states.find(state => state.provider.source === track.source)
    const errors: string[] = []
    if (original) {
      try { return await streamFor(original, track, quality, refresh) } catch (error) { errors.push(`${original.provider.name}：${error instanceof Error ? error.message : '无法播放'}`) }
    }
    if (allowToggleSource) {
      const alternatives = states.filter(state => state !== original).sort((a, b) => Number(b.account.connected) - Number(a.account.connected))
      for (const state of alternatives) {
        const generation = state.generation
        try {
          let matched = chooseMatch(track, state.tracks)
          if (matched.status !== 'matched') matched = chooseMatch(track, await state.provider.search(state.context, track))
          if (state.generation !== generation || matched.status !== 'matched') continue
          return await streamFor(state, matched.track, quality, refresh)
        } catch (error) { errors.push(`${state.provider.name}：${error instanceof Error ? error.message : '无法播放'}`) }
      }
    }
    throw new Error(errors.length ? errors.join('；') : '没有找到有播放权限的同版本歌曲，请登录平台或检查播放权限')
  }
  const qualitys = async(track: LX.Music.MusicInfoOnline): Promise<PlatformQuality[]> => {
    validate(track)
    const state = getStates().find(state => state.provider.source === track.source)
    if (state?.provider.musicQualitys) return state.provider.musicQualitys(state.context, track)
    return Object.keys(track.meta._qualitys ?? {}) as PlatformQuality[]
  }
  return { resolve, qualitys }
}

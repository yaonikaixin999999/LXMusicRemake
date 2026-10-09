import type { PlatformFavorite, PlatformId } from './platformAccounts'

const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
const singers = (text: string) => text.split(/\s*[、/&;,，]\s*/).map(normalize).filter(Boolean).sort().join('|')
const seconds = (track: LX.Music.MusicInfo) => {
  const parts = (track.interval ?? '').split(':').map(Number)
  return parts.length === 2 && parts.every(Number.isFinite) ? parts[0] * 60 + parts[1] : 0
}

export const recordingKey = (track: LX.Music.MusicInfo) => `${normalize(track.name)}::${singers(track.singer)}`
export const sameRecording = (first: LX.Music.MusicInfo, second: LX.Music.MusicInfo) => {
  if (first.source === second.source && first.id === second.id) return true
  if (recordingKey(first) !== recordingKey(second)) return false
  const durationA = seconds(first)
  const durationB = seconds(second)
  return durationA > 0 && durationB > 0 ? Math.abs(durationA - durationB) <= 3 : normalize(first.meta.albumName) === normalize(second.meta.albumName) && Boolean(first.meta.albumName)
}

export const chooseMatch = (track: LX.Music.MusicInfo, candidates: LX.Music.MusicInfoOnline[]): { status: 'matched', track: LX.Music.MusicInfoOnline } | { status: 'unmatched' | 'ambiguous' } => {
  const unique = [...new Map(candidates.map(item => [item.id, item])).values()]
  let matches = unique.filter(item => sameRecording(track, item))
  if (!matches.length) return { status: 'unmatched' }
  if (matches.length > 1 && track.meta.albumName) {
    const albumMatches = matches.filter(item => normalize(item.meta.albumName) === normalize(track.meta.albumName))
    if (albumMatches.length) matches = albumMatches
  }
  return matches.length === 1 ? { status: 'matched', track: matches[0] } : { status: 'ambiguous' }
}

export const aggregateFavorites = (collections: Array<{ platform: PlatformId, tracks: LX.Music.MusicInfoOnline[] }>): PlatformFavorite[] => {
  const result: PlatformFavorite[] = []
  const groups = new Map<string, PlatformFavorite[]>()
  for (const collection of collections) {
    for (const track of collection.tracks) {
      const key = recordingKey(track)
      const group = groups.get(key) ?? []
      const existing = group.find(item => sameRecording(item.track, track))
      if (existing) {
        if (!existing.platforms.some(item => item.platform === collection.platform && item.track.id === track.id)) existing.platforms.push({ platform: collection.platform, track })
      } else {
        const item = { key: `${key}::${track.id}`, track, platforms: [{ platform: collection.platform, track }] }
        group.push(item)
        groups.set(key, group)
        result.push(item)
      }
    }
  }
  return result
}

import { LIST_IDS } from '@common/constants'
import { addListMusics, getListMusics } from '@renderer/store/list/action'
import { playList } from '@renderer/core/player/action'

export const playTracks = async(tracks: LX.Music.MusicInfo[], index = 0, listId?: string) => {
  const track = tracks[index]
  if (!track) throw new Error('没有可播放的歌曲。')
  const targetId = listId ?? LIST_IDS.DEFAULT
  const saved = await getListMusics(targetId)
  const missing = tracks.filter(item => !saved.some(existing => existing.id === item.id))
  if (missing.length) await addListMusics(targetId, missing)
  const ready = await getListMusics(targetId)
  const position = ready.findIndex(item => item.id === track.id)
  if (position < 0) throw new Error('无法读取播放列表，请重试。')
  playList(targetId, position)
}

export const playTrack = async(track: LX.Music.MusicInfo, listId?: string) => {
  await playTracks([track], 0, listId)
}

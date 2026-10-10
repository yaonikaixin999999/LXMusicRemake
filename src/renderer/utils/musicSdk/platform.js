import { ipcRenderer } from 'electron'

export const getPlatformMusicUrl = (source, songInfo, type) => {
  return ipcRenderer.invoke('platform_accounts_music_url', {
    source,
    songId: songInfo.songmid,
    mediaMid: songInfo.strMediaMid,
    albumId: songInfo.albumId,
    id: songInfo.id,
    quality: type,
  })
}

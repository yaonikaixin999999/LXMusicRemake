import { getPlatformMusicUrl } from '../platform'

const unavailable = (..._args) => Promise.reject(new Error('哔哩哔哩收藏请在平台账号中同步，再从音乐库打开。'))

// Bilibili favorites are video recordings, with their real platform identity.
export default {
  // Do not advertise this adapter in discovery's music.sources list.
  hotSearch: {
    /** @returns {Promise<{source: string, list: string[]}>} */
    getList: unavailable,
  },
  musicSearch: { search: unavailable },
  leaderboard: { getBoards: unavailable, getList: unavailable },
  songList: { sortList: [], getTags: unavailable, getList: unavailable, getListDetail: unavailable, search: unavailable },
  getMusicUrl(songInfo, type) { return { promise: getPlatformMusicUrl('bi', songInfo, type) } },
  getLyric() { return { promise: Promise.resolve({ lyric: '', tlyric: '', rlyric: '', lxlyric: '' }) } },
  getPic(songInfo) { return Promise.resolve(songInfo.img || '') },
  getMusicDetailPageUrl(songInfo) { return `https://www.bilibili.com/video/${encodeURIComponent(songInfo.songmid)}` },
}

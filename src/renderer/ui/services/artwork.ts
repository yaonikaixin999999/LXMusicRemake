import { getPicUrl } from '@renderer/core/music/online'

const cache = new Map<string, Promise<string>>()
const queue: Array<() => void> = []
let active = 0
function drain() {
  const available = Math.min(4 - active, queue.length)
  for (let index = 0; index < available; index++) queue.shift()?.()
}
export async function resolveArtwork(track: LX.Music.MusicInfo, listId?: string | null, refresh = false): Promise<string> {
  if (track.meta.picUrl && !refresh) return Promise.resolve(track.meta.picUrl)
  const key = `${track.source}:${track.id}:${refresh ? 'refresh' : 'normal'}`
  let request = cache.get(key)
  if (request) return request
  request = new Promise<string>(resolve => {
    queue.push(() => {
      active++
      const task = track.source === 'local'
        ? window.lx.worker.main.getMusicFilePic(track.meta.filePath)
        : getPicUrl({ musicInfo: track, listId, isRefresh: refresh, allowToggleSource: false })
      void task.then(url => {
        resolve(typeof url === 'string' ? url : '')
      }).catch(() => { resolve('') }).finally(() => { active--; drain() })
    })
    drain()
  })
  cache.set(key, request)
  // Bound cached promises when browsing many search pages.
  if (cache.size > 500) cache.delete(cache.keys().next().value!)
  return request
}

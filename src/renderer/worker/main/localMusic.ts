import { LocalAudioScanner } from '@common/utils/localAudioScan'
import { createLocalMusicInfo } from '@renderer/utils/music'

const scanners = new Map<string, LocalAudioScanner>()
let scanIndex = 0

export const startLocalAudioScan = (paths: string[], excludedPaths: string[]) => {
  const id = `local_scan_${++scanIndex}`
  scanners.set(id, new LocalAudioScanner(paths, excludedPaths))
  return id
}

export const nextLocalAudioScan = async(id: string) => {
  const scanner = scanners.get(id)
  if (!scanner) throw new Error('本地音乐扫描已结束，请重新选择文件或文件夹。')
  const batch = await scanner.next()
  if (batch.done) { await scanner.close(); scanners.delete(id) }
  return batch
}

export const cancelLocalAudioScan = async(id: string) => {
  const scanner = scanners.get(id)
  if (scanner) { await scanner.close(); scanners.delete(id) }
}

export const createLocalMusicInfosDetailed = async(paths: string[]) => {
  const tracks: LX.Music.MusicInfoLocal[] = []
  let failed = 0
  const errors: string[] = []
  for (const filePath of paths) {
    try {
      const track = await createLocalMusicInfo(filePath)
      if (!track) throw new Error('无法读取音频信息')
      tracks.push(track)
    } catch {
      failed++
      if (errors.length < 5) errors.push(filePath)
    }
  }
  return { tracks, failed, errors }
}

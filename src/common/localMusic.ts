/** A normal user playlist keeps the local library compatible with backup and playback. */
export const LOCAL_LIBRARY_ID = 'userlist_linkline_local'
export const LOCAL_AUDIO_EXTENSIONS = ['mp3', 'flac', 'ogg', 'oga', 'opus', 'wav', 'm4a', 'aac', 'ape', 'aiff', 'aif', 'wma'] as const

export interface LocalAudioScanProgress {
  discovered: number
  skipped: number
  failed: number
  scanned: number
  directory: string
  errors: string[]
}

export interface LocalAudioScanBatch extends LocalAudioScanProgress {
  files: string[]
  done: boolean
}

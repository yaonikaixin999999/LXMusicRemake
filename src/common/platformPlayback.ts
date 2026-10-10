export type PlatformQuality = LX.Quality | 'auto' | '64k' | 'dolby' | 'jyeffect' | 'sky' | 'jymaster'

export const qualityLabels: Record<PlatformQuality, string> = {
  auto: '账号最高音质',
  '64k': '基础 · 64K',
  dolby: '杜比音频',
  '128k': '标准 · 128K',
  '192k': '较高 · 192K',
  '320k': '极高 · 320K',
  flac: '无损 · FLAC',
  flac24bit: 'Hi-Res · 24bit',
  jyeffect: '高清环绕声',
  sky: '沉浸环绕声',
  jymaster: '超清母带',
  ape: '无损 · APE',
  wav: '无损 · WAV',
}

export const isPlatformQuality = (value: unknown): value is PlatformQuality => typeof value === 'string' && Object.prototype.hasOwnProperty.call(qualityLabels, value)

export interface PlatformStream {
  url: string
  type: LX.Quality
  quality?: PlatformQuality
  expires?: number
  bitrate?: number
  sampleRate?: number
  bitDepth?: number
}

export interface ResolvedPlatformStream extends PlatformStream {
  platform: string
  musicInfo: LX.Music.MusicInfoOnline
}

export const legacyQuality = (quality: PlatformQuality): LX.Quality => {
  if (quality === '64k') return '128k'
  if (quality === 'dolby') return '192k'
  return ['auto', 'jyeffect', 'sky', 'jymaster'].includes(quality) ? 'flac24bit' : quality as LX.Quality
}

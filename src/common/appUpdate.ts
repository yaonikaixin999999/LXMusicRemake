export const LINKLINE_REPOSITORY = 'https://github.com/yaonikaixin999999/LXMusicRemake'
export const LINKLINE_RELEASES_URL = `${LINKLINE_REPOSITORY}/releases`
export const LINKLINE_UPDATE_CHECK = 'linkline_update_check'
export const LINKLINE_UPDATE_MANIFEST = 'https://raw.githubusercontent.com/yaonikaixin999999/LXMusicRemake/main/updates/stable.json'
export const LINKLINE_DOWNLOAD_MIRROR = 'https://gh-proxy.com/'
export const LINKLINE_BACKUP_MIRROR = 'https://ghfast.top/'

export type UpdateSource = 'github' | 'mirror'
export const UPDATE_SOURCES: Readonly<Record<UpdateSource, { label: string, description: string }>> = {
  github: { label: 'GitHub 官方', description: '从 LinkLine 的 GitHub 仓库检查版本并下载。' },
  mirror: { label: '国内加速（第三方）', description: '通过 GH-Proxy / GHFast 读取 LinkLine 的更新信息，使用第三方加速下载安装包。' },
}

export const isUpdateSource = (value: unknown): value is UpdateSource => value === 'github' || value === 'mirror'

/** Only LinkLine's own published release files can be sent through a mirror. */
export const releaseAssetDownloadUrl = (value: unknown, source: UpdateSource): string | null => {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash || !/^\/yaonikaixin999999\/LXMusicRemake\/releases\/download\/[^/]+\/[^/]+$/.test(url.pathname)) return null
    return source === 'mirror' ? `${LINKLINE_DOWNLOAD_MIRROR}${url.href}` : url.href
  } catch { return null }
}

export interface AppReleaseAsset {
  name: string
  url: string
  size: number
  sha256?: string
  downloadUrl?: string
}

export interface AppRelease {
  version: string
  name: string
  body: string
  publishedAt: string
  pageUrl: string
  assets: AppReleaseAsset[]
}

export interface UpdateCheckRequest {
  force?: boolean
  source?: UpdateSource
}

export interface UpdateCheckResult {
  status: 'latest' | 'available' | 'unpublished' | 'error'
  currentVersion: string
  latestRelease: AppRelease | null
  history: AppRelease[]
  checkedAt: number
  source: UpdateSource
  requestedSource: UpdateSource
  usedFallback: boolean
  sourceLabel: string
  error: string | null
}

export interface UpdateManifest {
  schemaVersion: 1
  repository: typeof LINKLINE_REPOSITORY
  releases: AppRelease[]
}

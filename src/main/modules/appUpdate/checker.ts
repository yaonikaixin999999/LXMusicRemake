import { LINKLINE_BACKUP_MIRROR, LINKLINE_DOWNLOAD_MIRROR, LINKLINE_RELEASES_URL, LINKLINE_REPOSITORY, LINKLINE_UPDATE_MANIFEST, UPDATE_SOURCES, isUpdateSource, releaseAssetDownloadUrl, type AppRelease, type AppReleaseAsset, type UpdateCheckRequest, type UpdateCheckResult, type UpdateSource } from '@common/appUpdate'

export const RELEASES_API_URL = 'https://api.github.com/repos/yaonikaixin999999/LinkLine/releases?per_page=100'
export const RELEASES_FEED_URL = `${LINKLINE_RELEASES_URL}.atom`
const CACHE_TTL = 60_000
const HISTORY_LIMIT = 20
const MAX_BODY_LENGTH = 64_000
const CHECK_TIMEOUT = 25_000

interface Version {
  parts: number[]
  prerelease: string[]
  text: string
}

const parseVersion = (value: string): Version | null => {
  if (value.length > 128) return null
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/.exec(value.trim())
  if (!match) return null
  const parts = match.slice(1, 4).map(Number)
  const prerelease = match[4]?.split('.') ?? []
  if (parts.some(part => !Number.isSafeInteger(part)) || prerelease.some(part => /^\d+$/.test(part) && (part.length > 1 && part[0] === '0'))) return null
  return { parts, prerelease, text: value.trim().replace(/^v/, '') }
}

export const compareVersions = (left: string, right: string): number | null => {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (!a || !b) return null
  for (let index = 0; index < 3; index++) {
    if (a.parts[index] !== b.parts[index]) return a.parts[index] > b.parts[index] ? 1 : -1
  }
  if (!a.prerelease.length || !b.prerelease.length) return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length ? -1 : 1
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
    const x = a.prerelease[index]
    const y = b.prerelease[index]
    if (x === y) continue
    if (x == null || y == null) return x == null ? -1 : 1
    const xNumeric = /^\d+$/.test(x)
    const yNumeric = /^\d+$/.test(y)
    if (xNumeric && yNumeric) return x.length === y.length ? x > y ? 1 : -1 : x.length > y.length ? 1 : -1
    if (xNumeric !== yNumeric) return xNumeric ? -1 : 1
    return x > y ? 1 : -1
  }
  return 0
}

const text = (value: unknown, maxLength = MAX_BODY_LENGTH): string => typeof value === 'string' ? value.slice(0, maxLength) : ''
const officialReleasePage = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.origin === 'https://github.com' && /^\/yaonikaixin999999\/LinkLine\/releases\/tag\/[^/]+$/.test(url.pathname) && !url.username && !url.password && !url.search && !url.hash ? url.href : null
  } catch { return null }
}
const officialAsset = (value: unknown): string | null => releaseAssetDownloadUrl(value, 'github')
const record = (value: unknown): Record<string, unknown> | null => value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const parseAssets = (values: unknown, api: boolean): AppReleaseAsset[] => Array.isArray(values) ? values.slice(0, 50).flatMap(value => {
  const asset = record(value)
  const url = officialAsset(api ? asset?.browser_download_url : asset?.url)
  if (!asset || !url) return []
  const digest = api ? text(asset.digest, 80).replace(/^sha256:/, '') : text(asset.sha256, 64)
  return [{ name: text(asset.name, 300), url, size: typeof asset.size === 'number' && asset.size >= 0 && Number.isFinite(asset.size) ? asset.size : 0, ...(/^[a-f\d]{64}$/i.test(digest) ? { sha256: digest.toLowerCase() } : {}) }]
}) : []

const normalizeHistory = (releases: AppRelease[]): AppRelease[] => {
  releases.sort((a, b) => -(compareVersions(a.version, b.version) ?? 0) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
  const seen = new Set<string>()
  return releases.filter(release => {
    const identity = parseVersion(release.version)!.parts.join('.')
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  }).slice(0, HISTORY_LIMIT)
}

export const parseApiReleases = (json: string): AppRelease[] => {
  const values: unknown = JSON.parse(json)
  if (!Array.isArray(values)) throw new Error('更新服务器返回了无效数据。')
  const releases: AppRelease[] = []
  for (const value of values.slice(0, 100)) {
    const release = record(value)
    if (!release || release.draft !== false || release.prerelease !== false) continue
    const version = parseVersion(text(release.tag_name, 128))
    const pageUrl = officialReleasePage(release.html_url)
    const publishedAt = text(release.published_at, 64)
    if (!version || version.prerelease.length || !pageUrl || !Number.isFinite(Date.parse(publishedAt))) continue
    releases.push({
      version: version.text,
      name: text(release.name, 300) || version.text,
      body: text(release.body),
      publishedAt,
      pageUrl,
      assets: parseAssets(release.assets, true),
    })
  }
  return normalizeHistory(releases)
}

export const parseUpdateManifest = (json: string): AppRelease[] => {
  const manifest = record(JSON.parse(json))
  if (manifest?.schemaVersion !== 1 || manifest.repository !== LINKLINE_REPOSITORY || !Array.isArray(manifest.releases)) throw new Error('国内加速返回了无效的 LinkLine 更新清单。')
  const releases: AppRelease[] = []
  for (const value of manifest.releases.slice(0, 100)) {
    const release = record(value)
    if (!release) continue
    const version = parseVersion(text(release.version, 128))
    const pageUrl = officialReleasePage(release.pageUrl)
    const publishedAt = text(release.publishedAt, 64)
    if (!version || version.prerelease.length || !pageUrl || !Number.isFinite(Date.parse(publishedAt))) continue
    const pageTag = decodeURIComponent(new URL(pageUrl).pathname.split('/releases/tag/')[1])
    if (compareVersions(pageTag, version.text) !== 0) continue
    releases.push({ version: version.text, name: text(release.name, 300) || version.text, body: text(release.body), publishedAt, pageUrl, assets: parseAssets(release.assets, false) })
  }
  if (manifest.releases.length && !releases.length) throw new Error('国内加速返回了无效的 LinkLine 版本信息。')
  return normalizeHistory(releases)
}

const decodeXml = (value: string): string => value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, entity => {
  const named: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }
  if (named[entity]) return named[entity]
  const code = entity[2].toLowerCase() === 'x' ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10)
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
})
const xmlContent = (entry: string, name: string): string => {
  const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i').exec(entry)
  return match ? decodeXml(match[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')).trim() : ''
}
const plainFeedBody = (content: string): string => decodeXml(content.replace(/<\/(?:p|div|li|h[1-6])\s*>|<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')).trim().slice(0, MAX_BODY_LENGTH)

export const parseExpandedAssets = (html: string): AppReleaseAsset[] => {
  const assets: AppReleaseAsset[] = []
  const seen = new Set<string>()
  for (const match of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
    const href = decodeXml(match[1])
    const url = officialAsset(href.startsWith('/') ? `https://github.com${href}` : href)
    if (!url || seen.has(url)) continue
    seen.add(url)
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop()!)
    assets.push({ name: name.slice(0, 300), url, size: 0 })
    if (assets.length >= 50) break
  }
  return assets
}

/** Atom omits the prerelease flag; verify each candidate's official release page. */
export const parseFeedReleases = async(xml: string, fetchText: (url: string) => Promise<string>): Promise<AppRelease[]> => {
  if (!/<feed\b[^>]*xmlns=["']http:\/\/www\.w3\.org\/2005\/Atom["']/i.test(xml) || !/<\/feed>\s*$/.test(xml) || !xml.includes(LINKLINE_RELEASES_URL) || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('更新服务器返回了无效订阅数据。')
  const entries = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].slice(0, HISTORY_LIMIT)
  const releases = await Promise.all(entries.map(async([, entry]): Promise<AppRelease | null> => {
    const link = /<link\b(?=[^>]*\brel=["']alternate["'])[^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/i.exec(entry)?.[1]
    const pageUrl = officialReleasePage(link && decodeXml(link))
    if (!pageUrl) return null
    const tag = decodeURIComponent(new URL(pageUrl).pathname.split('/releases/tag/')[1])
    const version = parseVersion(tag)
    const publishedAt = xmlContent(entry, 'published') || xmlContent(entry, 'updated')
    if (!version || version.prerelease.length || !Number.isFinite(Date.parse(publishedAt))) return null
    const page = await fetchText(pageUrl)
    // Fail closed if GitHub returns a login/challenge/error page instead of release details.
    const title = decodeXml(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(page)?.[1] ?? '')
    if (!title.includes('yaonikaixin999999/LinkLine') || !/^\s*Release\s/i.test(title)) throw new Error('无法验证正式版本信息，请稍后重试。')
    if (/<(?:span|a)\b[^>]*>\s*Pre-release\s*<\/(?:span|a)>/i.test(page)) return null
    let assets: AppReleaseAsset[] = []
    try {
      assets = parseExpandedAssets(await fetchText(`${LINKLINE_RELEASES_URL}/expanded_assets/${encodeURIComponent(tag)}`))
    } catch { /* Release details remain usable when the asset list is temporarily unavailable. */ }
    return { version: version.text, name: xmlContent(entry, 'title').slice(0, 300) || version.text, publishedAt, pageUrl, body: plainFeedBody(xmlContent(entry, 'content')), assets }
  }))
  return normalizeHistory(releases.filter((release): release is AppRelease => release != null))
}

export const createUpdateChecker = (currentVersion: string, fetchText: (url: string, signal?: AbortSignal) => Promise<string>, now = Date.now) => {
  const cache = new Map<UpdateSource, UpdateCheckResult>()
  const pending = new Map<UpdateSource, Promise<UpdateCheckResult>>()
  const run = async(requestedSource: UpdateSource): Promise<UpdateCheckResult> => {
    let source: UpdateSource = requestedSource
    let sourceLabel = UPDATE_SOURCES[source].label
    let usedFallback = false
    const resultBase = () => ({ currentVersion, checkedAt: now(), source, requestedSource, usedFallback: usedFallback || source !== requestedSource, sourceLabel })
    const controller = new AbortController()
    const timer = setTimeout(() => { controller.abort() }, CHECK_TIMEOUT)
    const fetch = async(url: string) => fetchText(url, controller.signal)
    try {
      if (!parseVersion(currentVersion)) throw new Error('当前版本号无效，无法比较更新。')
      let history: AppRelease[] | null = null
      if (requestedSource === 'mirror') {
        for (const [base, label] of [[LINKLINE_DOWNLOAD_MIRROR, 'GH-Proxy 国内加速（第三方）'], [LINKLINE_BACKUP_MIRROR, 'GHFast 国内加速（第三方）']]) {
          try {
            history = parseUpdateManifest(await fetch(`${base}${LINKLINE_UPDATE_MANIFEST}`))
            sourceLabel = label
            usedFallback = base !== LINKLINE_DOWNLOAD_MIRROR
            break
          } catch {
            if (controller.signal.aborted) throw new Error('检查更新超时，请检查网络后重试。')
          }
        }
      }
      if (history == null) {
        source = 'github'
        sourceLabel = UPDATE_SOURCES.github.label
        try {
          history = parseApiReleases(await fetch(RELEASES_API_URL))
        } catch {
          if (controller.signal.aborted) throw new Error('检查更新超时，请检查网络后重试。')
          try {
            history = await parseFeedReleases(await fetch(RELEASES_FEED_URL), fetch)
          } catch {
            if (controller.signal.aborted) throw new Error('检查更新超时，请检查网络后重试。')
            history = parseUpdateManifest(await fetch(LINKLINE_UPDATE_MANIFEST))
            sourceLabel = 'GitHub 官方（发布清单）'
            usedFallback = true
          }
        }
      }
      history = history.map(release => ({ ...release, assets: release.assets.map(asset => ({ ...asset, downloadUrl: releaseAssetDownloadUrl(asset.url, requestedSource)! })) }))
      const latestRelease = history[0] ?? null
      return { ...resultBase(), status: latestRelease ? compareVersions(latestRelease.version, currentVersion)! > 0 ? 'available' : 'latest' : 'unpublished', latestRelease, history, error: null }
    } catch (error) {
      return { ...resultBase(), status: 'error', latestRelease: null, history: [], error: error instanceof Error ? error.message : '检查更新失败，请稍后重试。' }
    } finally {
      clearTimeout(timer)
    }
  }
  return async(params: UpdateCheckRequest = {}): Promise<UpdateCheckResult> => {
    const source = isUpdateSource(params.source) ? params.source : 'github'
    const running = pending.get(source)
    if (running) return running
    const cached = cache.get(source)
    if (!params.force && cached && cached.status !== 'error' && now() >= cached.checkedAt && now() - cached.checkedAt < CACHE_TTL) return Promise.resolve(cached)
    const request = run(source).then(result => {
      cache.set(source, result)
      return result
    }).finally(() => {
      pending.delete(source)
    })
    pending.set(source, request)
    return request
  }
}

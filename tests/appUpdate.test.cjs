const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
function load(file, imports = {}, globals = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(output, {
    module, exports: module.exports, Error, URL, TextDecoder, AbortController, Buffer, setTimeout, clearTimeout,
    require: name => { if (name in imports) return imports[name]; throw new Error(`Unexpected import: ${name}`) },
    ...globals,
  }, { filename: file })
  return module.exports
}
const common = load('src/common/appUpdate.ts')
const checker = load('src/main/modules/appUpdate/checker.ts', { '@common/appUpdate': common })
const plain = value => JSON.parse(JSON.stringify(value))
const page = tag => `${common.LINKLINE_RELEASES_URL}/tag/${tag}`
const release = (tag, patch = {}) => ({
  tag_name: tag, name: `LinkLine ${tag}`, body: 'Release notes', draft: false, prerelease: false,
  html_url: page(tag), published_at: '2026-10-10T00:00:00Z', assets: [], ...patch,
})
const feed = entries => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><id>${common.LINKLINE_RELEASES_URL}</id>${entries.join('')}</feed>`
const entry = (tag, patch = '') => `<entry><title>LinkLine ${tag}</title><updated>2026-10-10T00:00:00Z</updated><link href="${page(tag)}" rel="alternate"/><content type="html">&lt;p&gt;New &amp;amp; improved&lt;/p&gt;</content>${patch}</entry>`
const officialHtml = badge => `<html><head><title>Release LinkLine v1.1.0 · yaonikaixin999999/LinkLine · GitHub</title></head><body>${badge || ''}</body></html>`
function deferred() {
  let resolve
  const promise = new Promise(yes => { resolve = yes })
  return { promise, resolve }
}

test('versions compare numerically, include semver prerelease ordering and reject invalid tags', () => {
  const cases = [
    ['v1.10.0', '1.9.99', 1], ['2.0.0', '10.0.0', -1], ['1.0.0+build.5', '1.0.0+build.1', 0],
    ['1.0.0', '1.0.0-rc.1', 1], ['1.0.0-beta.11', '1.0.0-beta.2', 1], ['1.0.0-beta', '1.0.0-alpha', 1],
    ['1.0.0-1', '1.0.0-beta', -1], ['1.0.0-beta', '1.0.0-beta.1', -1], ['release-1.0.0', '1.0.0', null],
    ['1.0', '1.0.0', null], ['01.0.0', '1.0.0', null], ['1.0.0-01', '1.0.0', null],
  ]
  for (const [left, right, result] of cases) assert.equal(checker.compareVersions(left, right), result, `${left} vs ${right}`)
})

test('API releases filter drafts, prereleases, invalid versions and foreign URLs, sort numerically and sanitize assets', () => {
  const parsed = checker.parseApiReleases(JSON.stringify([
    release('v1.9.0'), release('v1.10.0', { assets: [{ name: 'LinkLine.exe', browser_download_url: `${common.LINKLINE_RELEASES_URL}/download/v1.10.0/LinkLine.exe`, size: 123 }, { name: 'Foreign.exe', browser_download_url: 'https://example.com/a', size: 1 }] }),
    release('v3.0.0', { draft: true }), release('v3.1.0', { prerelease: true }), release('v4.0.0-beta.1'),
    release('next'), release('v9.0.0', { html_url: 'https://github.com/lyswhut/lx-music-desktop/releases/tag/v9.0.0' }),
    release('v8.0.0', { published_at: 'invalid' }), release('v1.10.0+other', { published_at: '2026-10-09T00:00:00Z' }),
  ]))
  assert.deepEqual(plain(parsed.map(item => item.version)), ['1.10.0', '1.9.0'])
  assert.deepEqual(plain(parsed[0].assets), [{ name: 'LinkLine.exe', url: `${common.LINKLINE_RELEASES_URL}/download/v1.10.0/LinkLine.exe`, size: 123 }])
  assert.throws(() => checker.parseApiReleases('{"message":"limited"}'), /无效数据/)
})

test('available, latest and locally newer versions are represented truthfully', async() => {
  for (const [current, latest, status] of [['1.0.0', '1.1.0', 'available'], ['1.0.0', '1.0.0', 'latest'], ['2.0.0', '1.1.0', 'latest'], ['1.1.0-rc.1', '1.1.0', 'available']]) {
    const result = await checker.createUpdateChecker(current, async() => JSON.stringify([release(latest)]), () => 123)()
    assert.equal(result.status, status)
    assert.equal(result.currentVersion, current)
    assert.equal(result.latestRelease.version, latest)
    assert.equal(result.checkedAt, 123)
    assert.equal(result.source, 'github')
    assert.equal(result.error, null)
    structuredClone(result)
  }
})

test('empty official API is unpublished rather than falsely up to date', async() => {
  const calls = []
  const result = await checker.createUpdateChecker('1.0.0', async url => { calls.push(url); return '[]' })()
  assert.equal(result.status, 'unpublished')
  assert.equal(result.latestRelease, null)
  assert.deepEqual(plain(result.history), [])
  assert.deepEqual(calls, [checker.RELEASES_API_URL])
})

test('rate-limited API falls back to own GitHub empty Atom feed and reports unpublished', async() => {
  const calls = []
  const result = await checker.createUpdateChecker('1.0.0', async url => {
    calls.push(url)
    if (url === checker.RELEASES_API_URL) throw new Error('GitHub API limited')
    return feed([])
  })()
  assert.equal(result.status, 'unpublished')
  assert.deepEqual(calls, [checker.RELEASES_API_URL, checker.RELEASES_FEED_URL])
  assert.equal(calls.some(url => url.includes('lyswhut')), false)
})

test('Atom fallback verifies release pages to exclude stable-looking prerelease tags', async() => {
  const calls = []
  const history = await checker.parseFeedReleases(feed([entry('v1.1.0'), entry('v2.0.0'), entry('v3.0.0-beta.1')]), async url => {
    calls.push(url)
    return officialHtml(url.endsWith('/v2.0.0') ? '<span class="Label Label--warning">Pre-release</span>' : '')
  })
  assert.deepEqual(plain(history.map(item => item.version)), ['1.1.0'])
  assert.equal(history[0].body, 'New & improved')
  assert.deepEqual(calls.sort(), [page('v1.1.0'), page('v2.0.0'), `${common.LINKLINE_RELEASES_URL}/expanded_assets/v1.1.0`].sort())
  assert.deepEqual(plain(history[0].assets), [])
})

test('Atom ignores foreign links and rejects challenge pages, malformed feeds and entity declarations', async() => {
  const malicious = entry('v1.1.0').replace(page('v1.1.0'), 'https://example.com/releases/tag/v1.1.0')
  let calls = 0
  assert.deepEqual(plain(await checker.parseFeedReleases(feed([malicious]), async() => { calls++; return '' })), [])
  assert.equal(calls, 0)
  await assert.rejects(checker.parseFeedReleases(feed([entry('v1.1.0')]), async() => '<title>Please sign in</title>'), /无法验证正式版本/)
  await assert.rejects(checker.parseFeedReleases('<html>Sorry</html>', async() => ''), /无效订阅数据/)
  await assert.rejects(checker.parseFeedReleases(`<!DOCTYPE feed>${feed([])}`, async() => ''), /无效订阅数据/)
})

test('concurrent startup and manual checks share one request; cached background reads expire; manual refresh bypasses cache', async() => {
  const wait = deferred()
  let calls = 0
  let now = 100
  const check = checker.createUpdateChecker('1.0.0', async() => { calls++; if (calls === 1) await wait.promise; return JSON.stringify([release('v1.1.0')]) }, () => now)
  const first = check()
  const second = check({ force: true })
  assert.equal(calls, 1)
  wait.resolve()
  assert.deepEqual(plain(await first), plain(await second))
  await check()
  assert.equal(calls, 1)
  await check({ force: true })
  assert.equal(calls, 2)
  now += 60_000
  await check()
  assert.equal(calls, 3)
  now = 0
  await check()
  assert.equal(calls, 4)
})

test('failed checks can retry immediately and invalid current version never contacts network', async() => {
  let networkWorks = false
  const calls = []
  const check = checker.createUpdateChecker('1.0.0', async url => {
    calls.push(url)
    if (!networkWorks) throw new Error('offline')
    return '[]'
  })
  const failure = await check()
  assert.equal(failure.status, 'error')
  assert.equal(failure.error, 'offline')
  networkWorks = true
  assert.equal((await check()).status, 'unpublished')
  assert.equal(calls.length, 4)
  const invalid = await checker.createUpdateChecker('development', async() => { throw new Error('must not fetch') })()
  assert.equal(invalid.status, 'error')
  assert.match(invalid.error, /当前版本号/)
})

test('whole-check deadline cancels outstanding release-page requests and stays retryable', async() => {
  const accelerated = load('src/main/modules/appUpdate/checker.ts', { '@common/appUpdate': common }, { setTimeout: callback => setTimeout(callback, 5) })
  let pageSignal
  let shouldStall = true
  const check = accelerated.createUpdateChecker('1.0.0', async(url, signal) => {
    if (!shouldStall) return '[]'
    if (url === accelerated.RELEASES_API_URL) throw new Error('API limited')
    if (url === accelerated.RELEASES_FEED_URL) return feed([entry('v1.1.0')])
    pageSignal = signal
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('检查更新超时，请检查网络后重试。'))))
  })
  const result = await check()
  assert.equal(result.status, 'error')
  assert.match(result.error, /检查更新超时/)
  assert.equal(pageSignal.aborted, true)
  shouldStall = false
  assert.equal((await check()).status, 'unpublished')
})

test('release body and history are bounded without truncating the version comparison', () => {
  const history = checker.parseApiReleases(JSON.stringify(Array.from({ length: 100 }, (_, index) => release(`1.${index}.0`, { body: 'x'.repeat(70_000) }))))
  assert.equal(history.length, 20)
  assert.equal(history[0].version, '1.99.0')
  assert.equal(history[0].body.length, 64_000)
})

const installerUrl = `${common.LINKLINE_RELEASES_URL}/download/v1.1.0/LinkLine-v1.1.0-x64-Setup.exe`
const manifest = (patch = {}) => JSON.stringify({
  schemaVersion: 1, repository: common.LINKLINE_REPOSITORY,
  releases: [{ version: '1.1.0', name: 'LinkLine 1.1.0', body: 'New version', publishedAt: '2026-10-10T00:00:00Z', pageUrl: page('v1.1.0'), assets: [{ name: 'LinkLine-v1.1.0-x64-Setup.exe', url: installerUrl, size: 123, sha256: 'a'.repeat(64) }] }],
  ...patch,
})

test('official source uses its GitHub manifest when both rate-limited API and Atom fail', async() => {
  const calls = []
  const result = await checker.createUpdateChecker('1.0.0', async url => {
    calls.push(url)
    if (url === checker.RELEASES_API_URL) throw new Error('GitHub API limited')
    if (url === checker.RELEASES_FEED_URL) return '<html>temporarily unavailable</html>'
    assert.equal(url, common.LINKLINE_UPDATE_MANIFEST)
    return manifest()
  })({ source: 'github' })
  assert.equal(result.status, 'available')
  assert.equal(result.source, 'github')
  assert.equal(result.requestedSource, 'github')
  assert.equal(result.usedFallback, true)
  assert.equal(result.sourceLabel, 'GitHub 官方（发布清单）')
  assert.equal(result.latestRelease.assets[0].downloadUrl, installerUrl)
  assert.equal(result.latestRelease.assets[0].sha256, 'a'.repeat(64))
  assert.deepEqual(calls, [checker.RELEASES_API_URL, checker.RELEASES_FEED_URL, common.LINKLINE_UPDATE_MANIFEST])
  assert.equal(calls.some(url => url.startsWith(common.LINKLINE_DOWNLOAD_MIRROR)), false)
})

test('official manifest fallback rejects a foreign repository instead of exposing its installer', async() => {
  const result = await checker.createUpdateChecker('1.0.0', async url => {
    if (url === common.LINKLINE_UPDATE_MANIFEST) return manifest({ repository: 'https://github.com/another/repo' })
    throw new Error('official metadata unavailable')
  })({ source: 'github' })
  assert.equal(result.status, 'error')
  assert.equal(result.latestRelease, null)
  assert.match(result.error, /无效的 LinkLine 更新清单/)
})

test('domestic manifest validates own repository, versions, SHA256 and only own published assets', () => {
  const valid = checker.parseUpdateManifest(manifest())
  assert.equal(valid[0].assets[0].sha256, 'a'.repeat(64))
  assert.equal(valid[0].assets[0].url, installerUrl)
  assert.throws(() => checker.parseUpdateManifest(manifest({ repository: 'https://github.com/another/repo' })), /无效的 LinkLine 更新清单/)
  assert.throws(() => checker.parseUpdateManifest(manifest({ schemaVersion: 2 })), /无效的 LinkLine 更新清单/)
  assert.throws(() => checker.parseUpdateManifest(manifest({ releases: [{ version: '2.0.0', pageUrl: page('v1.0.0'), publishedAt: '2026-10-10T00:00:00Z' }] })), /无效的 LinkLine 版本信息/)
  assert.deepEqual(plain(checker.parseUpdateManifest(manifest({ releases: [] }))), [])
})

test('mirror download URL accepts only own release asset paths and does not proxy arbitrary URIs', () => {
  assert.equal(common.releaseAssetDownloadUrl(installerUrl, 'mirror'), `${common.LINKLINE_DOWNLOAD_MIRROR}${installerUrl}`)
  assert.equal(common.releaseAssetDownloadUrl(installerUrl, 'github'), installerUrl)
  for (const value of ['javascript:alert(1)', 'file:///C:/secret', 'https://github.com/another/repo/releases/download/v1.1.0/a.exe', 'https://example.com/a.exe', `${installerUrl}?redirect=https://example.com`, `${installerUrl}#fragment`, installerUrl.replace('https://github.com', 'https://user:pass@github.com'), `${common.LINKLINE_RELEASES_URL}/download/v1.1.0/nested/a.exe`]) {
    assert.equal(common.releaseAssetDownloadUrl(value, 'mirror'), null, value)
  }
})

test('selected domestic source reads mirrored manifest and supplies direct installer download URL', async() => {
  const calls = []
  const result = await checker.createUpdateChecker('1.0.0', async url => { calls.push(url); return manifest() })({ source: 'mirror' })
  assert.equal(result.status, 'available')
  assert.equal(result.source, 'mirror')
  assert.equal(result.requestedSource, 'mirror')
  assert.equal(result.usedFallback, false)
  assert.match(result.sourceLabel, /GH-Proxy.*第三方/)
  assert.equal(result.latestRelease.assets[0].downloadUrl, `${common.LINKLINE_DOWNLOAD_MIRROR}${installerUrl}`)
  assert.equal(result.latestRelease.assets[0].url, installerUrl)
  assert.deepEqual(calls, [`${common.LINKLINE_DOWNLOAD_MIRROR}${common.LINKLINE_UPDATE_MANIFEST}`])
})

test('backup domestic mirror precedes official fallback and exposes actual provider', async() => {
  const calls = []
  const result = await checker.createUpdateChecker('1.0.0', async url => {
    calls.push(url)
    if (url.startsWith(common.LINKLINE_DOWNLOAD_MIRROR)) throw new Error('primary unavailable')
    return manifest()
  })({ source: 'mirror' })
  assert.equal(result.source, 'mirror')
  assert.match(result.sourceLabel, /GHFast/)
  assert.equal(result.requestedSource, 'mirror')
  assert.equal(result.usedFallback, true)
  assert.deepEqual(calls, [`${common.LINKLINE_DOWNLOAD_MIRROR}${common.LINKLINE_UPDATE_MANIFEST}`, `${common.LINKLINE_BACKUP_MIRROR}${common.LINKLINE_UPDATE_MANIFEST}`])
})

test('failed domestic mirrors transparently fall back to official metadata while keeping selected download source', async() => {
  const calls = []
  const result = await checker.createUpdateChecker('1.0.0', async url => {
    calls.push(url)
    if (url !== checker.RELEASES_API_URL) throw new Error('mirror unavailable')
    return JSON.stringify([release('v1.1.0', { assets: [{ name: 'LinkLine-v1.1.0-x64-Setup.exe', browser_download_url: installerUrl, size: 123 }] })])
  })({ source: 'mirror' })
  assert.equal(result.source, 'github')
  assert.equal(result.requestedSource, 'mirror')
  assert.equal(result.usedFallback, true)
  assert.equal(result.sourceLabel, 'GitHub 官方')
  assert.equal(result.latestRelease.assets[0].downloadUrl, `${common.LINKLINE_DOWNLOAD_MIRROR}${installerUrl}`)
  assert.deepEqual(calls, [`${common.LINKLINE_DOWNLOAD_MIRROR}${common.LINKLINE_UPDATE_MANIFEST}`, `${common.LINKLINE_BACKUP_MIRROR}${common.LINKLINE_UPDATE_MANIFEST}`, checker.RELEASES_API_URL])
})

test('source switching isolates caches and in-flight requests so official results never populate the mirror cache', async() => {
  const wait = deferred()
  const calls = []
  const check = checker.createUpdateChecker('1.0.0', async url => {
    calls.push(url)
    if (url === checker.RELEASES_API_URL) { await wait.promise; return '[]' }
    return manifest()
  })
  const official = check({ source: 'github' })
  const domestic = await check({ source: 'mirror' })
  assert.equal(domestic.status, 'available')
  assert.equal(domestic.source, 'mirror')
  wait.resolve()
  assert.equal((await official).status, 'unpublished')
  assert.equal((await check({ source: 'mirror' })).status, 'available')
  assert.equal((await check({ source: 'github' })).status, 'unpublished')
  assert.equal(calls.length, 2)
})

test('official Atom fallback discovers packaged installers through GitHub expanded-assets HTML', async() => {
  const foreign = 'https://github.com/another/repo/releases/download/v1.1.0/another.exe'
  const html = `<a href="${installerUrl.replace('https://github.com', '')}"><span>Installer</span></a><a href="${foreign}">Bad</a><a href="/yaonikaixin999999/LinkLine/archive/refs/tags/v1.1.0.zip">Sources</a><a href="${installerUrl}">Duplicate</a>`
  const result = await checker.createUpdateChecker('1.0.0', async url => {
    if (url === checker.RELEASES_API_URL) throw new Error('API limited')
    if (url === checker.RELEASES_FEED_URL) return feed([entry('v1.1.0')])
    if (url.includes('/expanded_assets/')) return html
    return officialHtml()
  })()
  assert.equal(result.status, 'available')
  assert.deepEqual(plain(result.latestRelease.assets), [{ name: 'LinkLine-v1.1.0-x64-Setup.exe', url: installerUrl, size: 0, downloadUrl: installerUrl }])
})

function backend(netFetch, globals = {}) {
  const handlers = new Map()
  const runtime = load('src/main/modules/appUpdate/index.ts', {
    electron: { app: { getVersion: () => '1.0.0', getPath: () => 'C:\\Temp' }, net: { fetch: netFetch } },
    'node:fs': { createWriteStream: () => ({ write: () => true, on: () => {}, once: () => {}, end: callback => callback?.(), destroy: () => {} }), existsSync: () => false },
    'node:fs/promises': { mkdir: async() => {}, rm: async() => {} },
    'node:events': { once: async() => {} },
    'node:path': { default: require('node:path') },
    'node:crypto': { createHash: () => ({ update: () => {}, digest: () => 'a'.repeat(64) }), randomUUID: () => 'test' },
    '@common/mainIpc': { mainHandle: (name, handler) => handlers.set(name, handler) },
    '@common/appUpdate': common,
    './checker': checker,
  }, globals)
  runtime.default()
  return { ...runtime, handlers }
}

test('registered IPC only queries LinkLine releases and forces only explicit boolean true', async() => {
  const calls = []
  const runtime = backend(async(url, options) => {
    calls.push({ url, options })
    return new Response('[]')
  })
  const handle = runtime.handlers.get(common.LINKLINE_UPDATE_CHECK)
  assert.equal((await handle({ params: undefined })).status, 'unpublished')
  assert.equal((await handle({ params: { force: 'yes' } })).status, 'unpublished')
  assert.equal(calls.length, 1)
  await handle({ params: { force: true } })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, checker.RELEASES_API_URL)
  assert.equal(calls[0].options.headers['User-Agent'], 'LinkLine-Update-Check')
})

test('installer download IPC streams a validated LinkLine asset and reports progress', async() => {
  const chunks = [new Uint8Array([1, 2]), new Uint8Array([3, 4])]
  const events = []
  const runtime = backend(async() => ({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-length': '4' }),
    body: { getReader: () => ({ read: async() => chunks.length ? { value: chunks.shift(), done: false } : { value: undefined, done: true } }) },
  }))
  const handle = runtime.handlers.get(common.LINKLINE_UPDATE_DOWNLOAD)
  const sender = { isDestroyed: () => false, send: (channel, progress) => events.push({ channel, progress }) }
  const result = await handle({ event: { sender }, params: { url: `${common.LINKLINE_RELEASES_URL}/download/v1.1.0/LinkLine-v1.1.0-x64-Setup.exe`, fileName: 'LinkLine-v1.1.0-x64-Setup.exe' } })
  assert.equal(result.fileName, 'LinkLine-v1.1.0-x64-Setup.exe')
  assert.equal(result.size, 4)
  assert.equal(events.at(-1).progress.percent, 100)
  await assert.rejects(handle({ event: { sender }, params: { url: 'https://example.com/evil.exe', fileName: 'LinkLine-v1.1.0-x64-Setup.exe' } }), /下载地址无效/)
})

test('network reader bounds declared and streamed response size and translates offline/timeout errors', async() => {
  const oversized = backend(async() => new Response('ignored', { headers: { 'content-length': String(3 * 1024 * 1024) } }))
  await assert.rejects(oversized.fetchUpdateText(checker.RELEASES_API_URL), /响应过大/)
  const streamed = backend(async() => new Response(new Uint8Array(2 * 1024 * 1024 + 1)))
  await assert.rejects(streamed.fetchUpdateText(checker.RELEASES_API_URL), /响应过大/)
  const limited = backend(async() => new Response('', { status: 403 }))
  await assert.rejects(limited.fetchUpdateText(checker.RELEASES_API_URL), /暂时受限/)
  const offline = backend(async() => { throw new Error('net::ERR_INTERNET_DISCONNECTED') })
  await assert.rejects(offline.fetchUpdateText(checker.RELEASES_API_URL), /无法连接 GitHub/)
  const timedOut = backend(async(url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))), { setTimeout: callback => setTimeout(callback, 5) })
  await assert.rejects(timedOut.fetchUpdateText(checker.RELEASES_API_URL), /检查更新超时/)
})

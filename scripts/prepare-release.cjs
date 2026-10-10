// Generate release metadata from the actual built Windows installer.
// No credentials, upload, or installation occurs in this script.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '..')
const { version } = require('../package.json')
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Only stable semantic versions can be prepared.')
const repository = 'https://github.com/yaonikaixin999999/LXMusicRemake'
const tag = `v${version}`
const name = `LinkLine-v${version}-x64-Setup.exe`
const file = path.join(root, 'build', name)
const installer = fs.readFileSync(file)
if (installer.length < 5_000_000 || installer.subarray(0, 2).toString() !== 'MZ') throw new Error('A valid built Windows installer is required.')
const sha256 = crypto.createHash('sha256').update(installer).digest('hex')
const body = fs.readFileSync(path.join(root, 'docs', 'releases', `${tag}.md`), 'utf8')
const manifestPath = path.join(root, 'updates', 'stable.json')
const existing = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')).releases : []
if (!Array.isArray(existing)) throw new Error('Existing update manifest is invalid.')
const release = {
  version, name: `LinkLine ${version}`, body,
  publishedAt: new Date().toISOString(),
  pageUrl: `${repository}/releases/tag/${tag}`,
  assets: [{ name, url: `${repository}/releases/download/${tag}/${name}`, size: installer.length, sha256 }],
}
fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
fs.writeFileSync(manifestPath, JSON.stringify({ schemaVersion: 1, repository, releases: [release, ...existing.filter(item => item.version !== version)].slice(0, 20) }, null, 2) + '\n')
fs.writeFileSync(path.join(root, 'build', 'SHA256SUMS.txt'), `${sha256}  ${name}\n`)
console.log(JSON.stringify({ version, installer: name, size: installer.length, sha256, manifest: 'updates/stable.json' }, null, 2))

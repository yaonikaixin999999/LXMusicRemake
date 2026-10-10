const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = path.resolve(__dirname, '../..')
const decodeName = value => String(value ?? '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '')

module.exports = function catalogFixture(handler) {
  const calls = []
  const cache = new Map()
  const resolve = file => [file, `${file}.js`, `${file}.ts`, path.join(file, 'index.js')].find(item => fs.existsSync(item) && fs.statSync(item).isFile())
  const utilities = {
    decodeName,
    formatPlayTime: seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`,
    sizeFormate: bytes => String(bytes),
  }
  function load(file) {
    file = resolve(file)
    if (file.endsWith(`${path.sep}utils${path.sep}index.ts`)) return utilities
    if (file.endsWith(`${path.sep}request.js`)) return { httpFetch: (url, options = {}) => {
      const request = { url: new URL(url), options }
      calls.push(request)
      return { promise: Promise.resolve().then(() => handler(request)).then(body => ({ statusCode: 200, body })) }
    } }
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
    vm.runInNewContext(output, { module, exports: module.exports, Buffer, URL, Date, console, require: name => {
      if (name === '@renderer/utils') return utilities
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), name))
      return require(name)
    } }, { filename: file })
    return module.exports
  }
  return { sdk: load(path.join(root, 'src/renderer/utils/musicSdk/catalogSearch.js')), calls }
}

module.exports.readNeteaseRequest = request => {
  const { createDecipheriv } = require('node:crypto')
  const decipher = createDecipheriv('aes-128-ecb', 'e82ckenh8dichen8', '')
  const decoded = Buffer.concat([decipher.update(Buffer.from(request.options.form.params, 'hex')), decipher.final()]).toString('utf8').split('-36cd479b6b5-')
  return { path: decoded[0], params: JSON.parse(decoded[1]) }
}

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')

const root = path.resolve(__dirname, '..')
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const qualityModule = { exports: {} }
vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'src/common/platformPlayback.ts'), 'utf8')), { module: qualityModule, exports: qualityModule.exports })
const track = id => ({ id, source: 'wy', name: id, singer: 'Fixture Artist', meta: { qualitys: [{ type: '128k' }, { type: '320k' }] } })
const plain = value => JSON.parse(JSON.stringify(value))

function fixture({ query = async() => ['128k', '320k', 'flac'], reload = async() => {} } = {}) {
  const props = vue.reactive({ track: track('first') })
  const preferredQuality = vue.ref('auto')
  const activeStream = vue.shallowRef(null)
  const qualityChanging = vue.ref(false)
  const qualityChangeError = vue.ref('')
  const calls = { saved: [], reloads: 0 }
  const source = fs.readFileSync(path.join(root, 'src/renderer/ui/components/QualityControl.vue'), 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const module = { exports: {} }
  const imports = {
    vue: { ...vue, watch() {}, onBeforeUnmount() {} },
    '@common/platformPlayback': qualityModule.exports,
    '@renderer/store': { sourceNames: vue.ref({ wy: '网易云音乐' }) },
    '../services/platformPlayback': {
      preferredQuality, activeStream, qualityChanging, qualityChangeError, getPlatformQualitys: query,
      setPreferredQuality: async(quality) => { preferredQuality.value = quality; calls.saved.push(quality); calls.reloads++; await reload() },
    },
  }
  vm.runInNewContext(compile(`${source}\nmodule.exports = { loadQualitys, choose, options, error, loading, changing, stream, platformLabel, unavailablePreference };`), {
    module, exports: module.exports, Error, defineProps: () => props, crypto: { randomUUID: () => 'fixture' },
    document: { removeEventListener() {} }, window: { removeEventListener() {} },
    require: name => { if (name in imports) return imports[name]; if (name.endsWith('.vue')) return {}; throw new Error(`Unexpected import ${name}`) },
  })
  return { ...module.exports, props, preferredQuality, activeStream, calls }
}

test('quality menu queries current song and ignores an older song response', async() => {
  const pending = new Map()
  const state = fixture({ query: info => new Promise(resolve => pending.set(info.id, resolve)) })
  const first = state.loadQualitys()
  state.props.track = track('second')
  const second = state.loadQualitys()
  pending.get('second')(['128k', 'flac24bit'])
  await second
  pending.get('first')(['128k', 'flac'])
  await first
  assert.deepEqual(plain(state.options.value), ['auto', '128k', 'flac24bit'])
  assert.equal(state.loading.value, false)
})

test('choosing quality persists preference and reloads playback once', async() => {
  const state = fixture()
  await state.choose('flac24bit')
  assert.deepEqual(state.calls.saved, ['flac24bit'])
  assert.equal(state.preferredQuality.value, 'flac24bit')
  assert.equal(state.calls.reloads, 1)
  assert.equal(state.changing.value, false)
})

test('quality request failure retains declared song qualities and exposes an error', async() => {
  const state = fixture({ query: async() => { throw new Error('Account expired') } })
  await state.loadQualitys()
  assert.deepEqual(plain(state.options.value), ['auto', '128k', '320k'])
  assert.equal(state.error.value, 'Account expired')
  assert.equal(state.loading.value, false)
})

test('cross-platform playback queries quality options from the actual playing platform', async() => {
  const queried = []
  const state = fixture({ query: async(info) => { queried.push({ source: info.source, id: info.id }); return ['128k', 'flac', 'flac24bit'] } })
  state.activeStream.value = { trackId: 'first', platform: 'qq', type: 'flac', requested: 'auto', musicInfo: { ...track('qq-match'), source: 'tx' } }
  await state.loadQualitys()
  assert.deepEqual(queried, [{ source: 'tx', id: 'qq-match' }])
  assert.deepEqual(plain(state.options.value), ['auto', '128k', 'flac', 'flac24bit'])
  assert.equal(state.platformLabel.value, 'QQ 音乐')
})

test('actual stream details disappear when the current song changes', () => {
  const state = fixture()
  state.activeStream.value = { trackId: 'first', platform: 'qq', type: 'flac', quality: 'flac', requested: 'auto' }
  assert.equal(state.stream.value.type, 'flac')
  assert.equal(state.platformLabel.value, 'QQ 音乐')
  state.props.track = track('second')
  assert.equal(state.stream.value, null)
  assert.equal(state.platformLabel.value, '网易云音乐')
})

test('failed quality reload reports failure without leaving controls locked', async() => {
  const state = fixture({ reload: async() => { throw new Error('Song unavailable') } })
  await state.choose('flac')
  assert.equal(state.error.value, 'Song unavailable')
  assert.equal(state.changing.value, false)
})

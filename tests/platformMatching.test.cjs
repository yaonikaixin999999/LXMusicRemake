const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const target = { exports: {} }
const source = fs.readFileSync(path.join(__dirname, '../src/common/platformMatching.ts'), 'utf8')
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: target.exports, module: target, require })
const { sameRecording, chooseMatch, aggregateFavorites } = target.exports
const song = (id, source = 'wy', extra = {}) => ({ id, source, name: '晴天', singer: '周杰伦', interval: '04:29', meta: { songId: id, albumName: '叶惠美' }, ...extra })

test('same recording merges platform IDs and preserves live/covers/different durations', () => {
  assert.equal(sameRecording(song('a'), song('b', 'tx')), true)
  assert.equal(sameRecording(song('a'), song('b', 'tx', { name: '晴天 (Live)' })), false)
  assert.equal(sameRecording(song('a'), song('b', 'tx', { singer: '其他歌手' })), false)
  assert.equal(sameRecording(song('a'), song('b', 'tx', { interval: '05:30' })), false)
  assert.equal(sameRecording(song('a', 'wy', { interval: null }), song('b', 'tx')), true)
  assert.equal(sameRecording(song('a', 'wy', { interval: null, meta: { albumName: '' } }), song('b', 'tx')), false)
})

test('matching refuses ambiguous versions and uses album as tie breaker', () => {
  const a = song('a', 'tx')
  const b = song('b', 'tx')
  assert.equal(chooseMatch(song('original'), [a, b]).status, 'ambiguous')
  const differentAlbum = song('b', 'tx', { meta: { albumName: '演唱会' } })
  assert.equal(chooseMatch(song('original'), [a, differentAlbum]).track.id, 'a')
  assert.equal(chooseMatch(song('original'), [song('b', 'tx', { name: '晴天 Live' })]).status, 'unmatched')
  assert.equal(chooseMatch(song('original'), [a, a]).track.id, 'a')
})

test('aggregation keeps every platform identifier with a single canonical recording', () => {
  const results = aggregateFavorites([{ platform: 'qq', tracks: [song('tx_1', 'tx')] }, { platform: 'netease', tracks: [song('wy_2'), song('wy_live', 'wy', { name: '晴天 Live' })] }])
  assert.equal(results.length, 2)
  assert.equal(results[0].platforms.length, 2)
  assert.equal(results[1].platforms.length, 1)
})

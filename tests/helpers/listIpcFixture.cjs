const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const ts = require('typescript')
const vue = require('vue')

const root = path.resolve(__dirname, '../..')
const LIST_IDS = { DEFAULT: 'default', LOVE: 'love', TEMP: 'temp' }
const compile = filename => ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

// Load the production action, list manager, state, and IPC wrapper together.
// Only the Electron process and player hardware are fixtures: every outgoing
// payload still passes through the real structured-clone transport boundary.
module.exports = function listIpcFixture() {
  const ipc = new EventEmitter()
  const writes = []
  const remoteLists = new Map()
  let remoteUserLists = []
  const plays = []
  const workerCalls = []
  const modules = new Map()
  let events
  const sortList = (list, position, ids) => {
    const selected = ids.map(id => list.find(item => item.id === id)).filter(Boolean)
    const remaining = list.filter(item => !ids.includes(item.id))
    remaining.splice(Math.min(position, remaining.length), 0, ...selected)
    return remaining
  }
  ipc.invoke = async(channel, input) => {
    const params = structuredClone(input)
    if (channel === events.list_get) return structuredClone(remoteUserLists)
    if (channel === events.list_music_get) return structuredClone(remoteLists.get(params) ?? [])
    writes.push({ channel, params })
    if (channel === events.list_add) {
      remoteUserLists.splice(params.position, 0, ...structuredClone(params.listInfos))
    } else if (channel === events.list_music_overwrite) {
      remoteLists.set(params.listId, structuredClone(params.musicInfos))
    } else if (channel === events.list_music_add) {
      const before = remoteLists.get(params.id) ?? []
      const added = params.musicInfos.filter(track => !before.some(item => item.id === track.id))
      remoteLists.set(params.id, params.addMusicLocationType === 'top' ? [...added, ...before] : [...before, ...added])
    } else if (channel === events.list_music_move) {
      remoteLists.set(params.fromId, (remoteLists.get(params.fromId) ?? []).filter(item => !params.musicInfos.some(track => track.id === item.id)))
      const before = remoteLists.get(params.toId) ?? []
      const added = params.musicInfos.filter(track => !before.some(item => item.id === track.id))
      remoteLists.set(params.toId, params.addMusicLocationType === 'top' ? [...added, ...before] : [...before, ...added])
    } else if (channel === events.list_music_remove) {
      remoteLists.set(params.listId, (remoteLists.get(params.listId) ?? []).filter(item => !params.ids.includes(item.id)))
    } else if (channel === events.list_music_update) {
      for (const { id, musicInfo } of params) remoteLists.set(id, (remoteLists.get(id) ?? []).map(item => item.id === musicInfo.id ? structuredClone(musicInfo) : item))
    } else if (channel === events.list_music_update_position) {
      remoteLists.set(params.listId, sortList(remoteLists.get(params.listId) ?? [], params.position, params.ids))
    } else if (channel === events.list_data_overwire) {
      remoteLists.set('default', structuredClone(params.defaultList))
      remoteLists.set('love', structuredClone(params.loveList))
      if (params.tempList) remoteLists.set('temp', structuredClone(params.tempList))
      remoteUserLists = params.userList.map(({ list, ...info }) => {
        remoteLists.set(info.id, structuredClone(list))
        return info
      })
    }
    ipc.emit(channel, {}, structuredClone(params))
  }
  const setting = { 'list.addMusicLocationType': 'bottom' }
  const load = filename => {
    let absolute = path.isAbsolute(filename) ? filename : path.join(root, filename)
    if (!path.extname(absolute)) absolute = fs.existsSync(`${absolute}.ts`) ? `${absolute}.ts` : path.join(absolute, 'index.ts')
    if (modules.has(absolute)) return modules.get(absolute).exports
    const module = { exports: {} }
    modules.set(absolute, module)
    const injectedRequire = name => {
      if (name === 'electron') return { ipcRenderer: ipc }
      if (name === 'vue') return vue
      if (name === '@common/constants') return { LIST_IDS }
      if (name === '@renderer/store/setting') return { appSetting: setting }
      if (name === '@renderer/utils/data') return new Proxy({}, { get: () => async() => {} })
      if (name === '@renderer/core/player/action') return { playList: (listId, index) => plays.push({ listId, index }) }
      if (name.startsWith('@common/')) return load(`src/common/${name.slice('@common/'.length)}`)
      if (name.startsWith('@renderer/')) return load(`src/renderer/${name.slice('@renderer/'.length)}`)
      if (name.startsWith('.')) return load(path.resolve(path.dirname(absolute), name))
      return require(name)
    }
    vm.runInNewContext(compile(absolute), {
      module, exports: module.exports, require: injectedRequire, console, Date, setTimeout, clearTimeout,
      window: { lx: { worker: { main: { createSortedList: async(list, position, ids) => {
        const payload = structuredClone({ list, position, ids })
        workerCalls.push(payload)
        return sortList(payload.list, payload.position, payload.ids)
      } } } } },
    })
    return module.exports
  }
  events = load('src/common/ipcNames.ts').PLAYER_EVENT_NAME
  const actions = load('src/renderer/store/list/action.ts')
  const state = load('src/renderer/store/list/state.ts')
  const manager = load('src/renderer/store/list/listManage/index.ts')
  const dispose = actions.registerAction(() => {})
  const music = load('src/renderer/ui/services/music.ts')
  return { actions, state, manager, music, writes, plays, remoteLists, workerCalls, events, LIST_IDS, dispose }
}

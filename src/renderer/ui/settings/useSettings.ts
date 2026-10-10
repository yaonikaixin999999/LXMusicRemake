import { onBeforeUnmount, onMounted, reactive, ref, toRaw } from 'vue'
import { appSetting, mergeSetting } from '@renderer/store/setting'
import { defaultList, loveList, userLists } from '@renderer/store/list/state'
import { getListMusics, overwriteListFull, overwriteListMusics } from '@renderer/store/list/action'
import { userApi, sync, versionInfo } from '@renderer/store'
import * as ipc from '@renderer/utils/ipc'
import { setUserApi } from '@renderer/core/apiSource'
import { setPowerSaveBlocker } from '@renderer/core/player/utils'
import { convolutions, hasInitedAdvancedAudioFeatures, setMediaDeviceId } from '@renderer/plugins/player'
import { filterMusicList, fixNewMusicInfoQuality, toNewMusicInfo } from '@renderer/utils'
import { gzipData, readFile, saveStrToFile } from '@common/utils/nodejs'
import { sizeFormate } from '@common/utils/common'
import migrateSetting from '@common/utils/migrateSetting'
import { appearance, validateAppearance } from '@renderer/composables/useAppearance'
import { dislikeInfo } from '@renderer/store/dislikeList'
import { overwirteDislikeInfo } from '@renderer/core/dislikeList'
import { parseSettingValue, validateSettingBackup, type SettingField } from './schema'
import { setPreferredQuality } from '@renderer/ui/services/platformPlayback'
import type { PlatformQuality } from '@common/platformPlayback'

type BackupKind = 'all' | 'settings' | 'lists'
type FullList = LX.List.MyDefaultListInfoFull | LX.List.MyLoveListInfoFull | LX.List.UserListInfoFull

export function useSettings() {
  const busy = ref(false)
  const notice = ref('')
  const failed = ref(false)
  const fonts = ref<string[]>([])
  const devices = ref<MediaDeviceInfo[]>([])
  const syncDevices = ref<LX.Sync.ServerDevices>([])
  const caches = reactive({ resources: '…', sources: 0, urls: 0, lyrics: 0, edited: 0 })
  const rules = ref(dislikeInfo.rules)
  const confirmation = ref<{ title: string, message: string, danger: boolean } | null>(null)
  let resolveConfirmation: ((value: boolean) => void) | null = null

  async function confirm(title: string, message: string, danger = false): Promise<boolean> {
    if (resolveConfirmation) resolveConfirmation(false)
    confirmation.value = { title, message, danger }
    return new Promise(resolve => { resolveConfirmation = resolve })
  }
  function answerConfirmation(value: boolean) {
    confirmation.value = null
    resolveConfirmation?.(value)
    resolveConfirmation = null
  }
  async function run(message: string, action: () => Promise<unknown> | unknown) {
    failed.value = false
    notice.value = ''
    busy.value = true
    try {
      const result = await action()
      if (result !== false) notice.value = message
    } catch (error) {
      failed.value = true
      notice.value = error instanceof Error ? error.message : String(error)
    } finally { busy.value = false }
  }
  async function saveRecord(setting: Partial<LX.AppSetting>) {
    await ipc.updateSetting(setting)
    mergeSetting(setting)
  }
  async function setPreference(field: SettingField, input: string | boolean) {
    await run('设置已保存', async() => {
      const value = typeof input === 'boolean' ? input : parseSettingValue(field, input)
      if (field.key === 'player.playQuality') {
        await setPreferredQuality(value as PlatformQuality)
        return
      }
      const patch: Partial<LX.AppSetting> = { [field.key]: value }
      if (field.key === 'common.apiSource') {
        await setUserApi(String(value))
      } else if (field.key === 'player.mediaDeviceId') {
        if (hasInitedAdvancedAudioFeatures()) throw new Error('高级音频功能已启用，当前输出为系统默认设备。重新启动应用后可切换输出设备。')
        if (appSetting['player.audioVisualization']) {
          if (!await confirm('切换输出设备', '切换设备需要关闭音频可视化，是否继续？')) return false
          patch['player.audioVisualization'] = false
        }
        await setMediaDeviceId(String(value))
      } else if ((field.key.startsWith('player.soundEffect.') || field.key === 'player.isMaxOutputChannelCount' || field.key === 'player.audioVisualization') && value && appSetting['player.mediaDeviceId'] !== 'default') {
        if (!await confirm('使用系统默认输出', '高级音频处理需要系统默认输出设备。是否切换并应用设置？')) return false
        await setMediaDeviceId('default')
        patch['player.mediaDeviceId'] = 'default'
      }
      if (field.key === 'player.soundEffect.convolution.fileName') {
        const preset = convolutions.find(item => item.source === value)
        if (preset) {
          patch['player.soundEffect.convolution.mainGain'] = preset.mainGain * 10
          patch['player.soundEffect.convolution.sendGain'] = preset.sendGain * 10
        }
      }
      if (field.key === 'sync.mode' && appSetting['sync.enable']) {
        await toggleSync(false)
        await saveRecord(patch)
        await toggleSync(true)
      } else await saveRecord(patch)
      if (field.key === 'player.powerSaveBlocker') setPowerSaveBlocker(Boolean(value), true)
    })
  }
  async function chooseDirectory() {
    await run('下载目录已保存', async() => {
      const result = await ipc.showSelectDialog({ title: '选择音乐保存目录', defaultPath: appSetting['download.savePath'], properties: ['openDirectory', 'createDirectory'] })
      if (result.canceled || !result.filePaths[0]) return false
      await saveRecord({ 'download.savePath': result.filePaths[0] })
    })
  }
  async function refreshDevices() {
    if (!navigator.mediaDevices) return
    devices.value = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audiooutput')
  }
  async function importSourceText(script: string) {
    if (userApi.list.length >= 20) throw new Error('最多可以保存 20 个自定义音源。')
    if (Buffer.byteLength(script, 'utf8') > 9_000_000) throw new Error('音源脚本大小不能超过 9 MB。')
    const result = await ipc.importUserApi(script)
    userApi.list = result.apiList
  }
  async function importSource() {
    await run('音源已导入，请选择使用', async() => {
      const result = await ipc.showSelectDialog({ title: '导入音源脚本', properties: ['openFile'], filters: [{ name: '音源脚本', extensions: ['js'] }] })
      if (result.canceled || !result.filePaths[0]) return false
      await importSourceText((await readFile(result.filePaths[0])).toString('utf8'))
    })
  }
  async function removeSource(api: LX.UserApi.UserApiInfo) {
    if (!await confirm('移除音源', `移除「${api.name}」后，其脚本将从本机删除。`, true)) return
    await run('音源已移除', async() => {
      if (appSetting['common.apiSource'] === api.id) {
        const remaining = userApi.list.find(item => item.id !== api.id)
        await setUserApi(remaining?.id ?? '')
        await saveRecord({ 'common.apiSource': remaining?.id ?? '' })
      }
      userApi.list = await ipc.removeUserApi([api.id])
    })
  }
  async function useSource(id: string) {
    await run('已选择音源，正在初始化', async() => {
      await setUserApi(id)
      await saveRecord({ 'common.apiSource': id })
    })
  }
  async function allLists(): Promise<FullList[]> {
    const result: FullList[] = []
    for (const list of [defaultList, loveList, ...userLists]) {
      result.push({ ...toRaw(list), list: toRaw(await getListMusics(list.id)) })
    }
    return result
  }
  async function exportBackup(kind: BackupKind) {
    await run('备份已保存', async() => {
      const result = await ipc.openSaveDir({ title: '保存备份', defaultPath: `lx_${kind}_${new Date().toISOString().slice(0, 10)}.lxmc`, filters: [{ name: 'LX 备份', extensions: ['lxmc'] }] })
      if (result.canceled || !result.filePath) return false
      const settings = { ...toRaw(appSetting) }
      const look = { ...toRaw(appearance) }
      const payload = kind === 'all'
        ? { type: 'allData_v2', setting: settings, playList: await allLists(), appearance: look }
        : kind === 'lists' ? { type: 'playList_v2', data: await allLists() } : { type: 'setting_v2', data: settings, appearance: look }
      // Wait for the disk write so the saved message reflects an actual file.
      await saveStrToFile(result.filePath.endsWith('.lxmc') ? result.filePath : `${result.filePath}.lxmc`, await gzipData(JSON.stringify(payload)))
    })
  }
  async function importLists(data: any, oldFormat: boolean) {
    if (!Array.isArray(data)) throw new Error('备份中的歌单格式无效。')
    const lists = await allLists()
    for (const item of data) {
      if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || !Array.isArray(item.list)) throw new Error('备份包含无效歌单。')
      const music = filterMusicList(oldFormat ? item.list.map((info: any) => toNewMusicInfo(info)) : item.list).map(info => fixNewMusicInfoQuality(info))
      const existing = lists.find(list => list.id === item.id)
      if (existing) existing.list = music
      else lists.push({ id: item.id, name: item.name, list: music, source: item.source, sourceListId: item.sourceListId, locationUpdateTime: item.locationUpdateTime ?? null })
    }
    await overwriteListFull({ defaultList: lists.find(list => list.id === defaultList.id)!.list, loveList: lists.find(list => list.id === loveList.id)!.list, userList: lists.filter(list => list.id !== defaultList.id && list.id !== loveList.id) as LX.List.UserListInfoFull[] })
  }
  function prepareSettings(data: unknown, oldFormat: boolean) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('备份中的设置格式无效。')
    // Only current preferences may be restored; legacy skins and upstream updater
    // settings are deliberately excluded from the standalone application.
    return validateSettingBackup(oldFormat ? migrateSetting(data) : data)
  }
  async function importBackup(kind: BackupKind) {
    await run('备份已导入', async() => {
      const result = await ipc.showSelectDialog({ title: '选择 LX 备份', properties: ['openFile'], filters: [{ name: 'LX 备份', extensions: ['lxmc', 'json'] }] })
      if (result.canceled || !result.filePaths[0]) return false
      const data = await window.lx.worker.main.readLxConfigFile(result.filePaths[0])
      if (!data || typeof data.type !== 'string') throw new Error('无法识别这个备份文件。')
      if ((kind === 'all' && !['allData', 'allData_v2'].includes(data.type)) || (kind === 'settings' && !['setting', 'setting_v2'].includes(data.type)) || (kind === 'lists' && !['playList', 'playList_v2', 'defautlList'].includes(data.type))) throw new Error('请选择与当前导入类型相符的备份文件。')
      const oldFormat = !data.type.endsWith('_v2')
      const setting = kind === 'all' ? prepareSettings(data.setting, oldFormat) : kind === 'settings' ? prepareSettings(data.data, oldFormat) : null
      if (kind !== 'settings' && !await confirm('导入歌单备份', '同名 ID 的现有歌单将使用备份中的内容覆盖，其他歌单继续保留。是否继续？', true)) return false
      if (kind === 'all') {
        if (data.defaultList) await overwriteListMusics({ listId: defaultList.id, musicInfos: filterMusicList(data.defaultList.list.map((info: any) => toNewMusicInfo(info))) })
        else await importLists(data.playList, oldFormat)
        await saveRecord(setting!)
      } else if (kind === 'settings') await saveRecord(setting!)
      else if (data.type === 'defautlList') await overwriteListMusics({ listId: defaultList.id, musicInfos: filterMusicList(data.data.list.map((info: any) => toNewMusicInfo(info))) })
      else await importLists(data.data, oldFormat)
      if (data.appearance) Object.assign(appearance, validateAppearance(data.appearance))
    })
  }
  async function exportText(format: 'text' | 'csv') {
    await run('歌单已导出', async() => {
      const result = await ipc.openSaveDir({ title: '导出所有歌单', defaultPath: `lx_music_lists.${format === 'csv' ? 'csv' : 'txt'}` })
      if (result.canceled || !result.filePath) return false
      const lists = await allLists()
      if (format === 'csv') await window.lx.worker.main.exportPlayListToCSV(result.filePath, lists, true, '歌名,歌手,专辑\n')
      else await window.lx.worker.main.exportPlayListToText(result.filePath, lists, true)
    })
  }
  async function refreshCaches() {
    const results = await Promise.allSettled([ipc.getCacheSize(), ipc.getOtherSourceCount(), ipc.getMusicUrlCount(), ipc.getLyricRawCount(), ipc.getLyricEditedCount()])
    if (results[0].status === 'fulfilled') caches.resources = sizeFormate(results[0].value)
    for (const [index, key] of ['sources', 'urls', 'lyrics', 'edited'].entries()) {
      const result = results[index + 1]
      if (result.status === 'fulfilled') caches[key as 'sources' | 'urls' | 'lyrics' | 'edited'] = result.value
    }
  }
  async function clearData(kind: 'resources' | 'sources' | 'urls' | 'lyrics' | 'edited' | 'lists') {
    const name = { resources: '资源缓存', sources: '换源缓存', urls: '播放地址缓存', lyrics: '原始歌词缓存', edited: '已编辑歌词', lists: '全部歌单及收藏' }[kind]
    if (!await confirm(`清理${name}`, kind === 'lists' || kind === 'edited' ? `此操作会删除${name}，无法恢复。请先导出备份。` : `将清理${name}，之后使用时会重新获取。`, true)) return
    await run(`${name}已清理`, async() => {
      if (kind === 'lists') await overwriteListFull({ defaultList: [], loveList: [], userList: [] })
      else await ({ resources: ipc.clearCache, sources: ipc.clearOtherSource, urls: ipc.clearMusicUrl, lyrics: ipc.clearLyricRaw, edited: ipc.clearLyricEdited }[kind])()
      await refreshCaches()
    })
  }
  async function toggleSync(enable: boolean) {
    if (appSetting['sync.mode'] === 'server') await ipc.sendSyncAction({ action: 'enable_server', data: { enable, port: appSetting['sync.server.port'] } })
    else await ipc.sendSyncAction({ action: 'enable_client', data: { enable, host: appSetting['sync.client.host'] } })
  }
  async function refreshSyncDevices() { syncDevices.value = await ipc.getSyncServerDevices() }
  async function removeSyncDevice(device: LX.Sync.ServerKeyInfo) {
    if (!await confirm('取消设备配对', `取消「${device.deviceName}」的配对后，需要重新输入连接码。`, true)) return
    await run('设备已取消配对', async() => { await ipc.removeSyncServerDevice(device.clientId); await refreshSyncDevices() })
  }
  async function saveRules() { await run('屏蔽规则已保存', async() => { await overwirteDislikeInfo(rules.value); rules.value = dislikeInfo.rules }) }
  async function initialize() {
    const results = await Promise.allSettled([ipc.getSystemFonts(), ipc.getUserApiList(), refreshDevices(), refreshCaches(), refreshSyncDevices()])
    if (results[0].status === 'fulfilled') fonts.value = results[0].value.map(font => font.replace(/^"|"$/g, ''))
    if (results[1].status === 'fulfilled') userApi.list = results[1].value
    const errors = results.filter(result => result.status === 'rejected')
    if (errors.length) { failed.value = true; notice.value = '部分设备信息暂时无法读取，可稍后点击刷新。' }
  }
  onMounted(() => {
    void initialize()
    navigator.mediaDevices?.addEventListener('devicechange', refreshDevices)
  })
  onBeforeUnmount(() => {
    answerConfirmation(false)
    navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices)
  })
  return { busy, notice, failed, fonts, devices, syncDevices, caches, rules, confirmation, answerConfirmation, confirm, run, saveRecord, setPreference, chooseDirectory, refreshDevices, importSource, importSourceText, removeSource, useSource, exportBackup, importBackup, exportText, refreshCaches, clearData, refreshSyncDevices, removeSyncDevice, saveRules, sync, versionInfo, userApi }
}

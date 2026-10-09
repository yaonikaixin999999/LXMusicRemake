<template>
  <div class="studio-settings">
    <header class="studio-settings-heading">
      <div><p>MAKE IT YOURS</p><h1>设置</h1><span>让每一次聆听，都更合心意。</span></div>
      <label class="studio-settings-search"><UiIcon name="search" /><input v-model="query" type="search" placeholder="搜索设置…" aria-label="搜索设置"></label>
    </header>
    <div class="studio-settings-layout">
      <nav class="studio-settings-nav" aria-label="设置分类">
        <button v-for="category in categories" :key="category.id" type="button" :class="{ active: active === category.id && !query }" @click="selectCategory(category.id)">{{ category.name }}<UiIcon name="chevronRight" /></button>
      </nav>
      <main ref="content" class="studio-settings-content scroll">
        <div v-if="notice" class="studio-settings-notice" :class="{ error: failed }" role="status"><span>{{ notice }}</span><button type="button" aria-label="关闭提示" @click="notice = ''"><UiIcon name="close" /></button></div>
        <div v-if="!visibleCategories.length" class="studio-settings-empty"><h2>没有找到相关设置</h2><p>试试「音源」「歌词」「代理」或「备份」。</p></div>
        <section v-for="category in visibleCategories" :key="category.id" class="studio-settings-panel">
          <header class="studio-settings-section-heading"><h2>{{ category.name }}</h2><p>{{ category.description }}</p></header>

          <div v-if="category.id === 'general'" class="studio-settings-feature">
            <div><h3>你的音乐，你的风格</h3><p>浅色与深色、点缀色、圆角、间距与发现页内容，即刻调整。</p></div>
            <button type="button" class="studio-settings-button primary" @click="appearancePanelOpen = true">外观定制 <UiIcon name="arrowUpRight" /></button>
          </div>

          <template v-if="category.id === 'sources'">
            <div class="studio-settings-feature"><div><h3>{{ userApi.status ? '音源连接正常' : currentSource ? '音源连接状态' : '添加你的音乐音源' }}</h3><p>{{ currentSource ? `${currentSource.name} · ${sourceStatus}` : '导入已有的 LX 音源脚本后，即可使用对应接口播放音乐。' }}</p></div><button type="button" class="studio-settings-button primary" :disabled="busy" @click="importSource()">导入脚本</button></div>
            <div class="studio-settings-inline-form"><input v-model="sourceUrl" type="url" placeholder="https://… 音源脚本地址" aria-label="在线音源脚本地址"><button type="button" class="studio-settings-button" :disabled="busy || !sourceUrl" @click="importOnlineSource">从链接导入</button></div>
            <div v-if="!userApi.list.length" class="studio-settings-empty compact"><p>当前尚未导入自定义音源。</p></div>
            <article v-for="api in userApi.list" :key="api.id" class="studio-settings-source" :class="{ selected: appSetting['common.apiSource'] === api.id }">
              <div class="studio-settings-source-info"><h3>{{ api.name }} <small v-if="api.version">{{ api.version }}</small><span v-if="appSetting['common.apiSource'] === api.id" class="studio-settings-tag">当前音源</span></h3><p>{{ api.description || '自定义音乐接口' }}</p><span v-if="api.author">{{ api.author }}</span><label class="studio-settings-check"><input :checked="api.allowShowUpdateAlert" type="checkbox" @change="toggleSourceUpdates(api, $event)">接收此音源的更新提醒</label></div>
              <div class="studio-settings-actions"><button v-if="api.homepage" type="button" class="studio-settings-button" @click="openHomepage(api)">主页</button><button type="button" class="studio-settings-button" :disabled="busy || appSetting['common.apiSource'] === api.id" @click="useSource(api.id)">使用</button><button type="button" class="studio-settings-button danger" :disabled="busy" @click="removeSource(api)">移除</button></div>
            </article>
          </template>

          <div v-for="field in fieldsFor(category.id)" :key="field.key" class="studio-settings-row">
            <div class="studio-settings-label"><label :for="fieldId(field)">{{ field.label }}</label><p v-if="field.hint">{{ field.hint }}</p></div>
            <div class="studio-settings-control">
              <button v-if="field.type === 'boolean'" :id="fieldId(field)" type="button" class="studio-settings-switch" :class="{ checked: appSetting[field.key] }" role="switch" :aria-checked="Boolean(appSetting[field.key])" :aria-label="field.label" @click="setPreference(field, !appSetting[field.key])"><span /></button>
              <UiSelect v-else-if="optionsFor(field).length" :id="fieldId(field)" :model-value="String(appSetting[field.key] ?? '')" :options="optionsFor(field)" :aria-label="field.label" @change="changeChoice(field, $event)" />
              <template v-else-if="field.type === 'path'"><input :id="fieldId(field)" :value="appSetting[field.key]" @change="changeField(field, $event)"><button type="button" class="studio-settings-icon-button" aria-label="选择保存目录" @click="chooseDirectory"><UiIcon name="folder" /></button><button type="button" class="studio-settings-icon-button" aria-label="打开保存目录" @click="openDirInExplorer(appSetting['download.savePath'])"><UiIcon name="arrowUpRight" /></button></template>
              <div v-else-if="field.type === 'font'" class="studio-settings-font"><UiSelect :model-value="String(appSetting[field.key] ?? '')" :options="fontOptions" :aria-label="`${field.label}，选择系统字体`" placeholder="选择系统字体" @change="changeChoice(field, $event)" /><input :id="fieldId(field)" :value="appSetting[field.key]" placeholder="或手动填写字体家族" @change="changeField(field, $event)"></div>
              <template v-else-if="field.type === 'color'"><span class="studio-settings-color" :style="{ background: String(appSetting[field.key]) }" /><input :id="fieldId(field)" :value="appSetting[field.key]" @change="changeField(field, $event)"></template>
              <input v-else :id="fieldId(field)" :type="field.type === 'number' ? 'number' : 'text'" :value="appSetting[field.key] ?? ''" :min="field.min" :max="field.max" :step="field.step" @change="changeField(field, $event)">
            </div>
          </div>

          <div v-if="category.id === 'playback'" class="studio-settings-feature"><div><h3>定时停止</h3><p>{{ timer.timeLabel.value ? `剩余 ${timer.timeLabel.value}` : '在上方设置分钟数，睡前让音乐陪伴一会儿。' }}</p></div><div class="studio-settings-actions"><button type="button" class="studio-settings-button" @click="stopTimeoutStop">取消定时</button><button type="button" class="studio-settings-button primary" @click="startTimer">启动定时</button></div></div>

          <template v-if="category.id === 'audio'">
            <div class="studio-settings-actions spaced"><button type="button" class="studio-settings-button" @click="run('输出设备已刷新', refreshDevices)">刷新输出设备</button><button type="button" class="studio-settings-button" @click="resetEQ">重置均衡器</button></div>
            <div class="studio-settings-feature"><div><h3>均衡器预设</h3><p>快速应用声音风格，也可以保存当前均衡器参数。</p></div><div class="studio-settings-actions"><UiSelect :model-value="eqPresetId" :options="eqPresetOptions" aria-label="选择均衡器预设" placeholder="选择预设…" @change="chooseEqPreset" /></div></div>
            <div class="studio-settings-inline-form"><input v-model="eqPresetName" placeholder="当前均衡器的新预设名称" aria-label="均衡器预设名称"><button type="button" class="studio-settings-button" :disabled="!eqPresetName || busy" @click="saveEq">保存预设</button></div>
            <div v-if="customEq.length" class="studio-settings-presets"><span v-for="preset in customEq" :key="preset.id"><button type="button" @click="applyEQ(preset)">{{ preset.name }}</button><button type="button" :aria-label="`移除预设 ${preset.name}`" @click="deleteEq(preset.id)"><UiIcon name="close" /></button></span></div>
          </template>

          <template v-if="category.id === 'library'">
            <div class="studio-settings-subheading"><h3>不喜欢与屏蔽规则</h3><p>每行一条规则：歌名、歌名@歌手，或 @歌手。播放时会跳过匹配的音乐。</p></div>
            <textarea v-model="rules" class="studio-settings-rules" rows="7" aria-label="音乐屏蔽规则" placeholder="歌名@歌手" />
            <div class="studio-settings-actions spaced"><button type="button" class="studio-settings-button primary" :disabled="busy" @click="saveRules">保存屏蔽规则</button></div>
          </template>

          <template v-if="category.id === 'sync'">
            <div class="studio-settings-feature"><div><h3>{{ syncStatus }}</h3><p>{{ appSetting['sync.mode'] === 'server' ? sync.server.status.address.join(' · ') : sync.client.status.address.join(' · ') }}</p><strong v-if="appSetting['sync.mode'] === 'server' && sync.server.status.code" class="studio-settings-pair-code">{{ sync.server.status.code }}</strong></div><button v-if="appSetting['sync.mode'] === 'server'" type="button" class="studio-settings-button" :disabled="!appSetting['sync.enable']" @click="run('连接码已刷新', () => sendSyncAction({ action: 'generate_code' }))">刷新连接码</button></div>
            <div v-if="appSetting['sync.mode'] === 'client'" class="studio-settings-inline-form"><input v-model="authCode" aria-label="同步连接码" placeholder="输入其他设备上的连接码"><button type="button" class="studio-settings-button primary" :disabled="!authCode || busy" @click="connectSync">连接并验证</button></div>
            <div v-else><div class="studio-settings-subheading"><h3>已配对设备</h3><button type="button" class="studio-settings-text-button" @click="run('设备列表已刷新', refreshSyncDevices)">刷新</button></div><p v-if="!syncDevices.length" class="studio-settings-hint">还没有配对设备。</p><div v-for="device in syncDevices" :key="device.clientId" class="studio-settings-device"><span>{{ device.deviceName }}<small>{{ device.lastConnectDate ? new Date(device.lastConnectDate).toLocaleString() : '尚未连接' }}</small></span><button type="button" class="studio-settings-button danger" @click="removeSyncDevice(device)">取消配对</button></div></div>
          </template>

          <div v-if="category.id === 'openAPI'" class="studio-settings-feature"><div><h3>{{ openAPI.address ? '开放接口已启动' : '开放接口未启动' }}</h3><p>{{ openAPI.address || openAPI.message || '启用后显示实际服务地址。' }}</p></div><button type="button" class="studio-settings-button" @click="openUrl('https://lyswhut.github.io/lx-music-doc/desktop/open-api')">接口文档<UiIcon name="arrowUpRight" /></button></div>

          <template v-if="category.id === 'hotkeys'">
            <p class="studio-settings-hint">点击按键输入框，然后按下组合键。Delete / Backspace 可清空；离开输入框时保存。</p>
            <section v-for="kind in hotkeyKinds" :key="kind.id" class="studio-settings-hotkeys"><header><h3>{{ kind.name }}</h3><label class="studio-settings-check"><input :checked="hotkeys.config.value[kind.id].enable" type="checkbox" @change="enableHotkeys(kind.id, $event)">启用</label></header><div v-for="info in hotkeys.allHotKeys[kind.id]" :key="info.name" class="studio-settings-row"><label :for="`shortcut-${kind.id}-${info.name}`">{{ shortcutLabel(info.name) }}</label><div class="studio-settings-control"><input :id="`shortcut-${kind.id}-${info.name}`" :value="shortcutValue(kind.id, info.name)" readonly placeholder="点击设置组合键" @focus="hotkeys.begin(kind.id, info)" @blur="hotkeys.finish"><span v-if="kind.id === 'global' && hotkeys.status.value.get(hotkeys.binding(kind.id, info.name))?.status === false" class="studio-settings-hotkey-error">被系统占用</span></div></div></section>
          </template>

          <template v-if="category.id === 'data'">
            <div class="studio-settings-backups"><article v-for="kind in backupKinds" :key="kind.id"><UiIcon :name="kind.icon" /><h3>{{ kind.name }}</h3><p>{{ kind.description }}</p><div class="studio-settings-actions"><button type="button" class="studio-settings-button" :disabled="busy" @click="importBackup(kind.id)">导入</button><button type="button" class="studio-settings-button primary" :disabled="busy" @click="exportBackup(kind.id)">导出</button></div></article></div>
            <div class="studio-settings-actions spaced"><button type="button" class="studio-settings-button" :disabled="busy" @click="exportText('text')">歌单导出为文本</button><button type="button" class="studio-settings-button" :disabled="busy" @click="exportText('csv')">歌单导出为 CSV</button></div>
            <div class="studio-settings-subheading"><h3>缓存与存储</h3><button type="button" class="studio-settings-text-button" @click="run('缓存统计已刷新', refreshCaches)">刷新统计</button></div>
            <div v-for="cache in cacheKinds" :key="cache.id" class="studio-settings-row"><div class="studio-settings-label"><span>{{ cache.name }}</span><p>{{ cache.id === 'resources' ? caches.resources : `${caches[cache.id]} 条` }}</p></div><button type="button" class="studio-settings-button" :disabled="busy" @click="clearData(cache.id)">清理</button></div>
            <div class="studio-settings-feature danger"><div><h3>清空音乐库</h3><p>删除所有歌单、试听列表与收藏。清理前请导出备份。</p></div><button type="button" class="studio-settings-button danger" :disabled="busy" @click="clearData('lists')">清空音乐库</button></div>
          </template>

          <template v-if="category.id === 'about'">
            <div class="studio-settings-about"><span>LX</span><h2>LX Studio</h2><p>版本 {{ versionInfo.version }} · 独立桌面客户端</p><p>音乐无界，热爱不止。</p></div>
            <p class="studio-settings-hint">LX Studio 基于落雪无痕的 LX Music 开源项目重新设计界面，保留其原生播放器和音乐服务。遵循 Apache-2.0 开源许可。本产品独立安装，不使用原项目的自动更新渠道。</p>
            <div class="studio-settings-actions spaced"><button type="button" class="studio-settings-button" @click="openUrl('https://github.com/lyswhut/lx-music-desktop')">原项目源码<UiIcon name="arrowUpRight" /></button><button type="button" class="studio-settings-button" @click="openUrl('https://lyswhut.github.io/lx-music-doc/desktop')">使用说明<UiIcon name="arrowUpRight" /></button><button type="button" class="studio-settings-button" @click="licenseOpen = true">开源许可</button></div>
          </template>
        </section>
      </main>
    </div>
    <UiModal :show="Boolean(confirmation)" :title="confirmation?.title ?? ''" @close="answerConfirmation(false)"><p>{{ confirmation?.message }}</p><template #footer><button type="button" class="ui-dialog-button" @click="answerConfirmation(false)">取消</button><button type="button" class="ui-dialog-button" :class="confirmation?.danger ? 'ui-dialog-button-danger' : 'ui-dialog-button-primary'" @click="answerConfirmation(true)">确认</button></template></UiModal>
    <UiModal :show="licenseOpen" title="开源许可与归属" @close="licenseOpen = false"><p>LX Studio 的播放器、音源接口和资料管理基于 LX Music Desktop。</p><p class="studio-settings-license">LX Music Desktop<br>Copyright © lyswhut / 落雪无痕<br>Licensed under the Apache License, Version 2.0.</p><p>修改后的界面代码与第三方依赖保留各自原始版权和许可声明。完整许可文件随应用一起分发。</p><template #footer><button type="button" class="ui-dialog-button" @click="openUrl('https://www.apache.org/licenses/LICENSE-2.0')">查看 Apache-2.0<UiIcon name="arrowUpRight" /></button><button type="button" class="ui-dialog-button ui-dialog-button-primary" @click="licenseOpen = false">关闭</button></template></UiModal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { appearancePanelOpen } from '@renderer/composables/useAppearance'
import { appSetting } from '@renderer/store/setting'
import { openAPI } from '@renderer/store'
import { openUrl } from '@common/utils/electron'
import { openDirInExplorer, sendSyncAction, setAllowShowUserApiUpdateAlert } from '@renderer/utils/ipc'
import { httpFetch } from '@renderer/utils/request'
import { convolutions, freqs, freqsPreset } from '@renderer/plugins/player'
import { getUserEQPresetList, saveUserEQPreset, removeUserEQPreset } from '@renderer/store/soundEffect'
import { startTimeoutStop, stopTimeoutStop, useTimeout } from '@renderer/core/player/timeoutStop'
import UiModal from '@renderer/ui/components/UiModal.vue'
import UiSelect from '@renderer/ui/components/UiSelect.vue'
import UiIcon from '@renderer/ui/components/UiIcon.vue'
import { categories, settingFields, type Option, type SettingField } from '@renderer/ui/settings/schema'
import { useSettings } from '@renderer/ui/settings/useSettings'
import { useHotkeys } from '@renderer/ui/settings/useHotkeys'

const settings = useSettings()
const { busy, notice, failed, fonts, devices, syncDevices, caches, rules, confirmation, answerConfirmation, run, setPreference, chooseDirectory, refreshDevices, importSource, removeSource, useSource, exportBackup, importBackup, exportText, refreshCaches, clearData, refreshSyncDevices, removeSyncDevice, saveRules, sync, versionInfo, userApi } = settings
const query = ref('')
const active = ref('general')
const content = ref<HTMLElement | null>(null)
const sourceUrl = ref('')
const authCode = ref('')
const licenseOpen = ref(false)
const customEq = ref<LX.SoundEffect.EQPreset[]>([])
const eqPresetName = ref('')
const eqPresetId = ref('')
const timer = useTimeout()
const report = (error: unknown) => { failed.value = true; notice.value = error instanceof Error ? error.message : String(error) }
const hotkeys = useHotkeys(report)
const hotkeyKinds = [{ id: 'local', name: '应用内快捷键' }, { id: 'global', name: '全局快捷键' }] as const
const backupKinds = [{ id: 'all', name: '完整备份', icon: 'folder', description: '歌单、设置与现代外观' }, { id: 'lists', name: '音乐库', icon: 'library', description: '试听、收藏与个人歌单' }, { id: 'settings', name: '偏好设置', icon: 'settings', description: '应用设置与现代外观' }] as const
const fontOptions = computed(() => [{ value: '', label: '系统默认' }, ...fonts.value.map(font => ({ value: font, label: font }))])
const cacheKinds = [{ id: 'resources', name: '图片和资源缓存' }, { id: 'sources', name: '换源匹配缓存' }, { id: 'urls', name: '播放地址缓存' }, { id: 'lyrics', name: '原始歌词缓存' }, { id: 'edited', name: '已编辑歌词' }] as const
const keyword = computed(() => query.value.trim().toLowerCase())
const visibleCategories = computed(() => keyword.value ? categories.filter(category => `${category.name} ${category.description} ${category.keywords}`.toLowerCase().includes(keyword.value) || settingFields.some(field => field.category === category.id && `${field.label} ${field.hint ?? ''}`.toLowerCase().includes(keyword.value))) : categories.filter(category => category.id === active.value))
const currentSource = computed(() => userApi.list.find(api => api.id === appSetting['common.apiSource']))
const sourceStatus = computed(() => userApi.status ? '已就绪' : userApi.message === 'initing' ? '正在初始化' : userApi.message ? userApi.message : '尚未连接')
const syncStatus = computed(() => {
  const status = appSetting['sync.mode'] === 'server' ? sync.server.status : sync.client.status
  return status.status ? '设备同步正在运行' : status.message || '设备同步未启动'
})
const fieldId = (field: SettingField) => `pref-${field.key.replaceAll('.', '-')}`
function selectCategory(id: string) { active.value = id; query.value = ''; content.value?.scrollTo({ top: 0 }) }
function fieldsFor(id: string) {
  const category = categories.find(item => item.id === id)
  const matchesCategory = `${category?.name} ${category?.description} ${category?.keywords}`.toLowerCase().includes(keyword.value)
  return settingFields.filter(field => field.category === id && (!keyword.value || matchesCategory || `${field.label} ${field.hint ?? ''}`.toLowerCase().includes(keyword.value)))
}
function optionsFor(field: SettingField): Option[] {
  if (field.key === 'common.apiSource') return [{ value: '', label: '未选择音源' }, ...userApi.list.map(api => ({ value: api.id, label: api.name }))]
  if (field.key === 'player.mediaDeviceId') return [{ value: 'default', label: '系统默认输出' }, ...devices.value.filter(device => device.deviceId !== 'default').map((device, index) => ({ value: device.deviceId, label: device.label || `音频输出 ${index + 1}` }))]
  if (field.key === 'player.soundEffect.convolution.fileName') return [{ value: '', label: '关闭环境混响' }, ...convolutions.map(preset => ({ value: preset.source, label: window.i18n.t(`player__sound_effect_convolution_file_${preset.name}` as Parameters<typeof window.i18n.t>[0]) }))]
  return field.options ?? []
}
function changeField(field: SettingField, event: Event) { void setPreference(field, (event.target as HTMLInputElement).value) }
function changeChoice(field: SettingField, value: string | number) { void setPreference(field, String(value)) }
async function importOnlineSource() {
  try {
    const url = new URL(sourceUrl.value.trim())
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('请输入 HTTP 或 HTTPS 音源脚本地址。')
    await run('音源已导入，请选择使用', async() => {
      const request = httpFetch(url.toString(), { follow_max: 3 }) as unknown as { promise: Promise<{ statusCode: number, body: unknown }> }
      const response = await request.promise
      if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`读取失败：HTTP ${response.statusCode}`)
      const body: unknown = response.body
      if (typeof body !== 'string' && !Buffer.isBuffer(body)) throw new Error('服务器没有返回有效的脚本文本。')
      await settings.importSourceText(typeof body === 'string' ? body : body.toString('utf8'))
      sourceUrl.value = ''
    })
  } catch (error) { report(error) }
}
function openHomepage(api: LX.UserApi.UserApiInfo) { if (api.homepage) void openUrl(api.homepage).catch(report) }
function toggleSourceUpdates(api: LX.UserApi.UserApiInfo, event: Event) {
  const value = (event.target as HTMLInputElement).checked
  void run('音源提醒设置已保存', async() => { await setAllowShowUserApiUpdateAlert(api.id, value); api.allowShowUpdateAlert = value })
}
function startTimer() {
  const minutes = Number(appSetting['player.waitPlayEndStopTime'])
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 10080) { report(new Error('请设置 1–10080 分钟的定时停止时间。')); return }
  startTimeoutStop(minutes * 60)
  notice.value = '定时停止已启动'
}
const eqPresets = computed(() => [...freqsPreset.map(preset => ({ ...preset, id: preset.name, name: window.i18n.t(`player__sound_effect_biquad_filter_preset_${preset.name}` as Parameters<typeof window.i18n.t>[0]) })), ...customEq.value])
const eqPresetOptions = computed(() => eqPresets.value.map(preset => ({ value: preset.id, label: preset.name, group: customEq.value.some(item => item.id === preset.id) ? '我的预设' : '内置预设' })))
async function applyEQ(preset: Omit<LX.SoundEffect.EQPreset, 'id' | 'name'>) {
  await run('均衡器预设已应用', async() => {
    if (appSetting['player.mediaDeviceId'] !== 'default') {
      if (!await settings.confirm('应用均衡器', '均衡器需要使用系统默认输出，是否切换？')) return false
      const field = settingFields.find(item => item.key === 'player.mediaDeviceId')!
      await setPreference(field, 'default')
      if (appSetting['player.mediaDeviceId'] !== 'default') return false
    }
    const patch: Partial<LX.AppSetting> = {}
    for (const frequency of freqs) patch[`player.soundEffect.biquadFilter.hz${frequency}`] = preset[`hz${frequency}`]
    await settings.saveRecord(patch)
  })
}
function chooseEqPreset(value: string | number) { const preset = eqPresets.value.find(item => item.id === String(value)); if (preset) { eqPresetId.value = preset.id; void applyEQ(preset) } }
function resetEQ() { const preset = Object.fromEntries(freqs.map(frequency => [`hz${frequency}`, 0])) as Omit<LX.SoundEffect.EQPreset, 'id' | 'name'>; void applyEQ(preset) }
async function saveEq() {
  await run('均衡器预设已保存', async() => {
    const preset: LX.SoundEffect.EQPreset = { id: `studio_eq_${Date.now()}`, name: eqPresetName.value.trim(), hz31: appSetting['player.soundEffect.biquadFilter.hz31'], hz62: appSetting['player.soundEffect.biquadFilter.hz62'], hz125: appSetting['player.soundEffect.biquadFilter.hz125'], hz250: appSetting['player.soundEffect.biquadFilter.hz250'], hz500: appSetting['player.soundEffect.biquadFilter.hz500'], hz1000: appSetting['player.soundEffect.biquadFilter.hz1000'], hz2000: appSetting['player.soundEffect.biquadFilter.hz2000'], hz4000: appSetting['player.soundEffect.biquadFilter.hz4000'], hz8000: appSetting['player.soundEffect.biquadFilter.hz8000'], hz16000: appSetting['player.soundEffect.biquadFilter.hz16000'] }
    if (!preset.name) return false
    await saveUserEQPreset(preset)
    customEq.value = await getUserEQPresetList()
    eqPresetName.value = ''
  })
}
async function deleteEq(id: string) { await run('均衡器预设已移除', async() => { await removeUserEQPreset(id); customEq.value = await getUserEQPresetList() }) }
async function connectSync() { await run('连接请求已发送', async() => { await settings.saveRecord({ 'sync.enable': true }); await sendSyncAction({ action: 'enable_client', data: { enable: true, host: appSetting['sync.client.host'], authCode: authCode.value.trim() } }) }) }
function shortcutLabel(name: string) { return window.i18n.t(`setting__hot_key_${name}` as Parameters<typeof window.i18n.t>[0]) }
function shortcutValue(kind: 'local' | 'global', name: string) {
  const item = hotkeys.recording.value
  if (item?.kind === kind && item.info.name === name) return item.changed ? hotkeys.formatted(item.next) : '按下新的组合键…'
  return hotkeys.formatted(hotkeys.binding(kind, name))
}
function enableHotkeys(kind: 'local' | 'global', event: Event) { void hotkeys.enable(kind, (event.target as HTMLInputElement).checked) }
onMounted(() => { void getUserEQPresetList().then(list => { customEq.value = list }).catch(report) })
</script>

<style lang="less">
.studio-settings { height: 100%; display: flex; flex-direction: column; color: var(--modern-text); overflow: hidden; }
.studio-settings-heading { padding: 25px 30px 21px; display: flex; align-items: center; justify-content: space-between; gap: 20px; border-bottom: 1px solid var(--modern-border); flex: none; > div > p { font-size: 9px; color: var(--modern-muted); letter-spacing: 1.8px; margin-bottom: 8px; } h1 { font-size: 26px; font-weight: 600; } > div > span { display: block; font-size: 11px; color: var(--modern-muted); margin-top: 7px; } }
.studio-settings-search { display: flex; align-items: center; gap: 9px; width: 230px; padding: 11px 13px; background: var(--modern-hover); border-radius: var(--modern-radius-small); svg { width: 16px; height: 16px; flex: none; stroke-width: 1.5; color: var(--modern-muted); } input { min-width: 0; width: 100%; font: inherit; font-size: 12px; border: 0; background: transparent; outline: none; color: inherit; } }
.studio-settings-layout { display: grid; grid-template-columns: 165px minmax(0, 1fr); min-height: 0; flex: 1; }
.studio-settings-nav { overflow: auto; padding: 16px 12px; border-right: 1px solid var(--modern-border); button { width: 100%; display: flex; align-items: center; justify-content: space-between; font: inherit; font-size: 11px; border: 0; padding: 11px 12px; background: transparent; color: var(--modern-muted); border-radius: var(--modern-radius-small); margin-bottom: 3px; text-align: left; cursor: pointer; svg { opacity: 0; width: 14px; height: 14px; } &:hover { color: var(--modern-text); background: var(--modern-hover); } &.active { color: var(--modern-accent-ink); background: var(--modern-accent-soft); font-weight: 600; svg { opacity: 1; } } } }
.studio-settings-content { min-height: 0; padding: 25px 30px 40px; overflow: auto; }
.studio-settings-panel { max-width: 940px; margin: 0 auto 28px; }
.studio-settings-section-heading { margin-bottom: 22px; h2 { font-size: 20px; font-weight: 600; } p { color: var(--modern-muted); font-size: 11px; line-height: 1.7; margin-top: 7px; } }
.studio-settings-feature { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 19px 20px; margin-bottom: 18px; background: var(--modern-accent-soft); border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); > div:first-child { min-width: 0; } h3 { font-size: 13px; font-weight: 550; } p { font-size: 11px; color: var(--modern-muted); line-height: 1.8; margin-top: 6px; overflow-wrap: anywhere; } &.danger { background: rgba(197, 78, 78, .05); margin-top: 25px; } }
.studio-settings-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 66px; padding: 13px 0; border-bottom: 1px solid var(--modern-border); box-sizing: border-box; font-size: 12px; }
.studio-settings-label { flex: 1; min-width: 0; line-height: 1.5; label { cursor: default; } p { font-size: 10px; color: var(--modern-muted); line-height: 1.7; margin-top: 5px; max-width: 420px; } }
.studio-settings-control { flex: none; width: 230px; display: flex; align-items: center; justify-content: flex-end; gap: 7px; input, .ui-select { width: 100%; min-width: 0; } input[type='number'] { max-width: 110px; } }
.studio-settings-control input, .studio-settings-inline-form input { box-sizing: border-box; border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); background: var(--modern-hover); color: var(--modern-text); padding: 10px 11px; font: inherit; font-size: 11px; min-height: 36px; }
.studio-settings-font { width: 100%; display: flex; flex-direction: column; gap: 7px; }
.studio-settings-switch { width: 35px; height: 21px; flex: none; border: 0; padding: 3px; border-radius: 20px; background: var(--modern-border); cursor: pointer; span { display: block; width: 15px; height: 15px; border-radius: 50%; background: var(--modern-panel); box-shadow: 0 1px 3px #0002; transition: transform .18s; } &.checked { background: var(--modern-accent); span { transform: translateX(14px); } } }
.studio-settings-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; font: inherit; font-size: 11px; border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); background: var(--modern-panel); color: var(--modern-text); padding: 9px 13px; white-space: nowrap; cursor: pointer; svg { width: 14px; height: 14px; } &:hover { background: var(--modern-hover); } &:disabled { opacity: .4; cursor: default; } &.primary { background: var(--modern-text); color: var(--modern-panel); border-color: transparent; &:hover { opacity: .85; } } &.danger { color: #c66666; background: rgba(197, 78, 78, .07); border-color: transparent; } }
.studio-settings-icon-button { display: grid; place-items: center; padding: 0; border: 1px solid var(--modern-border); border-radius: 9px; background: var(--modern-hover); color: var(--modern-muted); width: 31px; height: 35px; flex: none; cursor: pointer; svg { width: 16px; height: 16px; } }
.studio-settings-color { width: 25px; height: 25px; border-radius: 8px; border: 1px solid var(--modern-border); flex: none; }
.studio-settings-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; .ui-select { min-width: 180px; } &.spaced { margin: 18px 0 24px; } }
.studio-settings-inline-form { display: flex; gap: 8px; margin: 14px 0 20px; input { flex: 1; min-width: 0; } }
.studio-settings-source { padding: 20px; display: flex; align-items: center; justify-content: space-between; gap: 15px; border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); margin-bottom: 12px; &.selected { background: var(--modern-accent-soft); border-color: var(--color-primary-alpha-700); } }
.studio-settings-source-info { min-width: 0; h3 { font-size: 13px; font-weight: 600; line-height: 1.8; } small, > span { font-size: 10px; color: var(--modern-muted); font-weight: 400; margin-right: 8px; } p { color: var(--modern-muted); font-size: 11px; line-height: 1.7; margin: 5px 0; overflow-wrap: anywhere; } }
.studio-settings-tag { display: inline-block; margin-left: 9px; color: var(--modern-accent-ink); font-size: 9px; font-weight: 400; padding: 1px 7px; border-radius: 12px; border: 1px solid var(--modern-border); }
.studio-settings-check { font-size: 10px; color: var(--modern-muted); display: flex; align-items: center; gap: 6px; margin-top: 9px; input { accent-color: var(--modern-accent); } }
.studio-settings-hint { color: var(--modern-muted); font-size: 11px; line-height: 1.8; }
.studio-settings-notice { max-width: 900px; padding: 12px 15px; margin: 0 auto 20px; border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); color: var(--modern-accent-ink); font-size: 11px; display: flex; align-items: center; justify-content: space-between; gap: 12px; background: var(--modern-accent-soft); &.error { color: #c66666; background: rgba(197, 78, 78, .07); } button { border: 0; background: none; color: inherit; cursor: pointer; svg { width: 17px; height: 17px; } } }
.studio-settings-empty { text-align: center; padding: 60px 15px; h2 { font-size: 17px; font-weight: 500; } p { color: var(--modern-muted); font-size: 12px; margin-top: 10px; } &.compact { padding: 12px; } }
.studio-settings-subheading { margin: 25px 0 13px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; h3 { font-size: 13px; font-weight: 550; } p { flex-basis: 100%; color: var(--modern-muted); font-size: 10px; line-height: 1.8; } }
.studio-settings-text-button { font-size: 11px; color: var(--modern-accent-ink); border: 0; background: transparent; cursor: pointer; }
.studio-settings-rules { box-sizing: border-box; resize: vertical; width: 100%; min-height: 130px; padding: 12px; background: var(--modern-hover); border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); font-size: 12px; color: var(--modern-text); font-family: inherit; line-height: 1.8; }
.studio-settings-presets { display: flex; gap: 7px; flex-wrap: wrap; > span { display: flex; border: 1px solid var(--modern-border); border-radius: 12px; overflow: hidden; } button { display: inline-flex; align-items: center; padding: 6px 9px; border: 0; color: var(--modern-text); background: var(--modern-hover); font-size: 11px; cursor: pointer; svg { width: 13px; height: 13px; } &:hover { background: var(--modern-accent-soft); } } }
.studio-settings-pair-code { display: block; letter-spacing: 3px; font-size: 22px; padding-top: 12px; color: var(--modern-accent-ink); }
.studio-settings-device { padding: 14px 0; border-bottom: 1px solid var(--modern-border); display: flex; align-items: center; justify-content: space-between; font-size: 12px; small { display: block; color: var(--modern-muted); font-size: 10px; margin-top: 5px; } }
.studio-settings-hotkeys { margin-top: 25px; > header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px; h3 { font-size: 13px; font-weight: 550; } .studio-settings-check { margin: 0; } } }
.studio-settings-hotkey-error { color: #c66666; font-size: 9px; white-space: nowrap; }
.studio-settings-backups { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; article { padding: 18px; border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); background: var(--modern-hover); > svg { width: 26px; height: 26px; color: var(--modern-accent-ink); } h3 { font-size: 13px; font-weight: 550; margin: 12px 0 7px; } p { font-size: 10px; color: var(--modern-muted); line-height: 1.7; margin-bottom: 16px; min-height: 34px; } .studio-settings-button { padding: 7px 10px; } } }
.studio-settings-about { text-align: center; padding: 20px 0 35px; > span { width: 58px; height: 58px; display: grid; place-items: center; margin: 0 auto 18px; background: var(--modern-accent-soft); color: var(--modern-accent-ink); border-radius: 18px; font-size: 23px; font-weight: 700; } h2 { font-size: 24px; font-weight: 650; } p { color: var(--modern-muted); font-size: 11px; margin-top: 10px; } }
.studio-settings-license { margin: 16px 0; color: var(--modern-muted); }
.studio-settings button:focus-visible, .studio-settings input:focus-visible, .studio-settings textarea:focus-visible { outline: 2px solid var(--modern-accent); outline-offset: 3px; }
@media (max-width: 1100px) { .studio-settings-content { padding: 23px 22px 35px; } .studio-settings-control { width: 200px; } .studio-settings-layout { grid-template-columns: 145px minmax(0, 1fr); } }
@media (max-width: 860px) { .studio-settings-layout { display: flex; flex-direction: column; } .studio-settings-nav { display: flex; flex: none; padding: 10px 15px; border-right: 0; border-bottom: 1px solid var(--modern-border); white-space: nowrap; button { width: auto; flex: none; padding: 8px 12px; margin: 0 4px 0 0; svg { display: none; } } } .studio-settings-content { flex: 1; } .studio-settings-heading { padding: 22px; } }
@media (max-width: 650px) { .studio-settings-row { align-items: flex-start; flex-direction: column; gap: 9px; } .studio-settings-control { width: 100%; justify-content: flex-start; } .studio-settings-control input[type='number'] { max-width: 100%; } .studio-settings-backups { grid-template-columns: 1fr; } .studio-settings-source { flex-direction: column; align-items: stretch; } .studio-settings-feature { flex-direction: column; align-items: stretch; } .studio-settings-heading { align-items: flex-start; flex-direction: column; gap: 15px; } .studio-settings-search { width: 100%; box-sizing: border-box; } }
</style>

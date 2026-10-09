<template>
  <section class="ui-downloads">
    <header class="ui-downloads-heading"><div><span class="ui-downloads-eyebrow">TAKE YOUR MUSIC WITH YOU</span><h1>下载中心</h1><p>喜欢的声音，留在你的电脑里。</p></div><button type="button" class="ui-downloads-folder" @click="revealFolder"><UiIcon name="folder" />打开下载位置</button></header>
    <div class="ui-downloads-summary"><div><span>正在下载</span><strong>{{ activeTasks.length }}</strong><small>首歌曲在队列中</small></div><div><span>已经完成</span><strong>{{ completedTasks.length }}</strong><small>首音乐随时可听</small></div><div><span>保存到</span><strong class="ui-downloads-path">{{ folderName }}</strong><button type="button" @click="chooseFolder">更改下载位置 <UiIcon name="arrowUpRight" /></button></div></div>
    <div class="ui-downloads-tools"><div class="ui-downloads-tabs" role="tablist" aria-label="下载状态"><button v-for="item in tabs" :key="item.id" type="button" role="tab" :aria-selected="tab === item.id" :class="{ active: tab === item.id }" @click="tab = item.id">{{ item.label }}<span>{{ countFor(item.id) }}</span></button></div><div class="ui-downloads-bulk"><button type="button" :disabled="busy || !resumableTasks.length" @click="resumeAll">全部继续</button><button type="button" :disabled="busy || !activeTasks.length" @click="pauseAll">全部暂停</button></div></div>
    <div v-if="message" class="ui-downloads-message" role="status">{{ message }}<button type="button" aria-label="关闭提示" @click="message = ''"><UiIcon name="close" /></button></div>
    <div v-if="actionError" class="ui-downloads-error" role="alert">{{ actionError }}<button type="button" aria-label="关闭错误提示" @click="actionError = ''"><UiIcon name="close" /></button></div>
    <div class="ui-downloads-content scroll">
      <div v-if="loading" class="ui-downloads-loading" role="status">正在读取下载任务…</div>
      <UiEmpty v-else-if="error || !filteredTasks.length" :title="error ? '下载列表加载失败' : tab === 'completed' ? '还没有已完成的下载' : '这里暂时没有下载任务'" :description="error || '在搜索或歌单中选择下载，音乐会来到这里。'" :retry="Boolean(error)" @retry="load" />
      <article v-for="task in filteredTasks" v-else :key="task.id" class="ui-download-task" :class="{ failed: task.status === DOWNLOAD_STATUS.ERROR }">
        <div class="ui-download-art"><TrackArtwork :track="task.metadata.musicInfo" /></div>
        <div class="ui-download-info"><div class="ui-download-title"><h2>{{ task.metadata.musicInfo.name }}</h2><span>{{ task.metadata.quality.toUpperCase() }}</span></div><p>{{ task.metadata.musicInfo.singer || '未知歌手' }}<span v-if="task.metadata.musicInfo.meta.albumName"> · {{ task.metadata.musicInfo.meta.albumName }}</span></p><div class="ui-download-progress" :class="{ completed: task.status === DOWNLOAD_STATUS.COMPLETED }" role="progressbar" :aria-valuenow="percentage(task)" aria-valuemin="0" aria-valuemax="100" :aria-label="`${task.metadata.musicInfo.name} 下载进度`"><span :style="{ width: `${percentage(task)}%` }" /></div><div class="ui-download-details"><span class="ui-download-status">{{ statusLabel(task) }}</span><span v-if="task.status === DOWNLOAD_STATUS.RUN">{{ task.speed || '连接中' }}</span><span>{{ formatBytes(task.downloaded) }}{{ task.total ? ` / ${formatBytes(task.total)}` : '' }}</span><span>{{ percentage(task).toFixed(1) }}%</span></div></div>
        <div class="ui-download-actions"><button v-if="task.status === DOWNLOAD_STATUS.RUN || task.status === DOWNLOAD_STATUS.WAITING" type="button" :disabled="busy" aria-label="暂停下载" title="暂停下载" @click="pauseTask(task)"><UiIcon name="pause" filled /></button><button v-else-if="task.status === DOWNLOAD_STATUS.PAUSE || task.status === DOWNLOAD_STATUS.ERROR" type="button" :disabled="busy" :aria-label="task.status === DOWNLOAD_STATUS.ERROR ? '重试下载' : '继续下载'" @click="resumeTask(task)"><UiIcon :name="task.status === DOWNLOAD_STATUS.ERROR ? 'refresh' : 'play'" :filled="task.status !== DOWNLOAD_STATUS.ERROR" /></button><template v-else><button type="button" aria-label="播放已下载音乐" title="播放" @click="playTask(task)"><UiIcon name="play" filled /></button><button type="button" aria-label="在文件夹中显示" title="在文件夹中显示" @click="revealTask(task)"><UiIcon name="folder" /></button><button type="button" aria-label="加入歌单" title="加入歌单" @click="addTask(task)"><UiIcon name="plus" /></button></template><button type="button" :disabled="busy" aria-label="移除下载记录" title="移除下载记录" @click="askRemove(task)"><UiIcon name="close" /></button></div>
      </article>
    </div>
    <footer class="ui-downloads-footer"><span>{{ tasks.length }} 条下载记录</span><span>{{ appSetting['download.savePath'] }}</span></footer>
    <UiModal :show="removeOpen" title="移除下载记录" :subtitle="removeTarget?.metadata.musicInfo.name" @close="removeOpen = false"><p class="ui-dialog-note">{{ removeTarget?.status === DOWNLOAD_STATUS.COMPLETED ? '移除记录后，已经保存的音乐文件仍会保留。' : '这个任务将从下载队列移除。你可以在歌单中重新添加下载。' }}</p><template #footer><button type="button" class="ui-dialog-button" @click="removeOpen = false">取消</button><button type="button" class="ui-dialog-button ui-dialog-button-danger" :disabled="busy" @click="confirmRemove">移除记录</button></template></UiModal>
    <TrackActionModal :show="addOpen" action="add" :tracks="addTracks" @close="addOpen = false" @success="message = $event" />
  </section>
</template>

<script setup lang="ts">
import TrackArtwork from '@renderer/ui/components/TrackArtwork.vue'
import UiIcon from '@renderer/ui/components/UiIcon.vue'
import { computed, onMounted, ref } from 'vue'
import UiEmpty from '../components/UiEmpty.vue'
import UiModal from '../components/UiModal.vue'
import TrackActionModal from '../components/TrackActionModal.vue'
import { DOWNLOAD_STATUS, LIST_IDS } from '@common/constants'
import { getDownloadList, startDownloadTasks, pauseDownloadTasks, removeDownloadTasks } from '@renderer/store/download/action'
import { appSetting } from '@renderer/store/setting'
import { openDirInExplorer, showSelectDialog, updateSetting } from '@renderer/utils/ipc'
import { checkPath } from '@common/utils/nodejs'
import { playList } from '@renderer/core/player'

type Tab = 'all' | 'active' | 'paused' | 'error' | 'completed'
const tabs: Array<{ id: Tab, label: string }> = [{ id: 'all', label: '全部' }, { id: 'active', label: '进行中' }, { id: 'paused', label: '已暂停' }, { id: 'error', label: '需重试' }, { id: 'completed', label: '已完成' }]
const statusLabels: Record<LX.Download.DownloadTaskStatus, string> = { run: '正在下载', waiting: '等待下载', pause: '已暂停', error: '下载失败', completed: '下载完成' }
const tasks = ref<LX.Download.ListItem[]>([])
const loading = ref(true)
const error = ref('')
const actionError = ref('')
const message = ref('')
const tab = ref<Tab>('all')
const busy = ref(false)
const removeOpen = ref(false)
const removeTarget = ref<LX.Download.ListItem | null>(null)
const addOpen = ref(false)
const addTracks = ref<LX.Music.MusicInfo[]>([])
const activeTasks = computed(() => tasks.value.filter(task => task.status === DOWNLOAD_STATUS.RUN || task.status === DOWNLOAD_STATUS.WAITING))
const completedTasks = computed(() => tasks.value.filter(task => task.status === DOWNLOAD_STATUS.COMPLETED))
const resumableTasks = computed(() => tasks.value.filter(task => task.status === DOWNLOAD_STATUS.PAUSE || task.status === DOWNLOAD_STATUS.ERROR))
const folderName = computed(() => appSetting['download.savePath'].split(/[\\/]/).filter(Boolean).pop() ?? '未设置')
const filteredTasks = computed(() => tasks.value.filter(task => matches(task, tab.value)))
function matches(task: LX.Download.ListItem, selectedTab: Tab) { return selectedTab === 'all' || (selectedTab === 'active' ? task.status === DOWNLOAD_STATUS.RUN || task.status === DOWNLOAD_STATUS.WAITING : task.status === (selectedTab === 'paused' ? DOWNLOAD_STATUS.PAUSE : selectedTab)) }
function countFor(selectedTab: Tab) { return tasks.value.filter(task => matches(task, selectedTab)).length }
function statusLabel(task: LX.Download.ListItem) { return task.statusText || statusLabels[task.status] }
function percentage(task: LX.Download.ListItem) { return task.status === DOWNLOAD_STATUS.COMPLETED ? 100 : Math.max(0, Math.min(100, Number.isFinite(task.progress) ? task.progress : 0)) }
function formatBytes(bytes: number) { if (!bytes) return '0 B'; const index = Math.min(3, Math.max(0, Math.floor(Math.log(bytes) / Math.log(1024)))); return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${['B', 'KB', 'MB', 'GB'][index]}` }
async function load() {
  loading.value = true
  error.value = ''
  try { tasks.value = await getDownloadList() } catch (err) { error.value = err instanceof Error ? err.message : '无法读取下载任务，请重试。' } finally { loading.value = false }
}
onMounted(load)
async function perform(action: () => Promise<void>, success?: string) {
  if (busy.value) return
  busy.value = true
  actionError.value = ''
  try { await action(); if (success) message.value = success } catch (err) { actionError.value = err instanceof Error ? err.message : '操作失败，请重试。' } finally { busy.value = false }
}
async function pauseTask(task: LX.Download.ListItem) { await perform(async() => { await pauseDownloadTasks([task]) }) }
async function resumeTask(task: LX.Download.ListItem) { await perform(async() => { await startDownloadTasks([task]) }) }
async function pauseAll() { await perform(async() => { await pauseDownloadTasks(activeTasks.value) }, '下载队列已暂停') }
async function resumeAll() { await perform(async() => { await startDownloadTasks(resumableTasks.value) }, '下载队列已继续') }
function askRemove(task: LX.Download.ListItem) { removeTarget.value = task; removeOpen.value = true }
async function confirmRemove() { if (!removeTarget.value) return; const id = removeTarget.value.id; await perform(async() => { await removeDownloadTasks([id]); removeOpen.value = false }, '下载记录已移除') }
async function revealTask(task: LX.Download.ListItem) {
  await perform(async() => { if (!(await checkPath(task.metadata.filePath))) throw new Error('文件已经移动或删除，请检查下载位置。'); await openDirInExplorer(task.metadata.filePath) })
}
async function revealFolder() { await perform(async() => { if (!appSetting['download.savePath']) throw new Error('请先设置下载位置。'); await openDirInExplorer(appSetting['download.savePath']) }) }
async function chooseFolder() {
  await perform(async() => {
    const result = await showSelectDialog({ title: '选择下载位置', defaultPath: appSetting['download.savePath'], properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || !result.filePaths[0]) return
    await updateSetting({ 'download.savePath': result.filePaths[0] })
    message.value = '下载位置已更新'
  })
}
function playTask(task: LX.Download.ListItem) { const index = tasks.value.findIndex(item => item.id === task.id); if (index >= 0) playList(LIST_IDS.DOWNLOAD, index) }
function addTask(task: LX.Download.ListItem) { addTracks.value = [task.metadata.musicInfo]; addOpen.value = true }
</script>

<style lang="less">
.ui-downloads { height: 100%; box-sizing: border-box; padding: 28px 30px 0; display: flex; flex-direction: column; min-height: 0; color: var(--modern-text); }
.ui-downloads-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex: none; h1 { font-size: 27px; line-height: 1.5; font-weight: 600; margin-top: 5px; } p { font-size: 12px; color: var(--modern-muted); margin-top: 6px; } }
.ui-downloads-eyebrow { font-size: 9px; letter-spacing: 1.7px; color: var(--modern-muted); }
.ui-downloads-folder { border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); padding: 10px 14px; background: var(--modern-panel); color: var(--modern-muted); font-size: 11px; cursor: pointer; &:hover { background: var(--modern-hover); color: var(--modern-text); } }
.ui-downloads-summary { display: grid; grid-template-columns: 1fr 1fr 1.3fr; gap: var(--modern-gap); margin: 26px 0 24px; flex: none; > div { padding: 17px 20px; border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); background: var(--modern-bg); overflow: hidden; > span { display: block; color: var(--modern-muted); font-size: 10px; } > strong { display: block; font-size: 25px; font-weight: 500; margin: 6px 0; } > small { color: var(--modern-muted); font-size: 10px; } > button { border: 0; padding: 0; background: transparent; color: var(--modern-accent-ink); font-size: 10px; cursor: pointer; } > strong.ui-downloads-path { font-size: 16px; margin: 12px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } } }
.ui-downloads-tools { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-bottom: 14px; border-bottom: 1px solid var(--modern-border); flex: none; }
.ui-downloads-tabs { display: flex; gap: 4px; button { display: flex; gap: 6px; align-items: center; padding: 8px 10px; border: 0; border-radius: 9px; background: transparent; color: var(--modern-muted); font-size: 11px; cursor: pointer; span { font-size: 9px; opacity: .7; } &.active { background: var(--modern-accent-soft); color: var(--modern-accent-ink); font-weight: 500; } } }
.ui-downloads-bulk { display: flex; gap: 8px; button { border: 0; background: transparent; color: var(--modern-muted); font-size: 10px; cursor: pointer; padding: 5px 0; &:disabled { opacity: .35; cursor: default; } } }
.ui-downloads-content { min-height: 0; flex: 1; overflow-y: auto; }
.ui-downloads-loading { padding: 70px 0; text-align: center; font-size: 12px; color: var(--modern-muted); }
.ui-download-task { display: flex; align-items: center; gap: 16px; padding: 20px 6px; border-bottom: 1px solid var(--modern-border); }
.ui-download-art { width: 52px; height: 52px; flex: none; display: grid; place-items: center; border-radius: 12px; overflow: hidden; background: var(--modern-accent-soft); color: var(--modern-accent-ink); font-size: 25px; img { width: 100%; height: 100%; object-fit: cover; } }
.ui-download-info { min-width: 0; flex: 1; > p { font-size: 10px; color: var(--modern-muted); margin-top: 5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; } }
.ui-download-title { display: flex; align-items: center; gap: 10px; h2 { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 13px; font-weight: 500; } > span { flex: none; font-size: 8px; padding: 2px 4px; background: var(--modern-hover); color: var(--modern-muted); border-radius: 4px; } }
.ui-download-progress { width: 100%; height: 3px; margin: 11px 0 7px; border-radius: 4px; background: var(--modern-hover); overflow: hidden; > span { display: block; height: 100%; border-radius: 4px; background: var(--modern-accent); transition: width .4s linear; } &.completed > span { opacity: .6; } }
.ui-download-details { display: flex; gap: 10px; align-items: center; font-size: 9px; color: var(--modern-muted); font-variant-numeric: tabular-nums; > span:first-child { margin-right: auto; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; } > span:not(:first-child) { flex: none; } }
.ui-download-task.failed .ui-download-status { color: #c66666; }
.ui-download-task.failed .ui-download-progress > span { background: #c66666; }
.ui-download-actions { display: flex; align-items: center; flex: none; gap: 3px; button { display: grid; place-items: center; width: 29px; height: 29px; border: 0; border-radius: 8px; background: transparent; color: var(--modern-muted); font-size: 15px; cursor: pointer; &:hover { background: var(--modern-accent-soft); color: var(--modern-accent-ink); } &:disabled { opacity: .35; cursor: default; } } }
.ui-downloads-message, .ui-downloads-error { display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; margin: 10px 0 0; border-radius: 9px; font-size: 11px; color: var(--modern-accent-ink); background: var(--modern-accent-soft); button { background: transparent; border: 0; color: inherit; cursor: pointer; } }
.ui-downloads-error { color: #c66666; background: rgba(197, 78, 78, .08); }
.ui-downloads-footer { padding: 14px 0; display: flex; align-items: center; justify-content: space-between; gap: 18px; color: var(--modern-muted); font-size: 10px; flex: none; span:last-child { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; } }
@media (max-width: 1050px) { .ui-downloads { padding: 24px 22px 0; } .ui-downloads-tabs button { padding: 7px; } .ui-downloads-summary > div { padding: 14px; } }
@media (max-width: 760px) { .ui-downloads { padding: 20px 16px 0; } .ui-downloads-summary { gap: 8px; > div { padding: 11px; } } .ui-downloads-tools { flex-wrap: wrap; } .ui-downloads-heading h1 { font-size: 23px; } .ui-downloads-heading p { font-size: 11px; } .ui-downloads-folder { font-size: 10px; padding: 8px; } .ui-download-task { gap: 10px; } .ui-download-art { width: 42px; height: 42px; } .ui-download-actions { flex-direction: column; } }
</style>

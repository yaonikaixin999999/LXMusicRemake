<template>
  <UiModal :show="show" :title="action === 'add' ? '加入你的歌单' : '下载音乐'" :subtitle="tracks.length === 1 ? `${tracks[0].name} · ${tracks[0].singer || '未知歌手'}` : `已选择 ${tracks.length} 首歌曲`" @close="emit('close')">
    <div v-if="error" class="ui-dialog-error" role="alert">{{ error }}</div>
    <template v-if="action === 'add'">
      <div class="ui-track-targets"><button v-for="item in targets" :key="item.id" type="button" :disabled="busy" @click="addTo(item.id)"><span class="ui-track-target-icon"><UiIcon :name="item.id === 'love' ? 'heart' : 'list'" /></span><span>{{ item.name }}</span><span class="ui-track-target-arrow"><UiIcon name="arrowUpRight" /></span></button></div>
      <form class="ui-track-create" @submit.prevent="createAndAdd"><input v-model="newName" maxlength="80" placeholder="创建新歌单并加入" aria-label="新歌单名称"><button type="submit" :disabled="busy || !newName.trim()" aria-label="创建新歌单"><UiIcon name="plus" /></button></form>
    </template>
    <template v-else>
      <div v-if="!onlineTracks.length" class="ui-dialog-note">本地音乐已经保存在你的电脑中，无需重复下载。</div>
      <div v-else-if="!qualities.length" class="ui-dialog-note">当前音源没有可用的下载音质。请先在设置中导入支持这首歌曲的音乐源。</div>
      <div v-else class="ui-track-quality"><button v-for="quality in qualities" :key="quality" type="button" :disabled="busy" @click="download(quality)"><div><strong>{{ qualityLabel(quality) }}</strong><span>{{ quality.toUpperCase() }} · {{ quality === 'flac24bit' || quality === 'flac' || quality === 'ape' || quality === 'wav' ? '无损音质' : '标准音频' }}</span></div><UiIcon name="download" /></button></div>
      <p v-if="onlineTracks.length" class="ui-dialog-note ui-track-location">保存位置：{{ appSetting['download.savePath'] || '未设置' }}</p>
      <p v-if="onlineTracks.length < tracks.length && onlineTracks.length" class="ui-dialog-note">已跳过 {{ tracks.length - onlineTracks.length }} 首本地音乐。</p>
    </template>
  </UiModal>
</template>

<script setup lang="ts">
import UiIcon from '@renderer/ui/components/UiIcon.vue'
import { computed, ref, watch } from 'vue'
import UiModal from './UiModal.vue'
import { defaultList, loveList, userLists } from '@renderer/store/list/state'
import { addListMusics, createUserList, getUserLists } from '@renderer/store/list/action'
import { createDownloadTasks, getDownloadList } from '@renderer/store/download/action'
import { qualityList } from '@renderer/store'
import { QUALITYS } from '@common/constants'
import { LOCAL_LIBRARY_ID } from '@common/localMusic'
import { appSetting } from '@renderer/store/setting'
import { updateSetting } from '@renderer/utils/ipc'
import { setFavorites } from '../services/platformAccounts'

interface TrackActionProps { show: boolean, tracks: LX.Music.MusicInfo[], fromListId?: string, action: 'add' | 'download' }
const props: TrackActionProps = withDefaults(defineProps<TrackActionProps>(), { fromListId: '' })
const emit = defineEmits<{ (event: 'close'): void, (event: 'success', message: string): void }>()
const busy = ref(false)
const error = ref('')
const newName = ref('')
const targets = computed(() => [{ ...defaultList, name: '试听列表' }, { ...loveList, name: '我的收藏' }, ...userLists].filter(item => item.id !== props.fromListId && (item.id !== LOCAL_LIBRARY_ID || props.tracks.every(track => track.source === 'local'))))
const onlineTracks = computed<LX.Music.MusicInfoOnline[]>(() => props.tracks.filter((track: LX.Music.MusicInfo): track is LX.Music.MusicInfoOnline => track.source !== 'local'))
const qualities = computed<LX.Quality[]>(() => QUALITYS.filter((quality: LX.Quality) => onlineTracks.value.length && onlineTracks.value.every((track: LX.Music.MusicInfoOnline) => qualityList.value[track.source]?.includes(quality) && track.meta.qualitys.some((item: LX.Music.MusicQualityType) => item.type === quality))))
const qualityLabels: Record<LX.Quality, string> = { flac24bit: 'Hi-Res 高解析', flac: 'FLAC 无损', ape: 'APE 无损', wav: 'WAV 无损', '320k': '高品质 320 kbps', '192k': '清晰 192 kbps', '128k': '标准 128 kbps' }
function qualityLabel(quality: LX.Quality) { return qualityLabels[quality] }
watch(() => props.show, show => {
  if (!show) return
  error.value = ''
  newName.value = ''
  void getUserLists().catch(() => { error.value = '暂时无法读取歌单，请稍后重试。' })
})
async function run(task: () => Promise<void>, message: string) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try { await task(); emit('success', message); emit('close') } catch (err) { error.value = err instanceof Error ? err.message : '操作失败，请稍后重试。' } finally { busy.value = false }
}
async function addTo(id: string) {
  await run(async() => { if (id === loveList.id) await setFavorites(props.tracks, true); else await addListMusics(id, props.tracks) }, `已加入 ${props.tracks.length} 首歌曲`)
}
async function createAndAdd() {
  const name = newName.value.trim()
  if (!name) return
  if (userLists.some(item => item.name === name)) { error.value = '已有同名歌单，请换一个名字。'; return }
  const id = `userlist_${Date.now()}`
  await run(async() => { await createUserList({ id, name, list: props.tracks }) }, `已创建「${name}」`)
}
async function download(quality: LX.Quality) {
  await run(async() => {
    await getDownloadList()
    if (!appSetting['download.enable']) await updateSetting({ 'download.enable': true })
    await createDownloadTasks(onlineTracks.value, quality, props.fromListId === '' ? undefined : props.fromListId)
  }, '已加入下载队列')
}
</script>

<style lang="less">
.ui-track-targets { display: flex; flex-direction: column; gap: 7px; max-height: 320px; overflow: auto; button { display: flex; align-items: center; gap: 12px; width: 100%; border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); padding: 12px; background: var(--modern-panel); color: var(--modern-text); text-align: left; font-size: 13px; cursor: pointer; &:hover { background: var(--modern-accent-soft); } &:disabled { opacity: .5; } } }
.ui-track-target-icon { width: 30px; height: 30px; display: grid; place-items: center; flex: none; background: var(--modern-accent-soft); color: var(--modern-accent-ink); border-radius: 8px; font-size: 21px; }
.ui-track-target-arrow { margin-left: auto; color: var(--modern-muted); }
.ui-track-create { display: flex; gap: 8px; margin-top: 16px; input { flex: 1; width: 0; border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); background: var(--modern-bg); color: var(--modern-text); padding: 10px 12px; font-family: inherit; font-size: 12px; } button { width: 38px; border: 0; border-radius: 10px; background: var(--modern-text); color: var(--modern-panel); font-size: 22px; cursor: pointer; &:disabled { opacity: .4; } } }
.ui-track-quality { display: flex; flex-direction: column; gap: 8px; button { display: flex; align-items: center; justify-content: space-between; border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); padding: 13px 16px; background: var(--modern-panel); color: var(--modern-text); text-align: left; cursor: pointer; &:hover { background: var(--modern-accent-soft); } &:disabled { opacity: .5; } strong { display: block; font-size: 13px; font-weight: 500; } div span { font-size: 11px; color: var(--modern-muted); margin-top: 3px; display: block; } } }
.ui-track-location { margin-top: 18px; overflow-wrap: anywhere; }
</style>

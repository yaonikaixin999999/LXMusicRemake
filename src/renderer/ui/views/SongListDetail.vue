<template>
  <div class="ui-song-detail ui-discovery-page" @keyup.space.stop>
    <button type="button" class="ui-song-detail__back" @click="router.push({ path: '/songList/list', query: { source } })">← 精选歌单</button>
    <section class="ui-song-detail__hero"><div class="ui-song-detail__cover"><img v-if="cover" :src="cover" :alt="name" @error="hideImage"><span aria-hidden="true"><UiIcon name="music" /></span></div><div class="ui-song-detail__info"><span class="ui-eyebrow">PLAYLIST · {{ sourceNames[source] }}</span><h1>{{ name }}</h1><p class="ui-song-detail__author">{{ detail?.info.author || '精选歌单' }}<span v-if="detail?.total"> · {{ detail.total.toLocaleString() }} 首歌曲</span><span v-if="detail?.info.play_count"> · {{ detail.info.play_count }} 次播放</span></p><p v-if="description" class="ui-song-detail__description">{{ description }}</p><div class="ui-song-detail__buttons"><button type="button" class="ui-solid-button" :disabled="loading || busy || !detail?.list.length" @click="playCollection()"><UiIcon name="play" filled />{{ busy === 'play' ? '正在准备…' : '播放歌单' }}</button><button type="button" class="ui-outline-button" :disabled="loading || busy || !detail?.list.length" @click="importCollection"><UiIcon name="plus" />{{ busy === 'import' ? '正在导入…' : '加入音乐库' }}</button></div></div></section>
    <div v-if="message" class="ui-inline-message" role="status"><span>{{ message }}</span><button type="button" aria-label="关闭提示" @click="message = ''"><UiIcon name="close" /></button></div>
    <div class="ui-section-heading"><h2>歌单里的声音</h2><button type="button" :disabled="loading" @click="load(true)">刷新 ↻</button></div>
    <div class="ui-track-panel"><TrackTable :list="detail?.list || []" :loading="loading" :error="error" :offset="(page - 1) * (detail?.limit || 30)" empty-title="这份歌单暂时没有歌曲" @play="playCollection($event)" @add="openAction($event, 'add')" @download="openAction($event, 'download')" @retry="load(true)" /></div>
    <UiPagination :page="page" :pages="pages" :loading="loading" @change="changePage" />
    <TrackActionModal :show="actionOpen" :tracks="actionTracks" :action="action" @close="actionOpen = false" @success="message = $event" />
  </div>
</template>

<script setup lang="ts">
import UiIcon from '@renderer/ui/components/UiIcon.vue'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getListDetail, getListDetailAll } from '@renderer/store/songList/action'
import { sources, type ListDetailInfo } from '@renderer/store/songList/state'
import { createUserList, getUserLists, setTempList } from '@renderer/store/list/action'
import { userLists } from '@renderer/store/list/state'
import { sourceNames } from '@renderer/store'
import { assertApiSupport } from '@renderer/store/utils'
import { toMD5 } from '@renderer/utils'
import { LIST_IDS } from '@common/constants'
import { playTrack } from '../services/music'
import TrackTable from '../components/TrackTable.vue'
import TrackActionModal from '../components/TrackActionModal.vue'
import UiPagination from '../components/UiPagination.vue'

const route = useRoute()
const router = useRouter()
const queryValue = (value: unknown) => typeof value === 'string' ? value : ''
const source = computed(() => sources.includes(queryValue(route.query.source) as LX.OnlineSource) ? route.query.source as LX.OnlineSource : sources[0] || 'kw')
const playlistId = computed(() => queryValue(route.query.id))
const page = computed(() => Math.max(1, Number.parseInt(queryValue(route.query.page), 10) || 1))
const detail = ref<ListDetailInfo | null>(null)
const name = computed(() => detail.value?.info.name ?? (queryValue(route.query.name) || '歌单详情'))
const cover = computed(() => detail.value?.info.img ?? queryValue(route.query.picUrl))
const description = computed(() => detail.value?.info.desc ?? detail.value?.desc ?? '')
const pages = computed(() => Math.max(1, Math.ceil((detail.value?.total ?? 0) / (detail.value?.limit ?? 30))))
const loading = ref(false)
const busy = ref<'' | 'play' | 'import'>('')
const error = ref('')
const message = ref('')
const actionOpen = ref(false)
const action = ref<'add' | 'download'>('add')
const actionTracks = ref<LX.Music.MusicInfo[]>([])
let requestId = 0
let loadedKey = ''
let collectionRevision = 0
let active = true
const allTracks = ref<{ key: string, list: LX.Music.MusicInfoOnline[] } | null>(null)
watch(() => route.fullPath, () => {
  if (route.path !== '/songList/detail') return
  const key = `${source.value}__${playlistId.value}`
  if (key !== loadedKey) { detail.value = null; allTracks.value = null; message.value = ''; loadedKey = key; collectionRevision++ }
  void load(route.query.refresh === 'true')
}, { immediate: true })
onUnmounted(() => { requestId++; collectionRevision++; active = false })
async function load(refresh = false) {
  const id = ++requestId
  error.value = ''
  loading.value = true
  if (refresh) { allTracks.value = null; collectionRevision++ }
  try {
    if (!playlistId.value) throw new Error('缺少歌单链接或 ID，请返回精选歌单重新打开。')
    const result = await getListDetail(playlistId.value, source.value, page.value, refresh)
    if (id === requestId) detail.value = result
  } catch (err) { if (id === requestId) { detail.value = null; error.value = err instanceof Error ? err.message : '歌单读取失败，请重试。' } } finally { if (id === requestId) loading.value = false }
}
async function getCollection(sourceId: LX.OnlineSource, id: string) {
  const key = `${sourceId}__${id}`
  if (allTracks.value?.key === key) return allTracks.value.list
  const revision = collectionRevision
  const tracks = await getListDetailAll(id, sourceId)
  if (active && revision === collectionRevision && key === loadedKey) allTracks.value = { key, list: tracks }
  return tracks
}
async function playCollection(selected?: LX.Music.MusicInfo) {
  if (busy.value) return
  const sourceId = source.value
  const id = playlistId.value
  const key = `${sourceId}__${id}`
  busy.value = 'play'
  message.value = ''
  try {
    if (!assertApiSupport(selected?.source ?? sourceId)) throw new Error('当前音源尚未启用。请在设置中导入支持此平台的音乐源后再播放。')
    const tracks = await getCollection(sourceId, id)
    if (!active || key !== loadedKey) return
    const target = selected ? tracks.find(track => track.id === selected.id) : tracks[0]
    if (!target) throw new Error('歌单中没有可播放的歌曲。')
    await setTempList(`playlist__${key}`, tracks)
    await playTrack(target, LIST_IDS.TEMP)
  } catch (err) { message.value = err instanceof Error ? err.message : '无法播放这份歌单，请重试。' } finally { busy.value = '' }
}
async function importCollection() {
  if (busy.value) return
  const sourceId = source.value
  const id = playlistId.value
  const title = name.value
  busy.value = 'import'
  message.value = ''
  try {
    await getUserLists()
    if (userLists.some(item => item.source === sourceId && item.sourceListId === id)) { message.value = '这份歌单已经在你的音乐库里。'; return }
    const tracks = await getCollection(sourceId, id)
    if (!tracks.length) throw new Error('这份歌单暂无歌曲可导入。')
    await createUserList({ id: `${sourceId}_${toMD5(id)}`, name: title, list: tracks, source: sourceId, sourceListId: id })
    message.value = `已将「${title}」的 ${tracks.length} 首歌曲加入音乐库。`
  } catch (err) { message.value = err instanceof Error ? err.message : '导入失败，请重试。' } finally { busy.value = '' }
}
function changePage(value: number) { void router.push({ path: '/songList/detail', query: { ...route.query, page: String(value), refresh: undefined } }) }
function openAction(track: LX.Music.MusicInfo, value: 'add' | 'download') { actionTracks.value = [track]; action.value = value; actionOpen.value = true }
function hideImage(event: Event) { (event.target as HTMLImageElement).style.display = 'none' }
</script>

<style lang="less">
@import '../discovery.less';
.ui-song-detail__back { margin: 0 0 22px; padding: 0; border: 0; color: var(--modern-muted); background: transparent; font: inherit; font-size: 10px; cursor: pointer; &:hover { color: var(--modern-accent-ink); } }
.ui-song-detail__hero { display: flex; align-items: center; gap: 25px; margin-bottom: 28px; }
.ui-song-detail__cover { position: relative; flex: none; display: grid; place-items: center; width: 140px; height: 140px; overflow: hidden; border: 1px solid var(--modern-border); border-radius: var(--modern-radius); background: var(--modern-accent-soft); color: var(--modern-accent-ink); box-shadow: var(--modern-shadow); img { position: absolute; z-index: 1; inset: 0; width: 100%; height: 100%; object-fit: cover; } > span { font-size: 50px; } }
.ui-song-detail__info { min-width: 0; flex: 1; h1 { margin: 10px 0; font-size: 24px; font-weight: 550; letter-spacing: -.7px; line-height: 1.3; overflow-wrap: anywhere; } }
.ui-song-detail__author { color: var(--modern-muted); font-size: 10px; line-height: 1.5; }
.ui-song-detail__description { display: -webkit-box; overflow: hidden; margin-top: 10px; color: var(--modern-muted); font-size: 10px; line-height: 1.6; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.ui-song-detail__buttons { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 17px; }
@media (max-width: 680px) { .ui-song-detail__hero { gap: 17px; } .ui-song-detail__cover { width: 110px; height: 110px; } .ui-song-detail__info h1 { font-size: 20px; } }
</style>

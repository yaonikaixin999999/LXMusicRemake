<template>
  <div class="ui-charts ui-discovery-page" @keyup.space.stop>
    <header class="ui-discovery-heading"><div><span class="ui-eyebrow">ON REPEAT, EVERYWHERE</span><h1>正在被世界听见</h1><p>热歌、新歌与飙升趋势，从各个平台找到你的下一首。</p></div><span class="ui-heading-glyph" aria-hidden="true"><UiIcon name="chart" /></span></header>
    <div class="ui-source-pills" role="group" aria-label="排行榜平台"><button v-for="item in sources" :key="item" type="button" :class="{ active: item === source }" @click="selectSource(item)">{{ sourceNames[item] }}</button></div>
    <UiEmpty v-if="boardsLoading || boardsError || !boardList.length" :title="boardsLoading ? '正在读取排行榜…' : boardsError ? '排行榜暂时不可用' : '这个平台暂无排行榜'" :description="boardsError || ''" :retry="Boolean(boardsError)" @retry="loadBoards(true)" />
    <template v-else>
      <section class="ui-charts-picks" aria-label="推荐榜单"><button v-for="(board, index) in boardList.slice(0, 4)" :key="board.id" type="button" :class="{ active: board.id === boardId }" @click="selectBoard(board.id)"><span class="ui-charts-picks__number">0{{ index + 1 }}</span><strong>{{ board.name }}</strong><small>{{ sourceNames[source] }} · 音乐趋势</small><span class="ui-charts-picks__arrow" aria-hidden="true"><UiIcon name="arrowUpRight" /></span></button></section>
      <div class="ui-charts-toolbar"><label>更多榜单<UiSelect :model-value="boardId" :options="boardOptions" aria-label="选择排行榜" @change="changeBoard" /></label><button type="button" class="ui-outline-button" :disabled="loading || busy" @click="importCollection"><UiIcon name="plus" />{{ busy === 'import' ? '正在导入…' : '加入音乐库' }}</button></div>
      <div v-if="message" class="ui-inline-message" role="status"><span>{{ message }}</span><button type="button" aria-label="关闭提示" @click="message = ''"><UiIcon name="close" /></button></div>
      <section class="ui-charts-tracks"><div class="ui-section-heading"><h2>{{ boardName }}<span v-if="!loading && !error"> · {{ total.toLocaleString() }} 首歌曲</span></h2><div><button type="button" :disabled="loading || busy || !tracks.length" @click="playCollection()"><UiIcon name="play" filled />{{ busy === 'play' ? '正在准备…' : '播放榜单' }}</button><button type="button" :disabled="loading" @click="loadTracks(true)">刷新<UiIcon name="refresh" /></button></div></div><div class="ui-track-panel"><TrackTable :list="tracks" :loading="loading" :error="error" :offset="(page - 1) * limit" empty-title="这个榜单暂无歌曲" @play="playCollection($event)" @add="openAction($event, 'add')" @download="openAction($event, 'download')" @retry="loadTracks(true)" /></div><UiPagination :page="page" :pages="pages" :loading="loading" @change="changePage" /></section>
    </template>
    <TrackActionModal :show="actionOpen" :tracks="actionTracks" :action="action" @close="actionOpen = false" @success="message = $event" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { sources, type BoardItem } from '@renderer/store/leaderboard/state'
import { getBoardsList, getListDetail, getListDetailAll } from '@renderer/store/leaderboard/action'
import { createUserList, getUserLists, setTempList } from '@renderer/store/list/action'
import { userLists } from '@renderer/store/list/state'
import { sourceNames } from '@renderer/store'
import { getLeaderboardSetting, setLeaderboardSetting } from '@renderer/utils/data'
import { toMD5 } from '@renderer/utils'
import { LIST_IDS } from '@common/constants'
import { playTrack } from '../services/music'
import UiEmpty from '../components/UiEmpty.vue'
import TrackTable from '../components/TrackTable.vue'
import UiPagination from '../components/UiPagination.vue'
import TrackActionModal from '../components/TrackActionModal.vue'
import UiIcon from '../components/UiIcon.vue'
import UiSelect from '../components/UiSelect.vue'

const route = useRoute()
const router = useRouter()
const source = ref<LX.OnlineSource>(sources[0] || 'kw')
const boardList = ref<BoardItem[]>([])
const boardOptions = computed(() => boardList.value.map(board => ({ value: board.id, label: board.name })))
const boardCache = new Map<LX.OnlineSource, BoardItem[]>()
const boardId = ref('')
const boardName = computed(() => boardList.value.find(item => item.id === boardId.value)?.name ?? '排行榜')
const page = ref(1)
const limit = ref(30)
const total = ref(0)
const pages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)))
const tracks = ref<LX.Music.MusicInfoOnline[]>([])
const boardsLoading = ref(false)
const boardsError = ref('')
const loading = ref(false)
const error = ref('')
const busy = ref<'' | 'play' | 'import'>('')
const message = ref('')
const actionOpen = ref(false)
const action = ref<'add' | 'download'>('add')
const actionTracks = ref<LX.Music.MusicInfo[]>([])
let requestId = 0
let boardsRequestId = 0
let ready = false
let collectionRevision = 0
let active = true
const allTracks = ref<{ id: string, list: LX.Music.MusicInfoOnline[] } | null>(null)
const queryValue = (value: unknown) => typeof value === 'string' ? value : ''
function readRoute() {
  if (route.path !== '/leaderboard') return
  collectionRevision++
  const candidate = queryValue(route.query.source) as LX.OnlineSource
  source.value = sources.includes(candidate) ? candidate : source.value
  page.value = Math.max(1, Number.parseInt(queryValue(route.query.page), 10) || 1)
  void setLeaderboardSetting({ source: source.value }).catch(() => {})
  void loadBoards()
}
watch(() => route.fullPath, () => { if (ready) readRoute() })
onMounted(async() => {
  const saved = await getLeaderboardSetting().catch(() => null)
  if (saved?.source && sources.includes(saved.source as LX.OnlineSource)) source.value = saved.source as LX.OnlineSource
  ready = true
  readRoute()
})
onUnmounted(() => { requestId++; boardsRequestId++; collectionRevision++; active = false })
async function loadBoards(refresh = false) {
  const id = ++boardsRequestId
  const selected = source.value
  requestId++
  boardsLoading.value = true
  boardsError.value = ''
  try {
    let result = refresh ? null : boardCache.get(selected)
    if (!result) { result = (await getBoardsList(selected)).list; boardCache.set(selected, result) }
    if (id !== boardsRequestId) return
    boardList.value = result
    const requested = queryValue(route.query.boardId)
    const selectedId = result.some(item => item.id === requested) ? requested : result[0]?.id || ''
    if (selectedId !== boardId.value) { tracks.value = []; message.value = '' }
    boardId.value = selectedId
    if (selectedId) void loadTracks()
  } catch (err) { if (id === boardsRequestId) { boardList.value = []; boardsError.value = err instanceof Error ? err.message : '无法读取榜单，请重试或切换平台。' } } finally { if (id === boardsRequestId) boardsLoading.value = false }
}
async function loadTracks(refresh = false) {
  const id = ++requestId
  loading.value = true
  error.value = ''
  if (refresh) { allTracks.value = null; collectionRevision++ }
  try {
    const result = await getListDetail(boardId.value, page.value, refresh)
    if (id !== requestId) return
    tracks.value = result.list
    total.value = Number(result.total) || 0
    limit.value = result.limit || 30
  } catch (err) { if (id === requestId) { tracks.value = []; total.value = 0; error.value = err instanceof Error ? err.message : '歌曲读取失败，请重试。' } } finally { if (id === requestId) loading.value = false }
}
async function getCollection(id: string) {
  if (allTracks.value?.id === id) return allTracks.value.list
  const revision = collectionRevision
  const list = await getListDetailAll(id)
  if (active && revision === collectionRevision && boardId.value === id) allTracks.value = { id, list }
  return list
}
async function playCollection(selected?: LX.Music.MusicInfo) {
  if (busy.value) return
  const id = boardId.value
  const selectedSource = source.value
  const revision = collectionRevision
  busy.value = 'play'
  message.value = ''
  try {
    let list: LX.Music.MusicInfoOnline[]
    if (selected) list = tracks.value
    else {
      try { list = await getCollection(id) } catch (err) {
        if (!tracks.value.length) throw err
        list = tracks.value
        message.value = '完整榜单暂时无法读取，已播放当前页的歌曲。'
      }
    }
    if (!active || revision !== collectionRevision || source.value !== selectedSource || boardId.value !== id) return
    const target = selected ? list.find(track => track.id === selected.id) : list[0]
    if (!target) throw new Error('这个榜单暂时没有可播放的歌曲。')
    await setTempList(`board__${id}`, list)
    await playTrack(target, LIST_IDS.TEMP)
  } catch (err) { message.value = err instanceof Error ? err.message : '无法播放这个榜单。' } finally { busy.value = '' }
}
async function importCollection() {
  if (busy.value || !boardId.value) return
  const id = boardId.value
  const selectedSource = source.value
  const title = boardName.value
  busy.value = 'import'
  message.value = ''
  try {
    await getUserLists()
    const sourceListId = `board__${id}`
    if (userLists.some(item => item.source === selectedSource && item.sourceListId === sourceListId)) { message.value = '这个榜单已经在你的音乐库里。'; return }
    const list = await getCollection(id)
    if (!list.length) throw new Error('这个榜单暂无歌曲可导入。')
    await createUserList({ id: `${selectedSource}_${toMD5(sourceListId)}`, name: title, list, source: selectedSource, sourceListId })
    message.value = `已将「${title}」的 ${list.length} 首歌曲加入音乐库。`
  } catch (err) { message.value = err instanceof Error ? err.message : '导入失败，请重试。' } finally { busy.value = '' }
}
function selectSource(value: LX.OnlineSource) { if (value !== source.value) void router.push({ path: '/leaderboard', query: { source: value, page: '1' } }) }
function selectBoard(value: string) { if (value !== boardId.value) void router.push({ path: '/leaderboard', query: { source: source.value, boardId: value, page: '1' } }) }
function changeBoard(value: string | number) { selectBoard(String(value)) }
function changePage(value: number) { void router.push({ path: '/leaderboard', query: { source: source.value, boardId: boardId.value, page: String(value) } }) }
function openAction(track: LX.Music.MusicInfo, value: 'add' | 'download') { actionTracks.value = [track]; action.value = value; actionOpen.value = true }
</script>

<style lang="less">
@import '../discovery.less';
.ui-charts-picks { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--modern-panel-gap); margin: 6px 0 19px; button { position: relative; min-width: 0; padding: 18px; border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); background: var(--modern-panel); color: var(--modern-text); text-align: left; cursor: pointer; transition: background .15s, border-color .15s; &.active, &:hover { background: var(--modern-accent-soft); border-color: var(--modern-accent); } strong { display: block; overflow: hidden; margin: 17px 0 8px; font-family: inherit; font-size: 15px; font-weight: 500; white-space: nowrap; text-overflow: ellipsis; } small { color: var(--modern-muted); font-size: 9px; } } }
.ui-charts-picks__number { color: var(--modern-accent-ink); font-size: 23px; font-weight: 400; letter-spacing: -1px; }
.ui-charts .ui-heading-glyph .ui-svg-icon { width: 26px; height: 26px; }
.ui-charts-picks__arrow { position: absolute; right: 14px; top: 17px; color: var(--modern-muted); font-size: 17px; .ui-svg-icon { width: 17px; height: 17px; } }
.ui-charts-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 15px; margin-bottom: 25px; label { display: flex; align-items: center; gap: 10px; color: var(--modern-muted); font-size: 10px; } .ui-select { width: 220px; max-width: 220px; } > button { display: inline-flex; align-items: center; gap: 6px; .ui-svg-icon { width: 16px; height: 16px; } } }
.ui-charts-tracks .ui-section-heading > div { display: flex; gap: 4px; }
.ui-charts-tracks .ui-section-heading > div > button { display: inline-flex; align-items: center; gap: 6px; .ui-svg-icon { width: 14px; height: 14px; } }
@media (max-width: 760px) { .ui-charts-picks { grid-template-columns: repeat(2, minmax(0, 1fr)); button { padding: 14px; strong { margin-top: 9px; font-size: 13px; } } } }
</style>

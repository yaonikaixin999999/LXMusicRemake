<template>
  <div class="ui-explore ui-discovery-page" @keyup.space.stop>
    <header class="ui-discovery-heading"><div><span class="ui-eyebrow">MADE FOR THE MOMENT</span><h1>找到此刻的旋律</h1><p>从精选歌单里，遇见熟悉的声音与新的惊喜。</p></div><span class="ui-heading-glyph" aria-hidden="true"><UiIcon name="music" /></span></header>
    <div class="ui-source-pills" role="group" aria-label="歌单平台"><button v-for="item in sources" :key="item" type="button" :class="{ active: item === source }" @click="selectSource(item)">{{ sourceNames[item] }}</button></div>
    <section class="ui-explore-filter-panel"><div class="ui-section-heading"><h2>选择一种氛围</h2><UiSelect :model-value="sortId" :options="sortOptions" aria-label="歌单排序" @change="selectSort" /></div><div class="ui-explore-tags"><button type="button" :class="{ active: !tagId }" @click="selectTag('')">全部</button><button v-for="tag in hotTags" :key="tag.id" type="button" :class="{ active: tagId === tag.id }" @click="selectTag(tag.id)">{{ tag.name }}</button><UiSelect v-if="tagGroups.length" :model-value="tagId" :options="tagOptions" aria-label="更多歌单分类" @change="selectMoreTag" /></div><p v-if="tagError" class="ui-discovery-note">分类暂时不可用。<button type="button" @click="loadTags">重新加载</button></p></section>
    <details class="ui-explore-open"><summary>打开已有的歌单链接或 ID <span aria-hidden="true"><UiIcon name="arrowUpRight" /></span></summary><form @submit.prevent="openById"><input v-model="playlistInput" :placeholder="`粘贴${sourceNames[source]}歌单链接或 ID`" aria-label="歌单链接或 ID"><button type="submit" class="ui-solid-button" :disabled="!playlistInput.trim()">打开歌单</button></form></details>
    <div class="ui-section-heading ui-explore-list-title"><h2>{{ selectedTagName || '精选歌单' }}<span v-if="!loading && !error"> · {{ total.toLocaleString() }} 份</span></h2><button type="button" :disabled="loading" @click="load">刷新<UiIcon name="refresh" /></button></div>
    <UiEmpty v-if="loading || error || !list.length" :title="loading ? '正在发现好音乐…' : error ? '歌单暂时无法加载' : '这个分类还没有歌单'" :description="error || (loading ? '正在读取平台推荐的真实歌单。' : '换一个分类或音乐平台试试。')" :retry="Boolean(error)" @retry="load" />
    <PlaylistGrid v-else :list="list" @open="openPlaylist" />
    <UiPagination v-if="!error" :page="page" :pages="pages" :loading="loading" @change="changePage" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { sourceNames } from '@renderer/store'
import { getTags } from '@renderer/store/songList/action'
import { sources, sortList, type ListInfo, type ListInfoItem, type TagInfo, type SortInfo } from '@renderer/store/songList/state'
import { getSongListSetting, setSongListSetting } from '@renderer/utils/data'
import music from '@renderer/utils/musicSdk'
import UiEmpty from '../components/UiEmpty.vue'
import PlaylistGrid from '../components/PlaylistGrid.vue'
import UiPagination from '../components/UiPagination.vue'
import UiIcon from '../components/UiIcon.vue'
import UiSelect from '../components/UiSelect.vue'

const route = useRoute()
const router = useRouter()
const source = ref<LX.OnlineSource>(sources[0] || 'kw')
const availableSorts = computed<SortInfo[]>(() => sortList[source.value] ?? [])
const sortOptions = computed(() => availableSorts.value.map(sort => ({ value: sort.id, label: sort.name })))
const sortId = ref(sortList[source.value]?.[0]?.id ?? '')
const tagId = ref('')
const page = ref(1)
const limit = ref(30)
const total = ref(0)
const list = ref<ListInfoItem[]>([])
const tagInfo = ref<TagInfo | null>(null)
const tagCache = new Map<LX.OnlineSource, TagInfo>()
const tagError = ref(false)
const playlistInput = ref('')
const loading = ref(false)
const error = ref('')
const pages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)))
const hotTags = computed(() => tagInfo.value?.hotTag.slice(0, 11) ?? [])
const tagGroups = computed(() => tagInfo.value?.tags ?? [])
const tagOptions = computed(() => [{ value: '', label: '更多分类' }, ...tagGroups.value.flatMap(group => group.list.map(tag => ({ value: tag.id, label: tag.name, group: group.name })))])
const selectedTagName = computed(() => tagInfo.value?.tags.flatMap(group => group.list).find(tag => tag.id === tagId.value)?.name ?? tagInfo.value?.hotTag.find(tag => tag.id === tagId.value)?.name)
let requestId = 0
let ready = false
const queryValue = (value: unknown) => typeof value === 'string' ? value : ''
function readRoute() {
  if (!route.path.startsWith('/songList') || route.path.endsWith('/detail')) return
  const candidate = queryValue(route.query.source) as LX.OnlineSource
  const nextSource = sources.includes(candidate) ? candidate : source.value
  if (nextSource !== source.value) tagInfo.value = null
  source.value = nextSource
  const sorts = sortList[source.value] ?? []
  const preferredSort = queryValue(route.query.sortId)
  sortId.value = sorts.some(item => item.id === preferredSort) ? preferredSort : sorts[0]?.id ?? ''
  tagId.value = queryValue(route.query.tagId)
  page.value = Math.max(1, Number.parseInt(queryValue(route.query.page), 10) || 1)
  void setSongListSetting({ source: source.value, sortId: sortId.value, tagId: tagId.value }).catch(() => {})
  void loadTags()
  void load()
}
watch(() => route.fullPath, () => { if (ready) readRoute() })
onMounted(async() => {
  const saved = await getSongListSetting().catch(() => null)
  if (saved?.source && sources.includes(saved.source as LX.OnlineSource)) source.value = saved.source as LX.OnlineSource
  ready = true
  readRoute()
})
onUnmounted(() => { requestId++ })
async function loadTags() {
  const selected = source.value
  tagError.value = false
  try {
    const tags = tagCache.get(selected) ?? await getTags(selected)
    tagCache.set(selected, tags)
    if (source.value === selected) tagInfo.value = tags
  } catch { if (source.value === selected) tagError.value = true }
}
async function load() {
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    const result = await music[source.value]?.songList.getList(sortId.value, tagId.value, page.value) as ListInfo
    if (id !== requestId) return
    if (!result) throw new Error('这个平台暂时不支持精选歌单。')
    list.value = result.list
    total.value = Number(result.total) || 0
    limit.value = result.limit || 30
  } catch (err) {
    if (id !== requestId) return
    list.value = []
    total.value = 0
    error.value = err instanceof Error ? err.message : '网络请求失败，请重试或切换平台。'
  } finally { if (id === requestId) loading.value = false }
}
function navigate(selected = source.value, tag = tagId.value, sort = sortId.value, selectedPage = 1) { void router.push({ path: '/songList/list', query: { source: selected, tagId: tag, sortId: sort, page: String(selectedPage) } }) }
function selectSource(value: LX.OnlineSource) { if (value !== source.value) navigate(value, '', sortList[value]?.[0]?.id ?? '') }
function selectTag(value: string) { if (value !== tagId.value) navigate(source.value, value) }
function selectSort(value: string | number) { navigate(source.value, tagId.value, String(value)) }
function selectMoreTag(value: string | number) { selectTag(String(value)) }
function changePage(value: number) { navigate(source.value, tagId.value, sortId.value, value) }
function openPlaylist(item: ListInfoItem) { void router.push({ path: '/songList/detail', query: { source: item.source, id: item.id, name: item.name, picUrl: item.img } }) }
function openById() { if (playlistInput.value.trim()) void router.push({ path: '/songList/detail', query: { source: source.value, id: playlistInput.value.trim() } }) }
</script>

<style lang="less">
@import '../discovery.less';
.ui-explore .ui-heading-glyph .ui-svg-icon { width: 26px; height: 26px; }
.ui-explore-filter-panel { padding: 18px 20px; border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); background: var(--modern-panel); .ui-select { width: 150px; max-width: 150px; flex: none; } .ui-discovery-note { margin-bottom: 0; button { border: 0; color: var(--modern-accent-ink); background: transparent; font-size: 10px; cursor: pointer; } } }
.ui-explore-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; > button { padding: 6px 11px; border: 0; border-radius: 8px; color: var(--modern-muted); background: var(--modern-hover); font: inherit; font-size: 10px; cursor: pointer; &.active, &:hover { background: var(--modern-accent-soft); color: var(--modern-accent-ink); } } }
.ui-explore-open { margin: 14px 0 24px; padding: 10px 14px; border: 1px solid var(--modern-border); border-radius: 11px; background: var(--modern-panel); summary { color: var(--modern-muted); font-size: 10px; cursor: pointer; span { float: right; font-size: 13px; .ui-svg-icon { width: 15px; height: 15px; } } } form { display: flex; gap: 8px; margin-top: 12px; } input { flex: 1; min-width: 0; padding: 9px 12px; border: 1px solid var(--modern-border); border-radius: 10px; color: var(--modern-text); background: var(--modern-bg); font: inherit; font-size: 10px; } button { flex: none; } }
.ui-explore-list-title { margin-top: 24px; }
.ui-explore-list-title > button { display: inline-flex; align-items: center; gap: 6px; .ui-svg-icon { width: 14px; height: 14px; } }
</style>

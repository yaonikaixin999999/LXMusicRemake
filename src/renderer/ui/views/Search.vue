<template>
  <div class="ui-search ui-discovery-page" @keyup.space.stop>
    <header class="ui-discovery-heading"><div><span class="ui-eyebrow">FIND YOUR SOUND</span><h1>搜索音乐</h1><p>下一首喜欢的歌，从这里开始。</p></div><span class="ui-heading-glyph" aria-hidden="true"><UiIcon name="search" /></span></header>
    <form class="ui-search-composer" @submit.prevent="submit()"><UiIcon name="search" /><input v-model="input" aria-label="歌曲、歌手或歌单关键词" placeholder="搜索歌曲、歌手，或一份刚好的歌单" autocomplete="off"><button type="submit" :disabled="!input.trim()" aria-label="搜索"><UiIcon name="arrowUp" /></button></form>
    <div class="ui-search-filters"><div class="ui-segmented" role="group" aria-label="搜索类型"><button type="button" :class="{ active: kind === 'music' }" @click="changeKind('music')">歌曲</button><button type="button" :class="{ active: kind === 'songlist' }" @click="changeKind('songlist')">歌单</button></div><label class="ui-source-select"><span>音源</span><UiSelect :model-value="source" :options="sourceOptions" aria-label="搜索音源" @change="changeSource" /></label></div>
    <div v-if="message" class="ui-inline-message" role="status"><span>{{ message }}</span><button type="button" aria-label="关闭提示" @click="message = ''"><UiIcon name="close" /></button></div>
    <template v-if="!keyword">
      <section v-if="appSetting['search.isShowHistorySearch'] && historyList.length" class="ui-search-history"><div class="ui-section-heading"><h2>最近搜索</h2><button type="button" @click="clearHistoryList('')">清空</button></div><div class="ui-search-history__items"><span v-for="(word, index) in historyList" :key="word"><button type="button" @click="submit(word)">{{ word }}</button><button type="button" :aria-label="`删除搜索记录 ${word}`" @click="removeHistoryWord(index)"><UiIcon name="close" /></button></span></div></section>
      <section class="ui-search-start"><div class="ui-search-start__mark" aria-hidden="true"><UiIcon name="music" /></div><h2>音乐，为每一种心情</h2><p>试试一位歌手、一个歌名，或一种想要的氛围。</p><div class="ui-search-prompts"><button v-for="prompt in prompts" :key="prompt.text" type="button" @click="submit(prompt.text, 'songlist')"><span><UiIcon :name="prompt.icon" /></span><strong>{{ prompt.label }}</strong><small>{{ prompt.text }}</small><b aria-hidden="true"><UiIcon name="arrowUpRight" /></b></button></div></section>
    </template>
    <section v-else class="ui-search-results"><div class="ui-section-heading"><h2>“{{ keyword }}”<span v-if="!loading && !error"> · {{ total.toLocaleString() }} {{ kind === 'music' ? '首歌曲' : '份歌单' }}</span></h2><button v-if="kind === 'music' && tracks.length && !loading" type="button" @click="playPage"><UiIcon name="play" filled />播放本页</button></div><p v-if="partialFailure && !loading" class="ui-discovery-note">{{ partialFailure }}</p>
      <TrackTable v-if="kind === 'music'" :list="tracks" :loading="loading" :error="error" :offset="source === 'all' ? 0 : (page - 1) * limit" empty-title="没有找到这首歌" @play="playOne" @add="openAction($event, 'add')" @download="openAction($event, 'download')" @retry="load" />
      <template v-else><UiEmpty v-if="loading || error || !playlists.length" :title="loading ? '正在寻找歌单…' : error ? '搜索暂时失败' : '没有找到相关歌单'" :description="error || (loading ? '正在读取所选平台的结果。' : '试试更简短的关键词，或切换音源。')" :retry="Boolean(error)" @retry="load" /><PlaylistGrid v-else :list="playlists" @open="openPlaylist" @play="openPlaylist($event, true)" /></template>
      <UiPagination v-if="!error" :page="page" :pages="pages" :loading="loading" @change="changePage" />
    </section>
    <TrackActionModal :show="actionOpen" :tracks="actionTracks" :action="action" @close="actionOpen = false" @success="message = $event" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TrackTable from '../components/TrackTable.vue'
import UiEmpty from '../components/UiEmpty.vue'
import UiPagination from '../components/UiPagination.vue'
import UiIcon from '../components/UiIcon.vue'
import UiSelect from '../components/UiSelect.vue'
import PlaylistGrid from '../components/PlaylistGrid.vue'
import TrackActionModal from '../components/TrackActionModal.vue'
import { playTrack, playTracks } from '../services/music'
import music from '@renderer/utils/musicSdk'
import { deduplicationList, toNewMusicInfo } from '@renderer/utils'
import { sources as musicSources } from '@renderer/store/search/music/state'
import { sources as playlistSources } from '@renderer/store/search/songlist/state'
import { historyList } from '@renderer/store/search/state'
import { addHistoryWord, clearHistoryList, getHistoryList, removeHistoryWord, setSearchText } from '@renderer/store/search/action'
import { sourceNames } from '@renderer/store'
import { appSetting } from '@renderer/store/setting'
import { getSearchSetting, setSearchSetting } from '@renderer/utils/data'
import type { ListInfoItem } from '@renderer/store/songList/state'

type SearchKind = 'music' | 'songlist'
type SearchSource = LX.OnlineSource | 'all'
interface SearchResponse { list: LX.Music.MusicInfo[] | ListInfoItem[], total: number, limit: number, allPage?: number }
const route = useRoute()
const router = useRouter()
const input = ref('')
const keyword = ref('')
const kind = ref<SearchKind>('music')
const source = ref<SearchSource>('all')
const page = ref(1)
const limit = ref(30)
const pages = ref(1)
const total = ref(0)
const tracks = ref<LX.Music.MusicInfo[]>([])
const playlists = ref<ListInfoItem[]>([])
const loading = ref(false)
const error = ref('')
const partialFailure = ref('')
const message = ref('')
const actionOpen = ref(false)
const action = ref<'add' | 'download'>('add')
const actionTracks = ref<LX.Music.MusicInfo[]>([])
const availableSources = computed(() => (kind.value === 'music' ? musicSources : playlistSources).filter((item): item is LX.OnlineSource => item !== 'all'))
const sourceOptions = computed(() => [{ value: 'all', label: '全部平台' }, ...availableSources.value.map(item => ({ value: item, label: sourceNames.value[item] }))])
const prompts = [{ icon: 'moon', label: '放松一下', text: '睡前 轻音乐' }, { icon: 'focus', label: '保持专注', text: '专注 工作' }, { icon: 'discover', label: '发现好心情', text: '快乐 流行' }]
let requestId = 0
let ready = false
const queryValue = (value: unknown) => typeof value === 'string' ? value : ''
function readRoute() {
  if (route.path !== '/search') return
  keyword.value = queryValue(route.query.text).trim()
  input.value = keyword.value
  kind.value = route.query.type === 'songlist' ? 'songlist' : 'music'
  const selected = queryValue(route.query.source) as SearchSource
  source.value = selected === 'all' || availableSources.value.includes(selected as LX.OnlineSource) ? selected : 'all'
  page.value = Math.max(1, Number.parseInt(queryValue(route.query.page), 10) || 1)
  setSearchText(keyword.value)
  if (keyword.value) void addHistoryWord(keyword.value).catch(() => {})
  void setSearchSetting({ source: source.value, type: kind.value }).catch(() => {})
  void load()
}
watch(() => route.fullPath, () => { if (ready) readRoute() })
onMounted(async() => {
  await getHistoryList().catch(() => {})
  const saved = await getSearchSetting().catch(() => null)
  ready = true
  if (!route.query.source && saved?.source && !route.query.text) {
    kind.value = saved.type === 'songlist' ? 'songlist' : 'music'
    if (saved.source === 'all' || availableSources.value.includes(saved.source as LX.OnlineSource)) source.value = saved.source as SearchSource
    return
  }
  readRoute()
})
onUnmounted(() => { requestId++ })
async function load() {
  const id = ++requestId
  error.value = ''
  partialFailure.value = ''
  if (!keyword.value) { tracks.value = []; playlists.value = []; loading.value = false; return }
  loading.value = true
  const text = keyword.value
  const currentPage = page.value
  const currentKind = kind.value
  const selectedSources = source.value === 'all' ? availableSources.value : [source.value]
  const currentLimit = currentKind === 'music' ? 30 : source.value === 'all' ? 15 : 18
  try {
    const responses = await Promise.allSettled(selectedSources.map(async(item) => {
      const api = currentKind === 'music' ? music[item]?.musicSearch : music[item]?.songList
      if (!api?.search) throw new Error('平台不支持此搜索类型')
      return await api.search(text, currentPage, currentLimit) as SearchResponse
    }))
    if (id !== requestId) return
    const results = responses.filter((item): item is PromiseFulfilledResult<SearchResponse> => item.status === 'fulfilled').map(item => item.value)
    if (!results.length) throw new Error('所选平台暂时无法返回结果，请重试或切换音源。')
    total.value = results.reduce((sum, item) => sum + (Number(item.total) || 0), 0)
    limit.value = currentLimit
    pages.value = Math.max(1, ...results.map(item => item.allPage ?? Math.ceil(item.total / (item.limit || currentLimit))))
    const failed = responses.reduce<string[]>((names, item, index) => item.status === 'rejected' ? [...names, sourceNames.value[selectedSources[index]]] : names, [])
    partialFailure.value = failed.length ? `${failed.join('、')}暂时不可用，已显示其他平台的结果。` : ''
    if (currentKind === 'music') tracks.value = deduplicationList(results.flatMap(item => (item.list as LX.Music.MusicInfo[]).map(track => toNewMusicInfo(track))))
    else playlists.value = results.flatMap(item => item.list as ListInfoItem[])
  } catch (err) {
    if (id !== requestId) return
    error.value = err instanceof Error ? err.message : '搜索失败，请稍后重试。'
    tracks.value = []
    playlists.value = []
    total.value = 0
    pages.value = 1
  } finally { if (id === requestId) loading.value = false }
}
function navigate(text: string, selectedKind = kind.value, selectedSource = source.value, selectedPage = 1) {
  void router.push({ path: '/search', query: { text, type: selectedKind, source: selectedSource, page: String(selectedPage) } })
}
function submit(text = input.value, selectedKind = kind.value) {
  text = text.trim()
  if (!text) return
  if (text === keyword.value && selectedKind === kind.value && page.value === 1) { void load(); return }
  navigate(text, selectedKind)
}
function changeKind(value: SearchKind) { const selected = value === 'music' ? musicSources : playlistSources; navigate(input.value.trim() || keyword.value, value, selected.includes(source.value) ? source.value : 'all') }
function changeSource(value: string | number) { navigate(input.value.trim() || keyword.value, kind.value, String(value) as SearchSource) }
function changePage(value: number) { navigate(keyword.value, kind.value, source.value, value) }
async function playOne(track: LX.Music.MusicInfo) { try { await playTrack(track) } catch (err) { message.value = err instanceof Error ? err.message : '暂时无法播放。' } }
async function playPage() { try { await playTracks(tracks.value) } catch (err) { message.value = err instanceof Error ? err.message : '暂时无法播放。' } }
function openAction(track: LX.Music.MusicInfo, value: 'add' | 'download') { actionTracks.value = [track]; action.value = value; actionOpen.value = true }
function openPlaylist(item: ListInfoItem, play = false) { void router.push({ path: '/songList/detail', query: { source: item.source, id: item.id, name: item.name, picUrl: item.img, play: play ? 'true' : undefined } }) }
</script>

<style lang="less">
.ui-discovery-page { height: 100%; overflow: auto; padding: 27px 32px 20px; box-sizing: border-box; color: var(--modern-text); }
.ui-discovery-heading { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 24px; h1 { margin: 7px 0 9px; font-size: 25px; font-weight: 550; letter-spacing: -.8px; } p { margin: 0; color: var(--modern-muted); font-size: 11px; } }
.ui-eyebrow { color: var(--modern-muted); font-size: 8px; letter-spacing: 1.8px; }
.ui-heading-glyph { display: grid; place-items: center; width: 50px; height: 50px; border: 1px solid var(--modern-border); border-radius: 16px; color: var(--modern-accent-ink); background: var(--modern-accent-soft); font-size: 31px; .ui-svg-icon { width: 26px; height: 26px; } }
.ui-search-composer { display: flex; align-items: center; gap: 14px; min-height: 58px; padding: 0 12px 0 20px; border: 1px solid var(--modern-border); border-radius: var(--modern-radius); background: var(--modern-panel); box-shadow: 0 4px 22px rgba(0,0,0,.025); &:focus-within { border-color: var(--modern-accent); } > .ui-svg-icon { flex: none; width: 18px; height: 18px; color: var(--modern-muted); } input { flex: 1; min-width: 0; height: 50px; border: 0; outline: none; font: inherit; font-size: 12px; color: var(--modern-text); background: transparent; &::placeholder { color: var(--modern-muted); } } button { display: grid; place-items: center; width: 33px; height: 33px; flex: none; padding: 0; border: 0; border-radius: 11px; font-size: 21px; color: var(--modern-accent-contrast); background: var(--modern-accent); cursor: pointer; .ui-svg-icon { width: 19px; height: 19px; } &:disabled { opacity: .35; cursor: default; } } }
.ui-search-filters { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 17px 0 27px; }
.ui-segmented { display: inline-flex; gap: 3px; padding: 3px; border: 1px solid var(--modern-border); border-radius: 11px; background: var(--modern-hover); button { padding: 6px 17px; border: 0; border-radius: 8px; color: var(--modern-muted); background: transparent; font-family: inherit; font-size: 11px; cursor: pointer; &.active { color: var(--modern-text); background: var(--modern-panel); box-shadow: 0 1px 4px rgba(0,0,0,.06); } } }
.ui-source-select { display: flex; align-items: center; gap: 8px; color: var(--modern-muted); font-size: 10px; .ui-select { width: 145px; max-width: 170px; } }
.ui-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin: 0 0 15px; h2 { font-size: 13px; font-weight: 550; margin: 0; overflow-wrap: anywhere; span { color: var(--modern-muted); font-size: 10px; font-weight: 400; } } > button, > div:not(.ui-select) > button { display: inline-flex; align-items: center; gap: 6px; flex: none; padding: 6px 9px; border: 0; border-radius: 8px; color: var(--modern-muted); background: transparent; font: inherit; font-size: 10px; cursor: pointer; .ui-svg-icon { width: 14px; height: 14px; } &:hover { color: var(--modern-text); background: var(--modern-hover); } } }
.ui-search-history__items { display: flex; flex-wrap: wrap; gap: 8px; > span { display: flex; padding: 1px; border: 1px solid var(--modern-border); border-radius: 9px; background: var(--modern-panel); } button { display: inline-flex; align-items: center; padding: 6px 10px; border: 0; border-radius: 8px; color: var(--modern-text); background: transparent; font: inherit; font-size: 10px; cursor: pointer; .ui-svg-icon { width: 12px; height: 12px; } &:last-child { padding-left: 3px; color: var(--modern-muted); } &:hover { background: var(--modern-hover); } } }
.ui-search-start { display: flex; flex-direction: column; align-items: center; margin: 36px 0 10px; h2 { margin: 17px 0 8px; font-size: 22px; font-weight: 500; letter-spacing: -.4px; } > p { color: var(--modern-muted); font-size: 11px; text-align: center; } }
.ui-search-start__mark { display: grid; place-items: center; width: 52px; height: 52px; border-radius: 17px; color: var(--modern-accent-ink); background: var(--modern-accent-soft); font-size: 27px; .ui-svg-icon { width: 26px; height: 26px; } }
.ui-search-prompts { display: grid; grid-template-columns: repeat(3, 1fr); width: 100%; max-width: 580px; gap: 12px; margin-top: 24px; button { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 8px; min-width: 0; padding: 17px; border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); color: var(--modern-text); background: var(--modern-panel); text-align: left; cursor: pointer; &:hover { background: var(--modern-accent-soft); border-color: var(--modern-accent); } > span { font-size: 17px; color: var(--modern-accent-ink); .ui-svg-icon { width: 18px; height: 18px; } } strong { font-family: inherit; font-size: 11px; font-weight: 500; } small { color: var(--modern-muted); font-size: 9px; } b { position: absolute; right: 13px; top: 13px; color: var(--modern-muted); font-size: 13px; font-weight: 400; .ui-svg-icon { width: 14px; height: 14px; } } } }
.ui-search-results .track-table { border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); overflow: hidden; background: var(--modern-panel); }
.ui-inline-message { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; padding: 12px 14px; border: 1px solid var(--modern-border); border-radius: 10px; background: var(--modern-accent-soft); color: var(--modern-accent-ink); font-size: 11px; line-height: 1.5; button { display: grid; place-items: center; flex: none; border: 0; background: transparent; color: inherit; font-size: 19px; cursor: pointer; .ui-svg-icon { width: 16px; height: 16px; } } }
.ui-discovery-note { margin: 8px 0 15px; color: var(--modern-muted); font-size: 10px; line-height: 1.5; }
@media (max-width: 760px) { .ui-discovery-page { padding: 20px; } .ui-discovery-heading h1 { font-size: 22px; } .ui-search-prompts { gap: 8px; button { padding: 12px; } } }
</style>

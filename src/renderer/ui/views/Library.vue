<template>
  <section class="ui-library">
    <aside class="ui-library-rail">
      <div class="ui-library-rail-heading"><span>我的音乐库</span><button type="button" aria-label="创建新歌单" @click="openPlaylist('create')"><UiIcon name="plus" /></button></div>
      <div class="ui-library-playlists scroll"><button v-for="item in playlists" :key="item.id" type="button" :class="{ active: listId === item.id }" @click="chooseList(item.id)"><UiIcon class="ui-library-list-icon" :name="item.id === 'love' ? 'heart' : item.id === 'default' ? 'music' : 'list'" /><span>{{ item.name }}</span></button></div>
      <div class="ui-library-rail-bottom"><button type="button" :disabled="importing" @click="importAudio"><UiIcon name="plus" />导入本地音乐</button><button type="button" :disabled="importing" @click="importPlaylist"><UiIcon name="upload" />导入歌单文件</button></div>
    </aside>

    <main class="ui-library-main">
      <header class="ui-library-heading">
        <div class="ui-library-cover" :class="{ love: listId === 'love' }"><UiIcon :name="listId === 'love' ? 'heart' : 'music'" /></div>
        <div class="ui-library-title"><span class="ui-library-eyebrow">YOUR COLLECTION</span><h1>{{ currentName }}</h1><p>{{ tracks.length }} 首歌曲 · {{ localCount }} 首本地音乐</p></div>
        <div v-if="currentUserList" class="ui-library-edit"><button type="button" aria-label="重命名当前歌单" @click="openPlaylist('rename')">编辑</button><button type="button" aria-label="删除当前歌单" @click="openPlaylist('delete')">删除</button></div>
      </header>

      <div class="ui-library-toolbar">
        <button type="button" class="ui-library-primary" :disabled="!tracks.length" @click="playFirst"><UiIcon name="play" filled />播放全部</button>
        <button type="button" :disabled="importing" @click="importAudio">{{ importing ? '正在导入…' : '导入音乐' }}</button>
        <button type="button" :disabled="!tracks.length" @click="exportPlaylist">导出歌单</button>
        <label class="ui-library-search"><UiIcon name="search" /><input v-model="query" placeholder="搜索此歌单" aria-label="搜索此歌单"></label>
        <UiSelect :model-value="sort" :options="sortOptions" aria-label="歌单排序" @change="changeSort" />
      </div>

      <div v-if="message" class="ui-library-message" role="status">{{ message }}<button type="button" aria-label="关闭提示" @click="message = ''"><UiIcon name="close" /></button></div>
      <div v-if="actionError" class="ui-library-error" role="alert">{{ actionError }}<button type="button" aria-label="关闭错误提示" @click="actionError = ''"><UiIcon name="close" /></button></div>
      <div v-if="selected.size" class="ui-library-selection"><span>已选择 {{ selected.size }} 首</span><button type="button" @click="openTrackAction('add', selectedTracks)">加入歌单</button><button type="button" @click="favoriteMany(selectedTracks)">收藏</button><button type="button" @click="openTrackAction('download', selectedTracks)">下载</button><button type="button" @click="requestRemove(selectedTracks)">移除</button><button type="button" @click="selected = new Set()">取消选择</button></div>
      <div class="ui-library-results">
        <TrackTable :list="pageTracks" :list-id="listId" :loading="loading" :error="error" :offset="(page - 1) * PAGE_SIZE" removable :empty-title="query ? '没有找到匹配的歌曲' : '给这个歌单加入第一首音乐'" @play="playTrack" @add="addTrack" @download="downloadTrack" @remove="removeTrack" @retry="loadTracks">
          <template #actions="{ track }: { track: LX.Music.MusicInfo }"><button type="button" class="ui-library-row-btn" :class="{ loved: isFavorite(track) }" :aria-label="isFavorite(track) ? '取消收藏' : '收藏歌曲'" :disabled="favoritePending.has(track.id)" @click="toggleFavorite(track)"><UiIcon name="heart" :filled="isFavorite(track)" /></button><button type="button" class="ui-library-row-btn" aria-label="编辑歌曲信息" @click="editTrack(track)"><UiIcon name="more" /></button><input type="checkbox" :checked="selected.has(track.id)" :aria-label="`选择 ${track.name}`" @change="toggleSelected(track.id)"></template>
        </TrackTable>
      </div>
      <footer v-if="filteredTracks.length" class="ui-library-pagination"><label><input type="checkbox" :checked="pageAllSelected" @change="selectPage">选择本页</label><span>{{ filteredTracks.length }} 首{{ query ? '搜索结果' : '歌曲' }}</span><button type="button" :disabled="page <= 1" @click="page--">上一页</button><span>{{ page }} / {{ pages }}</span><button type="button" :disabled="page >= pages" @click="page++">下一页</button></footer>
    </main>

    <PlaylistDialog :show="playlistOpen" :action="playlistAction" :list-info="currentUserList" @close="playlistOpen = false" @saved="playlistSaved" />
    <TrackMetadataModal :show="metadataOpen" :track="metadataTrack" :list-id="listId" @close="metadataOpen = false" @saved="metadataSaved" />
    <TrackActionModal :show="trackActionOpen" :action="trackAction" :tracks="actionTracks" :from-list-id="listId" @close="trackActionOpen = false" @success="handleSuccess" />
    <UiModal :show="removeOpen" title="从歌单移除歌曲" :subtitle="`已选择 ${removeTracks.length} 首歌曲`" @close="removeOpen = false"><p class="ui-dialog-note">歌曲将从当前歌单移除，本地文件会继续保留。</p><template #footer><button type="button" class="ui-dialog-button" @click="removeOpen = false">取消</button><button type="button" class="ui-dialog-button ui-dialog-button-danger" :disabled="removing" @click="confirmRemove">{{ removing ? '移除中…' : '移除歌曲' }}</button></template></UiModal>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TrackTable from '../components/TrackTable.vue'
import UiModal from '../components/UiModal.vue'
import UiIcon from '../components/UiIcon.vue'
import UiSelect from '../components/UiSelect.vue'
import TrackActionModal from '../components/TrackActionModal.vue'
import PlaylistDialog from '../components/PlaylistDialog.vue'
import TrackMetadataModal from '../components/TrackMetadataModal.vue'
import { defaultList, loveList, userLists } from '@renderer/store/list/state'
import { getListMusics, getUserLists, addListMusics, createUserList, removeListMusics, updateListMusicsPosition } from '@renderer/store/list/action'
import { playList } from '@renderer/core/player'
import { openSaveDir, showSelectDialog } from '@renderer/utils/ipc'
import { getListPrevSelectId, saveListPrevSelectId } from '@renderer/utils/data'
import { filterMusicList, fixNewMusicInfoQuality, toNewMusicInfo, filterFileName } from '@renderer/utils'
import { favoritePending, isFavorite, refreshFavorites, setFavorite, setFavorites } from '../services/platformAccounts'

const route = useRoute()
const router = useRouter()
const PAGE_SIZE = 80
const listId = ref(typeof route.query.id === 'string' ? route.query.id : defaultList.id)
const tracks = ref<LX.Music.MusicInfo[]>([])
const loading = ref(true)
const initialized = ref(false)
const error = ref('')
const actionError = ref('')
const message = ref('')
const query = ref('')
const sort = ref('original')
const sortOptions = [{ value: 'original', label: '原始排序' }, { value: 'name', label: '按歌曲名称' }, { value: 'singer', label: '按歌手名称' }]
const originalOrder = ref<string[]>([])
const page = ref(1)
const importing = ref(false)
const selected = ref(new Set<string>())
const playlistOpen = ref(false)
const playlistAction = ref<'create' | 'rename' | 'delete'>('create')
const metadataOpen = ref(false)
const metadataTrack = ref<LX.Music.MusicInfo | null>(null)
const trackActionOpen = ref(false)
const trackAction = ref<'add' | 'download'>('add')
const actionTracks = ref<LX.Music.MusicInfo[]>([])
const removeOpen = ref(false)
const removeTracks = ref<LX.Music.MusicInfo[]>([])
const removing = ref(false)
const playlists = computed(() => [{ ...defaultList, name: '试听列表' }, { ...loveList, name: '我的收藏' }, ...userLists])
const currentName = computed(() => playlists.value.find(item => item.id === listId.value)?.name ?? '我的音乐')
const currentUserList = computed(() => userLists.find(item => item.id === listId.value) ?? null)
const localCount = computed(() => tracks.value.filter(track => track.source === 'local').length)
const filteredTracks = computed(() => {
  const text = query.value.trim().toLowerCase()
  return text ? tracks.value.filter(track => `${track.name} ${track.singer} ${track.meta.albumName}`.toLowerCase().includes(text)) : tracks.value
})
const pages = computed(() => Math.max(1, Math.ceil(filteredTracks.value.length / PAGE_SIZE)))
const pageTracks = computed(() => filteredTracks.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
const selectedTracks = computed(() => tracks.value.filter(track => selected.value.has(track.id)))
const pageAllSelected = computed(() => pageTracks.value.length > 0 && pageTracks.value.every(track => selected.value.has(track.id)))
let requestId = 0
async function loadTracks(background = false) {
  const request = ++requestId
  const id = listId.value
  if (!background) loading.value = true
  error.value = ''
  try {
    const data = await getListMusics(id)
    if (request !== requestId) return
    tracks.value = [...data]
    selected.value = new Set([...selected.value].filter(key => data.some(track => track.id === key)))
    page.value = Math.min(page.value, pages.value)
  } catch (err) { if (request === requestId) error.value = err instanceof Error ? err.message : '无法读取歌单，请重试。' } finally { if (request === requestId) loading.value = false }
}
async function loadFavorites() { await refreshFavorites() }
async function chooseList(id: string) {
  await router.replace({ path: '/list', query: { id } })
  if (listId.value !== id) listId.value = id
}
watch(() => route.query.id, id => { if (typeof id === 'string' && id !== listId.value) listId.value = id })
watch(listId, () => { query.value = ''; sort.value = 'original'; originalOrder.value = []; page.value = 1; selected.value = new Set(); saveListPrevSelectId(listId.value); void loadTracks() })
watch(query, () => { page.value = 1 })
watch(() => userLists.map(item => item.id), () => {
  if (initialized.value && !playlists.value.some(item => item.id === listId.value)) void chooseList(defaultList.id)
})
function handleListUpdate(ids: string[]) {
  if (ids.includes(listId.value)) void loadTracks(true)
  if (ids.includes(loveList.id)) void loadFavorites().catch(() => {})
}
onMounted(async() => {
  window.app_event.on('myListUpdate', handleListUpdate)
  try {
    const [, previousId] = await Promise.all([getUserLists(), getListPrevSelectId()])
    const requestedId = typeof route.query.id === 'string' ? route.query.id : previousId
    initialized.value = true
    const id = playlists.value.some(item => item.id === requestedId) ? requestedId : defaultList.id
    if (listId.value !== id) await chooseList(id)
    else await loadTracks()
    await loadFavorites()
  } catch (err) { loading.value = false; error.value = err instanceof Error ? err.message : '音乐库加载失败。' }
})
onBeforeUnmount(() => { requestId++; window.app_event.off('myListUpdate', handleListUpdate) })
function handleSuccess(value: string) { message.value = value; selected.value = new Set() }
async function perform(task: () => Promise<void>, success?: string) {
  actionError.value = ''
  try { await task(); if (success) message.value = success } catch (err) { actionError.value = err instanceof Error ? err.message : '操作未能完成，请重试。' }
}
function playTrack(track: LX.Music.MusicInfo) { const index = tracks.value.findIndex(item => item.id === track.id); if (index >= 0) playList(listId.value, index) }
function playFirst() { if (tracks.value.length) playList(listId.value, 0) }
function openPlaylist(action: 'create' | 'rename' | 'delete') { playlistAction.value = action; playlistOpen.value = true }
async function playlistSaved(id: string) { await getUserLists(); await chooseList(id); message.value = '歌单已更新' }
function editTrack(track: LX.Music.MusicInfo) { metadataTrack.value = track; metadataOpen.value = true }
async function metadataSaved() { await loadTracks(); message.value = '歌曲信息已更新' }
function openTrackAction(action: 'add' | 'download', list: LX.Music.MusicInfo[]) { trackAction.value = action; actionTracks.value = [...list]; trackActionOpen.value = true }
function addTrack(track: LX.Music.MusicInfo) { openTrackAction('add', [track]) }
function downloadTrack(track: LX.Music.MusicInfo) { openTrackAction('download', [track]) }
function toggleSelected(id: string) { const next = new Set(selected.value); if (next.has(id)) next.delete(id); else next.add(id); selected.value = next }
function selectPage() { const next = new Set(selected.value); for (const track of pageTracks.value) { if (pageAllSelected.value) next.delete(track.id); else next.add(track.id) }; selected.value = next }
async function favoriteMany(list: LX.Music.MusicInfo[]) { await perform(async() => { await setFavorites(list, true); await loadFavorites(); selected.value = new Set() }) }
async function toggleFavorite(track: LX.Music.MusicInfo) {
  await perform(async() => { await setFavorite(track, !isFavorite(track)); await loadFavorites() })
}
function requestRemove(list: LX.Music.MusicInfo[]) { removeTracks.value = [...list]; removeOpen.value = true }
function removeTrack(track: LX.Music.MusicInfo) { requestRemove([track]) }
async function confirmRemove() {
  removing.value = true
  await perform(async() => { if (listId.value === loveList.id) await setFavorites(removeTracks.value, false); else await removeListMusics({ listId: listId.value, ids: removeTracks.value.map(track => track.id) }); await loadTracks(); removeOpen.value = false; selected.value = new Set() }, listId.value === loveList.id ? undefined : '歌曲已从歌单移除')
  removing.value = false
}
async function changeSort(input: string | number) {
  const value = String(input)
  if (value === sort.value) return
  if (sort.value === 'original' && value !== 'original') originalOrder.value = tracks.value.map(track => track.id)
  await perform(async() => {
    const key = value === 'singer' ? 'singer' : 'name'
    const order = new Map(originalOrder.value.map((id, index) => [id, index]))
    const sorted = [...tracks.value].sort((first, second) => value === 'original' ? (order.get(first.id) ?? order.size) - (order.get(second.id) ?? order.size) : first[key].localeCompare(second[key], 'zh-CN'))
    await updateListMusicsPosition({ listId: listId.value, ids: sorted.map(track => track.id), position: 0 })
    sort.value = value
    await loadTracks()
  })
}
async function importAudio() {
  if (importing.value) return
  importing.value = true
  const id = listId.value
  await perform(async() => {
    const result = await showSelectDialog({ title: '导入本地音乐', properties: ['openFile', 'multiSelections'], filters: [{ name: '音频文件', extensions: ['mp3', 'flac', 'ogg', 'oga', 'wav', 'm4a', 'ape'] }] })
    if (result.canceled || !result.filePaths.length) return
    let count = 0
    for (let index = 0; index < result.filePaths.length; index += 100) {
      const files = await window.lx.worker.main.createLocalMusicInfos(result.filePaths.slice(index, index + 100))
      if (id === loveList.id) await setFavorites(files, true)
      else await addListMusics(id, files)
      count += files.length
    }
    message.value = `已导入 ${count} 首本地音乐`
    if (listId.value === id) await loadTracks()
  })
  importing.value = false
}
async function exportPlaylist() {
  await perform(async() => {
    const result = await openSaveDir({ title: '导出歌单', defaultPath: `${filterFileName(currentName.value)}.lxmc` })
    if (result.canceled || !result.filePath) return
    const info = playlists.value.find(item => item.id === listId.value)!
    await window.lx.worker.main.saveLxConfigFile(result.filePath, { type: 'playListPart_v2', data: { ...toRaw(info), list: toRaw(tracks.value) } })
    message.value = '歌单已导出'
  })
}
async function importPlaylist() {
  if (importing.value) return
  importing.value = true
  await perform(async() => {
    const result = await showSelectDialog({ title: '导入歌单文件', properties: ['openFile'], filters: [{ name: '歌单文件', extensions: ['lxmc', 'json'] }] })
    if (result.canceled || !result.filePaths[0]) return
    const config = await window.lx.worker.main.readLxConfigFile(result.filePaths[0]) as { type: string, data: { name: string, list: LX.Music.MusicInfo[] } }
    if (config.type !== 'playListPart' && config.type !== 'playListPart_v2') throw new Error('请选择单个歌单文件；完整备份请在设置中导入。')
    if (!config.data || !Array.isArray(config.data.list)) throw new Error('歌单文件缺少有效的歌曲列表。')
    const info = config.data
    const list = config.type === 'playListPart' ? filterMusicList(info.list.map(track => toNewMusicInfo(track))) : filterMusicList(info.list).map(track => fixNewMusicInfoQuality(track))
    const id = `userlist_${Date.now()}`
    await createUserList({ id, name: `${info.name || '导入歌单'}${userLists.some(item => item.name === info.name) ? '（导入）' : ''}`, list })
    await getUserLists()
    await chooseList(id)
    message.value = `已导入 ${list.length} 首歌曲`
  })
  importing.value = false
}
</script>

<style lang="less">
.ui-library { height: 100%; display: flex; min-height: 0; color: var(--modern-text); }
.ui-library-rail { width: 184px; flex: none; display: flex; flex-direction: column; border-right: 1px solid var(--modern-border); background: var(--modern-bg); }
.ui-library-rail-heading { padding: 24px 16px 16px; display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 600; button { display: grid; place-items: center; padding: 0; width: 25px; height: 25px; border: 0; border-radius: 7px; background: var(--modern-panel); color: var(--modern-muted); cursor: pointer; svg { width: 17px; height: 17px; } } }
.ui-library-playlists { flex: 1; min-height: 0; padding: 0 8px; overflow-y: auto; button { width: 100%; padding: 11px 9px; display: flex; align-items: center; gap: 9px; border: 0; border-radius: var(--modern-radius-small); margin-bottom: 4px; background: transparent; color: var(--modern-muted); font-size: 12px; text-align: left; cursor: pointer; span:last-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } &:hover { background: var(--modern-hover); color: var(--modern-text); } &.active { background: var(--modern-accent-soft); color: var(--modern-accent-ink); font-weight: 600; } } }
.ui-library-list-icon { width: 19px; height: 19px; }
.ui-library-rail-bottom { border-top: 1px solid var(--modern-border); padding: 14px 13px; button { display: flex; align-items: center; gap: 7px; width: 100%; border: 0; padding: 7px 0; background: transparent; color: var(--modern-muted); cursor: pointer; font-size: 11px; text-align: left; svg { width: 15px; height: 15px; } &:hover { color: var(--modern-accent-ink); } &:disabled { opacity: .5; } } }
.ui-library-main { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; padding: 28px 26px 0; }
.ui-library-heading { display: flex; align-items: center; gap: 18px; flex: none; }
.ui-library-cover { width: 74px; height: 74px; flex: none; border-radius: var(--modern-radius-small); display: grid; place-items: center; background: var(--modern-accent-soft); color: var(--modern-accent-ink); svg { width: 35px; height: 35px; } &.love { background: rgba(183, 117, 127, .12); color: #b17b86; } }
.ui-library-eyebrow { display: block; font-size: 9px; letter-spacing: 1.6px; color: var(--modern-muted); }
.ui-library-title { min-width: 0; h1 { font-size: 25px; font-weight: 600; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } p { font-size: 11px; color: var(--modern-muted); margin-top: 4px; } }
.ui-library-edit { margin-left: auto; display: flex; gap: 8px; button { background: transparent; border: 0; color: var(--modern-muted); cursor: pointer; padding: 6px; font-size: 11px; &:hover { color: var(--modern-accent-ink); } } }
.ui-library-toolbar { display: flex; gap: 8px; align-items: center; padding: 24px 0 18px; flex: none; > button { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); padding: 9px 12px; background: var(--modern-panel); color: var(--modern-muted); font-size: 11px; cursor: pointer; svg { width: 14px; height: 14px; } &:hover { color: var(--modern-text); background: var(--modern-hover); } &:disabled { opacity: .4; cursor: default; } } button.ui-library-primary { background: var(--modern-text); border-color: transparent; color: var(--modern-panel); } .ui-select { width: 125px; flex: none; } }
.ui-library-search { margin-left: auto; min-width: 60px; display: flex; align-items: center; gap: 6px; padding: 8px 10px; border: 1px solid var(--modern-border); border-radius: var(--modern-radius-small); color: var(--modern-muted); svg { width: 15px; height: 15px; } input { min-width: 0; width: 115px; border: 0; outline: none; background: transparent; font-size: 11px; color: var(--modern-text); font-family: inherit; } }
.ui-library-results { flex: 1; min-height: 0; overflow: hidden; }
.ui-library-message, .ui-library-error { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: 9px; font-size: 11px; margin-bottom: 10px; background: var(--modern-accent-soft); color: var(--modern-accent-ink); button { border: 0; color: inherit; background: transparent; cursor: pointer; svg { width: 15px; height: 15px; } } }
.ui-library-error { color: #c66666; background: rgba(197, 78, 78, .08); }
.ui-library-selection { display: flex; gap: 10px; align-items: center; padding: 9px 12px; margin-bottom: 8px; background: var(--modern-accent-soft); color: var(--modern-accent-ink); border-radius: 10px; font-size: 11px; button { border: 0; color: inherit; background: transparent; font-size: 11px; cursor: pointer; } }
.ui-library-row-btn { border: 0; background: transparent; color: var(--modern-muted); padding: 4px; line-height: 1; cursor: pointer; svg { width: 17px; height: 17px; } &.loved { color: #b17b86; } }
.ui-library-pagination { display: flex; align-items: center; gap: 12px; padding: 14px 0; color: var(--modern-muted); font-size: 10px; flex: none; label { display: flex; align-items: center; gap: 5px; } label + span { margin-right: auto; } button { border: 1px solid var(--modern-border); border-radius: 7px; background: transparent; color: var(--modern-muted); padding: 5px 8px; font-size: 10px; cursor: pointer; &:disabled { opacity: .3; cursor: default; } } }
@media (max-width: 1050px) { .ui-library-rail { width: 155px; } .ui-library-main { padding: 22px 18px 0; } .ui-library-toolbar { flex-wrap: wrap; } .ui-library-search { flex: 1; input { width: 100%; } } }
@media (max-width: 760px) { .ui-library-rail { width: 128px; } .ui-library-main { padding: 18px 12px 0; } .ui-library-cover { width: 48px; height: 48px; font-size: 25px; } .ui-library-title h1 { font-size: 19px; } .ui-library-eyebrow { display: none; } .ui-library-heading { gap: 10px; } .ui-library-edit { flex-direction: column; gap: 0; } }
</style>

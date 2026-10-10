<template>
  <div class="ui-shell">
    <aside class="ui-sidebar">
      <router-link class="ui-brand" to="/discover"><span class="ui-brand-mark"><img :src="linklineLogo" alt="LinkLine 标志"></span><span>LinkLine</span></router-link>
      <button class="ui-new-search" type="button" @click="router.push('/search')"><UiIcon name="plus" /><span>寻找新的声音</span></button>
      <div class="ui-nav-label">探索</div>
      <nav aria-label="主导航"><router-link v-for="item in navigation" :key="item.path" :to="item.path" :class="{ 'ui-nav-active': route.path.startsWith(item.path) }"><UiIcon :name="item.icon" /><span>{{ item.label }}</span></router-link></nav>
      <div class="ui-nav-label ui-library-label">你的收藏</div>
      <div class="ui-sidebar-lists scroll"><router-link to="/list?id=love"><UiIcon name="heart" /><span>我喜欢的音乐</span></router-link><router-link :to="{ path: '/list', query: { id: LOCAL_LIBRARY_ID } }"><UiIcon name="folder" /><span>本地音乐</span></router-link><router-link v-for="list in sidebarLists" :key="list.id" :to="{ path: '/list', query: { id: list.id } }"><span class="ui-list-dot" /><span>{{ list.name }}</span></router-link></div>
      <div class="ui-sidebar-footer"><router-link to="/setting"><UiIcon name="settings" /><span>设置与偏好</span></router-link><button type="button" @click="appearance.mode = resolvedAppearanceMode === 'light' ? 'dark' : 'light'"><UiIcon :name="resolvedAppearanceMode === 'light' ? 'moon' : 'sun'" /><span>{{ resolvedAppearanceMode === 'light' ? '切换深色' : '切换浅色' }}</span></button></div>
    </aside>
    <div class="ui-workspace">
      <header class="ui-topbar"><div class="ui-breadcrumb"><button type="button" class="ui-icon-button" aria-label="返回上一页" @click="router.back()"><UiIcon name="back" /></button><span>音乐空间</span><span class="ui-breadcrumb-separator">/</span><strong>{{ routeTitle }}</strong></div><form class="ui-global-search" @submit.prevent="search"><UiIcon name="search" /><input v-model="query" aria-label="搜索音乐" placeholder="搜索歌曲、专辑、歌手或歌单"><UiIcon name="enter" /></form><button type="button" class="ui-icon-button linkline-update-topbar" :class="{ 'ui-active': updateAvailable, spinning: updateChecking }" :title="updateButtonLabel" :aria-label="updateButtonLabel" :aria-busy="updateChecking" @click="openUpdateCenter"><UiIcon :name="updateChecking ? 'refresh' : 'cloudDownload'" /><span v-if="updateAvailable" class="linkline-update-dot" aria-hidden="true" /></button><button type="button" class="ui-icon-button" aria-label="外观定制" @click="appearancePanelOpen = true"><UiIcon name="settings" /></button><WindowControls /></header>
      <main id="view" class="ui-main-panel"><router-view /></main>
      <PlayerBar />
      <FavoriteSyncNotice />
      <UpdateCenter />
    </div>
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { userLists } from '@renderer/store/list/state'
import { LOCAL_LIBRARY_ID } from '@common/localMusic'
import { appearance, appearancePanelOpen, resolvedAppearanceMode } from '@renderer/composables/useAppearance'
import UiIcon from './components/UiIcon.vue'
import PlayerBar from './PlayerBar.vue'
import WindowControls from './components/WindowControls.vue'
import FavoriteSyncNotice from './components/FavoriteSyncNotice.vue'
import UpdateCenter from './components/UpdateCenter.vue'
import { checkUpdateOnStartup, openUpdateCenter, updateAvailable, updateChecking, updateResult } from './services/appUpdate'
import { migratePlayerProgressStyle } from './services/preferences'
import linklineLogo from '@renderer/assets/images/linkline-logo.svg'
void migratePlayerProgressStyle()
const route = useRoute()
const router = useRouter()
const query = ref('')
const sidebarLists = computed(() => userLists.filter(list => list.id !== LOCAL_LIBRARY_ID))
const updateButtonLabel = computed(() => updateChecking.value ? '正在检查更新，打开更新中心' : updateAvailable.value ? `发现 LinkLine ${updateResult.value.latestRelease?.version ?? ''}，打开更新中心` : '检查更新')
onMounted(checkUpdateOnStartup)
const navigation = [{ path: '/discover', label: '发现音乐', icon: 'discover' }, { path: '/search', label: '搜索', icon: 'search' }, { path: '/songList', label: '精选歌单', icon: 'list' }, { path: '/leaderboard', label: '排行榜', icon: 'chart' }, { path: '/list', label: '音乐库', icon: 'library' }, { path: '/download', label: '下载管理', icon: 'download' }]
const routeTitle = computed(() => route.path === '/setting' ? '设置与偏好' : navigation.find(item => route.path.startsWith(item.path))?.label ?? '发现音乐')
const search = () => { if (query.value.trim()) void router.push({ path: '/search', query: { text: query.value.trim() } }) }
</script>

<style lang="less">
.linkline-update-topbar { position: relative; svg { width: 18px; height: 18px; } }
.linkline-update-dot { position: absolute; top: 3px; right: 3px; width: 6px; height: 6px; border-radius: 50%; background: var(--modern-accent-ink); box-shadow: 0 0 0 2px var(--modern-bg); }
.ui-topbar .ui-breadcrumb > strong { overflow: hidden; text-overflow: ellipsis; }
.ui-topbar .ui-global-search { flex-shrink: 1; min-width: 110px; input { min-width: 0; } }
@media (max-width: 1000px) { .ui-topbar .ui-breadcrumb > span { display: none; } }
@media (max-width: 650px) { .ui-topbar .ui-breadcrumb { gap: 6px; } .ui-topbar .ui-global-search { min-width: 0; width: 125px; } .ui-topbar .ui-global-search > svg:last-child { display: none; } }
</style>


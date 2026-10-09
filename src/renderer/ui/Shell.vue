<template>
  <div class="ui-shell">
    <aside class="ui-sidebar">
      <router-link class="ui-brand" to="/discover"><span class="ui-brand-mark"><UiIcon name="music" /></span><span>LX Studio<small>你的音乐空间</small></span></router-link>
      <button class="ui-new-search" type="button" @click="router.push('/search')"><UiIcon name="plus" /><span>寻找新的声音</span></button>
      <div class="ui-nav-label">探索</div>
      <nav aria-label="主导航"><router-link v-for="item in navigation" :key="item.path" :to="item.path" :class="{ 'ui-nav-active': route.path.startsWith(item.path) }"><UiIcon :name="item.icon" /><span>{{ item.label }}</span></router-link></nav>
      <div class="ui-nav-label ui-library-label">你的收藏</div>
      <div class="ui-sidebar-lists scroll"><router-link to="/list?id=love"><UiIcon name="heart" /><span>我喜欢的音乐</span></router-link><router-link v-for="list in userLists" :key="list.id" :to="{ path: '/list', query: { id: list.id } }"><span class="ui-list-dot" /><span>{{ list.name }}</span></router-link></div>
      <div class="ui-sidebar-footer"><router-link to="/setting"><UiIcon name="settings" /><span>设置与偏好</span></router-link><button type="button" @click="appearance.mode = resolvedAppearanceMode === 'light' ? 'dark' : 'light'"><UiIcon :name="resolvedAppearanceMode === 'light' ? 'moon' : 'sun'" /><span>{{ resolvedAppearanceMode === 'light' ? '切换深色' : '切换浅色' }}</span></button><small>LX Studio · 1.0</small></div>
    </aside>
    <div class="ui-workspace">
      <header class="ui-topbar"><div class="ui-breadcrumb"><button type="button" class="ui-icon-button" aria-label="返回上一页" @click="router.back()"><UiIcon name="back" /></button><span>音乐空间</span><span class="ui-breadcrumb-separator">/</span><strong>{{ routeTitle }}</strong></div><form class="ui-global-search" @submit.prevent="search"><UiIcon name="search" /><input v-model="query" aria-label="搜索音乐" placeholder="搜索歌曲、歌手或歌单"><UiIcon name="enter" /></form><button type="button" class="ui-icon-button" aria-label="外观定制" @click="appearancePanelOpen = true"><UiIcon name="settings" /></button><WindowControls /></header>
      <main id="view" class="ui-main-panel"><router-view /></main>
      <PlayerBar />
    </div>
  </div>
</template>
<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { userLists } from '@renderer/store/list/state'
import { appearance, appearancePanelOpen, resolvedAppearanceMode } from '@renderer/composables/useAppearance'
import UiIcon from './components/UiIcon.vue'
import PlayerBar from './PlayerBar.vue'
import WindowControls from './components/WindowControls.vue'
const route = useRoute()
const router = useRouter()
const query = ref('')
const navigation = [{ path: '/discover', label: '发现音乐', icon: 'discover' }, { path: '/search', label: '搜索', icon: 'search' }, { path: '/songList', label: '精选歌单', icon: 'list' }, { path: '/leaderboard', label: '排行榜', icon: 'chart' }, { path: '/list', label: '音乐库', icon: 'library' }, { path: '/download', label: '下载管理', icon: 'download' }]
const routeTitle = computed(() => route.path === '/setting' ? '设置与偏好' : navigation.find(item => route.path.startsWith(item.path))?.label ?? '发现音乐')
const search = () => { if (query.value.trim()) void router.push({ path: '/search', query: { text: query.value.trim() } }) }
</script>


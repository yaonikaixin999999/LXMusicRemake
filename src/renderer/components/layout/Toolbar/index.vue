<template>
  <header :class="[$style.toolbar, { [$style.fullscreen]: isFullscreen }]">
    <div :class="$style.breadcrumb">
      <button type="button" :class="$style.backBtn" aria-label="返回上一页" @click="router.back()"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true"><path d="m14 6-6 6 6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg></button>
      <span :class="$style.breadcrumbRoot">音乐空间</span>
      <span :class="$style.divider">/</span>
      <strong :class="$style.routeTitle">{{ routeTitle }}</strong>
    </div>
    <SearchInput />
    <button type="button" :class="$style.appearanceBtn" aria-label="外观定制" @click="appearancePanelOpen = true"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true"><path d="m4 6 16 0M4 12h16M4 18h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /><circle cx="8" cy="6" r="2" fill="var(--modern-panel)" stroke="currentColor" stroke-width="1.6" /><circle cx="16" cy="12" r="2" fill="var(--modern-panel)" stroke="currentColor" stroke-width="1.6" /><circle cx="10" cy="18" r="2" fill="var(--modern-panel)" stroke="currentColor" stroke-width="1.6" /></svg></button>
    <div v-if="appSetting['common.controlBtnPosition'] != 'left'" :class="$style.windowControls"><ControlBtns /></div>
  </header>
</template>

<script setup>
import { computed } from '@common/utils/vueTools'
import { useRouter, useRoute } from '@common/utils/vueRouter'
import { useI18n } from '@root/lang'
import { isFullscreen } from '@renderer/store'
import { appSetting } from '@renderer/store/setting'
import { appearancePanelOpen } from '@renderer/composables/useAppearance'
import ControlBtns from './ControlBtns.vue'
import SearchInput from './SearchInput.vue'

const router = useRouter()
const route = useRoute()
const t = useI18n()
const routeTitle = computed(() => ({
  Discover: '发现音乐',
  Search: t('search'),
  SongList: t('song_list'),
  Leaderboard: t('leaderboard'),
  List: t('my_list'),
  Download: t('download'),
  Setting: t('setting'),
}[route.meta.name] || 'LX Music'))
</script>

<style lang="less" module>
.toolbar {
  box-sizing: border-box;
  display: flex;
  height: 68px;
  min-height: 68px;
  align-items: center;
  gap: 12px;
  padding: 0 20px;
  color: var(--modern-text);
  -webkit-app-region: drag;
  z-index: 6;
  &.fullscreen { -webkit-app-region: no-drag; }
}
.breadcrumb { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; font-size: 11px; white-space: nowrap; }
.breadcrumbRoot, .divider { color: var(--modern-muted); }
.divider { opacity: .45; }
.routeTitle { font-weight: 500; overflow: hidden; text-overflow: ellipsis; }
.backBtn, .appearanceBtn { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; background: transparent; border: 0; border-radius: 10px; color: var(--modern-muted); cursor: pointer; flex: none; -webkit-app-region: no-drag; &:hover { background: var(--modern-accent-soft); color: var(--modern-text); } &:focus-visible { outline: 2px solid var(--modern-accent); outline-offset: 2px; } }
.backBtn { width: 24px; }
.windowControls { align-self: flex-start; margin: 0 -20px 0 0; flex: none; }
@media (max-width: 1100px) { .toolbar { gap: 8px; } .breadcrumb { gap: 9px; } }
@media (max-width: 880px) { .breadcrumbRoot, .divider { display: none; } }
@media (max-width: 650px) { .toolbar { padding: 0 12px; gap: 6px; } .appearanceBtn { display: none; } .windowControls { margin-right: -12px; } .backBtn { display: none; } }
</style>

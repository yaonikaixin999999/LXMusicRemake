<template>
  <nav :class="$style.menu" aria-label="主导航">
    <section v-for="section in sections" :key="section.label" :class="$style.section">
      <div :class="$style.sectionLabel">{{ section.label }}</div>
      <ul :class="$style.list">
        <li v-for="item in section.items" :key="item.to">
          <router-link :class="[$style.link, { [$style.active]: $route.meta.name == item.name }]" :to="item.to" :aria-label="item.label" :aria-current="$route.meta.name == item.name ? 'page' : undefined">
            <svg v-if="item.name == 'Discover'" viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /><path d="M9 21v-8h6v8" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" /></svg>
            <svg v-else :viewBox="item.viewBox" height="20" width="20" aria-hidden="true"><use :xlink:href="item.icon" /></svg>
            <span :class="$style.label">{{ item.label }}</span>
          </router-link>
        </li>
      </ul>
    </section>
  </nav>
</template>

<script setup>
import { computed } from '@common/utils/vueTools'
import { appSetting } from '@renderer/store/setting'
import { useI18n } from '@root/lang'

const t = useI18n()
const sections = computed(() => [
  {
    label: '浏览音乐',
    items: [
      { to: '/discover', label: '发现音乐', name: 'Discover' },
      { to: '/search', label: t('search'), name: 'Search', icon: '#icon-search-2', viewBox: '0 0 425.2 425.2' },
      { to: '/songList/list', label: t('song_list'), name: 'SongList', icon: '#icon-album', viewBox: '0 0 425.2 425.2' },
      { to: '/leaderboard', label: t('leaderboard'), name: 'Leaderboard', icon: '#icon-leaderboard', viewBox: '0 0 425.22 425.2' },
    ],
  },
  {
    label: '我的音乐',
    items: [
      { to: '/list', label: t('my_list'), name: 'List', icon: '#icon-love', viewBox: '0 0 444.87 391.18' },
      ...(appSetting['download.enable'] ? [{ to: '/download', label: t('download'), name: 'Download', icon: '#icon-download-2', viewBox: '0 0 425.2 425.2' }] : []),
    ],
  },
  {
    label: '偏好设置',
    items: [{ to: '/setting', label: t('setting'), name: 'Setting', icon: '#icon-setting', viewBox: '0 0 493.23 436.47' }],
  },
])
</script>

<style lang="less" module>
.menu { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 12px; -webkit-app-region: no-drag; }
.section { margin-bottom: 24px; &:last-child { margin-bottom: 0; } }
.sectionLabel { padding: 0 12px 9px; font-size: 10px; letter-spacing: .8px; color: var(--modern-muted); opacity: .7; }
.list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.link {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 42px;
  padding: 0 12px;
  box-sizing: border-box;
  border-radius: 11px;
  color: var(--modern-muted);
  text-decoration: none;
  font-size: 13px;
  transition: background-color .15s, color .15s;
  svg { flex: none; opacity: .8; fill: currentColor; }
  svg[fill='none'] { fill: none; }
  &:hover { background: var(--modern-accent-soft); color: var(--modern-text); }
  &:focus-visible { outline: 2px solid var(--modern-accent); outline-offset: 2px; }
  &.active { background: var(--modern-accent-soft); color: var(--modern-accent-ink); font-weight: 600; svg { opacity: 1; } }
}
.label { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
@media (max-height: 630px) { .section { margin-bottom: 17px; } .link { min-height: 39px; } }
@media (max-width: 760px) {
  .menu { padding: 10px; }
  .section { margin-bottom: 22px; }
  .sectionLabel, .label { display: none; }
  .link { justify-content: center; min-height: 44px; padding: 0; }
}
</style>

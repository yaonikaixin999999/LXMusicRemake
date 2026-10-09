<template>
  <Teleport to="body"><aside v-if="favoriteNotice" class="ui-favorite-notice" role="status" aria-live="polite"><header><UiIcon name="heart" /><strong>{{ favoriteNotice?.title }}</strong><button type="button" aria-label="关闭收藏同步结果" @click="favoriteNotice = null"><UiIcon name="close" /></button></header><p v-if="favoriteNotice?.pending">正在同步红心…</p><template v-else><p v-if="favoriteNotice?.error" class="ui-favorite-result-error">{{ favoriteNotice?.localUpdated ? '本地收藏已更新，平台同步未完成：' : '操作未完整完成：' }}{{ favoriteNotice?.error }}</p><p v-else-if="!favoriteNotice?.results.length">本地收藏已更新</p><div v-for="result in favoriteNotice?.results ?? []" :key="result.platform" class="ui-favorite-result" :class="{ failed: result.status !== 'success' }"><UiIcon :name="result.status === 'success' ? 'check' : 'close'" /><span>{{ platformName(result.platform) }}</span><small>{{ result.message }}</small></div></template></aside></Teleport>
</template>

<script setup lang="ts">
import { favoriteNotice, platformName } from '../services/platformAccounts'
import UiIcon from './UiIcon.vue'
</script>

<style lang="less">
.ui-favorite-notice { position: fixed; z-index: 1050; right: 24px; bottom: 116px; width: 330px; max-width: calc(100vw - 40px); box-sizing: border-box; padding: 14px 16px; border: 1px solid var(--modern-border); border-radius: 8px; background: var(--modern-panel); color: var(--modern-text); box-shadow: 0 12px 35px #0002; header { display: flex; align-items: center; gap: 8px; > svg { width: 16px; height: 16px; color: var(--modern-accent-ink); flex: none; } strong { font-size: 12px; font-weight: 550; flex: 1; min-width: 0; overflow-wrap: anywhere; } button { width: 26px; height: 26px; display: grid; place-items: center; border: 0; background: transparent; color: var(--modern-muted); flex: none; cursor: pointer; svg { width: 16px; height: 16px; } &:hover { background: var(--modern-hover); border-radius: 4px; } } } > p { font-size: 11px; line-height: 1.8; color: var(--modern-muted); margin-top: 9px; } > .ui-favorite-result-error { color: #c66666; } }
.ui-favorite-result { display: grid; grid-template-columns: 14px minmax(0, 1fr); gap: 2px 7px; margin-top: 10px; align-items: center; font-size: 11px; svg { width: 14px; height: 14px; color: var(--modern-accent-ink); } small { grid-column: 2; font-size: 10px; color: var(--modern-muted); line-height: 1.7; overflow-wrap: anywhere; } &.failed svg, &.failed small { color: #c66666; } }
</style>

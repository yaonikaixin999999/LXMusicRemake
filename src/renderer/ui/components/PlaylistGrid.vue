<template>
  <div class="ui-playlist-grid">
    <button v-for="item in list" :key="`${item.source}-${item.id}`" type="button" class="ui-playlist-card" @click="emit('open', item)">
      <span class="ui-playlist-card__art"><img v-if="item.img" :src="item.img" alt="" loading="lazy" @error="hideImage"><span class="ui-playlist-card__fallback" aria-hidden="true"><UiIcon name="music" /></span><span v-if="item.play_count" class="ui-playlist-card__plays"><UiIcon name="play" filled />{{ item.play_count }}</span><span class="ui-playlist-card__open" aria-hidden="true"><UiIcon name="arrowUpRight" /></span></span>
      <strong>{{ item.name }}</strong><span class="ui-playlist-card__meta">{{ item.author || sourceLabel(item) }}<span>{{ sourceLabel(item) }}</span></span>
    </button>
  </div>
</template>
<script setup lang="ts">
import UiIcon from '@renderer/ui/components/UiIcon.vue'
import { sourceNames } from '@renderer/store'
import type { ListInfoItem } from '@renderer/store/songList/state'
defineProps<{ list: ListInfoItem[] }>()
const emit = defineEmits<(event: 'open', item: ListInfoItem) => void>()
const sourceLabel = (item: ListInfoItem) => sourceNames.value[item.source]
function hideImage(event: Event) { (event.target as HTMLImageElement).style.display = 'none' }
</script>
<style lang="less">
.ui-playlist-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(135px, 1fr)); gap: 23px 18px; }
.ui-playlist-card { min-width: 0; padding: 0; border: 0; color: var(--modern-text); background: transparent; text-align: left; font-family: inherit; cursor: pointer; &:hover .ui-playlist-card__art { transform: translateY(-3px); box-shadow: var(--modern-shadow); } &:hover .ui-playlist-card__open { opacity: 1; } &:focus-visible { outline: 2px solid var(--modern-accent); outline-offset: 5px; border-radius: 10px; } strong { display: -webkit-box; min-height: 33px; margin-top: 10px; overflow: hidden; font-size: 11px; font-weight: 550; line-height: 1.5; -webkit-line-clamp: 2; -webkit-box-orient: vertical; } }
.ui-playlist-card__art { position: relative; display: block; width: 100%; aspect-ratio: 1; overflow: hidden; border-radius: var(--modern-radius-small); background: var(--modern-accent-soft); transition: transform .2s, box-shadow .2s; img { position: absolute; z-index: 1; width: 100%; height: 100%; object-fit: cover; } }
.ui-playlist-card__fallback { position: absolute; inset: 0; display: grid; place-items: center; color: var(--modern-accent-ink); svg { width: 48px; height: 48px; } }
.ui-playlist-card__plays { position: absolute; z-index: 2; right: 8px; bottom: 8px; display: inline-flex; align-items: center; gap: 4px; padding: 4px 7px; border-radius: 7px; background: rgba(0,0,0,.5); color: white; font-size: 9px; backdrop-filter: blur(5px); svg { width: 10px; height: 10px; } }
.ui-playlist-card__open { position: absolute; z-index: 2; top: 8px; right: 8px; display: grid; place-items: center; width: 25px; height: 25px; border-radius: 50%; background: var(--modern-panel); color: var(--modern-text); opacity: 0; transition: opacity .2s; svg { width: 15px; height: 15px; } }
.ui-playlist-card__meta { display: flex; justify-content: space-between; gap: 8px; margin-top: 5px; color: var(--modern-muted); font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; span { flex: none; } }
</style>

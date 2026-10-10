<template>
  <div class="ui-catalog-grid">
    <article v-for="item in list" :key="`${item.source}-${item.kind}-${item.id}`" class="ui-catalog-card">
      <button type="button" class="ui-catalog-card__body" :aria-label="`查看${item.kind === 'album' ? '专辑' : '歌手'} ${item.name}`" @click="emit('open', item)">
        <span class="ui-catalog-card__art" :class="{ 'ui-catalog-card__art--artist': item.kind === 'artist' }"><span aria-hidden="true"><UiIcon :name="item.kind === 'album' ? 'music' : 'library'" /></span><img v-if="item.img" :src="item.img" alt="" loading="lazy" @error="hideImage"></span>
        <strong>{{ item.name }}</strong><span v-if="item.author" class="ui-catalog-card__author">{{ item.author }}</span><small>{{ platformLabel(item.source) }}<span v-if="item.date"> · {{ item.date }}</span><span v-if="item.count"> · {{ item.count }} 首</span></small>
      </button>
      <button type="button" class="ui-catalog-card__play" :aria-label="`播放 ${item.name} 的歌曲`" @click="emit('play', item)"><UiIcon name="play" filled /></button>
    </article>
  </div>
</template>
<script setup lang="ts">
import { sourceNames } from '@renderer/store'
import UiIcon from './UiIcon.vue'
import type { CatalogEntry } from '../services/catalogSearch'
defineProps<{ list: CatalogEntry[] }>()
const emit = defineEmits<{ open: [item: CatalogEntry], play: [item: CatalogEntry] }>()
const platformLabel = (source: LX.OnlineSource) => sourceNames.value[source]
function hideImage(event: Event) { (event.target as HTMLImageElement).style.display = 'none' }
</script>
<style lang="less">
.ui-catalog-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: calc(8px + var(--modern-panel-gap)) var(--modern-panel-gap); }
.ui-catalog-card { position: relative; min-width: 0; }
.ui-catalog-card__body { display: block; width: 100%; padding: 0; border: 0; color: var(--modern-text); background: transparent; font: inherit; text-align: left; cursor: pointer; strong { display: block; margin-top: 12px; font-size: 12px; font-weight: 550; line-height: 1.5; overflow-wrap: anywhere; } small, .ui-catalog-card__author { display: block; margin-top: 5px; color: var(--modern-muted); font-size: 10px; line-height: 1.5; } &:focus-visible { outline: 2px solid var(--modern-accent); outline-offset: 5px; border-radius: 10px; } }
.ui-catalog-card__art { display: block; position: relative; aspect-ratio: 1; overflow: hidden; border-radius: var(--modern-radius-small); background: var(--modern-accent-soft); > span { position: absolute; inset: 0; display: grid; place-items: center; color: var(--modern-accent-ink); svg { width: 48px; height: 48px; } } img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; } &--artist { border-radius: 50%; } }
.ui-catalog-card__play { position: absolute; z-index: 1; top: 8px; right: 8px; display: grid; place-items: center; width: 32px; height: 32px; border: 1px solid var(--modern-border); border-radius: 50%; color: var(--modern-text); background: var(--modern-panel); cursor: pointer; svg { width: 16px; height: 16px; } &:hover { background: var(--modern-accent); color: var(--modern-accent-contrast); } }
</style>

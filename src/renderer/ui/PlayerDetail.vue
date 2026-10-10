<template>
  <Transition name="ui-detail"><section v-if="isShowPlayerDetail" class="ui-player-detail" aria-label="播放详情"><header><span>正在播放 <small>NOW PLAYING</small></span><button type="button" class="ui-icon-button" aria-label="收起播放详情" @click="setShowPlayerDetail(false)"><UiIcon name="close" /></button></header><div class="ui-detail-body"><div class="ui-detail-song"><div class="ui-detail-cover"><TrackArtwork :track="currentTrack" :src="musicInfo.pic" :alt="musicInfo.name" /></div><h1>{{ musicInfo.name || '静候一首好歌' }}</h1><p class="ui-detail-artists"><template v-if="artistNames.length"><template v-for="(artist, index) in artistNames" :key="artist"><span v-if="index" aria-hidden="true">、</span><button type="button" class="ui-detail-metadata-link" :aria-label="`搜索歌手 ${artist}`" @click="searchMetadata('artist', artist)">{{ artist }}</button></template></template><span v-else>从你的音乐库开始聆听</span></p><small v-if="musicInfo.album"><button type="button" class="ui-detail-metadata-link" :aria-label="`搜索专辑 ${musicInfo.album}`" @click="searchMetadata('album', musicInfo.album)">{{ musicInfo.album }}</button></small><div class="ui-detail-actions"><button type="button" class="ui-button" :disabled="!playMusicInfo.musicInfo" @click="addOpen = true"><UiIcon name="plus" />加入歌单</button><button type="button" class="ui-button" @click="copyLyric">复制歌词</button><button type="button" class="ui-button" @click="commentsOpen = !commentsOpen">评论</button></div><div class="ui-detail-offset"><span>歌词延迟</span><button type="button" @click="setLyricOffset(lyric.offset + lyric.tempOffset - 500)"><UiIcon name="minimize" />0.5s</button><small>{{ ((lyric.offset + lyric.tempOffset) / 1000).toFixed(1) }}s</small><button type="button" @click="setLyricOffset(lyric.offset + lyric.tempOffset + 500)"><UiIcon name="plus" />0.5s</button></div></div><div ref="lyricPanel" class="ui-detail-lyrics scroll" :style="{ textAlign: appSetting['playDetail.style.align'], '--ui-lyric-size': (appSetting['playDetail.style.fontSize'] / 100) + 'rem' }"><div v-if="!lyric.lines.length" class="ui-lyric-empty"><UiIcon name="lyric" /><p>{{ musicInfo.name ? '纯粹聆听，暂无歌词' : '歌词会随音乐在这里展开' }}</p></div><button v-for="(line, index) in lyric.lines" :key="index" type="button" :data-line="index" :class="{ 'ui-lyric-current': lyric.line === index }" @click="seekLine(line)"><span>{{ line.text || '♪' }}</span><small v-for="(extended, i) in line.extendedLyrics" :key="i">{{ extended }}</small></button></div></div><PlayerBar /><TrackActionModal :show="addOpen" :tracks="currentTrack ? [currentTrack] : []" action="add" @close="addOpen = false" /><CommentsPanel v-if="commentsOpen && currentTrack" :track="currentTrack" @close="commentsOpen = false" /></section></Transition>
</template>
<script setup>
import TrackArtwork from '@renderer/ui/components/TrackArtwork.vue'
import { ref, watch, nextTick, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getCatalogSources } from './services/catalogSearch'
import { musicInfo, playMusicInfo, isShowPlayerDetail } from '@renderer/store/player/state'
import { setShowPlayerDetail } from '@renderer/store/player/action'
import { lyric } from '@renderer/store/player/lyric'
import { setLyricOffset } from '@renderer/core/lyric'
import { appSetting } from '@renderer/store/setting'
import { clipboardWriteText } from '@common/utils/electron'
import UiIcon from './components/UiIcon.vue'
import TrackActionModal from './components/TrackActionModal.vue'
import PlayerBar from './PlayerBar.vue'
import CommentsPanel from './components/CommentsPanel.vue'
const seekLine = line => { window.app_event.setProgress(line.time / 1000) }
const currentTrack = computed(() => { const item = playMusicInfo.musicInfo; return item && 'metadata' in item ? item.metadata.musicInfo : item })
const router = useRouter()
const artistNames = computed(() => String(musicInfo.singer || '').split(/\s*、\s*|\s+\/\s+/).map(name => name.trim()).filter(Boolean))
const searchMetadata = (type, text) => {
  text = String(text || '').trim()
  if (!text) return
  const preferredSource = currentTrack.value?.source
  const source = getCatalogSources(type).includes(preferredSource) ? preferredSource : 'all'
  setShowPlayerDetail(false)
  commentsOpen.value = false
  void router.push({ path: '/search', query: { text, type, source, page: '1' } })
}
const addOpen = ref(false)
const commentsOpen = ref(false)
const lyricPanel = ref(null)
const copyLyric = () => { clipboardWriteText(lyric.lines.map(line => line.text).join('\n')) }
watch(() => lyric.line, async line => { await nextTick(); lyricPanel.value?.querySelector(`[data-line="${line}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) })
</script>


<style scoped lang="less">
.ui-detail-metadata-link { padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: inherit; cursor: pointer; text-decoration: underline; text-decoration-color: transparent; text-underline-offset: 3px; &:hover { color: var(--modern-accent-ink); text-decoration-color: currentColor; } &:focus-visible { outline: 2px solid var(--modern-accent); outline-offset: 4px; border-radius: 3px; } }
.ui-detail-artists { line-height: 1.6; }
</style>

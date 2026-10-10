<template>
  <section class="ui-player" :class="`ui-progress-${appSetting['common.playBarProgressStyle']}`" aria-label="音乐播放器">
    <div class="ui-player-track"><button type="button" class="ui-player-cover" aria-label="打开播放详情" @click="setShowPlayerDetail(true)"><TrackArtwork :track="currentTrack" :src="musicInfo.pic" :alt="musicInfo.name" /></button><div class="ui-player-info"><button type="button" @click="setShowPlayerDetail(true)">{{ musicInfo.name || '选择一首歌，开始聆听' }}</button><span>{{ statusText || musicInfo.singer || '每一种心情，都有自己的旋律' }}</span></div><button type="button" class="ui-icon-button ui-collect-button" :aria-label="collected ? '取消收藏当前歌曲' : '收藏当前歌曲'" :class="{ 'ui-active': collected }" :disabled="!currentTrack" @click="toggleCollect"><UiIcon name="heart" :filled="collected" /></button></div>
    <div class="ui-player-center"><div class="ui-transport"><button type="button" class="ui-icon-button" aria-label="上一首" @click="playPrev()"><UiIcon name="prev" /></button><button type="button" class="ui-play-button" :aria-label="isPlay ? '暂停' : '播放'" @click="togglePlay"><UiIcon :name="isPlay ? 'pause' : 'play'" filled /></button><button type="button" class="ui-icon-button" aria-label="下一首" @click="playNext()"><UiIcon name="next" /></button></div><div class="ui-seek"><span>{{ playProgress.nowPlayTimeStr }}</span><UiRange :model-value="seeking ?? playProgress.nowPlayTime" :max="playProgress.maxPlayTime || 1" :step="0.1" aria-label="播放进度" :disabled="!playProgress.maxPlayTime" @input="seeking = $event" @change="seek" /><span>{{ playProgress.maxPlayTimeStr }}</span></div></div>
    <div class="ui-player-tools"><button type="button" class="ui-icon-button" :class="{ 'ui-active': appSetting['desktopLyric.enable'] }" aria-label="切换桌面歌词" @click="toggleDesktopLyric"><UiIcon name="lyric" /></button><button type="button" class="ui-icon-button" aria-label="播放队列" @click="queueOpen = true"><UiIcon name="queue" /></button><QualityControl :track="currentTrack" /><UiSelect class="ui-play-mode" :model-value="appSetting['player.togglePlayMethod']" :options="playModes" aria-label="播放模式" @change="setTogglePlayMode($event)" /><VolumeControl /></div>
    <UiModal :show="queueOpen" title="播放队列" :subtitle="`${queue.length} 首歌曲`" width="560px" @close="queueOpen = false"><div v-if="!queue.length" class="ui-empty">选择歌曲后，播放队列会出现在这里。</div><button v-for="(item, index) in queue" :key="item.id" type="button" class="ui-queue-track" :class="{ 'ui-active': item.id === musicInfo.id }" @click="playList(playMusicInfo.listId, index)"><span>{{ String(index + 1).padStart(2, '0') }}</span><strong>{{ item.name }}</strong><small>{{ item.singer }}</small></button><template v-if="tempPlayList.length"><h3 class="ui-queue-heading">稍后播放</h3><div v-for="item in tempPlayList" :key="item.musicInfo.id" class="ui-queue-track">{{ item.musicInfo.name }} · {{ item.musicInfo.singer }}</div></template></UiModal>
  </section>
</template>
<script setup>
import { computed, ref, watch } from 'vue'
import { musicInfo, statusText, isPlay, playMusicInfo, tempPlayList } from '@renderer/store/player/state'
import { setShowPlayerDetail } from '@renderer/store/player/action'
import { playProgress } from '@renderer/store/player/playProgress'
import { appSetting, setTogglePlayMode } from '@renderer/store/setting'
import { togglePlay, playNext, playPrev, playList } from '@renderer/core/player'
import { getListMusics } from '@renderer/store/list/action'
import { favoritePending, isFavorite, requestFavorite } from './services/platformAccounts'
import { getDownloadList } from '@renderer/store/download/action'
import useToggleDesktopLyric from '@renderer/utils/compositions/useToggleDesktopLyric'
import UiIcon from './components/UiIcon.vue'
import UiModal from './components/UiModal.vue'
import UiSelect from './components/UiSelect.vue'
import UiRange from './components/UiRange.vue'
import VolumeControl from './components/VolumeControl.vue'
import QualityControl from './components/QualityControl.vue'
import TrackArtwork from './components/TrackArtwork.vue'
const playModes = [{ value: 'listLoop', label: '列表循环' }, { value: 'random', label: '随机播放' }, { value: 'singleLoop', label: '单曲循环' }, { value: 'list', label: '顺序播放' }, { value: 'none', label: '播放一首' }]
const { toggleDesktopLyric } = useToggleDesktopLyric()
const currentTrack = computed(() => { const item = playMusicInfo.musicInfo; return item && 'metadata' in item ? item.metadata.musicInfo : item })
const collected = computed(() => isFavorite(currentTrack.value))
const toggleCollect = () => { if (currentTrack.value && !favoritePending.value.has(currentTrack.value.id)) requestFavorite(currentTrack.value, !collected.value) }
const seeking = ref(null)
const queueOpen = ref(false)
const queue = ref([])
const seek = () => { window.app_event.setProgress(seeking.value ?? 0); seeking.value = null }
watch(queueOpen, async show => { if (show) queue.value = playMusicInfo.listId === 'download' ? (await getDownloadList()).map(task => task.metadata.musicInfo) : playMusicInfo.listId ? await getListMusics(playMusicInfo.listId) : [] })
</script>


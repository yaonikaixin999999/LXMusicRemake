<template>
  <section :class="[$style.player, { [$style.fullProgress]: appSetting['common.playBarProgressStyle'] == 'full', [$style.miniProgress]: appSetting['common.playBarProgressStyle'] == 'mini' }]" aria-label="音乐播放器">
    <div :class="$style.track">
      <button type="button" :class="$style.cover" :aria-label="$t('player__pic_tip')" @contextmenu="handleToMusicLocation" @click="showPlayerDetail">
        <img v-if="musicInfo.pic" :src="musicInfo.pic" :alt="musicInfo.name" decoding="async" @error="imgError">
        <svg v-else viewBox="0 0 24 24" width="25" height="25" fill="none" aria-hidden="true"><path d="M9 17V6l10-2v11M9 8l10-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /><ellipse cx="6" cy="17" rx="3" ry="2.5" fill="currentColor" /><ellipse cx="16" cy="15" rx="3" ry="2.5" fill="currentColor" /></svg>
      </button>
      <div :class="$style.trackInfo">
        <button type="button" :class="$style.title" :disabled="!title" :aria-label="title ? title + $t('copy_tip') : '选择一首歌，开始聆听'" @click="handleCopy">{{ title || '选择一首歌，开始聆听' }}</button>
        <span :class="$style.subtitle">{{ statusText || musicInfo.singer || '让音乐陪伴此刻' }}</span>
      </div>
    </div>
    <div :class="$style.playback">
      <div :class="$style.playButtons">
        <button type="button" :class="$style.skipBtn" :aria-label="$t('player__prev')" @click="playPrev()"><svg viewBox="0 0 1024 1024" width="20" height="20" aria-hidden="true"><use xlink:href="#icon-prevMusic" /></svg></button>
        <button type="button" :class="$style.playBtn" :aria-label="isPlay ? $t('player__pause') : $t('player__play')" @click="togglePlay"><svg viewBox="0 0 1024 1024" width="22" height="22" aria-hidden="true"><use :xlink:href="isPlay ? '#icon-pause' : '#icon-play'" /></svg></button>
        <button type="button" :class="$style.skipBtn" :aria-label="$t('player__next')" @click="playNext()"><svg viewBox="0 0 1024 1024" width="20" height="20" aria-hidden="true"><use xlink:href="#icon-nextMusic" /></svg></button>
      </div>
      <div :class="$style.timeRow">
        <span>{{ nowPlayTimeStr }}</span>
        <div :class="$style.seek"><common-progress-bar v-if="!isShowPlayerDetail" :class-name="$style.progressBar" :progress="progress" :handle-transition-end="handleTransitionEnd" :is-active-transition="isActiveTransition" /></div>
        <span>{{ maxPlayTimeStr }}</span>
      </div>
    </div>
    <ControlBtns />
  </section>
</template>

<script setup>
import { computed } from '@common/utils/vueTools'
import { useRouter } from '@common/utils/vueRouter'
import { clipboardWriteText } from '@common/utils/electron'
import { LIST_IDS } from '@common/constants'
import { appSetting } from '@renderer/store/setting'
import { statusText, musicInfo, isShowPlayerDetail, isPlay, playInfo, playMusicInfo } from '@renderer/store/player/state'
import { setMusicInfo, setShowPlayerDetail } from '@renderer/store/player/action'
import { togglePlay, playNext, playPrev } from '@renderer/core/player'
import { formatMusicName } from '@renderer/utils'
import usePlayProgress from '@renderer/utils/compositions/usePlayProgress'
import ControlBtns from './ControlBtns.vue'

const router = useRouter()
const { nowPlayTimeStr, maxPlayTimeStr, progress, isActiveTransition, handleTransitionEnd } = usePlayProgress()
const title = computed(() => musicInfo.name ? formatMusicName(appSetting['download.fileName'], musicInfo.name, musicInfo.singer) : '')
const showPlayerDetail = () => {
  if (playMusicInfo.musicInfo) setShowPlayerDetail(true)
}
const handleCopy = () => {
  if (title.value) clipboardWriteText(title.value)
}
const imgError = () => { setMusicInfo({ pic: null }) }
const handleToMusicLocation = () => {
  const listId = playMusicInfo.listId
  if (!listId || listId == LIST_IDS.DOWNLOAD || !playMusicInfo.musicInfo || playInfo.playIndex == -1) return
  void router.push({ path: '/list', query: { id: listId, scrollIndex: playInfo.playIndex } })
}
</script>

<style lang="less" module>
.player {
  position: relative;
  box-sizing: border-box;
  height: 90px;
  min-height: 90px;
  margin: 12px 20px 16px;
  padding: 13px 18px;
  display: grid;
  grid-template-columns: minmax(135px, 1fr) minmax(215px, 1.2fr) auto;
  align-items: center;
  gap: 18px;
  border: 1px solid var(--modern-border);
  border-radius: var(--modern-radius);
  background: var(--modern-panel);
  color: var(--modern-text);
  box-shadow: var(--modern-shadow);
  z-index: 5;
  -webkit-app-region: no-drag;
  button { font: inherit; }
  button:focus-visible { outline: 2px solid var(--modern-accent); outline-offset: 3px; }
}
.track { display: flex; align-items: center; gap: 11px; min-width: 0; }
.cover {
  width: 48px;
  height: 48px;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--modern-accent-ink);
  background: var(--modern-accent-soft);
  overflow: hidden;
  cursor: pointer;
  img { width: 100%; height: 100%; object-fit: cover; }
  &:hover { opacity: .8; }
}
.trackInfo { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.title {
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--modern-text);
  text-align: left;
  font-size: 11px !important;
  font-weight: 550 !important;
  line-height: 1.4;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  cursor: pointer;
  &:disabled { opacity: 1; cursor: default; }
}
.subtitle { font-size: 9px; color: var(--modern-muted); line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.playback { display: flex; flex-direction: column; align-items: center; gap: 5px; min-width: 0; }
.playButtons { display: flex; align-items: center; gap: 19px; }
.skipBtn, .playBtn {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--modern-text);
  border-radius: 50%;
  cursor: pointer;
  svg { fill: currentColor; }
  transition: opacity .15s, transform .15s;
  &:hover { opacity: .75; }
  &:active { transform: scale(.94); }
}
.playBtn { width: 36px; height: 36px; background: var(--modern-text); color: var(--modern-panel); }
.timeRow { display: flex; align-items: center; gap: 8px; width: 100%; span { width: 30px; color: var(--modern-muted); font-size: 9px; font-variant-numeric: tabular-nums; white-space: nowrap; flex: none; text-align: center; } }
.seek { position: relative; flex: 1; min-width: 0; padding: 6px 0; }
.progressBar { height: 3px; background: var(--modern-border); > div { background: var(--modern-accent); } }
.fullProgress .seek { position: absolute; left: 18px; right: 18px; top: -6px; .progressBar { height: 2px; } }
.fullProgress .timeRow { justify-content: center; gap: 12px; }
.miniProgress .timeRow { justify-content: center; .seek { flex: none; width: 78px; } }
@media (max-width: 1100px) {
  .player { grid-template-columns: minmax(125px, 1fr) minmax(195px, 1.25fr) auto; gap: 12px; padding: 13px 14px; }
}
@media (max-width: 760px) {
  .player { margin: 12px 14px 14px; grid-template-columns: minmax(100px, 1fr) minmax(175px, 1.25fr) auto; gap: 10px; padding: 13px 12px; }
  .cover { width: 40px; height: 40px; border-radius: 10px; }
  .track { gap: 8px; }
}
@media (max-width: 580px) {
  .player { grid-template-columns: minmax(0, 1fr) 158px; grid-template-rows: 58px 28px; height: 116px; min-height: 116px; padding: 10px 12px; row-gap: 6px; }
  .player > div:last-child { grid-column: 1 / -1; justify-self: end; }
  .playButtons { gap: 14px; }
  .title { font-size: 10px !important; }
}
</style>

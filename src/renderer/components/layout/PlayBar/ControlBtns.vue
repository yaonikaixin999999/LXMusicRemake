<template>
  <div :class="$style.controlBtn">
    <!-- <common-volume-bar /> -->
    <button type="button" :class="[$style.titleBtn, $style.secondaryBtn]" :aria-label="$t('player__add_music_to')" @click="addMusicTo">
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" width="90%" viewBox="0 0 512 512" space="preserve">
        <use xlink:href="#icon-add-2" />
      </svg>
    </button>
    <button type="button" :class="[$style.titleBtn, $style.secondaryBtn]" :aria-label="toggleDesktopLyricBtnTitle" @click="toggleDesktopLyric" @contextmenu="toggleLockDesktopLyric">
      <svg v-show="appSetting['desktopLyric.enable']" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 512 512" space="preserve">
        <use xlink:href="#icon-desktop-lyric-on" />
      </svg>
      <svg v-show="!appSetting['desktopLyric.enable']" version="1.1" xmlns="http://www.w3.org/2000/svg" xlink="http://www.w3.org/1999/xlink" height="100%" viewBox="0 0 512 512" space="preserve">
        <use xlink:href="#icon-desktop-lyric-off" />
      </svg>
    </button>
    <common-volume-btn :class="$style.utility" />
    <common-toggle-play-mode-btn :class="$style.utility" />
    <common-list-add-modal v-model:show="isShowAddMusicTo" :music-info="playMusicInfo.musicInfo" />
  </div>
</template>

<script>
import { ref } from '@common/utils/vueTools'
import useToggleDesktopLyric from '@renderer/utils/compositions/useToggleDesktopLyric'
import { musicInfo, playMusicInfo } from '@renderer/store/player/state'
import { appSetting } from '@renderer/store/setting'

export default {
  setup() {
    const isShowAddMusicTo = ref(false)
    const {
      toggleDesktopLyricBtnTitle,
      toggleDesktopLyric,
      toggleLockDesktopLyric,
    } = useToggleDesktopLyric()
    const addMusicTo = () => {
      if (!musicInfo.id) return
      isShowAddMusicTo.value = true
    }
    return {
      appSetting,
      isShowAddMusicTo,
      toggleDesktopLyricBtnTitle,
      toggleDesktopLyric,
      toggleLockDesktopLyric,
      addMusicTo,
      playMusicInfo,
    }
  },
}
</script>

<style lang="less" module>
@import '@renderer/assets/styles/layout.less';

.controlBtn {
  padding: 0;
  height: 32px;
  flex: none;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  gap: 7px;

  button {
    color: var(--modern-muted);
    &:focus-visible { outline: 2px solid var(--modern-accent); outline-offset: 2px; }
  }
}

.titleBtn {
  flex: none;
  height: 28px;
  width: 28px;
  transition: @transition-fast;
  transition-property: color, opacity;
  // color: var(--color-button-font);
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  align-items: center;
  background-color: transparent;
  border: none;
  border-radius: 8px;
  padding: 0;

  opacity: .8;
  cursor: pointer;

  svg {
    width: 20px;
    height: 20px;
  }
  &:hover {
    opacity: 1;
    background: var(--modern-accent-soft);
  }
  &:active {
    opacity: 1;
  }
}

.utility { display: flex; align-items: center; height: 28px; > button { width: 24px; height: 28px; svg { height: 20px; width: 20px; filter: none; } } }


</style>

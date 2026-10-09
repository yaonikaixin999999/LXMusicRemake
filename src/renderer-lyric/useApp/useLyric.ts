import { watch } from '@common/utils/vueTools'
import { setLyric, setVertical, setPlaybackRate } from '@lyric/core/lyric'
import { getStatus } from '@lyric/core/mainWindowChannel'
import { isPlay, setting } from '@lyric/store/state'

export default () => {
  const reloadLyric = () => { setLyric(); getStatus() }
  watch(() => setting['player.isShowLyricTranslation'], reloadLyric)
  watch(() => setting['player.isShowLyricRoma'], reloadLyric)
  watch(() => setting['player.isSwapLyricTranslationAndRoma'], reloadLyric)
  watch(() => setting['player.isPlayLxlrc'], reloadLyric)
  watch(() => setting['player.playbackRate'], (rate) => {
    setPlaybackRate(rate)
    if (isPlay.value) {
      setTimeout(() => {
        getStatus()
      })
    }
  })
  watch(() => setting['desktopLyric.direction'], (direction) => {
    setVertical(direction == 'vertical')
    getStatus()
  })
}

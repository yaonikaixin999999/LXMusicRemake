import {
  createAudio,
} from '@renderer/plugins/player'
import useMediaDevice from './useMediaDevice'
import usePlayerEvent from './usePlayerEvent'
import usePlayer from './usePlayer'
import usePlayStatus from './usePlayStatus'
import { onBeforeUnmount } from '@common/utils/vueTools'
import { reloadCurrentQuality } from '@renderer/core/player/action'
import { bindQualityReload } from '@renderer/ui/services/platformPlayback'

export default () => {
  createAudio()

  usePlayerEvent()
  useMediaDevice() // 初始化音频驱动输出设置
  usePlayer()
  const initPlayStatus = usePlayStatus()
  onBeforeUnmount(bindQualityReload(reloadCurrentQuality))

  return () => {
    void initPlayStatus()
  }
}


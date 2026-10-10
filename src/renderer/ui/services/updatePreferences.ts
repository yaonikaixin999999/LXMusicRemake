import { ref } from 'vue'
import { isUpdateSource, type UpdateSource } from '@common/appUpdate'

const sourceKey = 'linkline.update-source.v1'
const readSource = (): UpdateSource => {
  try {
    const stored = localStorage.getItem(sourceKey)
    return isUpdateSource(stored) ? stored : 'mirror'
  } catch { return 'mirror' }
}

export const preferredUpdateSource = ref<UpdateSource>(readSource())
export const updateSourceSaveError = ref('')

export function saveUpdateSource(source: UpdateSource) {
  preferredUpdateSource.value = source
  updateSourceSaveError.value = ''
  try { localStorage.setItem(sourceKey, source) } catch {
    updateSourceSaveError.value = '本次已切换更新来源，但偏好未能保存，下次启动可能恢复默认来源。'
  }
}

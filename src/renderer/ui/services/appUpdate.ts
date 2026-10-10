import { computed, ref, shallowRef } from 'vue'
import { rendererInvoke } from '@common/rendererIpc'
import { isUpdateSource, LINKLINE_UPDATE_CHECK, UPDATE_SOURCES, type UpdateCheckRequest, type UpdateCheckResult, type UpdateSource } from '@common/appUpdate'
import { preferredUpdateSource, saveUpdateSource } from './updatePreferences'

export const updateResult = shallowRef<UpdateCheckResult | null>(null)
export const updateChecking = ref(false)
export const updateCenterOpen = ref(false)
export const updateAvailable = computed(() => !updateChecking.value && updateResult.value?.status === 'available' && updateResult.value.requestedSource === preferredUpdateSource.value)
const pendingRequests = new Map<UpdateSource, Promise<UpdateCheckResult>>()
let activeCheck: { source: UpdateSource, promise: Promise<UpdateCheckResult> } | null = null
let checkGeneration = 0
let startupChecked = false

// Settings and the title-bar dialog share a single request and result.
export async function checkAppUpdate(force = false): Promise<UpdateCheckResult> {
  const source = preferredUpdateSource.value
  if (activeCheck?.source === source) return activeCheck.promise
  const generation = ++checkGeneration
  const previous = updateResult.value
  updateChecking.value = true
  let request = pendingRequests.get(source)
  if (!request) {
    request = rendererInvoke<UpdateCheckRequest, UpdateCheckResult>(LINKLINE_UPDATE_CHECK, { force, source }).catch((error: unknown): UpdateCheckResult => ({
      status: 'error',
      currentVersion: previous?.currentVersion ?? process.versions.app ?? '',
      latestRelease: null,
      history: [],
      checkedAt: Date.now(),
      source,
      requestedSource: source,
      usedFallback: false,
      sourceLabel: UPDATE_SOURCES[source].label,
      error: error instanceof Error ? error.message : '无法连接更新服务，请稍后重试。',
    })).finally(() => { pendingRequests.delete(source) })
    pendingRequests.set(source, request)
  }
  const promise = request.then(result => {
    const next = result.status === 'error' && previous?.latestRelease && previous.requestedSource === source
      ? { ...result, latestRelease: previous.latestRelease, history: previous.history }
      : result
    if (generation === checkGeneration && preferredUpdateSource.value === source) updateResult.value = next
    return next
  }).finally(() => {
    if (generation === checkGeneration) {
      updateChecking.value = false
      activeCheck = null
    }
  })
  activeCheck = { source, promise }
  return promise
}

export async function selectUpdateSource(value: string | number): Promise<void> {
  if (!isUpdateSource(value) || value === preferredUpdateSource.value) return
  saveUpdateSource(value)
  updateResult.value = null
  await checkAppUpdate(true)
}

export function checkUpdateOnStartup() {
  if (startupChecked) return
  startupChecked = true
  void checkAppUpdate()
}

export function openUpdateCenter() {
  updateCenterOpen.value = true
  void checkAppUpdate(true)
}

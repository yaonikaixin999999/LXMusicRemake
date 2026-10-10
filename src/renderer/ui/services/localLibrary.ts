import { LOCAL_LIBRARY_ID, type LocalAudioScanProgress } from '@common/localMusic'
import { defaultList, loveList, userLists } from '@renderer/store/list/state'
import { addListMusics, createUserList, getListMusics, getUserLists, updateUserList } from '@renderer/store/list/action'

let initialization: Promise<void> | null = null
// Until the copy is complete, existing playlist metadata records a resumable migration.
const migrationMarker = 'linkline_local_migration_pending'

/** First use copies existing local entries; the originals and their playlists remain intact. */
export const ensureLocalLibrary = async() => {
  if (initialization) return initialization
  initialization = (async() => {
    await getUserLists()
    const localList = userLists.find(list => list.id === LOCAL_LIBRARY_ID)
    if (localList && localList.sourceListId !== migrationMarker) return
    const sourceIds = [defaultList.id, loveList.id, ...userLists.filter(list => list.id !== LOCAL_LIBRARY_ID).map(list => list.id)]
    const seen = new Set<string>()
    const existing: LX.Music.MusicInfoLocal[] = []
    for (const id of sourceIds) {
      for (const track of await getListMusics(id)) {
        if (track.source !== 'local' || seen.has(track.id)) continue
        seen.add(track.id)
        existing.push(track)
      }
    }
    if (!localList) await createUserList({ id: LOCAL_LIBRARY_ID, name: '本地音乐', sourceListId: migrationMarker })
    for (let offset = 0; offset < existing.length; offset += 100) await addListMusics(LOCAL_LIBRARY_ID, existing.slice(offset, offset + 100), 'bottom')
    const completed = userLists.find(list => list.id === LOCAL_LIBRARY_ID)!
    await updateUserList([{ ...completed, sourceListId: undefined }])
  })().finally(() => { initialization = null })
  return initialization
}

/** Merge restored list content into the dedicated library without removing tracks already there. */
export const reconcileLocalLibraryAfterRestore = async() => {
  await ensureLocalLibrary()
  const current = await getListMusics(LOCAL_LIBRARY_ID)
  const known = new Set(current.filter(track => track.source === 'local').map(track => track.id))
  const sourceIds = [defaultList.id, loveList.id, ...userLists.filter(list => list.id !== LOCAL_LIBRARY_ID).map(list => list.id)]
  const restored: LX.Music.MusicInfoLocal[] = []
  for (const id of sourceIds) {
    for (const track of await getListMusics(id)) {
      if (track.source !== 'local' || known.has(track.id)) continue
      known.add(track.id)
      restored.push(track)
    }
  }
  for (let offset = 0; offset < restored.length; offset += 100) await addListMusics(LOCAL_LIBRARY_ID, restored.slice(offset, offset + 100), 'bottom')
}

export interface LocalImportProgress extends LocalAudioScanProgress {
  imported: number
  metadataFailed: number
  cancelled: boolean
}

/** Worker batches and database writes have no total song cap. */
export const importLocalAudio = async(paths: string[], onProgress: (progress: LocalImportProgress) => void, isCancelled: () => boolean) => {
  await ensureLocalLibrary()
  const existing = (await getListMusics(LOCAL_LIBRARY_ID)).filter((track): track is LX.Music.MusicInfoLocal => track.source === 'local')
  const worker = window.lx.worker.main
  const scanId = await worker.startLocalAudioScan(paths, existing.map(track => track.meta.filePath))
  let progress: LocalImportProgress = { discovered: 0, skipped: 0, failed: 0, scanned: 0, directory: '', errors: [], imported: 0, metadataFailed: 0, cancelled: false }
  onProgress({ ...progress })
  try {
    while (!isCancelled()) {
      const batch = await worker.nextLocalAudioScan(scanId)
      progress = { ...progress, ...batch, errors: [...new Set([...progress.errors, ...batch.errors])].slice(0, 5) }
      onProgress({ ...progress })
      if (batch.files.length && !isCancelled()) {
        const result = await worker.createLocalMusicInfosDetailed(batch.files)
        // Keep an already completed batch even when the user cancels during metadata reading.
        if (result.tracks.length) await addListMusics(LOCAL_LIBRARY_ID, result.tracks, 'bottom')
        progress.imported += result.tracks.length
        progress.metadataFailed += result.failed
        progress.errors = [...new Set([...progress.errors, ...result.errors])].slice(0, 5)
        onProgress({ ...progress })
      }
      if (batch.done) break
      // Give input, pagination and paint a chance between batches.
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    progress.cancelled = isCancelled()
    return progress
  } finally { await worker.cancelLocalAudioScan(scanId) }
}

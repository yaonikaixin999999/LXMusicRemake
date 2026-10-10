import fs from 'node:fs/promises'
import path from 'node:path'
import { type Dir } from 'node:fs'
import { LOCAL_AUDIO_EXTENSIONS, type LocalAudioScanBatch, type LocalAudioScanProgress } from '../localMusic'

const extensions = new Set<string>(LOCAL_AUDIO_EXTENSIONS.map(ext => `.${ext}`))
const pathKey = (filePath: string) => process.platform === 'win32' ? filePath.toLowerCase() : filePath

/** Scans in bounded chunks without retaining every file or following directory symlinks. */
export class LocalAudioScanner {
  private readonly roots: string[]
  private readonly directories: string[] = []
  private rootIndex = 0
  private directoryIndex = 0
  private readonly seen = new Set<string>()
  private readonly excluded: Set<string>
  private current: Dir | null = null
  private closed = false
  private pending = false
  private readonly progress: LocalAudioScanProgress = { discovered: 0, skipped: 0, failed: 0, scanned: 0, directory: '', errors: [] }

  constructor(roots: string[], excludedPaths: string[] = []) {
    this.roots = roots.map(file => path.resolve(file))
    this.excluded = new Set(excludedPaths.map(file => pathKey(path.resolve(file))))
  }

  private fail(filePath: string) {
    this.progress.failed++
    if (this.progress.errors.length < 5) this.progress.errors.push(filePath)
  }

  private async visit(filePath: string, files: string[]) {
    this.progress.scanned++
    try {
      const stats = await fs.lstat(filePath)
      if (stats.isSymbolicLink()) { this.progress.skipped++; return }
      if (!stats.isDirectory() && (!stats.isFile() || !extensions.has(path.extname(filePath).toLowerCase()))) {
        this.progress.skipped++
        return
      }
      const actualPath = await fs.realpath(filePath)
      const key = pathKey(actualPath)
      if (this.seen.has(key)) { this.progress.skipped++; return }
      this.seen.add(key)
      if (stats.isDirectory()) {
        this.directories.push(actualPath)
        return
      }
      if (this.excluded.has(key) || this.excluded.has(pathKey(path.resolve(filePath)))) { this.progress.skipped++; return }
      await fs.access(actualPath, fs.constants.R_OK)
      this.progress.discovered++
      files.push(actualPath)
    } catch { this.fail(filePath) }
  }

  async next(): Promise<LocalAudioScanBatch> {
    if (this.pending) throw new Error('本地音乐扫描正在进行，请等待当前批次完成。')
    this.pending = true
    const files: string[] = []
    try {
      // This is a per-message work budget, never a limit on the total import.
      for (let steps = 0; steps < 512 && files.length < 100 && !this.closed; steps++) {
        const root = this.roots[this.rootIndex++]
        if (root) { await this.visit(root, files); continue }
        if (!this.current) {
          const directory = this.directories[this.directoryIndex++]
          if (!directory) { this.closed = true; break }
          this.progress.directory = directory
          try { this.current = await fs.opendir(directory) } catch { this.fail(directory) }
          continue
        }
        try {
          const entry = await this.current.read()
          if (entry) await this.visit(path.join(this.current.path, entry.name), files)
          else { await this.current.close(); this.current = null }
        } catch {
          this.fail(this.progress.directory)
          await this.closeCurrent()
        }
      }
      return { ...this.progress, errors: [...this.progress.errors], files, done: this.closed }
    } finally { this.pending = false }
  }

  private async closeCurrent() {
    const current = this.current
    this.current = null
    if (current) await current.close().catch(() => {})
  }

  async close() {
    this.closed = true
    this.roots.length = 0
    this.directories.length = 0
    await this.closeCurrent()
  }
}

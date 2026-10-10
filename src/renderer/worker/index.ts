import { createMainWorker, createDownloadWorker } from './utils'

/**
 * Downloads are an optional feature. Creating the worker eagerly starts a
 * second Chromium worker context for every session, even when the user never
 * downloads a song. Keep the same remote API while deferring that cost until
 * the first download operation is invoked.
 */
const createLazyDownloadWorker = () => {
  let worker: ReturnType<typeof createDownloadWorker> | null = null
  const getWorker = () => worker ??= createDownloadWorker()

  return new Proxy({}, {
    get(_target, property: string | symbol) {
      // Promise resolution checks for a `then` property. Returning undefined
      // keeps this proxy a plain API object instead of making it thenable.
      if (property === 'then') return undefined
      return (...args: unknown[]) => {
        const method = Reflect.get(getWorker(), property) as (...params: unknown[]) => unknown
        return method(...args)
      }
    },
  }) as ReturnType<typeof createDownloadWorker>
}

export default () => {
  return {
    main: createMainWorker(),
    download: createLazyDownloadWorker(),
  }
}


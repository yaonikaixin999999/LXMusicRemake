import { catalogSources, searchCatalog, getCatalogTracks } from '@renderer/utils/musicSdk/catalogSearch'
import { toNewMusicInfo } from '@renderer/utils'

export type CatalogKind = 'album' | 'artist'
export interface CatalogEntry {
  source: LX.OnlineSource
  kind: CatalogKind
  id: string
  name: string
  img: string
  author: string
  count?: number
  date?: string
  mid?: string
  numericId?: number
}
export interface CatalogResponse<T> { list: T[], total: number, limit: number, allPage: number }
export const getCatalogSources = (kind: CatalogKind): LX.OnlineSource[] => catalogSources[kind] as LX.OnlineSource[]
export const searchMusicCatalog = async(source: LX.OnlineSource, kind: CatalogKind, text: string, page: number, limit: number): Promise<CatalogResponse<CatalogEntry>> => await searchCatalog(source, kind, text, page, limit)
export const readCatalogTracks = async(item: CatalogEntry, page: number, limit: number): Promise<CatalogResponse<LX.Music.MusicInfo>> => {
  const response = await getCatalogTracks(item, page, limit)
  return { ...response, list: response.list.map((track: any) => toNewMusicInfo(track)) }
}


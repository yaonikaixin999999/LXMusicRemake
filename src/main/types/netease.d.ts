declare module 'NeteaseCloudMusicApi/util/crypto' {
  const encryption: { weapi: (data: object) => Record<string, string> }
  export default encryption
}

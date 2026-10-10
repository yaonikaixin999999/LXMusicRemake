<p align="center">
  <img src="resources/icons/linkline.svg" width="100" alt="LinkLine Logo">
</p>

# LinkLine

把不同平台的音乐，连接到同一个音乐空间。

LinkLine 是基于 LXMusic 开源项目再开发的桌面音乐应用。全新的界面采用圆角浮动面板、侧栏导航和长进度条播放器，支持浅色、深色与跟随系统主题。连接平台账号后，可以汇总红心歌曲与平台创建的歌单，也可以管理和播放本地音乐。

[项目源码](https://github.com/yaonikaixin999999/LXMusicRemake) · [下载与版本记录](https://github.com/yaonikaixin999999/LXMusicRemake/releases) · [完整功能与使用说明](docs/项目说明.md) · [反馈问题](https://github.com/yaonikaixin999999/LXMusicRemake/issues)

当前推荐下载 1.0.1 修正版。版本说明：[1.0.1](docs/releases/v1.0.1.md) · [1.0.0 首版](docs/releases/v1.0.0.md)。

## 下载与安装

**1.0.1 发行版：Windows 10 / 11，64 位（x64）。**

| 下载入口 | 链接 |
| --- | --- |
| GitHub 官方安装包 | [LinkLine-v1.0.1-x64-Setup.exe](https://github.com/yaonikaixin999999/LXMusicRemake/releases/download/v1.0.1/LinkLine-v1.0.1-x64-Setup.exe) |
| 国内加速下载 | [通过 gh-proxy.com 下载](https://gh-proxy.com/https://github.com/yaonikaixin999999/LXMusicRemake/releases/download/v1.0.1/LinkLine-v1.0.1-x64-Setup.exe) |
| 国内备用入口 | [通过 ghfast.top 下载](https://ghfast.top/https://github.com/yaonikaixin999999/LXMusicRemake/releases/download/v1.0.1/LinkLine-v1.0.1-x64-Setup.exe) |
| 文件校验 | [SHA256SUMS.txt](https://github.com/yaonikaixin999999/LXMusicRemake/releases/download/v1.0.1/SHA256SUMS.txt) |
| 所有正式版本 | [GitHub Releases](https://github.com/yaonikaixin999999/LXMusicRemake/releases) |

下载后运行安装程序，按提示安装并启动 LinkLine。国内加速入口由第三方提供，用于转发本仓库的官方文件；可用性取决于服务和网络，不能保证所有地区都能访问。无法连接时可切换备用入口或 GitHub 官方源。

## 开始使用

1. 首次启动阅读使用协议，随后按引导进入「设置与偏好 → 平台账号与红心」。
2. 打开需要连接的平台，在平台的官方网页完成登录。扫码、密码或短信登录方式以平台当时展示的选项为准。
3. 点击「同步音乐库」或「同步全部」，在「我喜欢的音乐」查看合并红心，在音乐库查看平台创建的歌单。
4. 从搜索、精选歌单、排行榜或音乐库中选择歌曲播放。在线播放仍由歌曲版权、平台权限、账号状态与网络决定。

不登录也可以使用音乐库的「导入本地音乐」。需要自定义音乐接口时，在「音源管理」导入自己准备的兼容音源脚本；项目不内置此类脚本。

## 功能概览

| 功能 | 内容 |
| --- | --- |
| 发现与搜索 | 歌曲和歌单搜索、全部平台或指定平台、搜索历史、精选分类、榜单、歌单链接 / ID |
| 平台音乐库 | 多平台账号、红心聚合、保守去重、平台创建歌单同步、每个平台的独立结果与错误提示 |
| 红心联动 | 主动收藏或取消收藏时，在已连接且支持写入的平台查找同版本歌曲，检查权限并逐个平台操作 |
| 播放 | 单曲 / 整个列表、播放队列、循环 / 随机 / 顺序、长进度条、音量浮层、播放进度恢复、定时停止 |
| 音质与换源 | 最高可用音质、标准至无损 / Hi-Res、平台特殊音质；原平台无法播放时尝试其他平台的同版本歌曲 |
| 本地音乐库 | 音频导入、自建歌单、搜索与排序、批量操作、资料编辑、歌单文件导入导出 |
| 下载中心 | 音质选择、任务进度、暂停 / 继续 / 重试、下载目录、完成文件播放、歌词与封面选项 |
| 歌词与详情 | 滚动歌词、翻译 / 罗马音、歌词偏移、复制歌词、平台评论、独立桌面歌词窗口 |
| 外观 | 浅 / 深 / 系统主题、点缀色、圆角、面板间距、列表密度、发现页内容开关 |
| 声音与设备 | 输出设备、播放速率、均衡器及预设、环境音效、环绕与音高选项 |
| 数据与服务 | 备份恢复、缓存清理、屏蔽规则、设备同步、本地开放 API、应用内 / 全局快捷键 |
| 更新中心 | 每次启动后台检查、顶部与设置入口、版本状态、更新日志、历史版本、国内加速与官方源 |

音质菜单会根据当前歌曲和平台展示可用选项。「最高可用音质」表示在当前账号和歌曲权限内选择最高档，并不代表自动获得会员或版权权限。设置与播放栏使用同一份音质偏好。

## 平台支持

| 平台 | 官方网页登录 | 红心 / 收藏同步 | 创建歌单 / 收藏夹同步 | 跨平台红心操作 |
| --- | --- | --- | --- | --- |
| QQ 音乐 | 支持 | 支持 | 支持 | 支持 |
| 网易云音乐 | 支持 | 支持 | 支持 | 支持 |
| 咪咕音乐 | 支持 | 支持 | 支持 | 支持 |
| 哔哩哔哩 | 支持 | 默认收藏夹聚合 | 自建收藏夹 | 收藏操作 |
| 酷狗音乐 | 支持，可验证网页登录 | 暂不支持 | 暂不支持 | 暂不支持 |
| 酷我音乐 | 官方网页入口，暂不能验证账号连接 | 暂不支持 | 暂不支持 | 暂不支持 |

已接入这些平台的播放能力，但平台接口可能变更；登录成功或同步出歌曲不等于获得这首歌的播放、下载权限。酷狗和酷我当前主要提供官方登录入口与公开播放能力，不支持把客户端的云收藏当作已同步。哔哩哔哩的内容按视频 / 音轨和收藏夹处理，与音乐平台的红心体系不同。

## 更新

每次启动会静默检查本项目的正式版本。点击顶部云下载图标，或打开「设置与偏好 → 检查更新」，可查看当前版本、最新版本、更新时间、发布说明和历史版本，并选择下载入口。

国内检查源读取本仓库的 [`updates/stable.json`](updates/stable.json)，通过 gh-proxy.com 加速；失败后尝试 ghfast.top，再回退 GitHub 官方。国内下载使用同样的第三方加速入口。可切换到官方源，网络异常时可重试。

发布清单提供安装包校验信息时，可在更新中心展开「查看 SHA-256 校验值」，与下载文件的 SHA-256 比较，确认文件完整。

1.0.1 的更新方式为下载完整安装包后手动运行安装，不在后台自动覆盖软件。升级前可在「备份与数据」导出资料；安装新版前先从托盘退出正在运行的旧版。

## 数据与备份

正常安装启动的数据目录为 `%APPDATA%\LinkLine`，音乐资料位于其中的 `LxDatas`。登录会话、个人音乐库与设置保存在本机。正式安装启动与源码测试脚本默认使用不同的数据目录：`启动测试版.cmd` 沿用项目内的 `artifacts/user-test-data`。

「设置与偏好 → 备份与数据」支持完整备份、音乐库或偏好设置的分别导入导出，以及歌单文本 / CSV 导出。支持兼容的 `.lxmc` 资料文件；备份不等于复制原始音频文件或平台登录会话。详见[完整说明](docs/项目说明.md#数据存储备份与迁移)。

## 开发与构建

需要 Node.js 22 或更新版本，以及 npm 8.5.2 或更新版本。安装依赖时会下载 Electron 并准备原生模块。

```sh
npm install
npm run dev
```

生产构建与桌面启动：

```sh
npm run build
npm start
```

自动测试与代码检查：

```sh
node --test tests/*.test.cjs
npm run lint
```

Windows x64 安装包：

```sh
npm run build
npm run pack:win:setup:x64
```

打包结果保存在 `build/`，文件名为 `LinkLine-v<版本>-x64-Setup.exe`。准备发布元数据：

```sh
npm run release:prepare
```

该命令读取实际安装包和 `docs/releases/v<版本>.md`，生成 `updates/stable.json` 及 `build/SHA256SUMS.txt`；不会上传、发布或运行安装程序。

主要目录：`src/renderer/ui/` 为主界面，`src/renderer-lyric/ui/` 为桌面歌词，`src/main/` 为 Electron 与平台服务，`src/common/` 为共享类型和配置，`tests/` 为回归测试，`build-config/` 为构建与打包配置。

## 维护正式版本

1. 将 `package.json` 与依赖锁文件的版本更新为更高的正式版本，并编写对应的 `docs/releases/v<版本>.md`。
2. 完成测试和生产构建，生成 Windows x64 安装包，再运行 `npm run release:prepare`。
3. 检查生成的安装包名称、下载地址、体积和 SHA-256；更新清单会保留最多 20 条不同版本的历史记录。
4. 提交源代码和发行说明到本仓库，创建并推送对应 `v<版本>` 标签；新更新清单暂不推送。
5. 在自己的 GitHub 仓库创建同标签的正式 Release，填写发布说明，上传安装包和 `SHA256SUMS.txt`，再发布。
6. 正式发布后再提交并推送 `updates/stable.json`，验证官方与加速下载文件，以及应用内国内 / 官方更新源的检查结果。

客户端只从本仓库识别正式更新；不要将草稿、预发布或未经构建的文件写入正式更新清单。

## 许可与归属

LinkLine 基于 [LXMusic 开源项目](https://github.com/lyswhut/lx-music-desktop)再开发，保留原作者 lyswhut / 落雪无痕的版权声明，遵循 [Apache License 2.0](LICENSE)，第三方组件保留[各自许可](licenses/)。音乐及平台内容的权利归各自权利人所有。

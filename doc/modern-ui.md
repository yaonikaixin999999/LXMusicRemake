# LinkLine 使用与交付说明

LinkLine 1.0.0 是基于 LX Music Desktop 音乐服务重新构建的桌面客户端。主窗口、播放详情、设置、弹窗与桌面歌词采用新界面，使用现代侧栏、圆角表面、浮动面板和浮动播放器。当前交付源码与生产资源，并运行真实 Electron 应用测试；按要求尚未生成安装包。

## 启动测试版与独立数据

双击根目录的 [启动测试版.cmd](../启动测试版.cmd)，或在项目根目录执行 `npm start`。这会通过当前依赖中的 Electron 启动 `dist/` 生产资源；不需要安装向导。启动脚本在缺少生产入口时先运行 `npm run build`。

应用名称为 LinkLine，默认数据目录为 `%APPDATA%\LinkLine`，音乐库等持久化资料位于该目录的 `LxDatas` 子目录。首次启动时，如果新目录不存在而 `%APPDATA%\LX Studio` 存在，会在旧实例退出后复制整个资料目录，再原子发布到新目录；旧目录保留，歌单、设置、音源与浏览器存储随同迁移。旧实例正在运行或复制失败时继续兼容旧路径，避免使用不完整的新资料；已有 LinkLine 目录不会被覆盖或合并。

`LINKLINE_DATA_DIR` 可指定独立资料目录，优先于兼容的 `LX_STUDIO_DATA_DIR`；显式指定目录时不进行自动迁移。未设置环境变量时，程序目录中的 `portable` 文件夹仍支持便携数据机制。后续打包配置使用 `com.linkline.desktop`、独立快捷方式与 `linkline://` 协议，同时继续识别 `lxstudio://` 和 `lxmusic://` 链接。应用名称和默认资料目录与上游 LX Music 分开。

本应用使用独立的 1.0.0 版本及打包配置，不使用上游自动更新服务。目前通过源码与本地构建启动，尚未执行安装包生成或安装验证。

右上角窗口按钮切换「最大化 / 还原」，保留 Windows 任务栏；F11 切换真正全屏，Esc 退出。窗口允许拖动四边和四角调整大小，最小尺寸为 720 × 480。Windows 使用系统支持缩放的非透明无边框窗口，界面内的浮动面板和圆角继续保留。

播放栏参考 QQ 音乐的布局加宽中间进度区。点击右侧音量图标打开竖向浮动面板，可拖动音量滑块、查看百分比或切换静音；点击面板外或按 Esc 关闭。主播放栏与播放详情使用同一个音量控制，浅深主题和自定义点缀色自动同步。

## 第一次播放

### 使用本地音乐

1. 打开「音乐库」，选择试听列表、收藏或自己创建的歌单。
2. 点击「导入本地音乐」或「导入音乐」，选择已有音频文件。文件选择器允许 MP3、FLAC、OGG、OGA、WAV、M4A 和 APE；实际解码能力取决于 Electron 播放器。
3. 点击歌曲的播放按钮，或点击「播放全部」。原文件路径用于播放，移动或删除原文件后需重新导入。

音乐库支持新建和重命名歌单、收藏、歌单内搜索、排序、批量操作、歌曲资料编辑与导出。移除歌单中的本地歌曲时保留原音频文件。

### 使用在线音源

1. 在「设置 → 音源管理」点击「导入脚本」，选择你自行准备的 LX 音源 `.js` 文件；也可以通过音源脚本的 HTTP / HTTPS 链接导入。
2. 在导入的音源卡片上点击「使用」，等待其初始化。
3. 在「搜索」查找歌曲，使用播放、加入歌单或下载操作。

项目不附带供用户使用的自定义音源。在线播放与下载由用户选择的音源提供地址，所支持的音质和可用性取决于音源及网络状态。音乐平台的搜索、歌单和排行榜查询继续使用 LX Music 的服务实现。

## 调整外观

点击侧栏或顶栏的外观入口，或在「设置 → 常规与外观」点击「外观定制」，即可调整：

- 浅色、深色或跟随系统主题。
- 预设点缀色或自定义颜色。
- 面板圆角，范围 8–28 px。
- 舒适或紧凑内容间距。
- 发现页的氛围与灵感内容开关。

外观修改立即生效并自动保存。「恢复默认」重置这组外观偏好。主窗口外观配置保存在应用的 `localStorage`，键为 `lx-modern-appearance-v1`；偏好设置备份和完整备份也包含这组配置。

桌面歌词在「设置 → 歌词」中开启，使用独立的圆角歌词界面，可调整文字、颜色、大小、翻译、罗马音、锁定与窗口行为。

## 设置、备份与服务

新的设置页按常规、音源、播放、声音、歌词、搜索、音乐库、下载、网络、设备同步、开放接口、快捷键、数据和关于分类。可搜索设置名称与说明，输入和开关直接保存。

「设置 → 平台账号与红心」提供 QQ 音乐和网易云音乐的官方登录窗口。登录过程使用各平台自己的网页，账号密码、短信验证和扫码内容不会进入 LinkLine 的渲染页面；登录 cookie 只保存在独立的 Electron 会话分区。登录后可同步各平台红心歌曲，LinkLine 会按歌名、歌手、时长和专辑做保守的同版本匹配并去重汇总。点击任意歌曲的红心会逐个平台查询匹配和版权，再分别执行红心操作；结果会明确显示成功、无版权、未匹配、版本有歧义或请求失败。未登录或登录过期的平台不会被伪报成功。平台只读同步不会改写远端，只有用户主动点红心或取消红心时才调用写接口。

「设置 → 备份与数据」支持完整备份、音乐库和偏好设置的导入导出，兼容 LX `.lxmc` 备份。导入歌单时，同 ID 的歌单内容被覆盖，其他歌单继续保留。导入的设置只恢复当前支持的偏好，不修改协议接受状态、版本、上游更新服务或旧界面主题。批量清理和覆盖操作提供确认弹窗。

全局快捷键使用操作系统的注册结果，系统已占用的组合键会显示状态。设备同步和开放接口连接真实原生服务，状态区域显示实际地址和连接信息。

## 源码与构建

- `src/renderer/ui/`：新主窗口、路由页面、播放器、播放详情、外观面板、共享弹窗与设置实现。
- `src/renderer-lyric/ui/`：新桌面歌词舞台、控制栏、可视化与拖动交互。
- `src/renderer/composables/useAppearance.ts`：主题、颜色、圆角、间距及外观持久化。
- `src/renderer/core/`、`store/` 和 `src/main/`：延用并适配的播放器、数据库、音源、下载、同步和 Electron 服务。
- `build-config/build-pack.js`：独立应用标识、名称、协议和安装包配置。

使用 Node.js 22 或更新版本，执行 `npm install` 安装包括 Electron 和原生模块在内的依赖。开发模式运行 `npm run dev`；生产资源的测试启动入口为根目录的「启动测试版.cmd」或 `npm start`。「启动测试版.cmd」默认继续使用 `artifacts/user-test-data`，也尊重显式设置的 `LINKLINE_DATA_DIR` / `LX_STUDIO_DATA_DIR`；`npm start` 使用普通应用资料目录。

```sh
npm run build
npm start
```

生产构建只生成 `dist/` 中的运行资源，不生成安装包。后续确需 Windows x64 安装程序时，单独运行 `npm run pack:win:setup:x64`；本次不执行该步骤。当前交付和验证以真实 Electron 测试运行结果为准。

## 验证记录

2026-10-09，LinkLine 品牌与资料兼容：`node --test tests/userDataDirectory.test.cjs` 的 10 项检查通过，覆盖完整资料复制（含 SQLite/WAL/SHM、设置和外观存储）、旧目录保留、已有新目录不覆盖、活动或未知旧锁跳过复制、环境变量优先级、便携目录、复制失败回退、临时目录清理失败不中断启动及新旧协议识别。本次未运行个人目录迁移或安装包生成。

2026-10-09：设置页及设置模块的定向 ESLint 检查通过；128 个偏好项标签、备份设置过滤、数值和空值处理，以及快捷键 IPC 序列化与绑定替换通过行为检查。

真实 Electron 外观与桌面歌词检查通过，记录见 [native-appearance-verification.json](../artifacts/native-appearance-verification.json)：音乐库布局、真实歌词行与字号设置同步、主窗口与桌面歌词外观同步、竖排歌词与工具栏边界、歌词方向及置顶设置。

主窗口原生回归通过，记录见 [native-verification.json](../artifacts/native-verification.json)：播放按钮居中偏差为 0 px、浅深主题切换、连续创建歌单与重名检查、重命名及删除、本地音频导入与真实播放暂停、全部主导航页面、重启后的歌曲和主题持久化。全源码 ESLint 和生产资源构建通过，回归中未出现 renderer 异常。

在线与离线联动通过，记录见 [native-online-verification.json](../artifacts/native-online-verification.json)：使用隔离数据目录和本地 HTTP 测试音源，验证真实音源导入与初始化、SQLite 歌单导入、在线 MP3 解码播放、实际下载与音频帧哈希一致，以及关闭 HTTP 服务后的下载文件离线播放。测试数据与个人数据分开保存。

全局快捷键原生回归通过，记录见 [native-hotkeys-verification.json](../artifacts/native-hotkeys-verification.json)：设置页录入后新键立即注册、替换后旧键注销、禁用时编辑不注册，以及启用/禁用状态和组合键的写盘与重启持久化。主进程在保存时立即更新内存配置，磁盘写入继续节流。

本次没有生成或验证安装包。测试音源只用于验证调用链，用户音源的实际可用性需使用自己的音源和网络验证。

2026-10-09，界面问题修复回归：主窗口 6 项原生检查通过，记录见 [native-window-verification.json](../artifacts/native-window-verification.json)。验证了最大化保留任务栏、精确还原原尺寸、F11 进出全屏及状态同步、Esc 返回原窗口、最小化恢复和缩放能力启用。自动鼠标拖拽受到桌面输入或目标窗口焦点变化干扰，四边和四角的完整拖拽检查未完成，报告单独标注这项限制。

播放栏 13 项原生检查通过，记录见 [native-player-verification.json](../artifacts/native-player-verification.json)。三种进度条样式在 720、900、1114 和 1500 宽度下均保持播放按钮与进度条居中、顶栏水平对齐且组件不重叠；本地音频导入、真实播放暂停、跳转至 10 秒及音量 0.37 的后端同步通过。

自绘下拉菜单 10 项检查通过，记录见 [native-menu-verification.json](../artifacts/native-menu-verification.json)。覆盖浅深主题、选择值写入原生设置、方向键与 Enter、Esc、Tab、外部点击关闭、底栏菜单向上展开、窄窗口边界和平台分类分组。所有操作图标使用 SVG 绘制。

封面 8 项检查通过，记录见 [native-artwork-verification.json](../artifacts/native-artwork-verification.json)。使用隔离目录与 HTTP 测试代理验证真实 Kuwo SDK 请求、空封面地址的读取、图片失败后的单次刷新、服务失败占位、懒加载及最多 4 个并发请求。列表、播放栏和播放详情复用同一张已解码图片；封面保存后后台刷新歌曲资料，保留歌单滚动位置。上述界面回归均无 renderer 运行时异常。全源码 ESLint、后续修改的定向 ESLint、主进程 TypeScript 及主窗口/歌词生产资源构建通过。

窄高度检查通过，记录见 [native-sidebar-height-verification.json](../artifacts/native-sidebar-height-verification.json)：827 × 541 下导航独立滚动，主题按钮可见，切换主题前后顶栏、品牌和根页面滚动位置稳定。

QQ 音乐参考播放栏调整回归通过：中间区域由 26% 扩展到 42%，简洁进度组的最大宽度由 184 px 增至 300 px；1114 宽窗口下居中进度轨道约为 274 px。更新后的 13 项播放栏回归继续通过，新增音量浮层 10 项检查通过，记录见 [native-volume-verification.json](../artifacts/native-volume-verification.json)。覆盖浅深主题和 4 种窗口尺寸、竖向滑块的键盘调节、37% 音量及静音状态的主进程保存、点击/Esc/外部关闭的焦点恢复及播放详情使用；无 renderer 异常。定向 ESLint 和主窗口生产构建通过，仍未生成安装包。

2026-10-09，平台账户与红心联动检查通过：平台匹配、网易云分页/版权判断/红心写入、账号会话恢复、过期登录、账号切换隔离、退出登录竞态、导航重定向域名边界、多平台逐项结果和异常缓存由 `node --test tests/*.test.cjs` 验证（31 项通过）。QQ 音乐接口 fixture 及真实只读搜索/歌曲详情通过，见 `artifacts/qq-provider-qa.log`；网易云真实只读搜索、歌曲详情和匿名账号响应通过，见 `artifacts/native-platform-smoke.json`。平台设置页与收藏服务 7 项行为检查通过，见 `artifacts/platform-renderer-service-verification.json`；真实 Electron 平台账号页面、LinkLine C 声波音符 Logo 和空账号状态通过，见 `artifacts/native-platform-ui.json`。登录和红心写入需要用户在测试版中自行完成官方网页登录后验证，本次未使用个人账号，也未生成安装包。

2026-10-10，登录与收藏故障修复：聚合快照使用浅层响应状态，收藏输入在 Electron IPC 前拆除嵌套 Vue Proxy。`tests/platformRenderer.test.cjs` 使用真实 Vue 和结构化克隆复现旧故障并验证修复。QQ 登录入口改为官方 OAuth 网页及网页回调，从 `y.qq.com` 读取音乐登录状态；认证成功即关闭登录窗口并返回主窗口，后台继续同步红心，认证和同步失败原因在账号页显示。QQ 请求有 20 秒超时，接口自动测试不发送真实网络写请求。

本轮 `node --test tests/*.test.cjs` 共 56 项通过。实际生产 Electron 收藏回归见 [native-favorites-regression.json](../artifacts/native-favorites-regression.json)：809 条模拟平台记录聚合成 805 首，通过真实 renderer IPC 写入 SQLite；红心入口、80 首分页、搜索、歌曲表格收藏和重启保留通过。模拟数据用于验证应用链路，并不代表已验证个人账号的远端同步。

设置默认首项为「平台账号与红心」。首次协议改为 LinkLine 内容，仅留一句「基于 LX Music 构建」，关于页仍保留上游许可。接受后提供一次性官方平台登录引导。实际首用及重启验证共 8 项通过，见 [native-first-use-verification.json](../artifacts/native-first-use-verification.json)。

桌面歌词修复了暂停时控制栏难见、偏好面板裁切、Windows 拖动缩放、锁定后解锁、播放状态和歌词重解析定位。实际生产 Electron 与本地 WAV/LRC 联动回归 9 项通过，见 [lyric-production-verification.json](../artifacts/lyric-production-verification.json)；暂停在 7 秒打开和重解析歌词、最小尺寸的左上边缘约束及竖排定位另有 4 项回归通过，见 [lyric-regression-verification.json](../artifacts/lyric-regression-verification.json)。ESLint、主窗口/主进程/歌词 TypeScript 和生产资源编译通过。本次仍未生成安装包；个人账号需重新在测试版中完成登录后验证红心同步。

## 上游版权与许可

LinkLine 的播放器、音源服务、数据库和同步基础来源于 [LX Music Desktop](https://github.com/lyswhut/lx-music-desktop)，作者 lyswhut / 落雪无痕。保留上游版权、仓库根目录的 `LICENSE` 和 `licenses/` 中的第三方许可，遵循 Apache License 2.0。应用「关于」页提供项目归属和许可入口，后续打包配置保留许可文件分发规则。

# Canbox Launcher

基于 Canbox 平台的快速启动器 APP。透明无边框窗口、键入即搜、键盘导航、一键唤起。

---

## 功能亮点

- **即时搜索**：子序列模糊匹配 + 中文拼音匹配，搜索在渲染进程本地执行，零延迟
- **一键启动**：选中应用后 Enter 启动，点击遮罩层或 Esc 隐藏窗口
- **全局快捷键**：通过 Canbox 平台 `shortcut` API 注册系统级快捷键，一键唤起 Launcher
- **设置面板**：齿轮图标入口，自定义快捷键、窗口宽度、字体大小、圆角

## 使用方法

### 唤起 Launcher

1. 在 Canbox 应用列表中点击 Launcher 图标
2. 或通过已注册的全局快捷键唤起（在设置面板中自定义）

### 搜索与启动

| 操作 | 说明 |
|------|------|
| 键入关键词 | 实时过滤应用列表（支持中文拼音搜索） |
| ↑ ↓ | 键盘导航选中应用 |
| Enter | 启动选中的应用 |
| Esc | 隐藏 Launcher 窗口 |
| 点击遮罩层 | 隐藏 Launcher 窗口 |

### 设置面板

点击搜索框右侧齿轮图标 ⚙ 打开设置面板：

- **唤起快捷键**：点击输入框后按下组合键即可捕获（需包含 Ctrl/Alt/Shift/Super 中至少一个修饰键），✕ 可清除
- **窗口宽度**：滑块调节 400~800px
- **字体大小**：滑块调节 12~24px
- **圆角大小**：滑块调节 4~24px

所有设置实时预览，松开后自动持久化。再次点击 ⚙ 或按 Esc 返回搜索视图。

---

# 技术文档

## 项目结构

```
canbox-launcher/
├── app.json                  # APP 元信息（id、窗口配置、preload 声明）
├── preload.js               # preload（Node 侧能力 → 渲染进程桥接）
├── index.html               # 入口 HTML
├── package.json             # Vue 3 + Pinia + Vite 7
├── vite.config.js           # Vite 配置（别名 @=src, @modules=modules）
├── src/
│   ├── main.js              # Vue + Pinia 初始化入口
│   ├── App.vue              # 根组件（透明背景、只渲染 <Launcher>）
│   ├── components/
│   │   ├── Launcher.vue     # 搜索框主界面（输入、列表、键盘导航）
│   │   └── SettingsPanel.vue # 设置面板（快捷键、外观、关于）
│   └── stores/
│       └── launcher.js      # Pinia Store（状态管理、搜索、缓存、配置）
├── modules/
│   ├── appSearchEngine.js   # 搜索算法（纯函数，浏览器环境可独立运行）
│   └── systemAppReader.js   # 系统应用读取（Node 模块，解析 .desktop 文件）
├── logo.svg                 # SVG 矢量图标
├── logo.png / logo_*.png    # 多尺寸 PNG 图标
└── uat.dev.json             # 开发模式下的 app.json（Canbox 加载用）
```

## 架构总览

### 双 Preload 架构

Launcher 运行时有**两层 preload**，并行工作、无冲突：

| 层级 | Preload | 注入方式 | 暴露对象 |
|------|---------|----------|----------|
| **Canbox 通用** | `modules/app/app.preload.js` | `sess.registerPreloadScript()`（Session 级） | `window.canbox`（store、shortcut、windowControl、openUrl 等） |
| **Launcher 专用** | `preload.js` | `app.json` → `window.webPreferences.preload`（BrowserWindow 级） | `window.__launcherApi`（getApps、launchApp、readIcon、hide 等） |

**加载机制**（由 Canbox 的 `childprocessEntry.js` 负责）：

1. **Session 级**：`sess.registerPreloadScript()` 始终加载 `modules/app/app.preload.js`，为所有 APP 提供 `window.canbox`（db、store、shortcut 等通用 API）
2. **BrowserWindow 级**：如果 `app.json` 有 `window.webPreferences.preload`，设为 BrowserWindow preload，用于加载 APP 自身的定制 preload（如 `__launcherApi`）

两层 preload 在不同层级并行工作，通过 `contextBridge` 向隔离世界暴露不同 API，无冲突。

**关键认知**：
- `preload.js` 直接使用全局 `canbox` 对象（`canbox.store.get/set`、`canbox.shortcut.register/unregister`、`canbox.windowControl.hide`、`canbox.openUrl`）
- `preload.js` 不直接使用 `ipcRenderer`，所有跨进程通信均通过 `canbox.*` API 中转
- `preload.js` 通过 `contextBridge.exposeInMainWorld('__launcherApi', ...)` 将能力桥接到渲染进程

### 数据流

```
┌─ 渲染进程（Vue）──────────────────────┐
│                                          │
│  Launcher.vue / SettingsPanel.vue        │
│      ↓ window.__launcherApi.xxx          │
└──────────────┬───────────────────────────┘
               │ contextBridge（隔离世界）
┌──────────────▼───────────────────────────┐
│  preload.js（Node 侧）                    │
│      ↓ canbox.store / canbox.shortcut    │
│      ↓ require('./modules/...')          │
├──────────────────────────────────────────┤
│  modules/appSearchEngine.js  (纯函数)     │
│  modules/systemAppReader.js  (Node 模块)  │
└──────────────┬───────────────────────────┘
               │
┌──────────────▼───────────────────────────┐
│  Canbox 主进程                            │
│  ├─ canbox.store   → electronStore       │
│  ├─ canbox.shortcut → GlobalShortcutManager│
│  └─ canbox.windowControl → win.hide()     │
└──────────────────────────────────────────┘
```

## 核心模块详解

### preload.js — Launcher 专用 Preload

通过 `contextBridge.exposeInMainWorld('__launcherApi', { ... })` 暴露以下 API：

| API | 签名 | 说明 |
|-----|------|------|
| `getApps()` | `→ Promise<{apps, defaultApps}>` | 扫描系统应用，排序，保存双缓存 |
| `getCachedApps()` | `→ Promise<Object\|null>` | 读取 appCache（全部应用，无图标） |
| `getDefaultAppsCache()` | `→ Promise<Object\|null>` | 读取 defaultAppsCache（top5，含 iconBase64） |
| `launchApp(app)` | `→ Promise<{success}>` | 执行 Exec 命令启动系统应用 |
| `readIcon(appOrPath)` | `→ Promise<string\|null>` | 读取图标为 base64 data URI |
| `hide()` | `→ void` | 通过 canbox.windowControl.hide() 隐藏窗口 |
| `store.get/set` | `(name, key) / (name, key, value)` | 封装 canbox.store API |
| `registerShortcut(accel)` | `→ Promise<{success}>` | 注册全局快捷键（focus 模式） |
| `unregisterShortcut(accel)` | `→ Promise<{success}>` | 注销全局快捷键 |
| `isShortcutRegistered(accel)` | `→ Promise<boolean>` | 检查快捷键注册状态 |
| `getSavedShortcut()` | `→ Promise<string>` | 从 electronStore 读取已保存的快捷键 |
| `openUrl(url)` | `→ void` | 用默认浏览器打开 URL |
| `onShown(callback)` | `→ void` | 注册窗口显示回调（快捷键触发时调用） |

**启动行为**：`preload.js` 末尾 IIFE 自动从 `electronStore` 读取已保存快捷键并重新注册。

### 双缓存架构

| 缓存 | Key | 内容 | 用途 |
|------|-----|------|------|
| `appCache` | `launcher.appCache` | 全部应用元数据（不含图标） | 搜索匹配 |
| `defaultAppsCache` | `launcher.defaultAppsCache` | 按名称排序前5个应用（含 iconBase64） | 启动即时展示 |

#### appCache 数据结构

```json
{
    "version": 2,
    "lastScanTime": 1717800000000,
    "apps": [
        {
            "id": "firefox.desktop",
            "name": "Firefox",
            "exec": "/usr/bin/firefox",
            "icon": "firefox",
            "iconPath": "/usr/share/icons/hicolor/48x48/apps/firefox.png",
            "comment": "Browse the World Wide Web",
            "source": "system",
            "desktopPath": "/usr/share/applications/firefox.desktop"
        }
    ]
}
```

#### defaultAppsCache 数据结构

与 appCache 结构相同，额外在每个 app 对象中包含 `iconBase64` 字段（`data:image/png;base64,...`），使得热启动时图标可零 IPC 直接渲染。

#### 缓存策略

| 场景 | 行为 |
|------|------|
| 冷启动（首次） | 无缓存 → UI 仅显示"正在扫描系统应用..." → 后台扫描完成后呈现 |
| 热启动（缓存有效） | 读取 defaultAppsCache → 即时展示5个应用（含图标，零 IPC） |
| 后台刷新 | 每5分钟自动扫描，Pinia store 响应式更新 UI |
| 搜索 | 使用 `appCache` 全部应用列表进行本地匹配 |

#### 启动性能

| 场景 | 首次启动（无缓存） | 热启动（有缓存） |
|------|-------------------|-----------------|
| 缓存读取 | 0（无缓存可读） | 2 次 IPC，< 20ms |
| 图标加载 | 后台扫描时读取 | 0（base64 已在缓存中） |
| 可见延迟 | 显示扫描提示，扫描完成后呈现 | 即时呈现 |
| 后台扫描 | `setImmediate` 推迟，不阻塞 | `setImmediate` 推迟，不阻塞 |

### appSearchEngine.js — 搜索算法

纯 JavaScript 模块，无 Electron/Node 依赖。匹配策略（按优先级）：

| 策略 | 分数 | 示例 |
|------|------|------|
| 完全匹配 | 100 | `"Firefox"` → Firefox |
| 前缀匹配 | 80 | `"fire"` → Firefox |
| 包含匹配 | 60 | `"refo"` → Firefox |
| 拼音全拼 | 50 | `"huohu"` → 火狐 |
| 子序列匹配 | 45 | `"dbev"` → DBeaver |
| 拼音首字母 | 40 | `"ff"` → 火狐 |
| 拼音子序列 | 35 | `"huo"` → 火狐浏览器 |

**拼音匹配触发条件**：仅当应用名包含中文字符（`/[\u4e00-\u9fff]/`）时才尝试拼音匹配。`pinyin-pro` 通过动态 `import()` 延迟加载，避免阻塞初始化。

**子序列算法**：`isSubsequence(query, target)` 使用双指针，字符按顺序出现即可，不要求连续。例如 `"dbever"` 匹配 `"DBeaver"`。

导出：`searchApps(query, apps, limit)` / `searchAppsSync(query, apps, limit)` / `calcMatchScore` / `calcMatchScoreSync`

### systemAppReader.js — 系统应用读取

Node.js 模块，解析 Linux `.desktop` 文件。

**来源目录（按优先级，先扫描到的优先去重）**：

1. `~/.local/share/applications/`
2. `/usr/share/applications/`
3. `~/.local/share/flatpak/exports/share/applications/`
4. `/var/lib/flatpak/exports/share/applications/`

**解析字段**：

| 字段 | 说明 |
|------|------|
| `id` | desktop 文件名（不含扩展名），用作去重 key |
| `name` | `Name=` 字段 |
| `exec` | `Exec=` 字段（已清理 `%f`、`%u` 等占位符） |
| `icon` | `Icon=` 字段原始值 |
| `iconPath` | 图标解析后的完整路径（延迟填充，首次 `readIcon()` 时解析） |
| `comment` | `Comment=` 字段 |
| `source` | 固定为 `"system"` |
| `desktopPath` | desktop 文件完整路径 |
| `_sourceDir` | 来源目录（内部用，不存入缓存） |

**过滤规则**：跳过 `NoDisplay=true` 和 `Hidden=true` 的 desktop 条目。

**图标解析**：搜索 `~/.local/share/icons/`、`~/.icons/`、`/usr/share/icons/`、`/usr/share/pixmaps/`、Flatpak exports 等目录，递归深度限制 5 层。对 Flatpak 应用额外搜索安装目录（深度 10 层）。目录 `readdirSync` 有内存缓存（`_iconDirCache`），避免同一目录重复读取。

**v2 异步 I/O 改进**：
- 使用 `fs.promises` 异步读取所有 `.desktop` 文件和目录
- 批量处理：每次最多 50 个文件并发解析，避免同时打开过多文件句柄
- 图标路径延迟解析：`getSystemApplications()` 只解析元数据，不解析图标路径。`resolveAppIcon()` 在首次调用 `readIcon()` 时按需解析单个应用的图标路径，结果缓存在 `app.iconPath`上

**去重**：以 `id`（desktop 文件名）为 key，多目录出现同名 `.desktop` 时，保留先扫描到的（高优先级来源）。

### Pinia Store — 状态管理

`src/stores/launcher.js` 集中管理：

| State | 说明 |
|-------|------|
| `allApps` | 全部应用元数据（响应式） |
| `filteredApps` | 当前展示列表（默认 top5 / 搜索结果） |
| `iconCache` | `{ appId → base64 data URI }` 图标缓存 |
| `config` | `{ width, fontSize, borderRadius }` 外观配置 |
| `query` | 搜索关键词 |
| `selectedIndex` | 键盘导航选中索引 |
| `showSettings` | 设置面板开关 |

**Actions 生命周期**：

```
onMounted → Promise.all([ loadConfig(), loadCache() ])
    ↓
loadCache → 读取两份缓存 → 即时展示 / 空状态
    ↓
setImmediate → scanApps()（推迟，不阻塞 UI）
    ↓
startAutoRefresh() → setInterval(scanApps, 5min)
```

### Launcher.vue — 搜索框主界面

Vue 3 组合式 API + `<script setup>`。核心交互：

- 搜索框自动聚焦
- 键入实时搜索（`watch(query) → handleQuery → searchAppsSync`，同步执行无延迟）
- 键盘导航：↑ ↓ 选择，Enter 启动（启动后自动隐藏），Esc 隐藏（设置面板中 Esc 返回搜索视图）
- 图标懒加载：`watch(filteredApps) → loadAppIcon(app)`，仅加载当前可见结果的图标
- 图标加载失败回退到 `DEFAULT_APP_ICON`（via `@error` handler）
- 点击遮罩层（`.launcher-overlay`）隐藏
- 透明窗口背景（`app.json` `transparent: true`）

**窗口失焦自动隐藏**：

Linux 下 `frame:false` 透明窗口在 `show()`+`focus()` 后，被抢走焦点的应用可能立即抢回，导致 focus→blur 秒级序列。为避免冷启动时误隐藏，使用 **500ms grace period**：窗口 focus 后延迟 500ms 才启用 blur 自动隐藏。代码位置：`Launcher.vue` 第 156-174 行。

**窗口显示回调（onShown）**：

Launcher 通过 `onShown` 监听窗口显示事件（由 canbox 主进程通过 `processBridge` 发送）。收到回调时：
1. `store.reset()` 重置搜索状态（清空 query、selectedIndex → 0、showSettings = false）
2. `nextTick` 后重新聚焦搜索框

### SettingsPanel.vue — 设置面板

齿轮图标 ⚙ 切换显示。三个设置分组：

**快捷键捕获**：

```
用户点击快捷键输入框
    ↓
进入"捕获模式"（绑定 window keydown，display 显示"按下组合键..."）
    ↓
用户按下组合键（如 Ctrl+Shift+Space）
    ↓
构建 accelerator 字符串："Ctrl+Shift+Space"
    ↓
验证：必须包含 Ctrl/Alt/Shift/Super 之一
    ├── 无效 → 显示错误提示
    └── 有效 → saveShortcut(accelerator)
```

**saveShortcut 流程**：

1. 如果存在旧快捷键 → 调用 `unregisterShortcut(旧加速器)` 先注销
2. 调用 `store.set('launcher', 'shortcut', accelerator)` 持久化到 electronStore
3. 如果 accelerator 非空 → 调用 `registerShortcut(accelerator)` 注册全局快捷键
4. 注册失败时的错误提示：
   - `reason === 'occupied'` → "快捷键已被 XXX 占用"
   - `reason === 'system-occupied'` → "快捷键已被系统占用"
   - 其他 → 显示具体错误原因

清除快捷键时，传入 `oldAccelerator` 参数确保准确注销旧值，而非清空后的空值。

**外观滑块**：`<input type="range">`，`@input` 实时更新 `localConfig` + `store.config` 实现预览，`@change` 调用 `store.saveConfig()` 持久化。默认值：width=600、fontSize=16、borderRadius=12。

**关于**：版本（从 package.json 读取）、项目地址（github.com/lizl6/canbox-launcher）、Canbox 平台链接（github.com/lizl6/canbox），均通过 `openUrl` API 在外部浏览器打开。

## Canbox 平台依赖

| 依赖 | 状态 | 说明 |
|------|------|------|
| APP 基本运行环境 | ✅ 已有 | 加载 asar、创建窗口、app.json 配置 |
| `electronStore` API | ✅ 已有 | `window.canbox.store.get/set` → `{launcher}.json` |
| APP 专用 preload 加载 | ✅ 已有 | `app.json` `webPreferences.preload` → `childprocessEntry.js` 自动加载 |
| `globalShortcut` API | ✅ 已有 | `window.canbox.shortcut.register/unregister/isRegistered/onTriggered` |

### 数据存储位置

所有配置通过 `canbox.store.set('launcher', key, value)` 持久化到 `{UsersPath}/data/{appId}/launcher.json`：

| Key | 内容 |
|-----|------|
| `launcher.config` | `{ width, fontSize, borderRadius }` |
| `launcher.shortcut` | accelerator 字符串（如 `"Alt+Space"`） |
| `launcher.appCache` | `{ version, lastScanTime, apps }` |
| `launcher.defaultAppsCache` | `{ version, lastScanTime, apps (含 iconBase64) }` |

### electronStore API 使用示例

```javascript
// 读取配置（name 为存储名，key 为键）
const data = await window.canbox.store.get('launcher', 'config');

// 保存配置
await window.canbox.store.set('launcher', 'config', configValue);
```

### globalShortcut API 使用示例

```javascript
// 注册快捷键（focus 模式 → 聚焦/显示窗口）
await window.canbox.shortcut.register('Alt+Space', { mode: 'focus' });

// 事件模式 → 触发回调
window.canbox.shortcut.onTriggered((accelerator) => {
    console.log(`快捷键触发: ${accelerator}`);
});
await window.canbox.shortcut.register('Alt+Space', { mode: 'callback' });

// 注销
await window.canbox.shortcut.unregister('Alt+Space');

// 检查是否已注册
const registered = await window.canbox.shortcut.isRegistered('Alt+Space');
```

**Canbox 主进程行为**：

1. 收到快捷键触发 → 查映射表找到对应 APP
2. APP 未运行 → 启动 APP
3. APP 已隐藏 → show() + focus()
4. APP 已显示（toggle 模式）→ hide()

**注册时冲突处理**：
- Canbox 内部已占用 → 提示"快捷键已被 Canbox 内 XX APP 占用"
- 系统其他应用占用 → 提示"快捷键已被系统其他应用占用"

**持久化**：Canbox 将快捷键映射存储在 `canbox.json` 中，重启后自动重新注册。

### app.json 窗口配置

```json
{
    "id": "com.canbox.launcher",
    "main": "index.html",
    "window": {
        "width": 700,
        "height": 400,
        "frame": false,
        "alwaysOnTop": true,
        "skipTaskbar": true,
        "transparent": true,
        "resizable": false,
        "center": true
    }
}
```

## 开发

```bash
npm install
npm run dev     # Vite 开发服务器，端口 5176
npm run build   # Vite 构建到 dist/
```

技术栈：Vue 3 + Pinia + Vite 7 + pinyin-pro

构建产物为 `dist/` 目录。Canbox 通过 `app.json` 中的 `main: "index.html"`（或 `cb.build.json`）引用构建结果打包为 `.asar`。

## 重要实现细节

1. **`preload.js` 使用全局 `canbox` 对象**：不直接调用 `ipcRenderer`，所有跨进程通信通过 `canbox.*`（由 `app.preload.js` 注入）
2. **启动时自动注册快捷键**：`preload.js` 末尾 IIFE 从 `electronStore` 读取并调用 `canbox.shortcut.register()`，失败时仅 warn 不阻塞
3. **全局快捷键触发 → onShown 回调链路**：`canbox.shortcut.onTriggered()` → preload 设置 `__onShownCallback` → 渲染进程通过 `__launcherApi.onShown()` 注册。回调执行 `store.reset()` + 重新聚焦搜索框
4. **图标路径延迟解析**：`systemAppReader.getSystemApplications()` 返回的 `iconPath` 为 null，首次 `readIcon()` 调用时由 `resolveAppIcon()` 按需解析并缓存到 `app.iconPath`
5. **排序在 preload 侧完成**：`localeCompare('zh-CN', { sensitivity: 'base' })`，中文按拼音排序
6. **去重策略**：以 desktop 文件名（不含扩展名）为 key，多目录同名 `.desktop` 文件保留先扫描到的（高优先级来源）
7. **浏览器开发模式兼容**：`getLauncherApi()` / `getStoreApi()` 返回 null 时静默跳过，`vite dev` 下可正常渲染（无数据）
8. **窗口焦点防抖**：Linux `frame:false` 透明窗口的 focus→blur 秒级竞态，用 500ms grace period 延迟启用 blur 自动隐藏，防止冷启动时误隐藏
9. **异步 I/O 优化**：`systemAppReader.js` v2 使用 `fs.promises` 全异步批量解析（每批 50 个），不阻塞事件循环；`readdirSync` 有内存缓存避免重复读取
10. **跨项目修复**：canbox 主程序 `GlobalShortcutManager._handleFocus` 已增加 `appsDev.json` fallback，确保开发模式下的 APP 快捷键也能冷启动成功

## 许可证

Apache-2.0

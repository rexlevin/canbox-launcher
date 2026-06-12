# 已实现的功能

## 搜索功能

### 搜索算法 (`modules/appSearchEngine.js`)

纯 JavaScript 实现，无 Electron/Node 依赖，可在浏览器环境直接运行。

**匹配策略（按优先级）：**
1. 完全匹配（`score = 100`）
2. 前缀匹配（`score = 80`）
3. 包含匹配（`score = 60`）
4. 拼音全拼匹配（`score = 50`）
5. 子序列匹配（`score = 45`）
6. 拼音首字母匹配（`score = 40`）
7. 拼音子序列匹配（`score = 35`）

**特点：**
- 子序列匹配：如输入 `dbever` → 匹配 `DBeaver`
- 拼音匹配：中文应用名支持全拼和首字母搜索
- 同步搜索：不含拼音的匹配即时完成，零延迟
- 异步搜索：需拼音匹配时异步加载 `pinyin-pro`

**导出接口：**
| 函数 | 说明 |
|------|------|
| `searchApps(query, apps, limit)` | 异步搜索（含拼音） |
| `searchAppsSync(query, apps, limit)` | 同步搜索（不含拼音） |
| `calcMatchScore(query, app)` | 异步单条匹配 |
| `calcMatchScoreSync(query, name)` | 同步单条匹配 |

---

## 系统应用读取 (`modules/systemAppReader.js`)

Node.js 模块，通过 preload 桥接到渲染进程。

**功能：**
- 解析 Linux `.desktop` 文件获取应用信息
- 支持 Flatpak 应用的图标查找回退
- 去重：多目录中出现相同 `.desktop` 文件名时，保留用户级优先

**来源目录（按优先级）：**
1. `~/.local/share/applications/`
2. `/usr/share/applications/`
3. Flatpak 用户导出
4. Flatpak 系统导出

**解析字段：**
| 字段 | 说明 |
|------|------|
| `id` | desktop 文件名（不含扩展名） |
| `name` | Name 字段 |
| `exec` | Exec 字段（已清理占位符） |
| `icon` | Icon 字段原始值 |
| `iconPath` | 图标解析后的完整路径 |
| `comment` | Comment 字段 |
| `source` | `"system"` |
| `desktopPath` | desktop 文件完整路径 |

**图标解析：**
- 搜索目录：`~/.local/share/icons/`, `~/.icons/`, Flatpak exports, `/usr/share/icons/`, `/usr/share/pixmaps/`
- 递归深度限制：5 层
- 对 Flatpak 应用：额外在 Flatpak 安装目录中搜索（深度 10 层）

---

## UI 组件 (`src/components/Launcher.vue`)

Vue 3 组合式 API 实现。

**功能：**
- 搜索框自动聚焦
- 键入实时搜索（本地执行，无 IPC 延迟）
- 键盘导航：↑ ↓ 选择，Enter 启动，Esc 隐藏
- 图标缓存：懒加载 + 内存缓存
- 点击遮罩层隐藏
- 透明窗口背景（配合 Canbox `app.json` 的 `transparent: true`）

**数据流：**
```
preload 获取应用列表 → allApps (ref)
    ↓
用户输入 → watch(query) → searchAppsSync(query, allApps) → filteredApps (ref)
    ↓
选中应用 → launchApp(app) → preload 执行 Exec 命令
```

**配置存储：**
使用 Canbox 的 `window.api.electronStore` 持久化以下配置：
- `width`：窗口宽度（默认 600）
- `fontSize`：字体大小（默认 16）
- `borderRadius`：圆角（默认 12）

---

## Preload 桥接 (`preload.js`)

通过 `contextBridge.exposeInMainWorld('__launcherApi', { ... })` 暴露：

| API | 说明 |
|-----|------|
| `getApps()` | 获取系统应用列表 |
| `launchApp(app)` | 启动应用（执行 Exec 命令） |
| `readIcon(iconPath)` | 读取图标为 base64 data URI |
| `hide()` | IPC 通知 Canbox 隐藏窗口 |
| `onShown(callback)` | 监听 Canbox 窗口显示事件 |

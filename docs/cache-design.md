# 缓存功能设计

## 概述

Launcher 采用**双缓存**策略，实现"打开即用"的体验。

## 双缓存架构

| 缓存 | Key | 内容 | 用途 |
|------|-----|------|------|
| `appCache` | `launcher.appCache` | 全部应用元数据（不含图标） | 搜索匹配 |
| `defaultAppsCache` | `launcher.defaultAppsCache` | 按名称排序前5个应用（含 iconBase64） | 启动即时展示 |

### appCache 数据结构

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

### defaultAppsCache 数据结构

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
            "desktopPath": "/usr/share/applications/firefox.desktop",
            "iconBase64": "data:image/png;base64,..."
        }
    ]
}
```

## 缓存策略

| 场景 | 行为 |
|------|------|
| 冷启动（首次） | 无缓存 → 显示"正在扫描系统应用..."，后台扫描完成后立即展示 |
| 热启动（缓存有效） | 读取 `defaultAppsCache` → 即时展示5个应用（含图标，零 IPC） |
| 后台刷新 | 每5分钟自动扫描，结果通过 Pinia store 响应式更新 UI |
| 搜索 | 使用 `appCache` 全部应用列表进行本地匹配 |

## 排序规则

- 全部应用按 `name` 字段排序
- 使用 `localeCompare('zh-CN', { sensitivity: 'base' })` 实现中文拼音排序
- 排序在 preload 侧 `getApps()` 中完成

## 数据流

```
Launcher 显示 (快捷键唤起)
    ↓
onMounted → Promise.all([
    loadConfig()          // IPC，读取配置
    loadCache()           // IPC，并行读取两份缓存
])
    ↓
loadCache:
    ├── defaultAppsCache 有效 → 即时展示5个应用（含图标base64）
    │                             图标零 IPC，直接渲染
    └── defaultAppsCache 无效 → filteredApps 为空，仅显示输入框
    ↓
scanApps()  →  后台异步扫描（setImmediate 推迟，不阻塞）
    ↓
getApps(): 扫描 .desktop → 排序 → 保存 appCache + defaultAppsCache
    ↓               │
    ↑               │
    └── 返回 { apps, defaultApps } ──┘
    ↓
Pinia store 更新:
    - allApps = result.apps
    - iconCache ← result.defaultApps.iconBase64
    - filteredApps = 无query时取前5 / 有query时重新搜索
    ↓
UI 响应式更新（新增/删除的应用自动呈现）
    ↓
startAutoRefresh() → setInterval(scanApps, 5min)
```

## 启动性能

| 场景 | 首次启动（无缓存） | 热启动（有缓存） |
|------|-------------------|-----------------|
| 缓存读取 | 0（无缓存可读） | 2次 IPC，< 20ms |
| 图标加载 | 后台扫描时读取 | 0（base64 已在缓存中） |
| 可见延迟 | 显示扫描提示，扫描完成后呈现 | 即时呈现 |
| 后台扫描 | `setImmediate` 推迟，不阻塞 | `setImmediate` 推迟，不阻塞 |

## 状态管理

使用 Pinia store (`src/stores/launcher.js`) 统一管理：
- `allApps`：全部应用元数据（响应式）
- `filteredApps`：当前展示列表（响应式）
- `iconCache`：图标缓存（响应式）
- `config`：外观配置（响应式）
- `showSettings`：设置面板开关

定时刷新 → `scanApps()` → 更新 store state → Vue 响应式系统自动更新 DOM。

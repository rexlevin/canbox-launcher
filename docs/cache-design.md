# 缓存功能设计（计划中）

> 原文源自 Canbox 主项目 `docs/changes/active/launcher-app-cache.md`，已改写为独立 APP 视角。

## 问题

Alt+Space 唤起 Launcher 后，首次加载需要同步读取 `.desktop` 文件（`systemAppReader`），在应用较多时可能造成窗口延迟显示。

## 设计目标

实现"打开即用"：Launcher 打开后应用列表立刻可用，搜索无延迟。

## 方案概述

### 复用已有设计，简化为 APP 自管理

Launcher 剥离为独立 APP 后，缓存服务不再需要 Canbox 主进程侧的 `launcherAppCacheService`。改为：
- **缓存存储**：使用 Canbox 提供的 `electronStore` API 存储序列化的应用列表
- **缓存更新**：Launcher 窗口显示时检查缓存时效，按需后台更新
- **搜索**：始终在渲染进程内存中执行（已有，`appSearchEngine`）

### 数据流

```
Launcher 显示 (Alt+Space)
    ↓
检查 electronStore 缓存
    ├── 缓存有效（上次扫描 < 5 分钟） → 直接使用缓存数据
    └── 缓存过期或不存在 → 先展示缓存数据，后台异步更新
            └── preload 侧调用 getSystemApplications()
            └── 序列化后存入 electronStore
            └── 推送到渲染进程
```

### 缓存数据结构

```json
{
    "version": 1,
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

### 缓存策略

| 场景 | 行为 |
|------|------|
| 冷启动（首次） | 异步扫描，期间隐藏列表区 |
| 热启动（缓存有效） | 立刻展示缓存数据 |
| 缓存过期 | 先展示旧数据，后台静默更新 |
| 后台更新完成 | 若窗口可见，静默替换列表 |

### 与 Canbox 平台的关系

- 缓存完全由 Launcher APP 自己管理，不依赖 Canbox 主进程
- 使用 `electronStore` API 存储（Canbox 已有的 APP 配置存储能力）
- 不需要 Canbox 新增任何特殊 API

### 实施状态

⏳ 计划中，尚未实现。

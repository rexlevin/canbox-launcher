# Canbox 平台依赖

Launcher APP 正常运行需要 Canbox 平台提供以下支撑能力。

## 依赖总览

| 依赖 | 状态 | 优先级 | 说明 |
|------|------|--------|------|
| APP 基本运行环境 | ✅ 已有 | 必需 | 加载 asar、创建窗口、app.json 配置 |
| `electronStore` API | ✅ 已有 | 必需 | APP 配置存储（`window.canbox.store`） |
| APP 专用 preload 加载 | ✅ 已有 | 必需 | 通过 `app.json` `window.webPreferences.preload` 指定，`childprocessEntry.js` 自动加载 |
| `globalShortcut` API | ✅ 已实现 | 重要 | 注册/注销全局快捷键（`window.canbox.shortcut`） |

## 详细说明

### 1. APP 基本运行环境

**状态**：✅ Canbox 已有

Canbox 加载 Launcher APP 的 `.asar` 包，按 `app.json` 配置创建 `BrowserWindow`。

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

### 2. electronStore API

**状态**：✅ Canbox 已有

Launcher APP 使用 `window.canbox.store.get/set` 存储用户配置（窗口宽度、字体大小、圆角等）。

```javascript
// 读取配置（name 为存储名，key 为键）
const data = await window.canbox.store.get('launcher', 'config');

// 保存配置
await window.canbox.store.set('launcher', 'config', configValue);
```

### 3. APP 专用 preload 加载

**状态**：✅ Canbox 已有

在 `app.json` 中通过 `window.webPreferences.preload` 声明 preload 路径，Canbox 自动加载。

```json
{
    "window": {
        "webPreferences": {
            "preload": "preload.js"
        }
    }
}
```

**加载机制**（`childprocessEntry.js`）：

1. **Session 级**（第 274 行）：`sess.registerPreloadScript()` 始终加载 `modules/app/app.preload.js`，为所有 APP 提供 `window.canbox`（db、store、shortcut 等通用 API）
2. **BrowserWindow 级**（第 326 行）：如果 `app.json` 有 `window.webPreferences.preload`，设为 BrowserWindow preload，用于加载 APP 自身的定制 preload（如 `__launcherApi`）

两个 preload 在不同层级并行工作，可同时通过 `contextBridge` 向隔离世界暴露不同 API，无冲突。

### 4. globalShortcut API

**状态**：✅ Canbox 已实现

Launcher APP 需要注册全局快捷键（默认 `Alt+Space`）来唤起搜索窗口。

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

**Canbox 主进程行为：**
1. 收到快捷键触发 → 查映射表找到对应 APP
2. APP 未运行 → 启动 APP
3. APP 已隐藏 → show() + focus()
4. APP 已显示（toggle 模式）→ hide()

**注册时冲突提示：**
- Canbox 内部已占用 → 提示"快捷键已被 Canbox 内 XX APP 占用"
- 系统其他应用占用 → 提示"快捷键已被系统其他应用占用"

**持久化：**
Canbox 将快捷键映射存储在 `canbox.json` 中，重启后自动重新注册。

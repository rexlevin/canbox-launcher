# launcher-settings-panel

## 概述

为 Canbox Launcher APP 添加设置入口，参考 uTools 的设计——在 Launcher 搜索窗口右侧放置齿轮图标，点击打开设置面板。同时为 settings 面板设计快捷键配置界面，复用刚实现的 `globalShortcut` API 让用户可以自定义唤起 Launcher 的全局快捷键。

## 背景与动机

### 当前状态

- Launcher 的配置（`width`、`fontSize`、`borderRadius`）通过 `window.api.electronStore` 持久化，但**没有任何 UI 入口可修改**
- 默认唤起快捷键（如 `Alt+Space`）写死在代码里，用户无法自定义
- Canbox 目前**不支持 APP 的 Tray 能力**，因此托盘菜单方案暂不可行

### 为什么选 uTools 方案

| 方案 | 可行性 | 说明 |
|------|--------|------|
| ❌ Tray 菜单入口 | 不可行 | Canbox 尚未支撑 APP 的 tray 能力 |
| ✅ 窗口内设置按钮 | **采纳** | 参考 uTools，搜索栏右侧放齿轮图标 |

### uTools 参考

uTools 在搜索栏右侧有图标按钮（插件中心、设置等），点击后切换到面板视图。Launcher 可采用同样的交互模式。

## 核心设计

### 1. 设置入口

Launcher 窗口的搜索栏右侧，放置一个齿轮图标按钮：

```
┌─────────────────────────────────────────────┐
│ 🔍  搜索应用...                    ⚙  Esc  │
├─────────────────────────────────────────────┤
│                                             │
│           （搜索结果 / 设置面板）             │
│                                             │
└─────────────────────────────────────────────┘
```

- 点击齿轮 → 切换为设置面板视图
- 设置面板内提供返回按钮 → 切回搜索视图
- 快捷键 `Ctrl+,` 也可打开设置（通用约定）

### 2. 设置面板内容

```yaml
设置分组:

  快捷键:
    - 唤起 Launcher: [输入框，显示当前快捷键，点击后捕获按键]
    - 说明文字: "按下你想使用的组合键"
    - 重置默认: 按钮

  外观:
    - 窗口宽度: [滑块 400~800，默认 600]
    - 字体大小: [滑块 12~24，默认 16]
    - 圆角大小: [滑块 4~24，默认 12]

  关于:
    - 版本号
    - 项目链接
```

### 3. 快捷键配置交互

```
用户点击快捷键输入框
    ↓
进入"捕获模式"（input 显示"按下组合键..."）
    ↓
用户按下组合键（如 Ctrl+Shift+Space）
    ↓
调用 canbox.shortcut.register(accelerator)
    ├── 成功 → 保存到 electronStore，更新 UI
    └── 冲突 → 提示"已被 XXX 占用"，允许用户选择：
        ├── 换一个组合键
        └── 强制覆盖（调用 unregister 后再 register）
```

### 4. 数据存储

快捷键配置同时存两份：
- `canbox.json` → `globalShortcutManager` 管理的 `accelerator → appId` 映射（Canbox 主进程持久化）
- `electronStore('launcherConfig')` → `{ shortcut: 'Alt+Space' }`（Launcher APP 自己记住用户选择，用于 UI 展示）

## 实施计划

### 步骤 1：Launcher.vue 添加设置按钮和视图切换

- 搜索栏右侧加齿轮 `<span class="settings-btn" @click="toggleSettings">⚙</span>`
- 新增 `showSettings` ref 控制视图切换
- `v-if="!showSettings"` → 搜索结果列表
- `v-else` → 设置面板组件

### 步骤 2：创建 SettingsPanel.vue 组件

- 分组卡片布局（参考 Canbox 主程序 `Settings.vue` 风格）
- 快捷键捕获输入框
- 外观滑块
- 关于信息

### 步骤 3：快捷键配置逻辑

- 实现按键捕获（`keydown` 事件，构建 accelerator 字符串）
- 调用 `window.canbox.shortcut.register()` / `unregister()`
- 冲突处理 UI

### 步骤 4：样式与交互打磨

- 设置面板动画（从右滑入或渐显）
- 点击窗口外部关闭设置（返回搜索视图）
- 适配透明窗口背景

## 实施参考

### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/Launcher.vue` | 修改 | 添加设置按钮 + 视图切换逻辑 |
| `src/components/SettingsPanel.vue` | 新建 | 设置面板组件 |
| `modules/app/app.preload.js` | 无需修改 | `window.canbox.shortcut` 已在 canbox 侧实现 |

### 关键依赖

| 依赖 | 状态 | 说明 |
|------|------|------|
| `window.canbox.shortcut` | ✅ 已实现 | Canbox `feature/app-global-shortcut` 分支 |
| `window.api.electronStore` | ✅ 已有 | 配置存储 |
| APP 专用 preload 加载 | ⏳ 计划中 | Launcher 的 `preload.js` 需要能被 Canbox 加载 |

### 快捷键 accelerator 格式

Electron accelerator 字符串示例：
- `Alt+Space`
- `CommandOrControl+Shift+Space`
- `Alt+` `(backtick)`

## 验收标准

- [ ] Launcher 窗口搜索栏右侧显示齿轮图标
- [ ] 点击齿轮打开设置面板
- [ ] 设置面板有关闭/返回按钮
- [ ] 快捷键输入框可捕获用户按键
- [ ] 注册成功 → 提示 + 保存
- [ ] 注册冲突 → 显示冲突信息 + 提供选择
- [ ] 外观设置（宽度/字体/圆角）实时生效
- [ ] 设置持久化，重启 Launcher 后保留
- [ ] 置后外观设置实时生效

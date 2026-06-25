# Launcher 设置面板

> **归属项目**：`canbox-launcher`（基于 Canbox 平台的 APP 项目，`.canbox-app`）
>
> **提案日期**：2026-06-11
>
> **完成日期**：2026-06-25
>
> **变更类型**：feat

## 概述

在 Launcher 搜索框右侧放置齿轮图标，点击打开设置面板。

## 入口

```
┌─────────────────────────────────────────────────────┐
│ 🔍  搜索应用...                        ⚙     Esc   │
├─────────────────────────────────────────────────────┤
│                                                     │
│            （搜索结果 / 设置面板）                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- 点击 ⚙ → 切换为设置面板视图
- 设置面板底部有"返回"按钮 → 切回搜索视图
- 再次点击 ⚙ → 关闭设置面板
- 在设置面板中按 Esc → 回到搜索视图

## 设置内容

### 快捷键

- **唤起 Launcher**：快捷键输入框，聚焦后捕获按键组合
  - 点击输入框 → 进入"捕获模式"（显示"按下组合键..."）
  - 按下组合键 → 验证后显示并保存
  - 验证规则：需包含 Ctrl/Alt/Shift/Super 中的至少一个修饰键
  - ✕ 按钮可清除已设置的快捷键
  - 默认：无快捷键（用户自行设置）

### 外观

- **窗口宽度**：滑块 400~800px，默认 600px
- **字体大小**：滑块 12~24px，默认 16px
- **圆角大小**：滑块 4~24px，默认 12px
- 滑块拖动时实时预览，松开后持久化到 electronStore

### 关于

- **版本**：从 package.json 读取
- **项目地址**：github.com/lizl6/canbox-launcher
- **Canbox 平台**：github.com/lizl6/canbox

## 数据存储

快捷键和外观配置均存储在 `electronStore('launcher', ...)` 中：
- `launcher.config` = `{ width, fontSize, borderRadius }`
- `launcher.shortcut` = `"Alt+Space"`（accelerator 字符串）

## 全局快捷键注册

设置快捷键时通过 canbox 平台的 `canbox.shortcut.register(accelerator)` API 注册全局快捷键：

```
用户设置快捷键 (SettingsPanel)
    ↓
1. persist: canbox.store.set('launcher', 'shortcut', accelerator)
2. register: canbox.shortcut.register(accelerator)
    ↓ ipcRenderer.invoke('shortcut-register', { accelerator, appId })
    ↓ api.js → GlobalShortcutManager.register(accelerator, appId, 'focus')
    ↓ Electron globalShortcut.register(accelerator, callback)
    ↓
触发时: GlobalShortcutManager → win.show() + win.focus()
```

- 注册模式为 `'focus'`：触发时自动显示并聚焦 Launcher 窗口
- 清除快捷键时调用 `canbox.shortcut.unregister(accelerator)` 注销（修复：使用旧值而非清空后的空值）
- 修改快捷键时先注销旧组合，再注册新组合
- 启动时自动从 electronStore 读取并注册已保存的快捷键
- 快捷键被占用时（occupied/system-occupied），界面上显示具体错误提示

> **跨项目修复**：canbox 主程序 `GlobalShortcutManager._handleFocus` 已增加 `appsDev.json` fallback，确保开发模式下的 APP 快捷键也能冷启动成功。

## 快捷键捕获逻辑

```
用户点击快捷键输入框
    ↓
进入"捕获模式"（input 显示"按下组合键..."）
    ↓
用户按下组合键（如 Ctrl+Shift+Space）
    ↓
构建 accelerator 字符串："Ctrl+Shift+Space"
    ↓
验证：必须包含 Ctrl/Alt/Shift/Super 之一
    ├── 无效 → 显示错误提示
    └── 有效 → 保存到 electronStore → 更新 UI
```

---

## 完成摘要

**实施分支**：`feat/launcher-settings-panel`

### 实现概要

为 Launcher APP 新增设置面板功能：

1. **入口**：搜索框右侧齿轮图标 ⚙，点击/再点击/Esc 切换搜索视图与设置面板
2. **快捷键设置**：捕获组合键输入框，验证至少包含一个修饰键，支持清除和实时修改
3. **外观设置**：窗口宽度（400-800px）、字体大小（12-24px）、圆角大小（4-24px）滑块，实时预览+持久化
4. **全局快捷键**：通过 `canbox.shortcut.register/unregister` API 注册/注销，启动时自动恢复
5. **依赖 canbox 主程序**：`GlobalShortcutManager._handleFocus` 增加 `appsDev.json` fallback 以支持开发模式冷启动

### 验收标准

全部已通过测试验证 ✓

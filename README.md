# Canbox Launcher APP

基于 Canbox 平台实现的快速启动器 APP，支持搜索并启动系统应用。

## 功能概述

- 🔍 **即时搜索**：子序列模糊匹配 + 中文拼音匹配，搜索在渲染进程本地执行，无 IPC 延迟
- 🚀 **应用启动**：支持启动系统应用和 Canbox 已安装 APP
- ⌨️ **全局快捷键**：通过 Canbox 平台 API 注册全局快捷键唤起（计划中）
- 🎨 **透明窗口**：无边框、置顶、点击失焦自动隐藏

## 项目结构

```
canbox-launcher/
├── app.json                  # APP 元信息
├── preload.js               # preload（Node 侧能力暴露）
├── index.html               # 入口 HTML
├── package.json
├── vite.config.js
├── src/
│   ├── main.js              # Vue 入口
│   ├── App.vue              # 根组件
│   └── components/
│       └── Launcher.vue    # 搜索框主界面
├── modules/
│   ├── appSearchEngine.js  # 搜索算法（纯函数，可在 renderer 中运行）
│   └── systemAppReader.js  # 系统应用读取（Node 模块，preload 侧调用）
├── docs/
│   ├── README.md           # 文档入口
│   ├── implemented-features.md   # 已实现能力清单
│   ├── cache-design.md     # 缓存功能设计
│   └── canbox-dependencies.md    # Canbox 平台依赖
└── logo.png
```

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build
```

## Canbox 平台依赖

本 APP 需要 Canbox 平台提供以下支撑能力：

| 依赖                   | 状态      | 说明                       |
| ---------------------- | --------- | -------------------------- |
| `globalShortcut` API | ⏳ 计划中 | 注册/注销全局快捷键        |
| `electronStore` API  | ✅ 已有   | APP 配置存储               |
| APP preload 加载       | ⏳ 计划中 | 加载 APP 自己的 preload.js |

详细说明见 `docs/canbox-dependencies.md`。

## 许可证

Apache-2.0

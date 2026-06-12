# Canbox Launcher APP 文档

## 文档索引

| 文档 | 说明 |
|------|------|
| [implemented-features.md](./implemented-features.md) | 当前已实现的功能清单 |
| [cache-design.md](./cache-design.md) | 缓存功能设计方案（计划中） |
| [canbox-dependencies.md](./canbox-dependencies.md) | Canbox 平台依赖清单 |

## 快速概览

Canbox Launcher APP 是从 Canbox 主程序剥离出的独立 APP。它通过 Canbox 平台提供的 API 实现：

1. **应用搜索**：纯前端算法，无延迟
2. **应用启动**：解析 `.desktop` 文件执行 `Exec` 命令
3. **全局快捷键**：调用 Canbox 的 `globalShortcut` API（计划中）
4. **配置存储**：使用 Canbox 的 `electronStore` API

## 架构特点

- 搜索算法 (`appSearchEngine.js`) 是纯函数模块，可在 renderer 进程直接运行
- 系统应用读取 (`systemAppReader.js`) 是 Node 模块，通过 preload 桥接
- 所有 Canbox 平台能力通过标准 API 调用，不入侵 Canbox 主程序代码

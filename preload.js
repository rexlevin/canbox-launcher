/**
 * canbox-launcher preload
 *
 * 为 Launcher APP 暴露 Node.js 侧能力（文件读取、命令执行等）。
 *
 * 此 preload 通过 contextBridge 向渲染进程暴露以下 API：
 * - globalThis.__launcherApi.getApps()       获取系统应用列表
 * - globalThis.__launcherApi.launchApp(app)   启动应用
 * - globalThis.__launcherApi.readIcon(path)   读取图标为 base64
 * - globalThis.__launcherApi.hide()           隐藏 launcher 窗口
 * - globalThis.__launcherApi.onShown(cb)      监听窗口显示事件
 *
 * 依赖：
 * - modules/systemAppReader.js (getSystemApplications, readIconAsBase64)
 * - Node.js child_process (exec)
 * - Electron ipcRenderer (与 canbox 主进程通信)
 */

const { contextBridge, ipcRenderer } = require('electron');
const { exec } = require('child_process');
const { getSystemApplications, readIconAsBase64 } = require('./modules/systemAppReader');

const launcherApi = {
    /**
     * 获取应用列表（系统应用 + canbox 已安装 APP 的快捷方式）
     * @returns {Promise<Array>}
     */
    getApps: async () => {
        const apps = getSystemApplications();
        // 过滤掉 Canbox 自身的快捷方式
        return apps.filter(app => app.id.toLowerCase() !== 'canbox');
    },

    /**
     * 启动应用
     * 系统应用：执行 Exec 命令
     * Canbox APP（.desktop 源自 canbox- 快捷方式）：通过 canbox 主进程启动
     * @param {Object} app - 应用对象
     * @returns {Promise<{ success: boolean }>}
     */
    launchApp: async (app) => {
        if (app.exec) {
            // 系统应用：执行 Exec 命令
            return new Promise((resolve) => {
                const child = exec(app.exec, (error) => {
                    if (error) {
                        console.error('[Launcher preload] 启动系统应用失败:', app.name, error.message);
                        resolve({ success: false, error: error.message });
                    } else {
                        resolve({ success: true });
                    }
                });
                child.unref();
            });
        }

        // canbox APP：通过 canbox 主进程 IPC 启动
        // （当 canbox 实现 appLauncher API 后替换）
        console.warn('[Launcher preload] 无法启动应用，缺少 exec 命令:', app.name);
        return { success: false, error: '无法启动应用，缺少执行命令' };
    },

    /**
     * 读取图标文件为 base64 data URI
     * @param {string} iconPath - 图标文件路径
     * @returns {Promise<string|null>}
     */
    readIcon: async (iconPath) => {
        return readIconAsBase64(iconPath);
    },

    /**
     * 隐藏 launcher 窗口
     * 通过 IPC 通知 canbox 主进程隐藏此 APP 窗口
     */
    hide: () => {
        ipcRenderer.invoke('launcher:hide').catch(() => {
            // fallback: 降级为关闭窗口
            ipcRenderer.invoke('msg-electronStore', { action: 'hide-window' }).catch(() => {});
        });
    },

    /**
     * 监听窗口显示事件
     * @param {Function} callback
     */
    onShown: (callback) => {
        ipcRenderer.on('launcher:shown', () => {
            if (typeof callback === 'function') callback();
        });
    }
};

contextBridge.exposeInMainWorld('__launcherApi', launcherApi);

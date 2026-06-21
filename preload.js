/**
 * canbox-launcher preload
 *
 * 为 Launcher APP 暴露 Node.js 侧能力（文件读取、命令执行等）。
 *
 * 此 preload 通过 contextBridge 向渲染进程暴露以下 API：
 * - getApps()            扫描系统应用（排序、缓存）
 * - getCachedApps()      读取全部应用缓存
 * - getDefaultAppsCache() 读取默认5个应用缓存（含图标base64）
 * - launchApp(app)       启动应用
 * - readIcon(path)       读取图标为 base64
 * - hide()               隐藏 launcher 窗口
 * - store.get/set        配置存储（基于 canbox electronStore）
 *
 * 缓存分为两份：
 * - appCache：全部应用元数据（不含图标），用于搜索
 * - defaultAppsCache：按名称排序前5个应用（含图标base64），用于即时展示
 *
 * 依赖：
 * - canbox 全局 API（app.preload.js 注入）: canbox.windowControl, canbox.store
 * - modules/systemAppReader.js (getSystemApplications, readIconAsBase64)
 * - Node.js child_process (exec)
 */
const { contextBridge } = require('electron');
const { exec } = require('child_process');
const { getSystemApplications, readIconAsBase64 } = require('./modules/systemAppReader');

canbox.hello();

/**
 * 缓存版本号，变更数据结构时递增
 */
const CACHE_VERSION = 2;

/**
 * 保存全部应用列表缓存（仅元数据，不含图标，保持轻量）
 * @param {Array} apps - 应用列表
 */
function saveAppCache(apps) {
    const cachedApps = apps.map(app => ({
        id: app.id,
        name: app.name,
        exec: app.exec,
        icon: app.icon,
        iconPath: app.iconPath,
        comment: app.comment,
        source: app.source,
        desktopPath: app.desktopPath
    }));

    canbox.store.set('launcher', 'appCache', {
        version: CACHE_VERSION,
        lastScanTime: Date.now(),
        apps: cachedApps
    }).then(() => {
        console.log('[Launcher preload] 应用缓存已保存:', cachedApps.length, '个应用');
    }).catch(err => {
        console.error('[Launcher preload] 保存应用缓存失败:', err);
    });
}

/**
 * 保存默认展示的5个应用缓存（含图标 base64，启动时即时渲染）
 * @param {Array} apps - 前5个应用（已含 iconBase64）
 */
function saveDefaultAppsCache(apps) {
    const cachedApps = apps.map(app => ({
        id: app.id,
        name: app.name,
        exec: app.exec,
        icon: app.icon,
        iconPath: app.iconPath,
        comment: app.comment,
        source: app.source,
        desktopPath: app.desktopPath,
        iconBase64: app.iconBase64
    }));

    canbox.store.set('launcher', 'defaultAppsCache', {
        version: CACHE_VERSION,
        lastScanTime: Date.now(),
        apps: cachedApps
    }).then(() => {
        console.log('[Launcher preload] 默认应用缓存已保存:', cachedApps.length, '个应用');
    }).catch(err => {
        console.error('[Launcher preload] 保存默认应用缓存失败:', err);
    });
}

const launcherApi = {
    /**
     * 扫描系统应用，排序后保存两份缓存
     *
     * 内部流程：
     * 1. 扫描全部 .desktop 文件
     * 2. 过滤掉 canbox 自身
     * 3. 按名称 localeCompare('zh-CN') 排序（中文按拼音）
     * 4. 保存 fullAppCache（全部应用，不含图标）
     * 5. 取前5个，读取图标 base64，保存 defaultAppsCache
     *
     * 使用 setImmediate 推迟重型 I/O，避免阻塞 preload 线程
     *
     * @returns {Promise<{ apps: Array, defaultApps: Array }>}
     *   apps - 全部排序后的应用列表（不含 iconBase64）
     *   defaultApps - 前5个应用（含 iconBase64）
     */
    getApps: () => new Promise((resolve) => {
        setImmediate(() => {
            try {
                const apps = getSystemApplications();
                const filtered = apps.filter(app => app.id.toLowerCase() !== 'canbox');

                // 按名称排序，使用 zh-CN localeCompare 让中文按拼音排序
                filtered.sort((a, b) =>
                    a.name.localeCompare(b.name, 'zh-CN', { sensitivity: 'base' })
                );

                // 保存全部应用缓存（不含图标，轻量）
                saveAppCache(filtered);

                // 取前5个，读取图标 base64
                const top5 = filtered.slice(0, 5);
                const top5WithIcons = top5.map(app => ({
                    id: app.id,
                    name: app.name,
                    exec: app.exec,
                    icon: app.icon,
                    iconPath: app.iconPath,
                    comment: app.comment,
                    source: app.source,
                    desktopPath: app.desktopPath,
                    iconBase64: app.iconPath ? readIconAsBase64(app.iconPath) : null
                }));

                // 保存默认应用缓存（含图标 base64）
                saveDefaultAppsCache(top5WithIcons);

                resolve({ apps: filtered, defaultApps: top5WithIcons });
            } catch (err) {
                console.error('[Launcher preload] 扫描系统应用失败:', err);
                resolve({ apps: [], defaultApps: [] });
            }
        });
    }),

    /**
     * 获取全部应用缓存（不含图标，用于搜索）
     * @returns {Promise<Object|null>} { version, lastScanTime, apps }
     */
    getCachedApps: async () => {
        return canbox.store.get('launcher', 'appCache');
    },

    /**
     * 获取默认展示的5个应用缓存（含图标 base64，用于即时展示）
     * @returns {Promise<Object|null>} { version, lastScanTime, apps }
     */
    getDefaultAppsCache: async () => {
        return canbox.store.get('launcher', 'defaultAppsCache');
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
     * 使用 canbox.windowControl API（app.preload.js 注入的全局 canbox）
     */
    hide: () => {
        canbox.windowControl.hide().catch((err) => {
            console.error('[Launcher preload] 隐藏窗口失败:', err);
        });
    },

    /**
     * 配置存储（基于 canbox electronStore）
     * 在预加载脚本中使用 canbox.store API（app.preload.js 注入的全局 canbox）
     */
    store: {
        /**
         * 读取配置值
         * @param {string} name - store 名称
         * @param {string} key - 配置键
         * @returns {Promise<any>}
         */
        get: (name, key) => {
            return canbox.store.get(name, key);
        },

        /**
         * 写入配置值
         * @param {string} name - store 名称
         * @param {string} key - 配置键
         * @param {*} value - 配置值
         * @returns {Promise<void>}
         */
        set: (name, key, value) => {
            return canbox.store.set(name, key, value);
        }
    }
};

contextBridge.exposeInMainWorld('__launcherApi', launcherApi);

/**
 * Launcher Pinia Store — 集中管理应用状态
 *
 * 职责：
 * - 应用列表状态（allApps / filteredApps）
 * - 图标缓存（iconCache）
 * - 搜索交互（handleQuery）
 * - 后台定时刷新（startAutoRefresh → 每5分钟 scanApps）
 * - 配置管理（loadConfig / saveConfig）
 * - 设置面板切换（showSettings）
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { searchAppsSync } from '@modules/appSearchEngine.js';

// 默认应用图标（内联 SVG base64）
function toBase64(str) {
    const bytes = new TextEncoder().encode(str);
    return btoa(String.fromCharCode(...bytes));
}
const DEFAULT_APP_ICON = 'data:image/svg+xml;base64,' + toBase64(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" rx="12" fill="#e5e7eb"/>' +
    '<text x="32" y="42" text-anchor="middle" font-size="32" fill="#9ca3af">📦</text>' +
    '</svg>'
);

const SCAN_INTERVAL = 5 * 60 * 1000; // 5 分钟

/**
 * 获取 launcher API（preload 注入的 __launcherApi）
 * 浏览器开发模式下返回 null
 */
function getLauncherApi() {
    if (typeof window !== 'undefined' && window.__launcherApi) {
        return window.__launcherApi;
    }
    return null;
}

/**
 * 获取配置存储 API
 */
function getStoreApi() {
    if (typeof window !== 'undefined' && window.__launcherApi && window.__launcherApi.store) {
        return window.__launcherApi.store;
    }
    return null;
}

export const useLauncherStore = defineStore('launcher', () => {
    // ================================================================
    // State
    // ================================================================

    /** 全部应用元数据（用于搜索） */
    const allApps = ref([]);

    /** 当前展示的应用列表（默认top5 或 搜索结果） */
    const filteredApps = ref([]);

    /** 图标缓存 (app.id → base64 data URI) */
    const iconCache = ref({});

    /** 配置 */
    const config = ref({
        width: 600,
        fontSize: 16,
        borderRadius: 12
    });

    /** 搜索关键词 */
    const query = ref('');

    /** 键盘导航选中索引 */
    const selectedIndex = ref(0);

    /** 是否显示设置面板 */
    const showSettings = ref(false);

    /** 定时刷新句柄 */
    let scanTimer = null;

    // ================================================================
    // Getters
    // ================================================================

    const searchPlaceholder = computed(() => '搜索应用...');

    const windowStyle = computed(() => ({
        width: config.value.width + 'px',
        height: '320px',
        borderRadius: config.value.borderRadius + 'px'
    }));

    const defaultAppIcon = computed(() => DEFAULT_APP_ICON);

    const hasApps = computed(() => allApps.value.length > 0);

    // ================================================================
    // Actions
    // ================================================================

    /**
     * 加载缓存：并行读取 defaultAppsCache（含图标base64）+ appCache（全部应用）
     *
     * 有 defaultAppsCache → 即时展示5个默认应用
     * 无 defaultAppsCache → filteredApps 为空，UI 仅显示输入框
     */
    async function loadCache() {
        const api = getLauncherApi();
        if (!api) return;

        try {
            const [defaultAppsData, allAppsData] = await Promise.allSettled([
                api.getDefaultAppsCache(),
                api.getCachedApps()
            ]);

            // 加载默认应用缓存（含图标 base64）
            if (defaultAppsData.status === 'fulfilled' && defaultAppsData.value?.apps?.length > 0) {
                const apps = defaultAppsData.value.apps;
                filteredApps.value = apps.slice(0, 5);
                // 从缓存直接恢复图标，无需 IPC 请求
                for (const app of apps) {
                    if (app.iconBase64) {
                        iconCache.value[app.id] = app.iconBase64;
                    }
                }
            }
            // 无缓存时什么都不做 — UI 自然显示空状态

            // 加载全部应用缓存（用于搜索）
            if (allAppsData.status === 'fulfilled' && allAppsData.value?.apps?.length > 0) {
                allApps.value = allAppsData.value.apps;
            }
        } catch (err) {
            console.error('[Launcher Store] 加载缓存失败:', err);
        }
    }

    /**
     * 后台扫描系统应用
     *
     * 调用 preload getApps()，后者内部：
     * 1. 扫描全部 .desktop 文件
     * 2. 按名称 localeCompare('zh-CN') 排序
     * 3. 保存 appCache（全部应用，无图标）
     * 4. 取前5个，读取图标 base64，保存 defaultAppsCache
     *
     * 扫描完成后：
     * - 更新 allApps
     * - 更新图标缓存
     * - 如无搜索关键词 → 更新默认展示列表
     * - 如有搜索关键词 → 重新执行搜索（匹配新应用）
     */
    async function scanApps() {
        const api = getLauncherApi();
        if (!api) return;

        try {
            const result = await api.getApps();
            allApps.value = result.apps;

            // 更新图标缓存（从扫描结果的 top5 中获取 base64）
            if (result.defaultApps?.length > 0) {
                for (const app of result.defaultApps) {
                    if (app.iconBase64) {
                        iconCache.value[app.id] = app.iconBase64;
                    }
                }
            }

            // 只在无搜索关键词时更新默认展示列表
            if (!query.value.trim()) {
                filteredApps.value = allApps.value.slice(0, 5);
            } else {
                // 有搜索关键词时，用新的 allApps 重新过滤
                handleQuery(query.value);
            }
        } catch (err) {
            console.error('[Launcher Store] 扫描应用失败:', err);
        }
    }

    /**
     * 启动定时刷新（每5分钟）
     */
    function startAutoRefresh() {
        stopAutoRefresh();
        scanTimer = setInterval(() => {
            scanApps();
        }, SCAN_INTERVAL);
    }

    /**
     * 停止定时刷新
     */
    function stopAutoRefresh() {
        if (scanTimer) {
            clearInterval(scanTimer);
            scanTimer = null;
        }
    }

    /**
     * 处理搜索输入
     * @param {string} q - 搜索关键词
     */
    function handleQuery(q) {
        const trimmed = q.trim();
        if (!trimmed) {
            filteredApps.value = allApps.value.slice(0, 5);
        } else {
            filteredApps.value = searchAppsSync(trimmed, allApps.value, 5);
        }
        selectedIndex.value = 0;
    }

    /**
     * 键盘导航：选择下一个
     */
    function selectNext() {
        if (filteredApps.value.length === 0) return;
        selectedIndex.value = Math.min(selectedIndex.value + 1, filteredApps.value.length - 1);
    }

    /**
     * 键盘导航：选择上一个
     */
    function selectPrev() {
        if (filteredApps.value.length === 0) return;
        selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
    }

    /**
     * 启动应用
     * @param {Object} app - 应用对象
     */
    async function launchApp(app) {
        const api = getLauncherApi();
        if (!api) return;

        try {
            await api.launchApp({ ...app });
        } catch (err) {
            console.error('[Launcher Store] 启动应用失败:', err);
        }
    }

    /**
     * 隐藏启动器并重置状态
     */
    function hide() {
        const api = getLauncherApi();
        if (api) {
            api.hide();
        }
        reset();
    }

    /**
     * 重置状态（不清除 allApps / iconCache）
     */
    function reset() {
        query.value = '';
        selectedIndex.value = 0;
        showSettings.value = false;
    }

    /**
     * 加载配置（从 electronStore）
     */
    async function loadConfig() {
        const store = getStoreApi();
        if (!store) return;

        try {
            const data = await store.get('launcher', 'config');
            if (data) {
                config.value = { ...config.value, ...data };
            }
        } catch (err) {
            console.error('[Launcher Store] 加载配置失败:', err);
        }
    }

    /**
     * 保存配置（到 electronStore）
     */
    async function saveConfig() {
        const store = getStoreApi();
        if (!store) return;

        try {
            await store.set('launcher', 'config', { ...config.value });
        } catch (err) {
            console.error('[Launcher Store] 保存配置失败:', err);
        }
    }

    /**
     * 切换设置面板显示
     */
    function toggleSettings() {
        showSettings.value = !showSettings.value;
    }

    /**
     * 按需加载应用图标（仅对无缓存的图标发起 IPC）
     *
     * 传入 app 对象给 readIcon，由 preload 侧按需解析图标路径（resolveAppIcon）
     * 首次调用时自动解析并缓存到 app.iconPath，后续调用直接使用缓存路径。
     *
     * @param {Object} app - 应用对象（含 icon / desktopPath 字段）
     */
    async function loadAppIcon(app) {
        if (iconCache.value[app.id] !== undefined) return;

        // 无图标名称（.desktop 中未定义 Icon=），跳过
        if (!app.icon) {
            iconCache.value[app.id] = DEFAULT_APP_ICON;
            return;
        }

        const api = getLauncherApi();
        if (!api) {
            iconCache.value[app.id] = DEFAULT_APP_ICON;
            return;
        }

        try {
            const dataUri = await api.readIcon(app);
            iconCache.value[app.id] = dataUri || DEFAULT_APP_ICON;
        } catch (e) {
            iconCache.value[app.id] = DEFAULT_APP_ICON;
        }
    }

    return {
        // State
        allApps,
        filteredApps,
        iconCache,
        config,
        query,
        selectedIndex,
        showSettings,
        // Getters
        searchPlaceholder,
        windowStyle,
        defaultAppIcon,
        hasApps,
        // Actions
        loadCache,
        scanApps,
        startAutoRefresh,
        stopAutoRefresh,
        handleQuery,
        selectNext,
        selectPrev,
        launchApp,
        hide,
        reset,
        loadConfig,
        saveConfig,
        toggleSettings,
        loadAppIcon,
        DEFAULT_APP_ICON
    };
});

<template>
    <div class="launcher-overlay" @click.self="store.hide()">
        <div class="launcher-window" :style="store.windowStyle">
            <!-- 搜索框 -->
            <div class="search-area">
                <span class="search-icon">🔍</span>
                <input
                    ref="searchInput"
                    :value="store.query"
                    class="search-input"
                    :placeholder="store.searchPlaceholder"
                    :style="{ fontSize: store.config.fontSize + 'px' }"
                    @input="onInput"
                    @keydown="handleKeydown"
                    autofocus
                />
                <span
                    class="settings-btn"
                    :class="{ active: store.showSettings }"
                    @click="store.toggleSettings()"
                    title="设置"
                >⚙</span>
                <span class="shortcut-hint" v-if="!store.query">Esc</span>
            </div>

            <!-- 设置面板 -->
            <SettingsPanel v-if="store.showSettings" />

            <!-- 搜索结果 -->
            <template v-else>
                <!-- 有结果 -->
                <div class="results-area" v-if="store.filteredApps.length > 0">
                    <div
                        v-for="(app, index) in store.filteredApps"
                        :key="app.id"
                        class="result-item"
                        :class="{ selected: index === store.selectedIndex }"
                        @click="launchApp(app)"
                        @mouseenter="store.selectedIndex = index"
                    >
                        <img
                            class="app-icon"
                            :src="store.iconCache[app.id] || store.DEFAULT_APP_ICON"
                            :alt="app.name"
                            @error="handleIconError"
                        />
                        <div class="app-info">
                            <span class="app-name" :style="{ fontSize: store.config.fontSize + 'px' }">
                                {{ app.name }}
                            </span>
                            <span class="app-comment" v-if="app.comment">
                                {{ app.comment }}
                            </span>
                        </div>
                        <span class="app-source" v-if="app.source === 'canbox'">📦</span>
                        <span class="enter-hint" v-if="index === store.selectedIndex">⏎</span>
                    </div>
                </div>

                <!-- 有搜索词无结果 -->
                <div class="results-area no-results" v-else-if="store.query && store.filteredApps.length === 0">
                    <div class="empty-text">无匹配结果</div>
                </div>

                <!-- 无搜索词无缓存（首次启动） -->
                <div class="results-area hint-area" v-else>
                    <div class="hint-text" v-if="store.hasApps">输入关键词搜索应用</div>
                    <div class="hint-text scanning-hint" v-else>
                        <span class="scanning-dot"></span>正在扫描系统应用...
                    </div>
                </div>
            </template>
        </div>
    </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useLauncherStore } from '@/stores/launcher.js';
import SettingsPanel from './SettingsPanel.vue';

const store = useLauncherStore();
const searchInput = ref(null);

/**
 * 获取 launcher API
 */
function getLauncherApi() {
    if (typeof window !== 'undefined' && window.__launcherApi) {
        return window.__launcherApi;
    }
    return null;
}

/**
 * 输入事件处理（更新 query + 执行搜索）
 */
function onInput(event) {
    store.query = event.target.value;
    store.handleQuery(event.target.value);
}

/**
 * 键盘事件处理
 */
function handleKeydown(event) {
    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            store.selectNext();
            break;
        case 'ArrowUp':
            event.preventDefault();
            store.selectPrev();
            break;
        case 'Enter':
            event.preventDefault();
            if (store.filteredApps.length > 0 && store.selectedIndex >= 0) {
                launchApp(store.filteredApps[store.selectedIndex]);
            }
            break;
        case 'Escape':
            event.preventDefault();
            store.hide();
            break;
    }
}

/**
 * 启动应用（启动后自动隐藏）
 */
async function launchApp(app) {
    await store.launchApp(app);
    store.hide();
}

/**
 * 图标加载失败回退
 */
function handleIconError(event) {
    event.target.src = store.DEFAULT_APP_ICON;
}

/**
 * 窗口失去焦点时隐藏
 */
function handleWindowBlur() {
    store.hide();
}

// 仅加载当前可见结果的图标（懒加载，避免一次性加载所有图标阻塞 I/O）
watch(() => store.filteredApps, (apps) => {
    apps.forEach(app => store.loadAppIcon(app));
}, { deep: false });

onMounted(async () => {
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('blur', handleWindowBlur);

    // 1. 并行加载配置和缓存（两次轻量 IPC，极快）
    await Promise.all([
        store.loadConfig(),
        store.loadCache()
    ]);

    // 2. 后台扫描系统应用（首次或缓存过期时更新）
    store.scanApps();

    // 3. 启动定时刷新（每5分钟）
    store.startAutoRefresh();

    // 4. 监听窗口显示事件（由 canbox 主进程发送，重置状态）
    const api = getLauncherApi();
    if (api && api.onShown) {
        api.onShown(() => {
            store.reset();
            nextTick(() => {
                if (searchInput.value) {
                    searchInput.value.focus();
                }
            });
        });
    }

    // 5. 自动获取焦点
    await nextTick();
    if (searchInput.value) {
        searchInput.value.focus();
    }
});

onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('blur', handleWindowBlur);
    store.stopAutoRefresh();
});
</script>

<style>
html, body {
    background-color: transparent !important;
}
</style>

<style scoped>
.launcher-overlay {
    width: 100vw;
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 0;
    text-align: left;
    overflow: visible;
}

.launcher-window {
    background: #ffffff;
    border: 1.5px solid rgba(0, 0, 0, 0.12);
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.25), 0 0 40px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    margin-top: 0;
    display: flex;
    flex-direction: column;
}

/* 搜索区域 */
.search-area {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid #f0f0f0;
    gap: 10px;
}

.search-icon {
    font-size: 18px;
    flex-shrink: 0;
    opacity: 0.5;
}

.search-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: #333;
    padding: 4px 0;
    font-family: inherit;
}

.search-input::placeholder {
    color: #bbb;
}

/* 设置齿轮按钮 */
.settings-btn {
    font-size: 18px;
    cursor: pointer;
    flex-shrink: 0;
    opacity: 0.4;
    transition: opacity 0.15s;
    padding: 2px 4px;
    border-radius: 4px;
    user-select: none;
}

.settings-btn:hover,
.settings-btn.active {
    opacity: 0.9;
    background: #f0f0f0;
}

.shortcut-hint {
    font-size: 12px;
    color: #ccc;
    background: #f5f5f5;
    padding: 2px 8px;
    border-radius: 4px;
    flex-shrink: 0;
}

/* 结果区域 */
.results-area {
    flex: 1;
    padding: 8px 0;
    overflow-y: auto;
    min-height: 0;
}

.results-area::-webkit-scrollbar {
    width: 0;
    height: 0;
}

.results-area.no-results {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 80px;
    padding: 24px 16px;
}

.empty-text {
    color: #bbb;
    font-size: 15px;
}

.hint-area {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60px;
    padding: 16px;
}

.hint-text {
    color: #999;
    font-size: 14px;
}

.scanning-hint {
    display: flex;
    align-items: center;
    gap: 8px;
}

.scanning-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #999;
    animation: scanning-pulse 1.2s ease-in-out infinite;
}

@keyframes scanning-pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
}

/* 结果项 */
.result-item {
    display: flex;
    align-items: center;
    padding: 8px 16px;
    gap: 12px;
    cursor: pointer;
    transition: background-color 0.15s ease;
}

.result-item:hover,
.result-item.selected {
    background-color: #f5f7fa;
}

.app-icon {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    flex-shrink: 0;
    object-fit: contain;
}

.app-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.app-name {
    color: #333;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.app-comment {
    font-size: 12px;
    color: #999;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.app-source {
    font-size: 14px;
    flex-shrink: 0;
    opacity: 0.6;
}

.enter-hint {
    font-size: 11px;
    color: #bbb;
    background: #f5f5f5;
    padding: 1px 6px;
    border-radius: 3px;
    flex-shrink: 0;
}
</style>

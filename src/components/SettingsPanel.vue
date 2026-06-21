<template>
    <div class="settings-panel">
        <!-- 快捷键 -->
        <div class="settings-group">
            <div class="group-title">快捷键</div>
            <div class="setting-item">
                <label class="setting-label">唤起 Launcher</label>
                <div class="setting-control">
                    <input
                        ref="shortcutInput"
                        class="shortcut-input"
                        :value="shortcutDisplay"
                        readonly
                        placeholder="点击设置快捷键"
                        @focus="startCapture"
                        @blur="stopCapture"
                        @keydown="handleKeyCapture"
                    />
                    <button
                        v-if="shortcutDisplay"
                        class="clear-btn"
                        @click="clearShortcut"
                        title="清除快捷键"
                    >✕</button>
                </div>
                <div class="setting-hint">按下你想使用的组合键（需包含 Ctrl/Alt/Shift/Super）</div>
                <div class="setting-hint error" v-if="captureError">{{ captureError }}</div>
            </div>
        </div>

        <!-- 外观 -->
        <div class="settings-group">
            <div class="group-title">外观</div>
            <div class="setting-item">
                <label class="setting-label">窗口宽度</label>
                <div class="setting-control slider-control">
                    <input
                        type="range"
                        min="400"
                        max="800"
                        step="20"
                        :value="localConfig.width"
                        @input="onWidthChange"
                    />
                    <span class="slider-value">{{ localConfig.width }}px</span>
                </div>
            </div>
            <div class="setting-item">
                <label class="setting-label">字体大小</label>
                <div class="setting-control slider-control">
                    <input
                        type="range"
                        min="12"
                        max="24"
                        step="1"
                        :value="localConfig.fontSize"
                        @input="onFontSizeChange"
                    />
                    <span class="slider-value">{{ localConfig.fontSize }}px</span>
                </div>
            </div>
            <div class="setting-item">
                <label class="setting-label">圆角大小</label>
                <div class="setting-control slider-control">
                    <input
                        type="range"
                        min="4"
                        max="24"
                        step="1"
                        :value="localConfig.borderRadius"
                        @input="onBorderRadiusChange"
                    />
                    <span class="slider-value">{{ localConfig.borderRadius }}px</span>
                </div>
            </div>
        </div>

        <!-- 关于 -->
        <div class="settings-group">
            <div class="group-title">关于</div>
            <div class="about-item">
                <span class="about-label">版本</span>
                <span class="about-value">{{ version }}</span>
            </div>
            <div class="about-item">
                <span class="about-label">项目地址</span>
                <a class="about-link" @click.prevent="openUrl('https://github.com/lizl6/canbox-launcher')">
                    github.com/lizl6/canbox-launcher
                </a>
            </div>
            <div class="about-item">
                <span class="about-label">Canbox 平台</span>
                <a class="about-link" @click.prevent="openUrl('https://github.com/lizl6/canbox')">
                    github.com/lizl6/canbox
                </a>
            </div>
        </div>

        <!-- 返回按钮 -->
        <div class="settings-footer">
            <button class="back-btn" @click="store.toggleSettings()">← 返回</button>
        </div>
    </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { useLauncherStore } from '@/stores/launcher.js';
import pkg from '../../package.json';

const store = useLauncherStore();
const shortcutInput = ref(null);
const version = pkg.version;

/** 当前显示/捕获的快捷键 */
const shortcutDisplay = ref('');

/** 是否处于按键捕获模式 */
let capturing = false;

/** 捕获失败的错误提示 */
const captureError = ref('');

/** 外观设置的本地副本（滑块实时更新，blur 时持久化） */
const localConfig = reactive({ ...store.config });

/**
 * 打开外部 URL（使用默认浏览器）
 */
function openUrl(url) {
    const api = getLauncherApi();
    if (api && api.openUrl) {
        api.openUrl(url);
    } else {
        // 回退：通过 canbox 的默认方式或在外部浏览器打开
        console.log('[SettingsPanel] openUrl:', url);
    }
}

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
 * 获取配置存储 API
 */
function getStoreApi() {
    if (typeof window !== 'undefined' && window.__launcherApi && window.__launcherApi.store) {
        return window.__launcherApi.store;
    }
    return null;
}

/**
 * 开始捕获快捷键
 */
function startCapture() {
    capturing = true;
    captureError.value = '';
    shortcutDisplay.value = '按下组合键...';
}

/**
 * 停止捕获快捷键
 */
function stopCapture() {
    capturing = false;
    captureError.value = '';
    if (shortcutDisplay.value === '按下组合键...') {
        // 用户没按任何键，恢复显示
        loadShortcut();
    }
}

/**
 * 验证 accelerator 字符串是否合法
 * @param {string} accel
 * @returns {{ valid: boolean, error?: string }}
 */
function validateAccelerator(accel) {
    if (!accel) return { valid: false, error: '快捷键不能为空' };

    const parts = accel.split('+');
    const modifiers = ['Ctrl', 'Alt', 'Shift', 'Super', 'Command', 'CommandOrControl'];
    const hasModifier = parts.some(p => modifiers.includes(p));

    if (!hasModifier) {
        return { valid: false, error: '快捷键需包含 Ctrl/Alt/Shift/Super 中的至少一个' };
    }

    if (parts.length < 2) {
        return { valid: false, error: '请使用组合键（如 Ctrl+Space）' };
    }

    return { valid: true };
}

/**
 * 处理按键捕获
 */
function handleKeyCapture(event) {
    if (!capturing) return;

    event.preventDefault();
    event.stopPropagation();

    const parts = [];

    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Super');

    // 忽略纯修饰键的按下
    const modifierKeys = ['Control', 'Alt', 'Shift', 'Meta'];
    if (modifierKeys.includes(event.key)) {
        return;
    }

    // 主键
    const key = event.key === ' ' ? 'Space' : event.key.length === 1
        ? event.key.toUpperCase() : event.key;
    parts.push(key);

    const accelerator = parts.join('+');

    // 验证
    const validation = validateAccelerator(accelerator);
    if (!validation.valid) {
        captureError.value = validation.error;
        return;
    }

    captureError.value = '';

    // 显示并通过 blur 触发持久化
    shortcutDisplay.value = accelerator;
    capturing = false;

    // 立即持久化
    saveShortcut(accelerator);
}

/**
 * 清除快捷键
 */
function clearShortcut() {
    shortcutDisplay.value = '';
    captureError.value = '';
    saveShortcut('');
}

/**
 * 保存快捷键到 electronStore 并注册全局快捷键
 */
async function saveShortcut(accelerator) {
    const api = getLauncherApi();
    const storeApi = getStoreApi();
    if (!storeApi || !api) return;

    console.log('[SettingsPanel] saveShortcut called, accelerator:', accelerator);

    try {
        // 1. 持久化到 electronStore
        await storeApi.set('launcher', 'shortcut', accelerator);
        console.log('[SettingsPanel] 快捷键已保存到 store:', accelerator);

        // 2. 调用 canbox.shortcut API 注册全局快捷键
        if (accelerator) {
            const result = await api.registerShortcut(accelerator);
            console.log('[SettingsPanel] 全局快捷键注册结果:', JSON.stringify(result));
            if (!result.success) {
                const reason = result.reason || '未知错误';
                if (reason === 'occupied') {
                    captureError.value = '快捷键已被 ' + (result.occupiedBy || '其他应用') + ' 占用';
                } else if (reason === 'system-occupied') {
                    captureError.value = '快捷键已被系统占用';
                } else {
                    captureError.value = '快捷键注册失败: ' + reason;
                }
            } else {
                captureError.value = '';
                console.log('[SettingsPanel] 全局快捷键注册成功 ✓');
            }
        } else {
            // 清空快捷键：先注销旧的
            await api.unregisterShortcut(shortcutDisplay.value || '');
            console.log('[SettingsPanel] 已清空快捷键');
        }
    } catch (err) {
        console.error('[SettingsPanel] 保存/注册快捷键失败:', err);
        captureError.value = '保存失败，请重试';
    }
}

/**
 * 加载已保存的快捷键
 */
async function loadShortcut() {
    const storeApi = getStoreApi();
    if (!storeApi) return;

    try {
        const saved = await storeApi.get('launcher', 'shortcut');
        shortcutDisplay.value = saved || '';
    } catch (err) {
        console.error('[SettingsPanel] 加载快捷键失败:', err);
    }
}

// 外观设置变更处理（实时更新预览 + 持久化）
function onWidthChange(e) {
    localConfig.width = Number(e.target.value);
    store.config.width = localConfig.width;
    store.saveConfig();
}
function onFontSizeChange(e) {
    localConfig.fontSize = Number(e.target.value);
    store.config.fontSize = localConfig.fontSize;
    store.saveConfig();
}
function onBorderRadiusChange(e) {
    localConfig.borderRadius = Number(e.target.value);
    store.config.borderRadius = localConfig.borderRadius;
    store.saveConfig();
}

onMounted(() => {
    loadShortcut();
    // 同步当前 config 到本地副本
    Object.assign(localConfig, store.config);
});
</script>

<style scoped>
.settings-panel {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    padding: 8px 0;
}

.settings-panel::-webkit-scrollbar {
    width: 0;
    height: 0;
}

/* 分组 */
.settings-group {
    padding: 8px 16px;
    border-bottom: 1px solid #f5f5f5;
}

.settings-group:last-of-type {
    border-bottom: none;
}

.group-title {
    font-size: 11px;
    font-weight: 600;
    color: #aaa;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 10px;
}

/* 设置项 */
.setting-item {
    margin-bottom: 14px;
}

.setting-item:last-child {
    margin-bottom: 0;
}

.setting-label {
    display: block;
    font-size: 14px;
    color: #555;
    margin-bottom: 6px;
}

.setting-control {
    display: flex;
    align-items: center;
    gap: 8px;
}

.setting-hint {
    font-size: 11px;
    color: #bbb;
    margin-top: 4px;
}

.setting-hint.error {
    color: #e74c3c;
}

/* 快捷键输入 */
.shortcut-input {
    flex: 1;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 14px;
    font-family: 'Courier New', monospace;
    color: #333;
    background: #fafafa;
    outline: none;
    cursor: pointer;
    text-align: center;
    transition: border-color 0.15s;
}

.shortcut-input:focus {
    border-color: #409eff;
    background: #fff;
}

.shortcut-input::placeholder {
    color: #ccc;
    font-family: inherit;
    font-size: 13px;
}

.clear-btn {
    border: none;
    background: none;
    color: #ccc;
    cursor: pointer;
    font-size: 14px;
    padding: 2px 6px;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
}

.clear-btn:hover {
    color: #e74c3c;
    background: #fef0f0;
}

/* 滑块 */
.slider-control input[type="range"] {
    flex: 1;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: #e0e0e0;
    border-radius: 2px;
    outline: none;
    cursor: pointer;
}

.slider-control input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #409eff;
    cursor: pointer;
    transition: background 0.15s;
}

.slider-control input[type="range"]::-webkit-slider-thumb:hover {
    background: #337ecc;
}

.slider-value {
    font-size: 13px;
    color: #888;
    min-width: 42px;
    text-align: right;
    font-family: 'Courier New', monospace;
}

/* 关于 */
.about-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 14px;
}

.about-label {
    color: #555;
}

.about-value {
    color: #999;
}

.about-link {
    color: #409eff;
    text-decoration: none;
    cursor: pointer;
    font-size: 13px;
}

.about-link:hover {
    text-decoration: underline;
}

/* 底部按钮 */
.settings-footer {
    padding: 8px 16px 12px;
}

.back-btn {
    display: inline-flex;
    align-items: center;
    border: none;
    background: none;
    color: #888;
    cursor: pointer;
    font-size: 13px;
    padding: 4px 8px;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
}

.back-btn:hover {
    color: #333;
    background: #f5f5f5;
}
</style>

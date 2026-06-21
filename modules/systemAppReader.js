/**
 * 系统应用读取器（Node.js 模块，用于 preload 侧调用）
 *
 * 解析 Linux .desktop 文件，获取系统已安装的应用列表。
 * 需要 Node.js 环境（fs, path, os），不可在浏览器中直接使用。
 *
 * v2: 全异步 I/O + 延迟图标路径解析
 * - getSystemApplications() 使用 fs.promises 异步读取，不阻塞事件循环
 * - parseDesktopContent() 仅解析元数据，不解析图标路径
 * - resolveAppIcon() 按需解析单个应用的图标路径（首次调用时）
 */

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');

// ================================================================
// 工具函数
// ================================================================

/**
 * 清理 Exec 命令中的 .desktop 占位符
 */
function cleanupExecCommand(exec) {
    return exec
        .replace(/%[fFuUdDnNickvm]/g, '')
        .replace(/%%/g, '%')
        .trim();
}

/**
 * 判断 desktop 文件是否来自 Flatpak 目录
 */
function isFlatpakDesktopFile(filePath) {
    return filePath.includes('/flatpak/');
}

/**
 * 从 Flatpak desktop 文件路径中提取应用 ID
 */
function extractFlatpakAppId(filePath) {
    return path.basename(filePath, '.desktop');
}

// ================================================================
// .desktop 文件解析（纯元数据，不含图标路径解析）
// ================================================================

/**
 * 从 .desktop 文件内容解析应用元数据（不解析图标路径）
 * @param {string} content - .desktop 文件文本内容
 * @param {string} filePath - .desktop 文件路径
 * @returns {Object|null} 应用信息，iconPath 始终为 null
 */
function parseDesktopContent(content, filePath) {
    try {
        const lines = content.split('\n');

        const app = {
            id: path.basename(filePath, '.desktop'),
            name: '',
            exec: '',
            icon: '',
            comment: '',
            source: 'system',
            desktopPath: filePath,
            iconPath: null  // 延迟解析，由 resolveAppIcon() 按需填充
        };

        let inDesktopEntry = false;

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed === '[Desktop Entry]') {
                inDesktopEntry = true;
                continue;
            }

            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                break;
            }

            if (!inDesktopEntry) continue;

            if (trimmed.startsWith('Name=')) {
                app.name = trimmed.substring(5);
            } else if (trimmed.startsWith('Exec=')) {
                app.exec = trimmed.substring(5);
            } else if (trimmed.startsWith('Icon=')) {
                app.icon = trimmed.substring(5);
            } else if (trimmed.startsWith('Comment=')) {
                app.comment = trimmed.substring(8);
            } else if (trimmed.startsWith('NoDisplay=')) {
                if (trimmed.substring(10).toLowerCase() === 'true') {
                    return null;
                }
            } else if (trimmed.startsWith('Hidden=')) {
                if (trimmed.substring(7).toLowerCase() === 'true') {
                    return null;
                }
            }
        }

        if (!app.name || !app.exec) {
            return null;
        }

        app.exec = cleanupExecCommand(app.exec);
        return app;
    } catch (error) {
        console.warn('[SystemAppReader] 解析 .desktop 内容失败:', filePath, error.message);
        return null;
    }
}

// ================================================================
// 图标路径解析（同步，按需调用，单个应用耗时 < 20ms）
// ================================================================

/**
 * 图标目录列表缓存：避免对同一目录重复 readdirSync
 */
const _iconDirCache = new Map();

/**
 * 在目录中递归查找图标文件（同步，带缓存）
 */
function findIconInDir(dir, iconName, extensions, maxDepth) {
    if (maxDepth <= 0) return null;

    try {
        let entries = _iconDirCache.get(dir);
        if (!entries) {
            entries = fs.readdirSync(dir, { withFileTypes: true });
            _iconDirCache.set(dir, entries);
        }

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                const found = findIconInDir(fullPath, iconName, extensions, maxDepth - 1);
                if (found) return found;
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name);
                const baseName = path.basename(entry.name, ext);
                if (baseName === iconName && extensions.includes(ext)) {
                    return fullPath;
                }
            }
        }
    } catch (e) {
        // 跳过无法读取的目录
    }

    return null;
}

/**
 * 解析单个图标的实际文件路径
 * @param {string} iconName - .desktop 中的 Icon= 值
 * @returns {string|null} 图标文件的绝对路径
 */
function resolveIconPath(iconName) {
    if (!iconName) return null;

    // 绝对路径：直接验证存在
    if (path.isAbsolute(iconName)) {
        if (fs.existsSync(iconName)) return iconName;
        for (const ext of ['.png', '.svg', '.xpm', '.ico']) {
            if (fs.existsSync(iconName + ext)) return iconName + ext;
        }
        return null;
    }

    // 相对路径：在标准图标目录中搜索
    const searchDirs = [
        path.join(os.homedir(), '.local/share/icons'),
        path.join(os.homedir(), '.icons'),
        path.join(os.homedir(), '.local/share/flatpak/exports/share/icons'),
        '/usr/share/icons',
        '/usr/share/pixmaps',
        '/var/lib/flatpak/exports/share/icons'
    ];

    const extensions = ['.png', '.svg', '.xpm', '.ico', ''];

    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        const found = findIconInDir(dir, iconName, extensions, 5);
        if (found) return found;
    }

    return null;
}

/**
 * 在 Flatpak 应用安装目录中搜索图标
 */
function findFlatpakIcon(appId, iconName) {
    const flatpakBases = [
        path.join(os.homedir(), '.local/share/flatpak/app'),
        '/var/lib/flatpak/app'
    ];

    for (const base of flatpakBases) {
        const appDir = path.join(base, appId);
        if (!fs.existsSync(appDir)) continue;

        const found = findIconInDir(appDir, iconName, ['.png', '.svg', '.xpm', '.ico'], 10);
        if (found) return found;
    }

    return null;
}

/**
 * 按需解析应用的图标路径（首次调用时解析，结果缓存在 app.iconPath 上）
 * @param {Object} app - 应用对象（需含 icon / desktopPath 字段）
 * @returns {string|null} 图标文件路径
 */
function resolveAppIcon(app) {
    if (app.iconPath) return app.iconPath;
    if (!app.icon) return null;

    app.iconPath = resolveIconPath(app.icon);

    // Flatpak 应用回退
    if (!app.iconPath && isFlatpakDesktopFile(app.desktopPath)) {
        const appId = extractFlatpakAppId(app.desktopPath);
        if (appId) {
            app.iconPath = findFlatpakIcon(appId, app.icon);
        }
    }

    return app.iconPath;
}

// ================================================================
// 系统应用扫描（全异步 I/O）
// ================================================================

/**
 * 获取系统应用列表
 *
 * v2 改进：
 * - 使用 fs.promises 异步 I/O，不阻塞事件循环
 * - .desktop 文件解析不再包含图标路径搜索（延迟到 resolveAppIcon()）
 * - 每次批量处理最多 50 个文件，避免同时打开过多文件句柄
 *
 * @returns {Promise<Array>} 应用列表（iconPath 字段需要 resolveAppIcon() 按需填充）
 */
async function getSystemApplications() {
    const tStart = Date.now();
    const apps = [];
    const seenIds = new Set();

    const dirs = [
        path.join(os.homedir(), '.local/share/applications'),
        '/usr/share/applications',
        '/var/lib/flatpak/exports/share/applications',
        path.join(os.homedir(), '.local/share/flatpak/exports/share/applications')
    ];

    // Step 1: 收集所有 .desktop 文件路径
    const desktopFiles = [];

    for (const dir of dirs) {
        try {
            await fsp.access(dir);
        } catch {
            continue;
        }

        let files;
        try {
            files = (await fsp.readdir(dir)).filter(f => f.endsWith('.desktop'));
        } catch (e) {
            console.warn('[SystemAppReader] 无法读取目录:', dir);
            continue;
        }

        console.log('[SystemAppReader] 目录', dir, '有', files.length, '个 .desktop 文件');

        for (const file of files) {
            desktopFiles.push({ dir, file });
        }
    }

    // Step 2: 异步批量解析 .desktop 文件（每次最多 50 个并发）
    const BATCH_SIZE = 50;

    for (let i = 0; i < desktopFiles.length; i += BATCH_SIZE) {
        const batch = desktopFiles.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
            batch.map(async ({ dir, file }) => {
                const filePath = path.join(dir, file);
                try {
                    const content = await fsp.readFile(filePath, 'utf8');
                    const app = parseDesktopContent(content, filePath);
                    if (app) app._sourceDir = dir;
                    return app;
                } catch (e) {
                    console.warn('[SystemAppReader] 读取文件失败:', filePath, e.message);
                    return null;
                }
            })
        );

        for (const app of results) {
            if (app && !seenIds.has(app.id)) {
                seenIds.add(app.id);
                apps.push(app);
            }
        }
    }

    console.log('[SystemAppReader] 读取到', apps.length, '个系统应用, 耗时:', (Date.now() - tStart), 'ms');
    return apps;
}

// ================================================================
// 图标文件读取
// ================================================================

/**
 * 读取图标文件为 base64
 * @param {string} iconPath - 图标文件路径
 * @returns {string|null} base64 data URI，读取失败返回 null
 */
function readIconAsBase64(iconPath) {
    if (!iconPath) return null;

    try {
        if (!fs.existsSync(iconPath)) return null;

        const ext = path.extname(iconPath).toLowerCase();
        const mimeType = ext === '.svg' ? 'image/svg+xml'
            : ext === '.png' ? 'image/png'
                : ext === '.ico' ? 'image/x-icon'
                    : ext === '.xpm' ? 'image/x-xpixmap'
                        : 'image/png';

        const data = fs.readFileSync(iconPath);
        return `data:${mimeType};base64,${data.toString('base64')}`;
    } catch (error) {
        console.error('[SystemAppReader] 读取图标失败:', iconPath, error.message);
        return null;
    }
}

module.exports = {
    getSystemApplications,
    parseDesktopContent,
    resolveAppIcon,
    readIconAsBase64
};

/**
 * 系统应用读取器（Node.js 模块，用于 preload 侧调用）
 *
 * 解析 Linux .desktop 文件，获取系统已安装的应用列表。
 * 需要 Node.js 环境（fs, path, os），不可在浏览器中直接使用。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * 解析 .desktop 文件
 * @param {string} filePath - .desktop 文件路径
 * @returns {Object|null} 应用信息
 */
function parseDesktopFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');

        const app = {
            id: path.basename(filePath, '.desktop'),
            name: '',
            exec: '',
            icon: '',
            comment: '',
            source: 'system',
            desktopPath: filePath
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
        app.iconPath = resolveIconPath(app.icon);

        // Flatpak 应用回退
        if (!app.iconPath && isFlatpakDesktopFile(filePath)) {
            const appId = extractFlatpakAppId(filePath);
            if (appId) {
                app.iconPath = findFlatpakIcon(appId, app.icon);
            }
        }

        return app;
    } catch (error) {
        console.error('[SystemAppReader] 解析 .desktop 文件失败:', filePath, error.message);
        return null;
    }
}

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
 * 解析图标路径
 */
function resolveIconPath(iconName) {
    if (!iconName) return null;

    if (path.isAbsolute(iconName)) {
        if (fs.existsSync(iconName)) return iconName;
        for (const ext of ['.png', '.svg', '.xpm', '.ico']) {
            if (fs.existsSync(iconName + ext)) return iconName + ext;
        }
        return null;
    }

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
 * 在目录中递归查找图标文件
 */
function findIconInDir(dir, iconName, extensions, maxDepth) {
    if (maxDepth <= 0) return null;

    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

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
 * 获取系统应用列表
 * @returns {Array} 应用列表
 */
function getSystemApplications() {
    const apps = [];
    const seenIds = new Set();

    const dirs = [
        path.join(os.homedir(), '.local/share/applications'),
        '/usr/share/applications',
        '/var/lib/flatpak/exports/share/applications',
        path.join(os.homedir(), '.local/share/flatpak/exports/share/applications')
    ];

    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;

        let files;
        try {
            files = fs.readdirSync(dir).filter(f => f.endsWith('.desktop'));
        } catch (e) {
            console.warn('[SystemAppReader] 无法读取目录:', dir);
            continue;
        }

        for (const file of files) {
            const filePath = path.join(dir, file);
            const app = parseDesktopFile(filePath);

            if (app && !seenIds.has(app.id)) {
                seenIds.add(app.id);
                app._sourceDir = dir;
                apps.push(app);
            }
        }
    }

    console.log('[SystemAppReader] 读取到', apps.length, '个系统应用');
    return apps;
}

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
    parseDesktopFile,
    readIconAsBase64
};

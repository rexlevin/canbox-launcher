/**
 * 应用搜索引擎（纯算法模块，无 Electron / Node 依赖）
 *
 * 支持：
 * - 完全匹配、前缀匹配、包含匹配
 * - 子序列模糊匹配（字符按顺序出现，可以不连续）
 * - 中文拼音匹配（全拼 + 首字母，需安装 pinyin-pro）
 *
 * 此模块可在浏览器 / renderer 进程中直接 import 使用
 */

let pinyinModule = null;

/**
 * 延迟加载 pinyin-pro 模块
 */
function getPinyinModule() {
    if (!pinyinModule) {
        try {
            // 动态 import ESM 模块
            pinyinModule = import('pinyin-pro');
        } catch (e) {
            console.warn('[AppSearchEngine] pinyin-pro 模块未安装，拼音匹配功能不可用');
            pinyinModule = Promise.resolve(null);
        }
    }
    return pinyinModule;
}

/**
 * 判断字符串是否包含中文字符
 * @param {string} str
 * @returns {boolean}
 */
function hasChinese(str) {
    return /[\u4e00-\u9fff]/.test(str);
}

/**
 * 获取字符串的拼音（全拼和首字母）
 * @param {string} str
 * @returns {Promise<{ full: string, first: string }|null>}
 */
async function getPinyin(str) {
    const mod = await getPinyinModule();
    if (!mod) return null;

    try {
        const { pinyin } = mod;
        const full = pinyin(str, { toneType: 'none', type: 'array' }).join('');
        const first = pinyin(str, { pattern: 'first', toneType: 'none', type: 'array' }).join('');
        return { full, first };
    } catch (e) {
        console.error('[AppSearchEngine] 拼音转换失败:', e.message);
        return null;
    }
}

/**
 * 判断 query 是否是 target 的子序列（字符按顺序出现，可以不连续）
 * @param {string} query
 * @param {string} target
 * @returns {boolean}
 */
function isSubsequence(query, target) {
    let i = 0;
    for (let j = 0; i < query.length && j < target.length; j++) {
        if (query[i] === target[j]) {
            i++;
        }
    }
    return i === query.length;
}

/**
 * 计算匹配分数（同步，不含拼音匹配）
 * @param {string} lowerQuery - 小写化的查询字符串
 * @param {string} lowerName - 小写化的应用名称
 * @returns {number} 匹配分数（0 表示不匹配）
 */
function calcMatchScoreSync(lowerQuery, lowerName) {
    if (!lowerQuery) return 0;

    let score = 0;

    if (lowerName === lowerQuery) {
        score = 100;
    } else if (lowerName.startsWith(lowerQuery)) {
        score = 80;
    } else if (lowerName.includes(lowerQuery)) {
        score = 60;
    } else if (isSubsequence(lowerQuery, lowerName)) {
        score = 45;
    }

    return score;
}

/**
 * 计算匹配分数（异步，含拼音匹配）
 * @param {string} query - 用户输入的查询字符串
 * @param {Object} app - 应用对象（含 name 字段）
 * @returns {Promise<number>} 匹配分数（0 表示不匹配）
 */
async function calcMatchScore(query, app) {
    const lowerQuery = query.toLowerCase().trim();
    const lowerName = (app.name || '').toLowerCase().trim();

    if (!lowerQuery) return 0;

    // 先做同步匹配
    const syncScore = calcMatchScoreSync(lowerQuery, lowerName);
    if (syncScore > 0) return syncScore;

    // 拼音匹配（仅当应用名包含中文时）
    if (hasChinese(app.name)) {
        const py = await getPinyin(app.name);
        if (py) {
            if (py.full.includes(lowerQuery)) return 50;
            if (py.first.includes(lowerQuery)) return 40;
            if (isSubsequence(lowerQuery, py.full) || isSubsequence(lowerQuery, py.first)) return 35;
        }
    }

    return 0;
}

/**
 * 搜索应用（同步版本，不含拼音）
 * @param {string} query - 用户输入
 * @param {Array} apps - 应用列表
 * @param {number} limit - 返回结果数量上限
 * @returns {Array} 匹配的应用列表（带 score 字段）
 */
function searchAppsSync(query, apps, limit = 5) {
    const lowerQuery = query.trim().toLowerCase();

    if (!lowerQuery) {
        return apps.slice(0, limit).map(app => ({ ...app, score: 0 }));
    }

    const scored = apps
        .map(app => ({
            ...app,
            score: calcMatchScoreSync(lowerQuery, (app.name || '').toLowerCase())
        }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit);
}

/**
 * 搜索应用（异步版本，含拼音）
 * @param {string} query - 用户输入
 * @param {Array} apps - 应用列表
 * @param {number} limit - 返回结果数量上限
 * @returns {Promise<Array>} 匹配的应用列表（带 score 字段）
 */
async function searchApps(query, apps, limit = 5) {
    const lowerQuery = query.trim().toLowerCase();

    if (!lowerQuery) {
        return apps.slice(0, limit).map(app => ({ ...app, score: 0 }));
    }

    const scored = [];
    for (const app of apps) {
        const score = await calcMatchScore(lowerQuery, app);
        if (score > 0) {
            scored.push({ ...app, score });
        }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
}

export {
    searchApps,
    searchAppsSync,
    calcMatchScore,
    calcMatchScoreSync
};

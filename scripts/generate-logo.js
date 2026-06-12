/**
 * 从 logo.svg 重新生成各尺寸 PNG
 * 需要 canbox 主项目的 sharp 依赖，或单独安装: npm install sharp
 *
 * 用法: node scripts/generate-logo.js
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svg = fs.readFileSync(path.join(__dirname, '..', 'logo.svg'));
const sizes = [
    { name: 'logo.png', size: 48 },
    { name: 'logo_128x128.png', size: 128 },
    { name: 'logo_256x256.png', size: 256 },
    { name: 'logo_512x512.png', size: 512 }
];

(async () => {
    for (const { name, size } of sizes) {
        const outPath = path.join(__dirname, '..', name);
        await sharp(svg).resize(size, size).png().toFile(outPath);
        console.log(`${name} (${size}x${size}) - OK`);
    }
    console.log('Done.');
})().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});

# generate-logo.js

## 中文

### 作用

`scripts/generate-logo.js` 用于从矢量源文件 `logo.svg` 批量生成各尺寸 PNG 图标。当 `logo.svg` 发生修改时，需重新执行该脚本以更新所有 PNG 产物。

### 生成的产物

| 文件名              | 尺寸     |
| ------------------- | -------- |
| `logo.png`          | 48×48    |
| `logo_128x128.png`  | 128×128  |
| `logo_256x256.png`  | 256×256  |
| `logo_512x512.png`  | 512×512  |

### 依赖

脚本使用 [`sharp`](https://sharp.pixelplumbing.com/) 进行 SVG → PNG 转换。`sharp` 是 Canbox 主项目（`/depot/cargo/canbox`）的依赖，不在 `canbox-launcher/package.json` 中声明。运行时依赖 Node.js 模块解析沿目录树向上查找的能力。

### 用法

在 `canbox-launcher` 目录下执行：

```bash
node scripts/generate-logo.js
```

执行成功时输出：

```
logo.png (48x48) - OK
logo_128x128.png (128x128) - OK
logo_256x256.png (256x256) - OK
logo_512x512.png (512x512) - OK
Done.
```

### 注意事项

- 必须在 `canbox-launcher/` 目录下执行，否则 `path.join(__dirname, '..', 'logo.svg')` 无法正确定位源文件。
- 如果 Canbox 主项目未安装依赖（`npm install`），`sharp` 模块将不可用，脚本会报错退出。
- 生成的 PNG 文件应一并提交到版本库。

---

## English

### Purpose

`scripts/generate-logo.js` generates multi-size PNG icons from the vector source file `logo.svg`. Whenever `logo.svg` is modified, this script must be re-run to update all PNG outputs.

### Outputs

| File                | Size     |
| ------------------- | -------- |
| `logo.png`          | 48×48    |
| `logo_128x128.png`  | 128×128  |
| `logo_256x256.png`  | 256×256  |
| `logo_512x512.png`  | 512×512  |

### Dependency

The script uses [`sharp`](https://sharp.pixelplumbing.com/) for SVG → PNG conversion. `sharp` is a dependency of the Canbox main project (`/depot/cargo/canbox`) and is not declared in `canbox-launcher/package.json`. It relies on Node.js module resolution walking up the directory tree to locate `sharp`.

### Usage

Run from the `canbox-launcher` directory:

```bash
node scripts/generate-logo.js
```

Successful output:

```
logo.png (48x48) - OK
logo_128x128.png (128x128) - OK
logo_256x256.png (256x256) - OK
logo_512x512.png (512x512) - OK
Done.
```

### Notes

- Must be executed from the `canbox-launcher/` directory, otherwise `path.join(__dirname, '..', 'logo.svg')` cannot locate the source file.
- If the Canbox main project dependencies are not installed (`npm install`), the `sharp` module will be unavailable and the script will exit with an error.
- Generated PNG files should be committed to the repository.

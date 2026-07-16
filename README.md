# PDF 小工具

这是一个基于 Node.js 的 PDF 工具，支持：

- 合并多个 PDF
- 压缩图片型 PDF，比如扫描件、画册、合同扫描版
- 批量处理文件夹里的 PDF
- Windows 下拖拽文件到 `.cmd` 脚本运行

## 环境要求

- Windows
- 已安装 `node`，并且可以在命令行里运行

首次使用前安装依赖：

```powershell
npm.cmd install
```

## 合并 PDF

按顺序合并多个 PDF：

```powershell
.\merge-pdf.cmd a.pdf b.pdf c.pdf
```

指定输出文件：

```powershell
.\merge-pdf.cmd -o merged.pdf a.pdf b.pdf
```

合并文件夹内所有 PDF：

```powershell
.\merge-pdf.cmd -o merged.pdf .\input-folder
```

覆盖已存在的输出文件：

```powershell
.\merge-pdf.cmd -f -o merged.pdf a.pdf b.pdf
```

如果不写 `-o`，默认会在第一个输入文件所在目录生成 `merged.pdf`。

## 压缩 PDF

默认压缩模式是 `image`，主要适合图片型 PDF，例如扫描件、画册、合同扫描版：

```powershell
.\compress-pdf.cmd scan.pdf
```

不写 `-o` 时，默认输出为：

```text
原文件名.compressed.pdf
```

指定输出文件：

```powershell
.\compress-pdf.cmd -o scan-small.pdf scan.pdf
```

更强压缩：

```powershell
.\compress-pdf.cmd --mode image --dpi 110 --quality 55 scan.pdf
```

扫描件常用灰度压缩：

```powershell
.\compress-pdf.cmd --mode image --grayscale --dpi 90 --quality 45 scan.pdf
```

压缩到较小体积时，可以继续降低 `--dpi` 和 `--quality`：

```powershell
.\compress-pdf.cmd --mode image --grayscale --dpi 80 --quality 35 -o output.pdf input.pdf
```

基础压缩模式：

```powershell
.\compress-pdf.cmd --mode basic report.pdf
```

`basic` 模式会尽量保留 PDF 原结构，但压缩幅度通常比 `image` 模式小。

## 常用参数

- `-o, --output <file>`：指定输出文件
- `-f, --force`：覆盖已有输出文件
- `--mode image`：图片压缩模式，默认模式，适合扫描件
- `--mode basic`：基础压缩模式，尽量保留原结构
- `--dpi <number>`：图片模式渲染清晰度，越低体积越小，默认 `120`
- `--quality <1-100>`：JPEG 图片质量，越低体积越小，默认 `60`
- `--max-side <pixels>`：限制页面最长边像素，默认 `2200`
- `--grayscale`：转为灰度，适合黑白扫描件和合同
- `--suffix <text>`：未指定 `-o` 时使用的输出文件后缀，默认 `.compressed`

## Windows 拖拽用法

合并 PDF：

把多个 PDF 文件拖到 `merge-pdf.cmd` 上，会按拖入顺序合并。

压缩 PDF：

把 PDF 文件拖到 `compress-pdf.cmd` 上，会按默认图片压缩参数生成 `原文件名.compressed.pdf`。

## 注意事项

- `image` 模式是有损压缩，会把每页重新渲染成图片。
- `image` 模式会丢失可选中文本、链接、表单、批注等 PDF 结构。
- `image` 模式适合扫描件、图片型合同、画册，不适合需要保留文字选择和链接的电子 PDF。
- 压缩目标很小时，建议使用 `--grayscale --dpi 90 --quality 45` 或更低参数。


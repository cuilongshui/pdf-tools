#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const { createCanvas } = require("@napi-rs/canvas");
const { PDFDocument } = require("pdf-lib");

const DEFAULT_MODE = "image";
const DEFAULT_DPI = 120;
const DEFAULT_QUALITY = 60;
const DEFAULT_MAX_SIDE = 2200;
const DEFAULT_SUFFIX = ".compressed";

let pdfjsModulePromise;

function printUsage() {
  console.log(`Usage:
  node compress-pdf.js [options] <pdf-or-folder> [more-pdfs-or-folders...]

Options:
  -m, --mode <basic|image>  Compression mode. Default: image
  -o, --output <file>       Output file, only valid for a single input PDF
  --suffix <text>           Output suffix when -o is omitted. Default: .compressed
  --dpi <number>            Render DPI for image mode. Default: 120
  -q, --quality <1-100>     JPEG quality for image mode. Default: 60
  --max-side <pixels>       Limit the longest rendered page side. Default: 2200
  -g, --grayscale           Convert rendered pages to grayscale in image mode
  -f, --force               Overwrite output if it already exists
  -h, --help                Show this help

Examples:
  node compress-pdf.js scan.pdf
  node compress-pdf.js -o scan-small.pdf scan.pdf
  node compress-pdf.js --mode image --dpi 110 --quality 55 .\\brochure.pdf
  node compress-pdf.js --mode basic .\\docs-folder

Notes:
  - image mode is best for scans, brochures, and other image-heavy PDFs.
  - image mode is lossy and will flatten text, links, forms, and annotations into page images.`);
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}

function sortPaths(values) {
  return [...values].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
  );
}

function parseInteger(value, optionName, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || String(parsed) !== String(value).trim()) {
    throw new Error(`invalid ${optionName}: ${value}`);
  }
  if (parsed < min || parsed > max) {
    throw new Error(`${optionName} must be between ${min} and ${max}`);
  }
  return parsed;
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function expandInput(inputPath) {
  const resolvedPath = path.resolve(inputPath);
  let stats;

  try {
    stats = await fs.stat(resolvedPath);
  } catch {
    throw new Error(`input not found: ${resolvedPath}`);
  }

  if (stats.isDirectory()) {
    const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
    const pdfFiles = sortPaths(
      entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
        .map((entry) => path.join(resolvedPath, entry.name)),
    );

    if (pdfFiles.length === 0) {
      throw new Error(`folder has no PDF files: ${resolvedPath}`);
    }

    return pdfFiles;
  }

  if (!stats.isFile()) {
    throw new Error(`not a file or folder: ${resolvedPath}`);
  }

  if (!resolvedPath.toLowerCase().endsWith(".pdf")) {
    throw new Error(`not a PDF file: ${resolvedPath}`);
  }

  return [resolvedPath];
}

function buildDefaultOutputFile(inputFile, suffix) {
  const parsedPath = path.parse(inputFile);
  return path.join(parsedPath.dir, `${parsedPath.name}${suffix}.pdf`);
}

function buildCompressionPlan(inputFiles, parsedArgs) {
  if (parsedArgs.output) {
    if (inputFiles.length !== 1) {
      throw new Error("--output can only be used with a single input PDF");
    }

    return [
      {
        inputFile: inputFiles[0],
        outputFile: path.resolve(parsedArgs.output),
      },
    ];
  }

  return inputFiles.map((inputFile) => ({
    inputFile,
    outputFile: buildDefaultOutputFile(inputFile, parsedArgs.suffix),
  }));
}

function parseArgs(argv) {
  const inputs = [];
  let mode = DEFAULT_MODE;
  let output = null;
  let suffix = DEFAULT_SUFFIX;
  let dpi = DEFAULT_DPI;
  let quality = DEFAULT_QUALITY;
  let maxSide = DEFAULT_MAX_SIDE;
  let grayscale = false;
  let force = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "-h" || arg === "--help") {
      return { help: true };
    }

    if (arg === "-f" || arg === "--force") {
      force = true;
      continue;
    }

    if (arg === "-g" || arg === "--grayscale") {
      grayscale = true;
      continue;
    }

    if (arg === "-m" || arg === "--mode") {
      index += 1;
      if (index >= argv.length) {
        throw new Error("missing value for --mode");
      }
      mode = argv[index];
      continue;
    }

    if (arg === "-o" || arg === "--output") {
      index += 1;
      if (index >= argv.length) {
        throw new Error("missing value for --output");
      }
      output = argv[index];
      continue;
    }

    if (arg === "--suffix") {
      index += 1;
      if (index >= argv.length) {
        throw new Error("missing value for --suffix");
      }
      suffix = argv[index];
      continue;
    }

    if (arg === "--dpi") {
      index += 1;
      if (index >= argv.length) {
        throw new Error("missing value for --dpi");
      }
      dpi = parseInteger(argv[index], "--dpi", { min: 36, max: 300 });
      continue;
    }

    if (arg === "-q" || arg === "--quality") {
      index += 1;
      if (index >= argv.length) {
        throw new Error("missing value for --quality");
      }
      quality = parseInteger(argv[index], "--quality", { min: 1, max: 100 });
      continue;
    }

    if (arg === "--max-side") {
      index += 1;
      if (index >= argv.length) {
        throw new Error("missing value for --max-side");
      }
      maxSide = parseInteger(argv[index], "--max-side", { min: 512, max: 6000 });
      continue;
    }

    inputs.push(arg);
  }

  if (!["basic", "image"].includes(mode)) {
    throw new Error(`unsupported mode: ${mode}`);
  }

  if (!suffix) {
    throw new Error("--suffix cannot be empty");
  }

  return {
    dpi,
    force,
    grayscale,
    help: false,
    inputs,
    maxSide,
    mode,
    output,
    quality,
    suffix,
  };
}

async function loadPdfJs() {
  pdfjsModulePromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsModulePromise;
}

function applyGrayscale(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
    data[index] = gray;
    data[index + 1] = gray;
    data[index + 2] = gray;
  }

  context.putImageData(imageData, 0, 0);
}

function getRenderScale(baseViewport, dpi, maxSide) {
  let scale = dpi / 72;
  const longestSide = Math.max(baseViewport.width * scale, baseViewport.height * scale);

  if (longestSide > maxSide) {
    scale *= maxSide / longestSide;
  }

  return scale;
}

async function compressPdfBasic(inputFile, outputFile) {
  const sourceBytes = await fs.readFile(inputFile);
  const sourcePdf = await PDFDocument.load(sourceBytes);
  const outputBytes = await sourcePdf.save({
    addDefaultPage: false,
    useObjectStreams: true,
  });

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, outputBytes);
}

async function compressPdfAsImages(inputFile, outputFile, options) {
  const pdfjs = await loadPdfJs();
  const sourceBytes = new Uint8Array(await fs.readFile(inputFile));
  const loadingTask = pdfjs.getDocument({ data: sourceBytes });
  const sourcePdf = await loadingTask.promise;
  const outputPdf = await PDFDocument.create();

  try {
    for (let pageNumber = 1; pageNumber <= sourcePdf.numPages; pageNumber += 1) {
      const sourcePage = await sourcePdf.getPage(pageNumber);
      const baseViewport = sourcePage.getViewport({ scale: 1 });
      const scale = getRenderScale(baseViewport, options.dpi, options.maxSide);
      const renderViewport = sourcePage.getViewport({ scale });
      const canvasWidth = Math.max(1, Math.ceil(renderViewport.width));
      const canvasHeight = Math.max(1, Math.ceil(renderViewport.height));
      const canvas = createCanvas(canvasWidth, canvasHeight);
      const context = canvas.getContext("2d");

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvasWidth, canvasHeight);

      await sourcePage.render({
        canvasContext: context,
        viewport: renderViewport,
      }).promise;

      if (options.grayscale) {
        applyGrayscale(context, canvasWidth, canvasHeight);
      }

      const jpegBytes = await canvas.encode("jpeg", options.quality);
      const image = await outputPdf.embedJpg(jpegBytes);
      const outputPage = outputPdf.addPage([baseViewport.width, baseViewport.height]);

      outputPage.drawImage(image, {
        height: outputPage.getHeight(),
        width: outputPage.getWidth(),
        x: 0,
        y: 0,
      });

      sourcePage.cleanup();
    }

    const outputBytes = await outputPdf.save({
      addDefaultPage: false,
      useObjectStreams: true,
    });

    await fs.mkdir(path.dirname(outputFile), { recursive: true });
    await fs.writeFile(outputFile, outputBytes);
  } finally {
    await sourcePdf.cleanup();
    await loadingTask.destroy();
  }
}

async function main() {
  let parsedArgs;

  try {
    parsedArgs = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
    printUsage();
    return;
  }

  if (parsedArgs.help) {
    printUsage();
    return;
  }

  if (parsedArgs.inputs.length === 0) {
    printUsage();
    return;
  }

  const inputFiles = [];

  try {
    for (const input of parsedArgs.inputs) {
      const resolvedInputs = await expandInput(input);
      inputFiles.push(...resolvedInputs);
    }
  } catch (error) {
    fail(error.message);
    return;
  }

  let plan;

  try {
    plan = buildCompressionPlan(inputFiles, parsedArgs);
  } catch (error) {
    fail(error.message);
    return;
  }

  for (const { inputFile, outputFile } of plan) {
    const inputFileLower = inputFile.toLowerCase();
    const outputFileLower = outputFile.toLowerCase();

    if (inputFileLower === outputFileLower) {
      fail("output file cannot be the same as an input file");
      return;
    }

    if ((await fileExists(outputFile)) && !parsedArgs.force) {
      fail(`output already exists: ${outputFile}. Use --force to overwrite.`);
      return;
    }
  }

  for (const { inputFile, outputFile } of plan) {
    try {
      if (parsedArgs.mode === "basic") {
        await compressPdfBasic(inputFile, outputFile);
      } else {
        await compressPdfAsImages(inputFile, outputFile, parsedArgs);
      }
    } catch (error) {
      fail(`${path.basename(inputFile)}: ${error.message}`);
      return;
    }

    const [inputStats, outputStats] = await Promise.all([
      fs.stat(inputFile),
      fs.stat(outputFile),
    ]);
    const savedBytes = inputStats.size - outputStats.size;
    const savedPercent = inputStats.size === 0 ? 0 : (savedBytes / inputStats.size) * 100;

    console.log(
      `${path.basename(inputFile)} -> ${outputFile} (${inputStats.size} -> ${outputStats.size} bytes, ${savedPercent.toFixed(1)}%)`,
    );
  }
}

main();

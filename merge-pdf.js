#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const { PDFDocument } = require("pdf-lib");

function printUsage() {
  console.log(`Usage:
  node merge-pdf.js [options] <pdf-or-folder> [more-pdfs-or-folders...]

Options:
  -o, --output <file>  Output PDF path. Default: merged.pdf next to the first input
  -f, --force          Overwrite output if it already exists
  -h, --help           Show this help

Examples:
  node merge-pdf.js a.pdf b.pdf c.pdf
  node merge-pdf.js -o final.pdf .\\chapter1.pdf .\\chapter2.pdf
  node merge-pdf.js -o merged.pdf .\\input-folder

Tips:
  - You can drag PDF files onto merge-pdf.cmd on Windows.
  - Folder inputs will include all .pdf files in that folder, sorted by name.`);
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

function parseArgs(argv) {
  const inputs = [];
  let output = null;
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

    if (arg === "-o" || arg === "--output") {
      index += 1;
      if (index >= argv.length) {
        throw new Error("missing value for --output");
      }
      output = argv[index];
      continue;
    }

    inputs.push(arg);
  }

  return {
    help: false,
    force,
    inputs,
    output,
  };
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function mergePdfFiles(inputFiles, outputFile) {
  const merged = await PDFDocument.create();

  for (const inputFile of inputFiles) {
    const bytes = await fs.readFile(inputFile);
    const sourcePdf = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(sourcePdf, sourcePdf.getPageIndices());

    for (const page of pages) {
      merged.addPage(page);
    }
  }

  const mergedBytes = await merged.save();
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, mergedBytes);
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

  const expandedInputs = [];

  try {
    for (const input of parsedArgs.inputs) {
      const resolvedInputs = await expandInput(input);
      expandedInputs.push(...resolvedInputs);
    }
  } catch (error) {
    fail(error.message);
    return;
  }

  const outputFile = parsedArgs.output
    ? path.resolve(parsedArgs.output)
    : path.join(path.dirname(expandedInputs[0]), "merged.pdf");
  const outputFileLower = outputFile.toLowerCase();

  if (expandedInputs.some((file) => file.toLowerCase() === outputFileLower)) {
    fail("output file cannot be the same as an input file");
    return;
  }

  if ((await fileExists(outputFile)) && !parsedArgs.force) {
    fail(`output already exists: ${outputFile}. Use --force to overwrite.`);
    return;
  }

  try {
    await mergePdfFiles(expandedInputs, outputFile);
  } catch (error) {
    fail(error.message);
    return;
  }

  console.log(`Merged ${expandedInputs.length} file(s) into: ${outputFile}`);
}

main();

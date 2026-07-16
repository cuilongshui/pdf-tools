const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { PDFDocument } = require("pdf-lib");

async function createPdf(filePath, pageSizes) {
  const pdf = await PDFDocument.create();

  for (const [width, height] of pageSizes) {
    pdf.addPage([width, height]);
  }

  const bytes = await pdf.save();
  await fs.writeFile(filePath, bytes);
}

test("merge-pdf.js merges input files in the provided order", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "merge-pdf-"));
  const first = path.join(workspace, "01-first.pdf");
  const second = path.join(workspace, "02-second.pdf");
  const output = path.join(workspace, "merged.pdf");

  await createPdf(first, [
    [200, 300],
    [210, 310],
  ]);
  await createPdf(second, [[400, 500]]);

  const result = spawnSync(
    process.execPath,
    [path.resolve(__dirname, "..", "merge-pdf.js"), "-o", output, first, second],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const merged = await PDFDocument.load(await fs.readFile(output));
  const pageSizes = merged.getPages().map((page) => page.getSize());

  assert.equal(merged.getPageCount(), 3);
  assert.deepEqual(pageSizes, [
    { width: 200, height: 300 },
    { width: 210, height: 310 },
    { width: 400, height: 500 },
  ]);
});

test("merge-pdf.js expands folder inputs using filename order", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "merge-pdf-folder-"));
  const inputFolder = path.join(workspace, "input");
  const output = path.join(workspace, "folder-merged.pdf");

  await fs.mkdir(inputFolder);
  await createPdf(path.join(inputFolder, "10-last.pdf"), [[600, 700]]);
  await createPdf(path.join(inputFolder, "2-middle.pdf"), [[400, 500]]);
  await createPdf(path.join(inputFolder, "1-first.pdf"), [[200, 300]]);

  const result = spawnSync(
    process.execPath,
    [path.resolve(__dirname, "..", "merge-pdf.js"), "-o", output, inputFolder],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const merged = await PDFDocument.load(await fs.readFile(output));
  const pageSizes = merged.getPages().map((page) => page.getSize());

  assert.deepEqual(pageSizes, [
    { width: 200, height: 300 },
    { width: 400, height: 500 },
    { width: 600, height: 700 },
  ]);
});

test("merge-pdf.js writes merged.pdf next to the first input when output is omitted", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "merge-pdf-default-output-"));
  const first = path.join(workspace, "a.pdf");
  const second = path.join(workspace, "b.pdf");
  const output = path.join(workspace, "merged.pdf");

  await createPdf(first, [[100, 200]]);
  await createPdf(second, [[300, 400]]);

  const result = spawnSync(
    process.execPath,
    [path.resolve(__dirname, "..", "merge-pdf.js"), first, second],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const merged = await PDFDocument.load(await fs.readFile(output));
  assert.equal(merged.getPageCount(), 2);
});

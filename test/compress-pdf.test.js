const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { createCanvas } = require("@napi-rs/canvas");
const { PDFDocument } = require("pdf-lib");

async function createNoisyPng(width, height) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  const imageData = context.createImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      imageData.data[index] = (x * 17 + y * 11) % 256;
      imageData.data[index + 1] = (x * 7 + y * 19) % 256;
      imageData.data[index + 2] = (x * 29 + y * 3) % 256;
      imageData.data[index + 3] = 255;
    }
  }

  context.putImageData(imageData, 0, 0);
  return canvas.encode("png");
}

async function createImageHeavyPdf(filePath) {
  const pdf = await PDFDocument.create();
  const png = await createNoisyPng(900, 1200);
  const image = await pdf.embedPng(png);

  for (let pageIndex = 0; pageIndex < 2; pageIndex += 1) {
    const page = pdf.addPage([595, 842]);
    page.drawImage(image, {
      height: page.getHeight(),
      width: page.getWidth(),
      x: 0,
      y: 0,
    });
  }

  await fs.writeFile(filePath, await pdf.save());
}

test("compress-pdf.js basic mode preserves page count", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "compress-pdf-basic-"));
  const input = path.join(workspace, "input.pdf");
  const output = path.join(workspace, "output.pdf");

  await createImageHeavyPdf(input);

  const result = spawnSync(
    process.execPath,
    [path.resolve(__dirname, "..", "compress-pdf.js"), "--mode", "basic", "-o", output, input],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const compressed = await PDFDocument.load(await fs.readFile(output));
  assert.equal(compressed.getPageCount(), 2);
});

test("compress-pdf.js image mode reduces size for image-heavy PDFs", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "compress-pdf-image-"));
  const input = path.join(workspace, "input.pdf");
  const output = path.join(workspace, "output.pdf");

  await createImageHeavyPdf(input);

  const result = spawnSync(
    process.execPath,
    [
      path.resolve(__dirname, "..", "compress-pdf.js"),
      "--mode",
      "image",
      "--dpi",
      "110",
      "--quality",
      "55",
      "-o",
      output,
      input,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const [inputStats, outputStats] = await Promise.all([fs.stat(input), fs.stat(output)]);
  const compressed = await PDFDocument.load(await fs.readFile(output));

  assert.equal(compressed.getPageCount(), 2);
  assert.ok(outputStats.size < inputStats.size, `${outputStats.size} should be smaller than ${inputStats.size}`);
});

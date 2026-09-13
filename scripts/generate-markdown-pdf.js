const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const inputArg = process.argv[2];
const outputArg = process.argv[3];

if (!inputArg || !outputArg) {
  console.error('Usage: node scripts/generate-markdown-pdf.js <input.md> <output.pdf>');
  process.exit(1);
}

const inputPath = path.resolve(repoRoot, inputArg);
const outputPath = path.resolve(repoRoot, outputArg);
const markdown = fs.readFileSync(inputPath, 'utf8');

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 50;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 48;
const MAX_Y = PAGE_HEIGHT - MARGIN_TOP;
const MIN_Y = MARGIN_BOTTOM;

const escapePdfText = (value) => String(value)
  .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '-')
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)');

const cleanInline = (value) => String(value)
  .replace(/\*\*/g, '')
  .replace(/`/g, '')
  .trim();

const wrapText = (text, maxChars) => {
  const raw = cleanInline(text);
  if (!raw) return [''];
  const words = raw.split(/\s+/);
  const lines = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (`${current} ${word}`.length <= maxChars) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
};

const splitCodeLine = (line, maxChars) => {
  const text = String(line || '');
  if (text.length <= maxChars) return [text];
  const lines = [];
  for (let i = 0; i < text.length; i += maxChars) {
    lines.push(text.slice(i, i + maxChars));
  }
  return lines;
};

const buildRenderableLines = (source) => {
  const renderLines = [];
  let inCode = false;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, '  ');

    if (line.trim().startsWith('```')) {
      inCode = !inCode;
      renderLines.push({ style: 'space', height: 5 });
      continue;
    }

    if (inCode) {
      for (const codeLine of splitCodeLine(line, 84)) {
        renderLines.push({ text: codeLine || ' ', style: 'code' });
      }
      continue;
    }

    if (!line.trim()) {
      renderLines.push({ style: 'space', height: 7 });
      continue;
    }

    if (line.startsWith('# ')) {
      renderLines.push({ text: line.slice(2).trim(), style: 'title' });
      continue;
    }

    if (line.startsWith('## ')) {
      renderLines.push({ text: line.slice(3).trim(), style: 'heading' });
      continue;
    }

    const bulletMatch = line.match(/^(\d+\.|-)\s+(.*)$/);
    if (bulletMatch) {
      const prefix = `${bulletMatch[1]} `;
      const wrapped = wrapText(bulletMatch[2], 86);
      wrapped.forEach((wrappedLine, index) => {
        renderLines.push({
          text: `${index === 0 ? prefix : '   '}${wrappedLine}`,
          style: 'body',
        });
      });
      continue;
    }

    for (const wrappedLine of wrapText(line, 92)) {
      renderLines.push({ text: wrappedLine, style: 'body' });
    }
  }

  return renderLines;
};

const styleFor = (style) => {
  if (style === 'title') return { font: 'F2', size: 20, lineHeight: 26, before: 0, after: 10 };
  if (style === 'heading') return { font: 'F2', size: 13.5, lineHeight: 18, before: 9, after: 4 };
  if (style === 'code') return { font: 'F3', size: 8.3, lineHeight: 11.5, before: 0, after: 0, xOffset: 10 };
  return { font: 'F1', size: 10.2, lineHeight: 14.5, before: 0, after: 2, xOffset: 0 };
};

const paginate = (renderLines) => {
  const pages = [[]];
  let y = MAX_Y;

  const addPage = () => {
    pages.push([]);
    y = MAX_Y;
  };

  for (const line of renderLines) {
    if (line.style === 'space') {
      y -= line.height || 7;
      if (y < MIN_Y) addPage();
      continue;
    }

    const style = styleFor(line.style);
    const needed = style.before + style.lineHeight + style.after;
    if (y - needed < MIN_Y) addPage();

    y -= style.before;
    pages[pages.length - 1].push({ ...line, y, style });
    y -= style.lineHeight + style.after;
  }

  return pages.filter((page) => page.length > 0);
};

const buildPdf = (source) => {
  const pages = paginate(buildRenderableLines(source));
  const objects = [];

  const addObject = (content) => {
    objects.push(content);
    return objects.length;
  };

  const catalogId = addObject('');
  const pagesId = addObject('');
  const font1Id = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const font2Id = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const font3Id = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
  const pageIds = [];

  pages.forEach((page, pageIndex) => {
    const commands = [];
    page.forEach((line) => {
      const { font, size, xOffset } = line.style;
      const x = MARGIN_X + (xOffset || 0);
      commands.push(`BT /${font} ${size} Tf ${x.toFixed(2)} ${line.y.toFixed(2)} Td (${escapePdfText(line.text)}) Tj ET`);
    });

    const pageLabel = `Page ${pageIndex + 1} of ${pages.length}`;
    commands.push(`BT /F1 8 Tf ${MARGIN_X.toFixed(2)} 28 Td (${escapePdfText(pageLabel)}) Tj ET`);

    const stream = commands.join('\n');
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${font1Id} 0 R /F2 ${font2Id} 0 R /F3 ${font3Id} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((content, index) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${index + 1} 0 obj\n${content}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, buildPdf(markdown));
console.log(outputPath);

#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SHOULD_FIX = process.argv.includes('--fix');

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.css',
  '.html',
  '.json',
  '.md',
  '.txt',
  '.yml',
  '.yaml'
]);

const EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.vite',
  '.idea',
  '.vscode'
]);

const CP1252_SPECIAL_TO_BYTE = new Map([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f]
]);

const ISSUE_PATTERNS = [
  {
    type: 'replacement_char',
    regex: /\uFFFD/g,
    message: 'Found replacement char (U+FFFD)'
  },
  {
    type: 'c1_controls',
    regex: /[\u0080-\u009F]/g,
    message: 'Found C1 control characters'
  },
  {
    type: 'mojibake_utf8_cp1252',
    regex: /(?:[ÐÑÃÂ][\u00A0-\u024F])|(?:[РС][\u00A0-\u024F])/g,
    message: 'Found suspicious mojibake sequence'
  }
];

function walk(dirPath, acc = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.editorconfig' && entry.name !== '.gitattributes') {
      continue;
    }
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      walk(path.join(dirPath, entry.name), acc);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) continue;
    acc.push(path.join(dirPath, entry.name));
  }
  return acc;
}

function formatRel(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function hasUtf8Bom(buffer) {
  return (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  );
}

function getScore(text) {
  let score = 0;
  score += (text.match(/\uFFFD/g) || []).length * 4;
  score += (text.match(/[\u0080-\u009F]/g) || []).length * 3;
  score += (text.match(/(?:[ÐÑÃÂ][\u00A0-\u024F])|(?:[РС][\u00A0-\u024F])/g) || []).length * 2;
  return score;
}

function encodeCp1252Byte(charCode) {
  if (charCode <= 0x7f) return charCode;
  if (charCode >= 0xa0 && charCode <= 0xff) return charCode;
  return CP1252_SPECIAL_TO_BYTE.get(charCode);
}

function tryRepairMojibake(text) {
  const bytes = [];
  for (const char of text) {
    const charCode = char.codePointAt(0);
    if (charCode === undefined) return null;
    const encoded = encodeCp1252Byte(charCode);
    if (encoded === undefined) return null;
    bytes.push(encoded);
  }
  const decoded = Buffer.from(bytes).toString('utf8');
  const before = getScore(text);
  const after = getScore(decoded);
  if (after >= before) return null;
  return decoded;
}

function collectLineIssues(fileText, baseIssue) {
  const lines = fileText.split(/\r?\n/);
  const issues = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    baseIssue.regex.lastIndex = 0;
    let match;
    let perLineLimit = 0;
    while ((match = baseIssue.regex.exec(line)) !== null) {
      const col = match.index + 1;
      issues.push({
        type: baseIssue.type,
        message: baseIssue.message,
        line: lineIndex + 1,
        col,
        sample: line.slice(Math.max(0, col - 1), Math.min(line.length, col + 20))
      });
      perLineLimit += 1;
      if (perLineLimit >= 3) break;
    }
  }
  return issues;
}

function findIssues(fileText) {
  const all = [];
  for (const pattern of ISSUE_PATTERNS) {
    const lineIssues = collectLineIssues(fileText, pattern);
    all.push(...lineIssues);
  }
  return all;
}

function writeUtf8NoBom(filePath, text) {
  fs.writeFileSync(filePath, text, { encoding: 'utf8' });
}

function main() {
  const files = walk(ROOT);
  const report = [];
  let fixedCount = 0;
  let checkedCount = 0;

  for (const filePath of files) {
    checkedCount += 1;
    const raw = fs.readFileSync(filePath);
    const rel = formatRel(filePath);
    let bom = hasUtf8Bom(raw);
    let text = raw.toString('utf8');
    let changed = false;

    if (SHOULD_FIX && bom) {
      text = text.replace(/^\uFEFF/, '');
      bom = false;
      changed = true;
    }

    let issues = findIssues(text);
    if (SHOULD_FIX && issues.some((i) => i.type === 'mojibake_utf8_cp1252')) {
      const repaired = tryRepairMojibake(text);
      if (repaired !== null) {
        const repairedIssues = findIssues(repaired);
        if (repairedIssues.length < issues.length) {
          text = repaired;
          issues = repairedIssues;
          changed = true;
        }
      }
    }

    if (SHOULD_FIX && changed) {
      writeUtf8NoBom(filePath, text);
      fixedCount += 1;
    }

    if (bom || issues.length > 0) {
      report.push({
        file: rel,
        bom,
        issues
      });
    }
  }

  if (report.length === 0) {
    if (SHOULD_FIX) {
      console.log(`Encoding check passed. Files checked: ${checkedCount}. Auto-fixed: ${fixedCount}.`);
    } else {
      console.log(`Encoding check passed. Files checked: ${checkedCount}.`);
    }
    process.exit(0);
  }

  console.error(`Encoding issues found in ${report.length} file(s).`);
  for (const entry of report) {
    console.error(`- ${entry.file}`);
    if (entry.bom) {
      console.error('  * utf8_bom: File has UTF-8 BOM');
    }
    for (const issue of entry.issues.slice(0, 20)) {
      console.error(
        `  * ${issue.type} at ${issue.line}:${issue.col} - ${issue.message} | "${issue.sample}"`
      );
    }
    if (entry.issues.length > 20) {
      console.error(`  * ... and ${entry.issues.length - 20} more issue(s)`);
    }
  }

  if (SHOULD_FIX) {
    console.error(`Auto-fixed files: ${fixedCount}. Re-run check to verify clean state.`);
  }
  process.exit(1);
}

main();

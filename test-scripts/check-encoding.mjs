#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FIX_MODE = process.argv.includes('--fix');

const ROOTS = ['src', 'public'];
const EXTRA_FILES = [
  '.editorconfig',
  '.gitattributes',
  'package.json',
  'README.md',
  'index.html'
];

const ALLOWED_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.html', '.json', '.md']);
const MOJIBAKE_RE = /[ÐÑ]/;
const CONTROL_RE = /[\u0080-\u009F]/;
const REPLACEMENT_RE = /\uFFFD/;

function isAllowedFile(p) {
  return ALLOWED_EXT.has(path.extname(p).toLowerCase());
}

function walk(dir) {
  const result = [];
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...walk(full));
      continue;
    }
    if (entry.isFile() && isAllowedFile(full)) {
      result.push(full);
    }
  }
  return result;
}

function stripBom(file) {
  const raw = fs.readFileSync(file);
  if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
    fs.writeFileSync(file, raw.subarray(3));
    return true;
  }
  return false;
}

function lineFlags(text) {
  if (CONTROL_RE.test(text)) return 'control(U+0080..U+009F)';
  if (REPLACEMENT_RE.test(text)) return 'replacement(U+FFFD)';
  if (MOJIBAKE_RE.test(text)) return 'mojibake(Ð/Ñ)';
  return '';
}

const files = [
  ...ROOTS.flatMap((r) => walk(path.join(ROOT, r))),
  ...EXTRA_FILES.map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f))
];

const errors = [];
let fixedBomCount = 0;

for (const file of files) {
  if (FIX_MODE && stripBom(file)) {
    fixedBomCount += 1;
  }

  const rel = path.relative(ROOT, file);
  const content = fs.readFileSync(file, 'utf8');

  if (content.charCodeAt(0) === 0xfeff) {
    errors.push(`${rel}:1 BOM`);
  }

  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const flag = lineFlags(line);
    if (flag) {
      errors.push(`${rel}:${idx + 1} ${flag}`);
    }
  });
}

if (fixedBomCount > 0) {
  console.log(`Fixed BOM in ${fixedBomCount} file(s).`);
}

if (errors.length > 0) {
  console.error('Encoding check failed:');
  for (const item of errors) console.error(`- ${item}`);
  process.exit(1);
}

console.log('Encoding check passed.');

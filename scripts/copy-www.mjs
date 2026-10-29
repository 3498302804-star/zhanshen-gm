// 把上一级的网页资源复制进 ios-app/www，供 Capacitor 打包。
// 用法：node scripts/copy-www.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '..', '..'); // 斩神跑团台/
const dst = path.resolve(here, '..', 'www');

const INCLUDE_DIRS = ['assets', 'data'];
const INCLUDE_FILES = ['index.html', 'manifest.webmanifest', 'service-worker.js'];
const SKIP = new Set();

async function rmrf(p) {
  await fs.rm(p, { recursive: true, force: true });
}

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  for (const ent of await fs.readdir(from, { withFileTypes: true })) {
    if (SKIP.has(ent.name)) continue;
    const a = path.join(from, ent.name);
    const b = path.join(to, ent.name);
    if (ent.isDirectory()) await copyDir(a, b);
    else await fs.copyFile(a, b);
  }
}

async function main() {
  await rmrf(dst);
  await fs.mkdir(dst, { recursive: true });

  for (const d of INCLUDE_DIRS) {
    const from = path.join(src, d);
    try {
      await copyDir(from, path.join(dst, d));
      console.log('copied dir ', d);
    } catch (e) {
      console.warn('skip dir', d, e.message);
    }
  }
  for (const f of INCLUDE_FILES) {
    try {
      await fs.copyFile(path.join(src, f), path.join(dst, f));
      console.log('copied file', f);
    } catch (e) {
      console.warn('skip file', f, e.message);
    }
  }

  // 统计体积
  let total = 0;
  let count = 0;
  async function walk(d) {
    for (const ent of await fs.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) await walk(p);
      else {
        total += (await fs.stat(p)).size;
        count++;
      }
    }
  }
  await walk(dst);
  console.log(`\nwww 就绪：${count} 个文件，${(total / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
// Patch Prisma generated client for CJS compatibility
// - Replaces import.meta.url with __dirname
// - Removes .js extensions from imports

const fs = require('fs');
const path = require('path');

const generatedDir = path.resolve(__dirname, '../src/generated');

function walkDir(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(fullPath));
    } else if (entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = walkDir(generatedDir);
for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  let modified = false;

  // Patch 1: Remove import.meta.url references
  // Replace patterns like: path.dirname(fileURLToPath(import.meta.url))
  if (content.includes('import.meta.url')) {
    content = content.replace(
      /globalThis\['__dirname'\]\s*=\s*path\.dirname\(fileURLToPath\(import\.meta\.url\)\)/g,
      "globalThis['__dirname'] = __dirname",
    );
    // Remove unused fileURLToPath import if __dirname is set elsewhere
    content = content.replace(
      /import\s*\{[^}]*fileURLToPath[^}]*\}\s*from\s*['"]node:url['"];?\n?/g,
      '',
    );
    modified = true;
  }

  // Patch 2: Remove .js extensions from imports (CJS compatibility)
  content = content.replace(/from\s+['"]([^'"]+)\.js['"]/g, "from '$1'");
  content = content.replace(/from\s+\"([^\"]+)\.js\"/g, 'from "$1"');

  if (content !== fs.readFileSync(file, 'utf-8')) {
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(file, content, 'utf-8');
    console.log(`  patched: ${path.relative(generatedDir, file)}`);
  }
}

console.log(`Prisma client patched: ${files.length} files scanned`);

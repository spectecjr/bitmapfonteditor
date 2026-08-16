#!/usr/bin/env node
/**
 * Converts docs/user-guide.md and docs/file-formats.md into standalone,
 * dark-themed HTML pages for Help ▸ User Guide / File Formats Reference to
 * load directly — no script, no network, matching the read-only viewer they
 * open in. Runs before both `dev` and `build` (see package.json's `predev`/
 * `prebuild`), so the in-app copy can never go stale relative to docs/*.md.
 *
 * Output lands in src/renderer/public/docs/, which Vite copies verbatim into
 * the build (electron-vite's renderer root is src/renderer, and `public/` is
 * Vite's default static-asset directory relative to that root) — no bundler
 * entry point needed, since these pages carry no JS of their own.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'

const root = fileURLToPath(new URL('..', import.meta.url))
const outDir = join(root, 'src/renderer/public/docs')

const PAGES = [
  { slug: 'user-guide', source: 'docs/user-guide.md', title: 'User Guide' },
  { slug: 'file-formats', source: 'docs/file-formats.md', title: 'File Formats Reference' }
]

/** Same convention GitHub uses for heading anchors — matches the hand-written ToC links in user-guide.md. */
function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
}

function buildRenderer() {
  const renderer = new marked.Renderer()

  renderer.heading = function (token) {
    const html = this.parser.parseInline(token.tokens)
    const id = slugify(token.text)
    return `<h${token.depth} id="${id}">${html}</h${token.depth}>\n`
  }

  // The two docs link to each other as .md — inside the app they're sibling
  // .html pages, so only the extension needs to change, fragments and all.
  renderer.link = function (token) {
    const href = token.href.replace(/\.md(#|$)/, '.html$1')
    const html = this.parser.parseInline(token.tokens)
    const title = token.title ? ` title="${token.title}"` : ''
    return `<a href="${href}"${title}>${html}</a>`
  }

  return renderer
}

function page(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'unsafe-inline'; script-src 'none'" />
<title>${title} — Font Editor</title>
<style>
  :root {
    --bg: #1b1c1f;
    --panel: #212328;
    --panel-alt: #191a1e;
    --line: #34373e;
    --text: #dfe1e6;
    --text-dim: #8d929c;
    --accent: #e0533d;
    color-scheme: dark;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font: 15px/1.6 'Segoe UI', system-ui, sans-serif;
    padding: 32px clamp(16px, 6vw, 96px) 96px;
  }
  article { max-width: 760px; margin: 0 auto; }
  h1, h2, h3 { line-height: 1.25; scroll-margin-top: 16px; }
  h1 { font-size: 1.6em; border-bottom: 1px solid var(--line); padding-bottom: 10px; }
  h2 { font-size: 1.3em; margin-top: 2em; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
  h3 { font-size: 1.05em; margin-top: 1.6em; }
  a { color: #7fb3e0; }
  a:hover { color: var(--accent); }
  code, pre { font-family: Consolas, 'Cascadia Mono', monospace; }
  code { background: var(--panel-alt); padding: 0.1em 0.4em; border-radius: 3px; font-size: 0.92em; }
  pre { background: var(--panel-alt); border: 1px solid var(--line); border-radius: 6px; padding: 12px 14px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote {
    margin: 1em 0; padding: 4px 16px; border-left: 3px solid var(--accent);
    background: var(--panel); color: var(--text-dim);
  }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid var(--line); padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: var(--panel); }
  tr:nth-child(even) td { background: rgb(255 255 255 / 2%); }
  ul, ol { padding-left: 1.4em; }
  li { margin: 0.3em 0; }
  hr { border: none; border-top: 1px solid var(--line); margin: 2em 0; }
</style>
</head>
<body>
<article>
${bodyHtml}
</article>
</body>
</html>
`
}

await mkdir(outDir, { recursive: true })

for (const { slug, source, title } of PAGES) {
  const markdown = await readFile(join(root, source), 'utf8')
  const body = marked.parse(markdown, { renderer: buildRenderer() })
  const target = join(outDir, `${slug}.html`)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, page(title, body), 'utf8')
  console.log(`wrote ${target}`)
}

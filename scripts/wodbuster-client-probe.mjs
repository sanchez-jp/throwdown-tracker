#!/usr/bin/env node
/**
 * Second-stage WodBuster diagnostic.
 * Saves raw public HTML and client resource hints; it never infers or publishes results.
 */
import { mkdir, writeFile } from "node:fs/promises";

const pages = [
  { key: "general", url: "https://arena.wodbuster.com/competition.aspx?id=4282&idd=18412&idw=" },
  { key: "wod1a", url: "https://arena.wodbuster.com/competition.aspx?id=4282&idd=18412&idw=-66076" },
  { key: "wod1b", url: "https://arena.wodbuster.com/competition.aspx?id=4282&idd=18412&idw=-66077" },
  { key: "wod2", url: "https://arena.wodbuster.com/competition.aspx?id=4282&idd=18412&idw=65398" },
  { key: "wod3", url: "https://arena.wodbuster.com/competition.aspx?id=4282&idd=18412&idw=65410" },
  { key: "wod4", url: "https://arena.wodbuster.com/competition.aspx?id=4282&idd=18412&idw=65422" },
];
const decode = s => s.replace(/&amp;/gi, "&").replace(/&#39;/gi, "'").replace(/&quot;/gi, '"');
const clean = s => decode(s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
const resolve = (value, pageUrl) => {
  try { return new URL(decode(value), pageUrl).href; } catch { return null; }
};
const keyword = /ajax|fetch\s*\(|\$\s*\.\s*ajax|XMLHttpRequest|DataTable|competition|clasific|ranking|result|puntuaci|position|webmethod|handler|\.ashx|\.asmx|api\//i;

async function inspect(page) {
  const response = await fetch(page.url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; ThrowdownTracker/1.0; +https://github.com/sanchez-jp/throwdown-tracker)",
      "accept": "text/html,application/xhtml+xml"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(25000)
  });
  const html = await response.text();
  const dir = `wodbuster-html/${page.key}`;
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/page.html`, html);

  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((m, i) => {
    const src = (m[1].match(/\bsrc\s*=\s*["']([^"']+)/i) || [])[1];
    const body = m[2] || "";
    const hits = [];
    for (const line of body.split(/\r?\n/)) {
      if (keyword.test(line)) hits.push(line.trim().slice(0, 700));
      if (hits.length >= 30) break;
    }
    return { index: i, src: src ? resolve(src, response.url) : null, inlineBytes: Buffer.byteLength(body), keywordLines: hits };
  });
  const resources = [...html.matchAll(/<(?:script|iframe|link)\b([^>]+)>/gi)].map(m => {
    const tag = m[0].slice(1, m[0].indexOf(" "));
    const attr = tag === "script" || tag === "iframe" ? "src" : "href";
    const value = (m[1].match(tag === "link" ? /\bhref\s*=\s*["']([^"']+)/i : /\bsrc\s*=\s*["']([^"']+)/i) || [])[1];
    return value ? { tag, url: resolve(value, response.url), rel: (m[1].match(/\brel\s*=\s*["']([^"']+)/i) || [])[1] || null } : null;
  }).filter(Boolean);
  const forms = [...html.matchAll(/<form\b([^>]*)>/gi)].map(m => ({
    action: (m[1].match(/\baction\s*=\s*["']([^"']*)/i) || [])[1] || "",
    method: (m[1].match(/\bmethod\s*=\s*["']([^"']*)/i) || [])[1] || "GET",
    id: (m[1].match(/\bid\s*=\s*["']([^"']*)/i) || [])[1] || null
  }));
  const iframes = [...html.matchAll(/<iframe\b([^>]*)>/gi)].map(m => (m[1].match(/\bsrc\s*=\s*["']([^"']+)/i) || [])[1]).filter(Boolean).map(x => resolve(x, response.url));
  const dataScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(m => /application\/(?:ld\+)?json|json/i.test(m[1]))
    .map(m => ({ type: (m[1].match(/\btype\s*=\s*["']([^"']+)/i) || [])[1] || null, bytes: Buffer.byteLength(m[2]), preview: m[2].slice(0, 1200) }));
  const visibleText = clean(html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " "));
  return {
    key: page.key, requestedUrl: page.url, finalUrl: response.url, status: response.status,
    contentType: response.headers.get("content-type"), htmlBytes: Buffer.byteLength(html),
    title: clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ""])[1] || ""),
    scripts, resources, forms, iframes, dataScripts,
    textMentions: visibleText.match(/.{0,100}(?:clasific|ranking|result|VENI VIDI|WOD|equipo).{0,180}/gi)?.slice(0, 30) || [],
    htmlFile: `${dir}/page.html`
  };
}

const results = await Promise.all(pages.map(async page => {
  try { return await inspect(page); }
  catch (error) { return { key: page.key, requestedUrl: page.url, error: String(error) }; }
}));
const report = {
  generatedAt: new Date().toISOString(),
  purpose: "Diagnostic only. Raw public HTML and client resource hints; no ranking or points are inferred or published.",
  pages: results
};
await writeFile("wodbuster-client-probe.json", JSON.stringify(report, null, 2) + "\n");
for (const p of results) console.log(JSON.stringify({
  key: p.key, status: p.status ?? null, htmlBytes: p.htmlBytes ?? null,
  scripts: p.scripts?.length ?? 0, externalScripts: p.scripts?.filter(s => s.src).length ?? 0,
  iframes: p.iframes?.length ?? 0, jsonBlocks: p.dataScripts?.length ?? 0, error: p.error ?? null
}));

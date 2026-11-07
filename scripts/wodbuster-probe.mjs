#!/usr/bin/env node
/**
 * Diagnostic probe for WodBuster Arena.
 * Intentionally does not infer ranks or scores: it records the table headers
 * and the exact row containing our team so selectors can be verified first.
 */
import { writeFile } from "node:fs/promises";

const TEAM = "VENI VIDI REGULINCHI";
const pages = [
  { key: "general", url: "https://arena.wodbuster.com/competition.aspx?id=4282&idd=18412&idw=" },
  { key: "wod1a", url: "https://arena.wodbuster.com/competition.aspx?id=4282&idd=18412&idw=-66076" },
  { key: "wod1b", url: "https://arena.wodbuster.com/competition.aspx?id=4282&idd=18412&idw=-66077" },
  { key: "wod2", url: "https://arena.wodbuster.com/competition.aspx?id=4282&idd=18412&idw=65398" },
  { key: "wod3", url: "https://arena.wodbuster.com/competition.aspx?id=4282&idd=18412&idw=65410" },
  { key: "wod4", url: "https://arena.wodbuster.com/competition.aspx?id=4282&idd=18412&idw=65422" },
];

function decode(s) {
  return s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function clean(s) {
  return decode(s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}
function tables(html) {
  const found = [];
  for (const table of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    const rows = [];
    for (const tr of table[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...tr[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(m => clean(m[1]));
      if (cells.length) rows.push(cells);
    }
    if (rows.length) found.push(rows);
  }
  return found;
}
async function inspect(page) {
  const response = await fetch(page.url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; ThrowdownTracker/1.0; +https://github.com/sanchez-jp/throwdown-tracker)",
      "accept": "text/html,application/xhtml+xml"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20000)
  });
  const html = await response.text();
  const parsed = tables(html);
  const matches = [];
  for (let ti = 0; ti < parsed.length; ti++) {
    const rows = parsed[ti];
    for (let ri = 0; ri < rows.length; ri++) {
      if (rows[ri].join(" ").toLocaleUpperCase("es").includes(TEAM)) {
        matches.push({
          tableIndex: ti,
          rowIndex: ri,
          headerCandidate: ri > 0 ? rows[0] : null,
          row: rows[ri],
          precedingRows: rows.slice(Math.max(0, ri - 2), ri)
        });
      }
    }
  }
  return {
    key: page.key,
    url: page.url,
    status: response.status,
    finalUrl: response.url,
    contentType: response.headers.get("content-type"),
    htmlBytes: Buffer.byteLength(html),
    title: clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [,""])[1]),
    tableCount: parsed.length,
    tableSizes: parsed.map(t => t.length),
    teamMatches: matches,
    diagnostic: response.ok ? (matches.length ? "team-row-found" : "team-row-not-found") : "http-error"
  };
}
const results = await Promise.all(pages.map(async p => {
  try { return await inspect(p); }
  catch (e) { return { key: p.key, url: p.url, diagnostic: "request-failed", error: String(e) }; }
}));
const report = {
  generatedAt: new Date().toISOString(),
  team: TEAM,
  note: "Diagnostic only. No rank/score is calculated or written to production data.",
  pages: results
};
await writeFile("wodbuster-probe.json", JSON.stringify(report, null, 2) + "\n");
for (const p of results) {
  console.log(JSON.stringify({
    key: p.key, status: p.status ?? null, htmlBytes: p.htmlBytes ?? null,
    tableCount: p.tableCount ?? null, matches: p.teamMatches?.length ?? 0,
    diagnostic: p.diagnostic, error: p.error ?? null
  }));
}
if (!results.some(p => p.teamMatches?.length)) {
  console.error("No team rows found. Keep production rankings untouched until the HTML structure is understood.");
  process.exitCode = 2;
}

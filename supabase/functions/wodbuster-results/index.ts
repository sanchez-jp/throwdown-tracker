// Read-only results adapter. URLs are built from numeric WodBuster IDs; arbitrary URLs are never accepted.
const LEGACY_CONFIG = {
  provider: "wodbuster",
  teamName: "VENI VIDI REGULINCHI",
  competitionId: "4282",
  divisionId: "18412",
  pages: [
    { key: "overall", label: "Clasificación general", idw: "", overall: true },
    { key: "wod1a", label: "WOD 1A · Gimnasia", idw: "-66076" },
    { key: "wod1b", label: "WOD 1B · Remo", idw: "-66077" },
    { key: "wod2", label: "WOD 2", idw: "65398" },
    { key: "wod3", label: "WOD 3", idw: "65410" },
    { key: "wod4", label: "WOD 4", idw: "65422" },
    { key: "wod5", label: "WOD 5", idw: "65434" },
  ],
};
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
type ResultPage = { key: string; label?: string; idw: string };
type ResultsConfig = { provider: string; teamName: string; competitionId: string; divisionId: string; pages: ResultPage[] };
type CacheEntry = { expires: number; payload: unknown };
const cache = new Map<string, CacheEntry>();

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}
function textContent(markup: string): string {
  return decodeEntities(markup.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}
function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"));
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3] ?? "") : null;
}
type DivElement = { start: number; innerStart: number; end: number; innerEnd: number; classes: string[] };
function findDivElements(html: string): DivElement[] {
  const elements: DivElement[] = [], stack: Omit<DivElement, "end" | "innerEnd">[] = [];
  const token = /<\/?div\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = token.exec(html)) !== null) {
    const tag = match[0];
    if (/^<\//.test(tag)) {
      const opened = stack.pop();
      if (opened) elements.push({ ...opened, end: token.lastIndex, innerEnd: match.index });
    } else if (!/\/\s*>$/.test(tag)) {
      stack.push({ start: match.index, innerStart: token.lastIndex, classes: (attribute(tag, "class") || "").split(/\s+/).filter(Boolean) });
    }
  }
  return elements;
}
function innerHtml(html: string, element: DivElement): string { return html.slice(element.innerStart, element.innerEnd); }
function classElement(elements: DivElement[], container: DivElement, className: string): DivElement | null {
  return elements.filter(e => e.classes.includes(className) && e.start >= container.innerStart && e.end <= container.innerEnd).sort((a,b)=>a.start-b.start)[0] || null;
}
function parseInteger(value: string): number | null {
  const match = String(value ?? "").match(/^\s*(\d+)\s*$/); return match ? Number(match[1]) : null;
}
function normalizeName(value: string): string {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("en");
}
function parseCompetitionHtml(html: string, teamName: string) {
  const elements = findDivElements(html);
  const cards = elements.filter(element => element.classes.includes("athleteresult"));
  if (!cards.length) throw new Error("No WodBuster result cards found");
  const target = cards.find(card => {
    const athlete = classElement(elements, card, "athlete");
    const name = athlete && classElement(elements, athlete, "name");
    if (!name) return false;
    const visible = textContent(innerHtml(html, name));
    const title = attribute(html.slice(name.start, name.innerStart), "title");
    return normalizeName(title || visible) === normalizeName(teamName);
  });
  if (!target) throw new Error("Team not found in WodBuster results");
  const score = classElement(elements, target, "score");
  const result = classElement(elements, target, "result");
  const pointsElement = result && classElement(elements, result, "points");
  const rank = score ? parseInteger(textContent(innerHtml(html, score))) : null;
  let resultText = result ? innerHtml(html, result) : "";
  if (pointsElement) resultText = resultText.replace(html.slice(pointsElement.start, pointsElement.end), " ");
  const rawResult = textContent(resultText);
  const mark = rawResult && rawResult !== "-" && !/^\d+\s*pts$/i.test(rawResult) ? rawResult : null;
  let points = pointsElement ? parseInteger(textContent(innerHtml(html, pointsElement)).replace(/\s*pts\s*$/i, "")) : null;
  if (points === null && result) {
    const pointsMatch = rawResult.match(/^(\d+)\s*pts$/i);
    if (pointsMatch) points = Number(pointsMatch[1]);
  }
  return { team: teamName, rank, totalTeams: cards.length, mark, points, hasResult: rank !== null || mark !== null || (points !== null && points > 0) };
}
function validateConfig(value: unknown): ResultsConfig {
  if (!value || typeof value !== "object") throw new Error("Missing results configuration");
  const cfg = value as Record<string, unknown>;
  if (cfg.provider !== "wodbuster") throw new Error("Unsupported results provider");
  const teamName = typeof cfg.teamName === "string" ? cfg.teamName.trim() : "";
  const competitionId = String(cfg.competitionId ?? "");
  const divisionId = String(cfg.divisionId ?? "");
  if (!teamName || teamName.length > 100) throw new Error("Invalid teamName");
  if (!/^\d{1,12}$/.test(competitionId) || !/^\d{1,12}$/.test(divisionId)) throw new Error("Invalid WodBuster competition or division ID");
  if (!Array.isArray(cfg.pages) || cfg.pages.length < 1 || cfg.pages.length > 30) throw new Error("Invalid results pages");
  const seen = new Set<string>();
  const pages = cfg.pages.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid result page");
    const page = raw as Record<string, unknown>;
    const key = typeof page.key === "string" ? page.key : "";
    const idw = String(page.idw ?? "");
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(key) || seen.has(key)) throw new Error("Invalid or duplicate result page key");
    if (idw !== "" && !/^-?\d{1,12}$/.test(idw)) throw new Error("Invalid WodBuster workout ID");
    seen.add(key);
    return { key, label: typeof page.label === "string" ? page.label.slice(0, 80) : key, idw };
  });
  return { provider: "wodbuster", teamName, competitionId, divisionId, pages };
}
function pageUrl(cfg: ResultsConfig, page: ResultPage): string {
  const url = new URL("https://arena.wodbuster.com/competition.aspx");
  url.searchParams.set("id", cfg.competitionId);
  url.searchParams.set("idd", cfg.divisionId);
  url.searchParams.set("idw", page.idw);
  return url.toString();
}
async function getResult(url: string, teamName: string) {
  const response = await fetch(url, {
    headers: { "Accept": "text/html,application/xhtml+xml", "User-Agent": "Mozilla/5.0 (compatible; ThrowdownTracker/1.0)" },
    signal: AbortSignal.timeout(12000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("WodBuster returned HTTP " + response.status);
  return parseCompetitionHtml(await response.text(), teamName);
}
async function loadResults(cfg: ResultsConfig) {
  const cacheKey = JSON.stringify(cfg), cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.payload;
  const entries = await Promise.all(cfg.pages.map(async page => {
    try { return [page.key, await getResult(pageUrl(cfg, page), cfg.teamName)] as const; }
    catch (error) { return [page.key, null, error instanceof Error ? error.message : "Unknown fetch error"] as const; }
  }));
  const results: Record<string, unknown> = {}, errors: Record<string, string> = {};
  for (const [key, result, error] of entries) {
    if (result) results[key] = result;
    else errors[key] = error || "Result unavailable";
  }
  const payload = { results, errors, updatedAt: new Date().toISOString(), source: "WodBuster" };
  if (Object.keys(results).length) {
    if (cache.size >= 30) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, { expires: Date.now() + 30000, payload });
  }
  return payload;
}
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    let raw: unknown = LEGACY_CONFIG;
    if (request.method === "POST") raw = await request.json();
    const cfg = validateConfig(raw);
    return json(await loadResults(cfg));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid results request";
    const status = /Unsupported results provider|Invalid|Missing/.test(message) ? 400 : 500;
    return json({ error: message }, status);
  }
});

// Public, read-only proxy for the official WodBuster classifications.
const TEAM_NAME = "VENI VIDI REGULINCHI";
const PAGES: Record<string, string> = {
  overall: "https://arena.wodbuster.com/competition.aspx?id=4282&idd=18412&idw=",
  wod1a: "https://arena.wodbuster.com/competition.aspx?id=4282&idd=18412&idw=-66076",
  wod1b: "https://arena.wodbuster.com/competition.aspx?id=4282&idd=18412&idw=-66077",
  wod2: "https://arena.wodbuster.com/competition.aspx?id=4282&idd=18412&idw=65398",
  wod3: "https://arena.wodbuster.com/competition.aspx?id=4282&idd=18412&idw=65410",
  wod4: "https://arena.wodbuster.com/competition.aspx?id=4282&idd=18412&idw=65422",
  wod5: "https://arena.wodbuster.com/competition.aspx?id=4282&idd=18412&idw=65434",
};
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
let cache: { expires: number; payload: unknown } | null = null;

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
function parseCompetitionHtml(html: string) {
  const elements = findDivElements(html);
  const cards = elements.filter(element => element.classes.includes("athleteresult"));
  if (!cards.length) throw new Error("No WodBuster result cards found");
  const target = cards.find(card => {
    const athlete = classElement(elements, card, "athlete");
    const name = athlete && classElement(elements, athlete, "name");
    if (!name) return false;
    const visible = textContent(innerHtml(html, name));
    const title = attribute(html.slice(name.start, name.innerStart), "title");
    return normalizeName(title || visible) === normalizeName(TEAM_NAME);
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
  return { team: TEAM_NAME, rank, totalTeams: cards.length, mark, points, hasResult: rank !== null || mark !== null || (points !== null && points > 0) };
}
async function getResult(url: string) {
  const response = await fetch(url, {
    headers: { "Accept": "text/html,application/xhtml+xml", "User-Agent": "Mozilla/5.0 (compatible; ThrowdownTracker/1.0)" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("WodBuster returned HTTP " + response.status);
  return parseCompetitionHtml(await response.text());
}
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "GET") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });
  if (cache && cache.expires > Date.now()) return new Response(JSON.stringify(cache.payload), { headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  const entries = await Promise.all(Object.entries(PAGES).map(async ([key, url]) => {
    try { return [key, await getResult(url)] as const; }
    catch (error) { return [key, null, error instanceof Error ? error.message : "Unknown fetch error"] as const; }
  }));
  const results: Record<string, unknown> = {}, errors: Record<string, string> = {};
  for (const [key, result, error] of entries) {
    if (result) results[key] = result;
    else errors[key] = error || "Result unavailable";
  }
  const payload = { results, errors, updatedAt: new Date().toISOString(), source: "WodBuster" };
  if (Object.keys(results).length) cache = { expires: Date.now() + 30000, payload };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
});

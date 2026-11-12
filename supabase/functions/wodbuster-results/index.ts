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
type ResultsPayload = { results: Record<string, any>; errors: Record<string, string>; updatedAt: string; source: string };
const cache = new Map<string, CacheEntry>();
const HISTORY_SCOPES = new Set([
  "4282:18412:VENI VIDI REGULINCHI",
  "3829:16625:ESCUCHO BORROSO",
]);
const HISTORY_TABLE = "competition_result_snapshots";

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
function parseCard(html: string, elements: DivElement[], card: DivElement) {
  const athlete = classElement(elements, card, "athlete");
  const name = athlete && classElement(elements, athlete, "name");
  const team = name ? (attribute(html.slice(name.start, name.innerStart), "title") || textContent(innerHtml(html, name))) : null;
  const score = classElement(elements, card, "score");
  const result = classElement(elements, card, "result");
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
  return { team: team?.trim() || null, rank, mark, points, hasResult: rank !== null || mark !== null || (points !== null && points > 0) };
}
function parseCompetitionHtml(html: string, teamName: string) {
  const elements = findDivElements(html);
  const cards = elements.filter(element => element.classes.includes("athleteresult"));
  if (!cards.length) throw new Error("No WodBuster result cards found");
  const standings = cards.map(card => parseCard(html, elements, card)).filter(row => row.team)
    .sort((a, b) => a.rank === null ? (b.rank === null ? 0 : 1) : b.rank === null ? -1 : a.rank - b.rank);
  const target = standings.find(row => normalizeName(row.team || "") === normalizeName(teamName));
  if (!target) throw new Error("Team not found in WodBuster results");
  return { ...target, team: target.team || teamName, totalTeams: cards.length, standings };
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
async function loadResults(cfg: ResultsConfig): Promise<ResultsPayload> {
  const cacheKey = JSON.stringify(cfg), cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.payload as ResultsPayload;
  const entries = await Promise.all(cfg.pages.map(async page => {
    try { return [page.key, await getResult(pageUrl(cfg, page), cfg.teamName)] as const; }
    catch (error) { return [page.key, null, error instanceof Error ? error.message : "Unknown fetch error"] as const; }
  }));
  const results: Record<string, any> = {}, errors: Record<string, string> = {};
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
function adminCredentials(): { url: string; key: string } | null {
  const url = Deno.env.get("SUPABASE_URL");
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  try {
    const secrets = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    if (typeof secrets.default === "string" && secrets.default) key = secrets.default;
  } catch (_) { /* Use the legacy service-role secret when present. */ }
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}
async function syncHistory(cfg: ResultsConfig, payload: { results: Record<string, any>; updatedAt: string }) {
  const scope = cfg.competitionId + ":" + cfg.divisionId + ":" + cfg.teamName;
  if (!HISTORY_SCOPES.has(scope)) return { history: [], historyEnabled: false };
  const credentials = adminCredentials();
  if (!credentials) return { history: [], historyEnabled: true, historyError: "History storage is not configured" };
  const hasOverallPage = cfg.pages.some(page => page.key === "overall" && page.idw === "");
  const overall = payload.results.overall;
  if (hasOverallPage && overall?.standings?.length) {
    const snapshotResults = { overall };
    const snapshotHash = await sha256(JSON.stringify(snapshotResults));
    const params = new URLSearchParams({ on_conflict: "competition_id,division_id,team_name,snapshot_hash" });
    const insertResponse = await fetch(credentials.url + "/rest/v1/" + HISTORY_TABLE + "?" + params.toString(), {
      method: "POST",
      headers: {
        "apikey": credentials.key,
        "Authorization": "Bearer " + credentials.key,
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates,return=minimal"
      },
      body: JSON.stringify({
        competition_id: cfg.competitionId,
        division_id: cfg.divisionId,
        team_name: cfg.teamName,
        snapshot_hash: snapshotHash,
        snapshot_at: payload.updatedAt,
        results: snapshotResults
      })
    });
    if (!insertResponse.ok) throw new Error("History insert failed: HTTP " + insertResponse.status + " " + (await insertResponse.text()).slice(0, 300));
  }
  const query = new URLSearchParams({
    select: "snapshot_at,results",
    competition_id: "eq." + cfg.competitionId,
    division_id: "eq." + cfg.divisionId,
    team_name: "eq." + cfg.teamName,
    order: "snapshot_at.desc",
    limit: "120"
  });
  const response = await fetch(credentials.url + "/rest/v1/" + HISTORY_TABLE + "?" + query.toString(), {
    headers: { "apikey": credentials.key, "Authorization": "Bearer " + credentials.key }
  });
  if (!response.ok) throw new Error("History read failed: HTTP " + response.status);
  const rows = await response.json();
  return {
    history: Array.isArray(rows) ? rows.reverse().map((row: any) => ({ snapshotAt: row.snapshot_at, results: row.results })) : [],
    historyEnabled: true
  };
}
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "GET" && request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    let raw: unknown = LEGACY_CONFIG;
    if (request.method === "POST") raw = await request.json();
    const cfg = validateConfig(raw);
    const payload = await loadResults(cfg);
    try {
      const history = await syncHistory(cfg, payload);
      return json({ ...payload, ...history });
    } catch (historyError) {
      console.error("Could not synchronize official result history", historyError);
      return json({ ...payload, history: [], historyEnabled: HISTORY_SCOPES.has(cfg.competitionId + ":" + cfg.divisionId + ":" + cfg.teamName), historyError: "No se ha podido sincronizar el historial." });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid results request";
    const status = /Unsupported results provider|Invalid|Missing/.test(message) ? 400 : 500;
    return json({ error: message }, status);
  }
});

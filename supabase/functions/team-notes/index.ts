import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://sanchez-jp.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const encoder = new TextEncoder();
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
function fromHex(value: string) {
  return new Uint8Array(value.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []);
}

async function validPassword(password: string) {
  if (typeof password !== "string" || password.length > 128) return false;
  const { data, error } = await supabase
    .from("team_credentials")
    .select("password_salt,password_hash")
    .eq("id", true)
    .single();
  if (error || !data) return false;

  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: fromHex(data.password_salt),
    iterations: 210000,
    hash: "SHA-256",
  }, key, 256);
  const actual = hex(new Uint8Array(derived));
  if (actual.length !== data.password_hash.length) return false;
  let mismatch = 0;
  for (let i = 0; i < actual.length; i++) mismatch |= actual.charCodeAt(i) ^ data.password_hash.charCodeAt(i);
  return mismatch === 0;
}

const attempts = new Map<string, { count: number; resetAt: number }>();
function tooManyAttempts(ip: string) {
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || now > current.resetAt) {
    attempts.set(ip, { count: 0, resetAt: now + 5 * 60 * 1000 });
    return false;
  }
  return current.count >= 12;
}
function recordFailure(ip: string) {
  const current = attempts.get(ip);
  if (current) current.count++;
}

function validCompetitionId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,80}$/.test(value);
}
function validWodId(value: unknown, competitionId: string): value is string {
  if (typeof value !== "string") return false;
  const match = value.match(/^([a-z0-9-]{1,80}):wod([1-9]\d{0,2})$/);
  return !!match && match[1] === competitionId && Number(match[2]) <= 30;
}
function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Método no permitido" }, 405);

  const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  if (tooManyAttempts(ip)) return reply({ error: "Demasiados intentos. Espera unos minutos." }, 429);

  try {
    const body = await req.json();
    if (!validCompetitionId(body.competition_id)) {
      return reply({ error: "Identificador de competición no válido" }, 400);
    }
    if (body.username !== "adobo" || !await validPassword(body.password)) {
      recordFailure(ip);
      return reply({ error: "Credenciales incorrectas" }, 401);
    }

    if (body.action === "login") return reply({ ok: true });

    if (body.action === "get") {
      const { data, error } = await supabase
        .from("wod_notes")
        .select("wod_id,content,updated_at,updated_by")
        .like("wod_id", body.competition_id + ":wod%")
        .order("wod_id");
      if (error) throw error;
      return reply({ notes: data ?? [] });
    }

    if (body.action === "save") {
      if (!validWodId(body.wod_id, body.competition_id)) {
        return reply({ error: "WOD no válido para esta competición" }, 400);
      }
      if (typeof body.content !== "string" || body.content.length > 10000) {
        return reply({ error: "La nota debe tener como máximo 10000 caracteres" }, 400);
      }
      const { data, error } = await supabase
        .from("wod_notes")
        .upsert({
          wod_id: body.wod_id,
          content: body.content,
          updated_at: new Date().toISOString(),
          updated_by: "Equipo",
        }, { onConflict: "wod_id" })
        .select("wod_id,content,updated_at,updated_by")
        .single();
      if (error) throw error;
      return reply({ note: data });
    }

    if (body.action === "delete") {
      if (!validWodId(body.wod_id, body.competition_id)) {
        return reply({ error: "WOD no válido para esta competición" }, 400);
      }
      const { error } = await supabase.from("wod_notes").delete().eq("wod_id", body.wod_id);
      if (error) throw error;
      return reply({ ok: true });
    }

    return reply({ error: "Acción no válida" }, 400);
  } catch (error) {
    console.error("team-notes error", error);
    return reply({ error: "No se ha podido procesar la solicitud" }, 500);
  }
});

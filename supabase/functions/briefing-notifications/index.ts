import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_BASE_URL = "https://sanchez-jp.github.io/throwdown-tracker";
const corsHeaders = {
  "Access-Control-Allow-Origin": "https://sanchez-jp.github.io",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function reply(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}
function validCompetitionId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{1,80}$/.test(value);
}
function validSubscription(value: any): boolean {
  if (!value || typeof value !== "object" || typeof value.endpoint !== "string" ||
      value.endpoint.length > 4096 || !value.endpoint.startsWith("https://")) return false;
  try {
    const host = new URL(value.endpoint).hostname.toLowerCase();
    const allowed = host === "web.push.apple.com" || host.endsWith(".push.apple.com") ||
      host.endsWith(".googleapis.com") || host.endsWith(".push.services.mozilla.com") ||
      host.endsWith(".mozilla.org") || host.endsWith(".notify.windows.com");
    return allowed && typeof value.keys?.p256dh === "string" &&
      typeof value.keys?.auth === "string" && value.keys.p256dh.length < 256 &&
      value.keys.auth.length < 128;
  } catch { return false; }
}
async function settings() {
  const { data, error } = await db.from("briefing_push_settings")
    .select("id,cron_secret,vapid_public_key,vapid_private_key")
    .eq("id", true).single();
  if (error || !data) throw new Error("Push settings are not configured");
  return data;
}
async function vapidKeys() {
  let current = await settings();
  if (current.vapid_public_key && current.vapid_private_key) return current;
  const generated = webpush.generateVAPIDKeys();
  const { data, error } = await db.from("briefing_push_settings")
    .update({ vapid_public_key: generated.publicKey, vapid_private_key: generated.privateKey })
    .eq("id", true).is("vapid_public_key", null)
    .select("id,cron_secret,vapid_public_key,vapid_private_key").maybeSingle();
  if (error) throw error;
  if (data) return data;
  current = await settings();
  if (!current.vapid_public_key || !current.vapid_private_key) {
    throw new Error("Could not initialize VAPID keys");
  }
  return current;
}
function localDateTimeToUtc(date: string, time: string, timeZone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (hour > 23 || minute > 59) return null;
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  try {
    for (let i = 0; i < 4; i++) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(guess))
        .filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
      const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
      guess += target - represented;
    }
    return new Date(guess);
  } catch { return null; }
}
async function competitionConfig(id: string, cache: Map<string, any>) {
  if (cache.has(id)) return cache.get(id);
  const response = await fetch(APP_BASE_URL + "/data/competitions/" + encodeURIComponent(id) + ".json",
    { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Competition config returned HTTP " + response.status);
  const config = await response.json();
  if (config?.id !== id || !Array.isArray(config.days)) throw new Error("Invalid competition configuration");
  cache.set(id, config);
  return config;
}
function dueBriefings(config: any, now: Date) {
  const timeZone = typeof config.competition?.timezone === "string" ? config.competition.timezone : "Europe/Lisbon";
  const due: any[] = [];
  for (const day of config.days) {
    if (!Array.isArray(day.events)) continue;
    for (const event of day.events) {
      if (typeof event.briefing !== "string" || !event.name) continue;
      const briefingAt = localDateTimeToUtc(day.date, event.briefing, timeZone);
      if (!briefingAt) continue;
      const notifyAt = new Date(briefingAt.getTime() - 15 * 60 * 1000);
      const age = now.getTime() - notifyAt.getTime();
      if (age >= 0 && age <= 2 * 60 * 1000) {
        due.push({
          key: config.id + ":" + day.date + ":" + event.name + ":" + event.briefing,
          name: String(event.name),
          title: typeof event.title === "string" ? event.title : "",
          briefing: event.briefing,
          competition: String(config.competition?.name || config.appName || "Throwdown Tracker"),
        });
      }
    }
  }
  return due;
}
async function dispatch(request: Request) {
  const config = await settings();
  const supplied = request.headers.get("x-cron-secret") || "";
  if (!supplied || supplied.length !== config.cron_secret.length) return reply({ error: "Unauthorized" }, 401);
  const a = new TextEncoder().encode(supplied), b = new TextEncoder().encode(config.cron_secret);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i++) mismatch |= a[i] ^ b[i];
  if (mismatch !== 0) return reply({ error: "Unauthorized" }, 401);

  const { data: subscriptions, error } = await db.from("briefing_push_subscriptions")
    .select("id,competition_id,endpoint,subscription");
  if (error) throw error;
  if (!subscriptions?.length) return reply({ ok: true, sent: 0, checked: 0 });

  const keys = await vapidKeys();
  webpush.setVapidDetails(APP_BASE_URL, keys.vapid_public_key, keys.vapid_private_key);
  const configCache = new Map<string, any>();
  const now = new Date();
  let sent = 0, checked = 0, failed = 0;
  for (const item of subscriptions) {
    let due: any[] = [];
    try {
      const competition = await competitionConfig(item.competition_id, configCache);
      due = dueBriefings(competition, now);
    } catch (error) {
      console.error("Could not load competition schedule", item.competition_id, error);
      continue;
    }
    for (const event of due) {
      checked++;
      const { data: previous, error: previousError } = await db.from("briefing_push_deliveries")
        .select("id,status,attempts")
        .eq("subscription_id", item.id).eq("event_key", event.key).maybeSingle();
      if (previousError) { console.error("Could not inspect notification delivery", previousError); failed++; continue; }
      if (previous?.status === "sent" || (previous && previous.attempts >= 3)) continue;
      const attempts = (previous?.attempts || 0) + 1;
      const delivery = {
        subscription_id: item.id, event_key: event.key, status: "sending",
        attempts, last_error: null,
      };
      const write = previous
        ? await db.from("briefing_push_deliveries").update(delivery).eq("id", previous.id)
        : await db.from("briefing_push_deliveries").insert(delivery);
      if (write.error) { console.error("Could not reserve notification delivery", write.error); failed++; continue; }
      const body = event.title
        ? event.name + " · " + event.title + " · Briefing " + event.briefing
        : event.name + " · Briefing " + event.briefing;
      const payload = JSON.stringify({
        title: "Briefing en 15 minutos",
        body: event.competition + " · " + body,
        url: APP_BASE_URL + "/?competition=" + encodeURIComponent(item.competition_id),
        tag: "briefing-" + event.key,
      });
      try {
        await webpush.sendNotification(item.subscription, payload, { TTL: 1800, urgency: "high" });
        await db.from("briefing_push_deliveries")
          .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
          .eq("subscription_id", item.id).eq("event_key", event.key);
        sent++;
      } catch (pushError: any) {
        const message = String(pushError?.message || pushError).slice(0, 500);
        await db.from("briefing_push_deliveries")
          .update({ status: "failed", last_error: message })
          .eq("subscription_id", item.id).eq("event_key", event.key);
        if (pushError?.statusCode === 404 || pushError?.statusCode === 410) {
          await db.from("briefing_push_subscriptions").delete().eq("id", item.id);
        }
        console.error("Briefing push delivery failed", item.id, pushError);
        failed++;
      }
    }
  }
  return reply({ ok: true, sent, checked, failed });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const body = await request.json();
    if (body.action === "dispatch") return await dispatch(request);
    if (!validCompetitionId(body.competition_id)) return reply({ error: "Invalid competition id" }, 400);
    if (body.action === "config") {
      const keys = await vapidKeys();
      return reply({ publicKey: keys.vapid_public_key });
    }
    if (body.action === "subscribe") {
      if (!validSubscription(body.subscription)) return reply({ error: "Invalid push subscription" }, 400);
      const { error } = await db.from("briefing_push_subscriptions").upsert({
        competition_id: body.competition_id,
        endpoint: body.subscription.endpoint,
        subscription: body.subscription,
        updated_at: new Date().toISOString(),
      }, { onConflict: "competition_id,endpoint" });
      if (error) throw error;
      return reply({ ok: true });
    }
    if (body.action === "unsubscribe") {
      if (typeof body.endpoint !== "string" || body.endpoint.length > 4096) return reply({ error: "Invalid endpoint" }, 400);
      const { error } = await db.from("briefing_push_subscriptions")
        .delete().eq("competition_id", body.competition_id).eq("endpoint", body.endpoint);
      if (error) throw error;
      return reply({ ok: true });
    }
    return reply({ error: "Invalid action" }, 400);
  } catch (error) {
    console.error("briefing-notifications error", error);
    return reply({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});

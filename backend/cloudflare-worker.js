/**
 * SaltNet Cloudflare Worker (free, no expiry). One KV namespace (VISITS):
 *
 *   Visitor map
 *     GET  /                     -> {CC:count} aggregate
 *     POST /hit?cc=SA            -> increment country, return aggregate
 *
 *   Suggestions — moderated public board
 *     POST /suggest              -> {message, contact?, hp?}  store as PENDING (not public)
 *     GET  /board                -> APPROVED suggestions only, sanitized (message + date)
 *     GET  /suggestions?token=X  -> ALL (pending+approved) for the owner
 *     POST /moderate?token=X      -> {key, action:'approve'|'delete'}
 *
 * Deploy: paste into a Worker; bind a KV namespace as variable `VISITS`, and add a
 * Worker secret `ADMIN_TOKEN` (Settings -> Variables) — that token gates review.
 */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" },
  });

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(request.url);
    const ip = request.headers.get("cf-connecting-ip") || "";
    const authed = env.ADMIN_TOKEN && url.searchParams.get("token") === env.ADMIN_TOKEN;

    // ---- submit a suggestion (stored PENDING) ----
    if (request.method === "POST" && url.pathname === "/suggest") {
      const rlKey = "rl:" + ip;
      const cnt = parseInt((await env.VISITS.get(rlKey)) || "0", 10);
      if (cnt >= 5) return json({ ok: false, error: "Too many submissions, try again later." }, 429);
      let body = {};
      try { body = await request.json(); } catch (_) {}
      if (body.hp) return json({ ok: true });                       // honeypot -> drop silently
      const message = String(body.message || "").trim().slice(0, 2000);
      if (message.length < 2) return json({ ok: false, error: "Message is empty." }, 400);
      const contact = String(body.contact || "").trim().slice(0, 200);
      const key = "sug:" + Date.now() + ":" + crypto.randomUUID().slice(0, 8);
      await env.VISITS.put(key, JSON.stringify({
        message, contact, ip, ua: request.headers.get("user-agent") || "",
        time: new Date().toISOString(), status: "pending",
      }));
      await env.VISITS.put(rlKey, String(cnt + 1), { expirationTtl: 3600 });
      return json({ ok: true });
    }

    // ---- public board: approved only, sanitized ----
    if (request.method === "GET" && url.pathname === "/board") {
      const out = [];
      const list = await env.VISITS.list({ prefix: "sug:" });
      for (const k of list.keys) {
        try {
          const s = JSON.parse(await env.VISITS.get(k.name));
          if (s.status === "approved") out.push({ message: s.message, time: s.time });
        } catch (_) {}
      }
      out.sort((a, b) => (a.time < b.time ? 1 : -1));
      return json(out.slice(0, 200));
    }

    // ---- owner: list all for review ----
    if (request.method === "GET" && url.pathname === "/suggestions") {
      if (!authed) return json({ error: "unauthorized" }, 401);
      const out = [];
      const list = await env.VISITS.list({ prefix: "sug:" });
      for (const k of list.keys) {
        try { out.push({ key: k.name, ...JSON.parse(await env.VISITS.get(k.name)) }); } catch (_) {}
      }
      out.sort((a, b) => (a.time < b.time ? 1 : -1));
      return json(out);
    }

    // ---- owner: approve / delete ----
    if (request.method === "POST" && url.pathname === "/moderate") {
      if (!authed) return json({ error: "unauthorized" }, 401);
      let body = {};
      try { body = await request.json(); } catch (_) {}
      const key = String(body.key || "");
      if (!key.startsWith("sug:")) return json({ ok: false }, 400);
      if (body.action === "delete") {
        await env.VISITS.delete(key);
      } else if (body.action === "approve") {
        const s = JSON.parse((await env.VISITS.get(key)) || "{}");
        s.status = "approved";
        await env.VISITS.put(key, JSON.stringify(s));
      }
      return json({ ok: true });
    }

    // ---- visitor map ----
    const KEY = "agg";
    let agg = {};
    try { agg = JSON.parse((await env.VISITS.get(KEY)) || "{}"); } catch (_) { agg = {}; }
    if (request.method === "POST" && url.pathname === "/hit") {
      const cc = (url.searchParams.get("cc") || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
      if (cc.length === 2) { agg[cc] = (agg[cc] || 0) + 1; await env.VISITS.put(KEY, JSON.stringify(agg)); }
    }
    return json(agg);
  },
};

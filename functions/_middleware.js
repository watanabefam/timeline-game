// functions/_middleware.js — HTTP Basic Auth gate for the hosted game.
//
// Hosting layer, not game core: this runs on Cloudflare Pages at the edge,
// BEFORE any file is served, so decks, narration MP3s and every other asset
// stay private until the visitor authenticates. It is not loaded by
// index.html and does not touch the no-build-step game code.
//
// Credentials come from Pages environment variables (never hardcode them):
//   BASIC_AUTH_USER  e.g. "family"
//   BASIC_AUTH_PASS  e.g. a long random string
// Set them in: Pages project > Settings > Environment variables
// (add them for both Production and Preview, then redeploy).
//
// Fail-closed: if the variables are unset, every request is denied with 401,
// so a misconfigured deploy never silently goes public.

export async function onRequest(context) {
  const { request, env, next } = context;

  const auth = request.headers.get("Authorization") || "";
  const [scheme, encoded] = auth.split(" ");

  let ok = false;
  if (scheme === "Basic" && encoded) {
    let decoded = "";
    try {
      decoded = atob(encoded);
    } catch {
      decoded = ""; // malformed base64
    }
    const [user, pass] = decoded.split(":");
    ok = user === env.BASIC_AUTH_USER && pass === env.BASIC_AUTH_PASS;
  }

  if (ok) {
    return next();
  }

  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Timeline Game"' },
  });
}
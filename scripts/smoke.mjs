// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const email = `smoke-${Date.now()}@example.com`;
const password = "Smoke-Test-Passw0rd!";
// Defaults match the local/CI-only organizer created by supabase/seed.sql.
const organizerEmail = process.env.SMOKE_ORGANIZER_EMAIL ?? "organizer@example.com";
const organizerPassword = process.env.SMOKE_ORGANIZER_PASSWORD ?? "Organizer-Passw0rd!";
const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), rest.join("="));
  }
}

async function request(path, { method = "GET", form } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  storeCookies(response);
  return { status: response.status, location: response.headers.get("location") ?? "" };
}

const steps = [
  ["home renders", () => request("/"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["organizer page redirects anonymous user", () => request("/organizer"), { status: 302, location: "/auth/signin" }],
  ["organizer api rejects anonymous user", () => request("/api/organizer/me"), { status: 401 }],
  ["signin page renders for anonymous user", () => request("/auth/signin"), { status: 200 }],
  [
    "signup creates account",
    () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/" },
  ],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  ["signin page redirects signed-in user", () => request("/auth/signin"), { status: 302, location: "/dashboard" }],
  ["signup page redirects signed-in user", () => request("/auth/signup"), { status: 302, location: "/dashboard" }],
  ["organizer page forbids player", () => request("/organizer"), { status: 403 }],
  ["organizer api forbids player", () => request("/api/organizer/me"), { status: 403 }],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  [
    "signin accepts seeded organizer",
    () => request("/api/auth/signin", { method: "POST", form: { email: organizerEmail, password: organizerPassword } }),
    { status: 302, location: "/" },
  ],
  ["organizer page renders for organizer", () => request("/organizer"), { status: 200 }],
  ["organizer api allows organizer", () => request("/api/organizer/me"), { status: 200 }],
  [
    "signout clears organizer session",
    () => request("/api/auth/signout", { method: "POST" }),
    { status: 302, location: "/" },
  ],
];

// An expected location with a query ("/auth/signin?error=") is a prefix; anything else must match exactly,
// otherwise "/" would accept every redirect.
function locationMatches(actual, expected) {
  if (expected === undefined) return true;
  return expected.includes("?") ? actual.startsWith(expected) : actual === expected;
}

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok = actual.status === expected.status && locationMatches(actual.location, expected.location);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : "\nAll smoke steps passed");
process.exit(failed ? 1 : 0);

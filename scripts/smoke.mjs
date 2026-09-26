// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const email = `smoke-${Date.now()}@example.com`;
const nextEmail = `smoke-next-${Date.now()}@example.com`;
const password = "Smoke-Test-Passw0rd!";
// Defaults match the local/CI-only organizer created by supabase/seed.sql.
const organizerEmail = process.env.SMOKE_ORGANIZER_EMAIL ?? "organizer@example.com";
const organizerPassword = process.env.SMOKE_ORGANIZER_PASSWORD ?? "Organizer-Passw0rd!";
const jar = new Map();
const CREATED_LOCATION = /^\/organizer\/trainings\/([0-9a-f-]{36})\?created=1$/;
// Set by the organizer's create step, read by the later player/organizer steps.
let trainingId = "";

// Training start as the form sends it: Polish wall-clock time ("YYYY-MM-DDTHH:mm") `hours` from now.
function warsawLocal(hours) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(Date.now() + hours * 60 * 60 * 1000));
  const part = (type) => parts.find((p) => p.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function trainingForm(hours) {
  return { title: "Smoke training", starts_at: warsawLocal(hours), location: "Smoke hall", note: "" };
}

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
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin?next=" }],
  [
    "organizer page redirects anonymous user",
    () => request("/organizer"),
    { status: 302, location: "/auth/signin?next=" },
  ],
  [
    "training page redirects anonymous user",
    () => request("/t/00000000-0000-4000-8000-000000000999"),
    { status: 302, location: "/auth/signin?next=%2Ft%2F" },
  ],
  ["organizer api rejects anonymous user", () => request("/api/organizer/me"), { status: 401 }],
  ["signin page renders for anonymous user", () => request("/auth/signin"), { status: 200 }],
  [
    "signup creates account",
    () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "signup keeps next",
    () => request("/api/auth/signup", { method: "POST", form: { email: nextEmail, password, next: "/dashboard" } }),
    { status: 302, location: "/auth/confirm-email?next=" },
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
  [
    "signin returns to next",
    () => request("/api/auth/signin", { method: "POST", form: { email, password, next: "/dashboard" } }),
    { status: 302, location: "/dashboard" },
  ],
  [
    "signin ignores external next",
    () => request("/api/auth/signin", { method: "POST", form: { email, password, next: "//evil.example" } }),
    { status: 302, location: "/" },
  ],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  ["signin page redirects signed-in user", () => request("/auth/signin"), { status: 302, location: "/dashboard" }],
  [
    "signin page honours next for signed-in user",
    () => request("/auth/signin?next=/dashboard"),
    { status: 302, location: "/dashboard" },
  ],
  ["signup page redirects signed-in user", () => request("/auth/signup"), { status: 302, location: "/dashboard" }],
  ["organizer page forbids player", () => request("/organizer"), { status: 403 }],
  ["organizer api forbids player", () => request("/api/organizer/me"), { status: 403 }],
  [
    "training create forbids player",
    () => request("/api/organizer/trainings", { method: "POST", form: trainingForm(48) }),
    { status: 403 },
  ],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin?next=" }],
  [
    "signin accepts seeded organizer",
    () => request("/api/auth/signin", { method: "POST", form: { email: organizerEmail, password: organizerPassword } }),
    { status: 302, location: "/" },
  ],
  ["organizer page renders for organizer", () => request("/organizer"), { status: 200 }],
  ["organizer api allows organizer", () => request("/api/organizer/me"), { status: 200 }],
  [
    "training create rejects start within 3 hours",
    () => request("/api/organizer/trainings", { method: "POST", form: trainingForm(1) }),
    { status: 302, location: "/organizer/trainings/new?error=starts_too_soon" },
  ],
  [
    "training create succeeds for organizer",
    async () => {
      const result = await request("/api/organizer/trainings", { method: "POST", form: trainingForm(48) });
      trainingId = CREATED_LOCATION.exec(result.location)?.[1] ?? "";
      return result;
    },
    { status: 302, location: CREATED_LOCATION },
  ],
  ["training detail renders for organizer", () => request(`/organizer/trainings/${trainingId}`), { status: 200 }],
  ["organizer list renders with trainings", () => request("/organizer"), { status: 200 }],
  [
    "signout clears organizer session",
    () => request("/api/auth/signout", { method: "POST" }),
    { status: 302, location: "/" },
  ],
  [
    "signin player again",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/" },
  ],
  ["training page renders for player", () => request(`/t/${trainingId}`), { status: 200 }],
  ["training page 404s for malformed id", () => request("/t/not-a-uuid"), { status: 404 }],
  [
    "signout clears player session",
    () => request("/api/auth/signout", { method: "POST" }),
    { status: 302, location: "/" },
  ],
];

// An expected location with a query ("/auth/signin?error=") is a prefix; anything else must match exactly,
// otherwise "/" would accept every redirect. A RegExp is tested as-is (for locations carrying generated ids).
function locationMatches(actual, expected) {
  if (expected === undefined) return true;
  if (expected instanceof RegExp) return expected.test(actual);
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

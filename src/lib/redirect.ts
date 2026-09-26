// A `next` value is only honoured when it is a same-origin path: a leading "/", not followed by "/" or "\"
// (protocol-relative / backslash tricks), and free of control characters.
export function safeNext(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  if (value[1] === "/" || value[1] === "\\") return null;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return null;
  }
  return value;
}

export function withNext(path: string, next: string | null): string {
  if (next === null) return path;
  return `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}`;
}

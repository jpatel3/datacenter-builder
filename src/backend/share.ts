/** Pure helpers for share links. No DOM, no network — unit-tested. */

export function parseShareParam(search: string): string | null {
  const id = new URLSearchParams(search).get("build");
  return id && /^[0-9a-f-]{20,}$/i.test(id) ? id : null;
}

export function buildShareUrl(origin: string, basePath: string, id: string): string {
  const base = basePath.endsWith("/") ? basePath : basePath + "/";
  return `${origin}${base}?build=${id}`;
}

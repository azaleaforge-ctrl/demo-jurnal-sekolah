export function cn(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}
export function slugEmail(name: string, school: string) {
  const clean = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "guru";
  return `${clean(name)}@${clean(school)}.id`;
}
export function todayID() {
  return new Date().toISOString().slice(0, 10);
}

// Urut abjad A–Z, case-insensitive, locale Indonesia.
export function byNameStr(a: unknown, b: unknown) {
  return String(a ?? "").localeCompare(String(b ?? ""), "id", { sensitivity: "base" });
}
export function byName<T>(pick: (x: T) => unknown = (x: any) => (x as any)?.name) {
  return (a: T, b: T) => byNameStr(pick(a), pick(b));
}

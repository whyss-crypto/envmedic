/**
 * Minimal semver-range check for the common cases found in package.json.
 * Returns true/false, or null when the range cannot be understood
 * (caller should treat null as "unknown", not as a failure).
 */
export function satisfiesRange(version: string, range: string): boolean | null {
  const v = version.trim().replace(/^v/, "");
  let r = range.trim();
  if (!r || r === "*" || r === "x" || r.toLowerCase() === "latest") return true;

  // Normalize x-ranges ("18.x", "18.*", "18", "18.2") to caret/tilde form,
  // matching npm semantics: 18.x ≡ ^18, 18.2.x ≡ ~18.2.
  r = normalizeXRange(r);

  const parts = v.split(".").map(Number);
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null;
  const [major, minor = 0, patch = 0] = parts as [number, number?, number?];

  // Compound ranges like ">=18 <21" — every comparator must pass.
  if (/[<>=\s|]/.test(r) && !/^[~^]/.test(r)) {
    const comparators = r.split(/\s*\|\|\s*/);
    // Only support a single AND-group for the MVP.
    if (comparators.length !== 1 || !comparators[0]) return null;
    const ands = (comparators[0] as string).split(/\s+/);
    for (const c of ands) {
      const m = c.match(/^(>=|<=|>|<|=|~)?\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
      if (!m) return null;
      const [, op = "=", rm, rn, rp] = m;
      const t: [number, number, number] = [
        Number(rm),
        rn === undefined ? 0 : Number(rn),
        rp === undefined ? 0 : Number(rp),
      ];
      const cmp = compare([major, minor, patch], t);
      // Bare "=" with missing parts is a prefix match (npm: =18 means 18.x).
      const ok =
        op === "="
          ? rn === undefined
            ? major === t[0]
            : rp === undefined
              ? major === t[0] && minor === t[1]
              : cmp === 0
          : op === ">="
            ? cmp >= 0
            : op === "<="
              ? cmp <= 0
              : op === ">"
                ? cmp > 0
                : cmp < 0;
      if (!ok) return false;
    }
    return true;
  }

  const caret = r.match(/^\^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (caret) {
    const [, rm, rn, rp] = caret;
    const req: [number, number, number] = [
      Number(rm),
      rn === undefined ? 0 : Number(rn),
      rp === undefined ? 0 : Number(rp),
    ];
    if (compare([major, minor, patch], req) < 0) return false;
    if (req[0] !== 0) return major === req[0];
    // ^0.x: ^0.2.3 := >=0.2.3 <0.3.0; ^0.0.3 := >=0.0.3 <0.0.4; ^0 := >=0.0.0 <1.0.0
    if (rn !== undefined) {
      if (req[1] !== 0 || rp !== undefined) {
        return major === 0 && minor === req[1];
      }
      // ^0.0 (patch unspecified): <0.1.0
      return major === 0 && minor === 0;
    }
    return major === 0;
  }

  const tilde = r.match(/^~(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (tilde) {
    const [, rm, rn] = tilde;
    const reqMajor = Number(rm);
    if (major !== reqMajor) return false;
    // ~18 := >=18.0.0 <19.0.0; ~18.2(.3) := >=18.2.0 <18.3.0
    if (rn === undefined) return compare([major, minor, patch], [reqMajor, 0, 0]) >= 0;
    if (minor !== Number(rn)) return false;
    const reqPatch = tilde[3] === undefined ? 0 : Number(tilde[3]);
    return compare([major, minor, patch], [reqMajor, Number(rn), reqPatch]) >= 0;
  }

  const exact = r.match(/^=?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (exact) {
    const [, rm, rn, rp] = exact;
    if (major !== Number(rm)) return false;
    if (rn !== undefined && minor !== Number(rn)) return false;
    if (rp !== undefined && minor === Number(rn ?? minor)) {
      return patch === Number(rp);
    }
    return true;
  }

  return null;
}

function normalizeXRange(r: string): string {
  const m = r.match(/^v?(\d+)(?:\.(x|\*|\d+))?(?:\.(x|\*|\d+))?$/i);
  if (!m) return r;
  const [, maj, min, pat] = m as [string, string, string | undefined, string | undefined];
  if (min === undefined || /^(x|\*)$/i.test(min)) return `^${maj}`;
  if (pat === undefined || /^(x|\*)$/i.test(pat)) return `~${maj}.${min}`;
  return r;
}

function compare(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return (a[i] as number) < (b[i] as number) ? -1 : 1;
  }
  return 0;
}

export const ipv4Octets = (host: string): ReadonlyArray<number> | null => {
  const parts = host.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const octets = parts.map((part) =>
    /^\d{1,3}$/.test(part) ? Number(part) : Number.NaN,
  );
  return octets.every((n) => Number.isInteger(n) && n <= 255) ? octets : null;
};

export const isBlockedIpv4 = (octets: ReadonlyArray<number>): boolean => {
  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a! >= 224
  );
};

const embeddedIpv4 = (groups: ReadonlyArray<number>): ReadonlyArray<number> => [
  groups[6]! >> 8,
  groups[6]! & 0xff,
  groups[7]! >> 8,
  groups[7]! & 0xff,
];

const parseHextets = (part: string): ReadonlyArray<number> | null =>
  part === ""
    ? []
    : part.split(":").map((group) =>
        /^[0-9a-f]{1,4}$/.test(group)
          ? Number.parseInt(group, 16)
          : Number.NaN,
      );

export const ipv6Groups = (host: string): ReadonlyArray<number> | null => {
  const text = host.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (!text.includes(":")) {
    return null;
  }
  const dotted = /(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/.exec(text);
  let head = text;
  let tail: ReadonlyArray<number> = [];
  if (dotted?.[1] !== undefined) {
    const octets = ipv4Octets(dotted[1]);
    if (octets === null) {
      return null;
    }
    tail = [(octets[0]! << 8) | octets[1]!, (octets[2]! << 8) | octets[3]!];
    head = text.slice(0, text.length - dotted[1].length).replace(/:$/, "");
  }
  const halves = head.split("::");
  if (halves.length > 2) {
    return null;
  }
  const leading = parseHextets(halves[0] ?? "");
  const trailing =
    halves.length === 2 ? parseHextets(halves[1] ?? "") : ([] as const);
  if (leading === null || trailing === null) {
    return null;
  }
  const known = leading.length + trailing.length + tail.length;
  const groups =
    halves.length === 2
      ? [...leading, ...new Array<number>(8 - known).fill(0), ...trailing, ...tail]
      : [...leading, ...tail];
  return groups.length === 8 && groups.every((g) => Number.isInteger(g))
    ? groups
    : null;
};

const isZeroThrough = (groups: ReadonlyArray<number>, end: number): boolean =>
  groups.slice(0, end).every((group) => group === 0);

export const isBlockedIpv6 = (groups: ReadonlyArray<number>): boolean => {
  if (isZeroThrough(groups, 5) && (groups[5] === 0xffff || groups[5] === 0)) {
    return isBlockedIpv4(embeddedIpv4(groups));
  }
  if (groups[0] === 0x0064 && groups[1] === 0xff9b) {
    return isBlockedIpv4(embeddedIpv4(groups));
  }
  if (groups.every((group) => group === 0)) {
    return true;
  }
  if (isZeroThrough(groups, 7) && groups[7] === 1) {
    return true;
  }
  return (
    (groups[0]! & 0xffc0) === 0xfe80 ||
    (groups[0]! & 0xfe00) === 0xfc00 ||
    (groups[0]! & 0xff00) === 0xff00
  );
};

const blockedNames = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "169.254.169.254",
]);

const blockedSuffixes = [".localhost", ".internal", ".local", ".home.arpa"];

export const isBlockedHost = (rawHost: string): boolean => {
  const host = rawHost.toLowerCase().replace(/\.+$/, "");
  if (host.length === 0) {
    return true;
  }
  if (blockedNames.has(host)) {
    return true;
  }
  if (blockedSuffixes.some((suffix) => host.endsWith(suffix))) {
    return true;
  }
  const octets = ipv4Octets(host.replace(/^\[/, "").replace(/\]$/, ""));
  if (octets !== null) {
    return isBlockedIpv4(octets);
  }
  const groups = ipv6Groups(host);
  if (groups !== null) {
    return isBlockedIpv6(groups);
  }
  // a public hostname carries a dot; a bare label resolves through local search domains
  return !host.includes(".");
};

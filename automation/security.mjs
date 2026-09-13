import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 168].includes(b)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && [18, 19, 51].includes(b)) ||
      (a === 203 && b === 0)
    );
  }
  // Accept only global-unicast IPv6, excluding documentation ranges and mapped IPv4.
  return isIP(address) === 6 && /^[23]/i.test(address) && !/^2001:db8:/i.test(address);
}

export async function publicUrl(value, resolver = lookup) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    url.href.length > 2000
  )
    throw new Error("Use a public HTTPS destination.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await resolver(host, { all: true });
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address)))
    throw new Error("Private network destinations are not allowed.");
  return url;
}

export const personalAction =
  /\b(sign(?:ature)?|under penalty|perjury|certif(?:y|ication)|attest|swear|pay(?:ment)?|purchase|buy|credit card|bank account|routing number|settlement|accept.*(?:terms|contract|lease)|apply.*loan|password|captcha|social security|ssn)\b/i;

export function supportedValue(facts, key, value) {
  if (!Object.hasOwn(facts, key) || typeof value !== "string" || !value.trim()) return false;
  const source = facts[key].trim();
  // Permit a literal excerpt from a reviewed document, but never an invented value.
  return source === value || (key.startsWith("document:") && source.includes(value));
}

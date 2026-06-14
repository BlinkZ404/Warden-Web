import { timingSafeEqual } from "node:crypto";

/** Length-guarded constant-time string compare for HMAC signatures. */
export function safeEqual(a: string, b: string): boolean {
 const x = Buffer.from(a);
 const y = Buffer.from(b);
 return x.length === y.length && timingSafeEqual(x, y);
}

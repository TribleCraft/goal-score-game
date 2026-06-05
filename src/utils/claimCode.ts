const CLAIM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateClaimCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes, (byte) => CLAIM_ALPHABET[byte % CLAIM_ALPHABET.length]).join("");

  return `ZDF-${code.slice(0, 4)}-${code.slice(4)}`;
}

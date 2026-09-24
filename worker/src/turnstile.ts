/**
 * Cloudflare Turnstile (CAPTCHA invisible). El juego obtiene un token del widget al tocar "Jugar"
 * y el servidor lo confirma con Cloudflare antes de emitir el JWT. Cada token sirve una sola vez.
 */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface SiteverifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

export async function verifyTurnstile(token: string, secret: string, ip: string | null): Promise<boolean> {
  if (!token || token.length > 2048) {
    console.warn("Turnstile: token vacío o demasiado largo", token.length);
    return false;
  }

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);

  const res = await fetch(VERIFY_URL, { method: "POST", body: form });
  // Siteverify responde 400 con los códigos de error en el cuerpo (p. ej. invalid-input-secret)
  const outcome = (await res.json().catch(() => ({ success: false }))) as SiteverifyResponse;
  if (!outcome.success) console.warn("Turnstile rechazado", res.status, outcome["error-codes"]);
  return outcome.success;
}

/**
 * Cloudflare Turnstile: CAPTCHA invisible que frena a los bots antes de entregar el JWT.
 * Casi siempre se resuelve solo; si Cloudflare duda, muestra una casilla abajo de la pantalla.
 *
 * La clave del sitio es pública: en producción va en la variable de build VITE_TURNSTILE_SITE_KEY
 * (Workers Builds → Settings → Build → Variables). Sin ella se usa la clave de prueba de Cloudflare,
 * que solo sirve en desarrollo: el servidor de producción rechaza sus tokens.
 */
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA";
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

/** Descarga el script de Turnstile una sola vez. Se llama al abrir el menú para tenerlo listo. */
export function loadTurnstile(): Promise<TurnstileApi> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile no cargó")));
    script.onerror = () => {
      scriptPromise = null; // permite reintentar en el siguiente click
      script.remove();
      reject(new Error("No se pudo descargar Turnstile"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Resuelve el reto y devuelve un token de un solo uso para enviar al servidor. */
export async function getTurnstileToken(): Promise<string> {
  const turnstile = await loadTurnstile();
  const container = document.createElement("div");
  container.className = "turnstile-box";
  document.body.appendChild(container);

  return new Promise<string>((resolve, reject) => {
    let widgetId = "";
    const done = (fn: () => void) => {
      if (widgetId) turnstile.remove(widgetId);
      container.remove();
      fn();
    };
    widgetId = turnstile.render(container, {
      sitekey: SITE_KEY,
      appearance: "interaction-only", // invisible salvo que Cloudflare pida confirmar
      action: "login",
      callback: (token: string) => done(() => resolve(token)),
      "error-callback": () => done(() => reject(new Error("Turnstile falló"))),
      "timeout-callback": () => done(() => reject(new Error("Turnstile expiró"))),
    });
  });
}

// Accesso con Supabase Auth: email e password, o Google. L'unico file che parla con Supabase.
// Il token di accesso va al backend (api.ts) per leggere e salvare il profilo dell'utente.
// Senza PUBLIC_SUPABASE_URL e PUBLIC_SUPABASE_ANON_KEY l'accesso non c'è e i dati restano nel
// browser, come prima.

import { createClient, type AuthError, type Session } from "@supabase/supabase-js";

const URL_SUPABASE: string | undefined = import.meta.env.PUBLIC_SUPABASE_URL;
const CHIAVE: string | undefined = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

// Solo nel browser: il modulo entra anche nella build statica, dove non c'è una sessione.
const supabase = URL_SUPABASE && CHIAVE && typeof window !== "undefined"
  ? createClient(URL_SUPABASE, CHIAVE, { auth: { flowType: "pkce" } })
  : null;

/** L'accesso è configurato: altrimenti il sito non mostra né "Accedi" né "Esci". */
export const disponibile = !!(URL_SUPABASE && CHIAVE);

export interface Utente {
  id: string;
  email: string | null;
  token: string;
}

const utente = (s: Session | null): Utente | null =>
  s ? { id: s.user.id, email: s.user.email ?? null, token: s.access_token } : null;

/** L'utente che ha fatto accesso, con un token valido (Supabase lo rinnova se serve). */
export async function attuale(): Promise<Utente | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return utente(data.session);
}

/** Chiamata a ogni accesso e uscita, e quando l'utente torna dal link per cambiare password. */
export function suCambio(fn: (u: Utente | null, evento: "accesso" | "uscita" | "nuova-password") => void) {
  let prima: string | null | undefined;   // undefined: sessione iniziale non ancora nota
  supabase?.auth.onAuthStateChange((evento, s) => {
    const u = utente(s);
    if (evento === "PASSWORD_RECOVERY") fn(u, "nuova-password");
    // Rinnovi del token e stato iniziale non sono un cambio di utente.
    if (prima !== undefined && (u?.id ?? null) !== prima) fn(u, u ? "accesso" : "uscita");
    prima = u?.id ?? null;
    // Tornando da Google o da un link nell'email, il codice nell'URL non serve più.
    if (s && new URLSearchParams(location.search).has("code")) {
      const url = new URL(location.href);
      url.searchParams.delete("code");
      history.replaceState(history.state, "", url);
    }
  });
}

/** Messaggio per l'utente; gli errori di Supabase sono in inglese. */
function messaggio(e: AuthError): string {
  switch (e.code) {
    case "invalid_credentials": return "Email o password non corrette.";
    case "email_not_confirmed": return "Conferma prima l'indirizzo email: ti abbiamo mandato un link.";
    case "user_already_exists":
    case "email_exists": return "Esiste già un account con questa email: accedi.";
    case "weak_password": return "Password troppo debole: usa almeno 8 caratteri, con lettere e numeri.";
    case "same_password": return "La nuova password è uguale alla precedente.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit": return "Troppi tentativi: riprova tra qualche minuto.";
    case "validation_failed": return "Controlla l'indirizzo email.";
    default: return "Non è stato possibile completare l'operazione. Riprova.";
  }
}

function client() {
  if (!supabase) throw new Error("Accesso non configurato");
  return supabase;
}

/** null se è andata bene, altrimenti il messaggio da mostrare. */
export async function accedi(email: string, password: string): Promise<string | null> {
  const { error } = await client().auth.signInWithPassword({ email, password });
  return error ? messaggio(error) : null;
}

/** Registra l'utente. confermare: Supabase ha mandato il link di conferma, l'accesso arriva dopo. */
export async function registrati(email: string, password: string): Promise<{ errore: string | null; confermare: boolean }> {
  const { data, error } = await client().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: location.origin + "/" },
  });
  if (error) return { errore: messaggio(error), confermare: false };
  // Con la conferma email attiva, per un'email già registrata Supabase risponde senza errore e
  // con un utente senza identità: non dice altro per non rivelare chi è iscritto.
  return { errore: null, confermare: !data.session };
}

/** Porta a Google e poi sulla pagina dopo (percorso dello stesso sito, es. da destinazione()). */
export async function google(dopo: string): Promise<string | null> {
  const { error } = await client().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: location.origin + dopo },
  });
  return error ? messaggio(error) : null;
}

export async function recuperaPassword(email: string): Promise<string | null> {
  const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/login?mode=new-password" });
  return error ? messaggio(error) : null;
}

export async function nuovaPassword(password: string): Promise<string | null> {
  const { error } = await client().auth.updateUser({ password });
  return error ? messaggio(error) : null;
}

export async function esci(): Promise<void> {
  await supabase?.auth.signOut();
}

// ---------------------------------------------------------------- pagina di accesso

export type Modo = "login" | "signup" | "reset" | "new-password";

/** Porta alla pagina di accesso (pages/login.astro); finito, si torna alla pagina di adesso. */
export function vaiAdAccesso(modo: Modo = "login"): void {
  const qui = location.pathname + location.search;
  location.href = `/login?${new URLSearchParams({ mode: modo, next: qui })}`;
}

/** Dove tornare dopo l'accesso: solo un percorso di questo sito, mai un indirizzo esterno. */
export function destinazione(search: string): string {
  const t = new URLSearchParams(search).get("next") ?? "/";
  // Si decide sull'URL come lo legge il browser, non sul testo: "/\altro.it" porta fuori.
  try {
    const u = new URL(t, location.origin);
    if (u.origin === location.origin && !u.pathname.startsWith("/login")) return u.pathname + u.search + u.hash;
  } catch {
    /* non è un URL: si torna alla home */
  }
  return "/";
}

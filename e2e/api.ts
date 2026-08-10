import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadEnv, readBackendConfig, readCredentials } from "./env";

loadEnv();

const backend = readBackendConfig();
const credentials = readCredentials();
const url = backend?.url;
const key = backend?.key;
const email = credentials?.email;
const password = credentials?.password;

/** True when the API-level specs can authenticate against the backend. */
export const canCallApi = Boolean(url && key && email && password);

export const missingApiConfigMessage =
  "Set VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY plus E2E_EMAIL / E2E_PASSWORD to run API-level tests.";

export type ApiSession = {
  db: SupabaseClient;
  userId: string;
  accessToken: string;
  restUrl: string;
  anonKey: string;
  /** Headers for raw `request` fixture calls against PostgREST. */
  headers: Record<string, string>;
  signOut: () => Promise<void>;
};

/** Authenticate once and hand back everything the API specs need. */
export async function apiSession(): Promise<ApiSession> {
  const db = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.signInWithPassword({
    email: email!,
    password: password!,
  });
  if (error || !data.user || !data.session) {
    throw new Error(`API sign-in failed: ${error?.message ?? "no session"}`);
  }
  const accessToken = data.session.access_token;
  return {
    db,
    userId: data.user.id,
    accessToken,
    restUrl: `${url!.replace(/\/$/, "")}/rest/v1`,
    anonKey: key!,
    headers: {
      apikey: key!,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    signOut: async () => {
      await db.auth.signOut();
    },
  };
}

export type TxRow = {
  id: string;
  type: "income" | "expense";
  amount: number;
  date: string;
  wallet_id: string | null;
  wallet_name: string | null;
  note: string | null;
};

/** Aggregate a transaction list exactly the way the analytics screen does. */
export function aggregate(rows: TxRow[]) {
  const income = rows
    .filter((r) => r.type === "income")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const expenses = rows
    .filter((r) => r.type === "expense")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  return { income, expenses, netFlow: income - expenses };
}

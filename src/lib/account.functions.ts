import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Permanently deletes the signed-in user's account and every row they own.
 * Wallets / transactions / bills / categories / profile cascade from auth.users.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    await supabaseAdmin.from("transactions").delete().eq("user_id", userId);
    await supabaseAdmin.from("bills").delete().eq("user_id", userId);
    await supabaseAdmin.from("categories").delete().eq("user_id", userId);
    await supabaseAdmin.from("wallets").delete().eq("user_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

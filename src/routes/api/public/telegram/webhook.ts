import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const MINI_APP_URL = "https://appfinancetelegram.vercel.app";

function deriveTelegramWebhookSecret(telegramApiKey: string): string {
  return createHash("sha256").update(`telegram-webhook:${telegramApiKey}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function sendMessage(
  lovableApiKey: string,
  telegramApiKey: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "X-Connection-Api-Key": telegramApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[telegram] sendMessage failed [${response.status}]: ${errorBody}`);
    return;
  }

  const payload = (await response.json()) as { ok?: boolean; description?: string };
  if (payload.ok === false) {
    console.error(`[telegram] sendMessage rejected: ${payload.description ?? "unknown error"}`);
  }
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const TELEGRAM_API_KEY = process.env["TELEGRAM_API_KEY"];
        const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
        if (!TELEGRAM_API_KEY || !LOVABLE_API_KEY) {
          console.error("[telegram] missing TELEGRAM_API_KEY or LOVABLE_API_KEY");
          return new Response("Not configured", { status: 500 });
        }

        const expectedSecret = deriveTelegramWebhookSecret(TELEGRAM_API_KEY);
        const actualSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actualSecret, expectedSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = (await request.json()) as {
          message?: { chat?: { id?: number }; text?: string; from?: { first_name?: string } };
          edited_message?: { chat?: { id?: number }; text?: string };
        };

        const message = update.message ?? update.edited_message;
        const chatId = message?.chat?.id;
        const text = (message?.text ?? "").trim();
        if (!chatId) return Response.json({ ok: true, ignored: true });

        const command = text.split(/\s+/)[0]?.toLowerCase().split("@")[0];

        if (command === "/start" || command === "/app" || command === "/buka") {
          const name = update.message?.from?.first_name ?? "";
          await sendMessage(LOVABLE_API_KEY, TELEGRAM_API_KEY, {
            chat_id: chatId,
            parse_mode: "HTML",
            text:
              `<b>C2H KEUANGAN</b>\n\n` +
              `Hai${name ? ` ${name}` : ""}! 👋\n` +
              `Kelola dompet, transaksi, dan tagihan langsung dari Telegram.\n\n` +
              `Tekan tombol di bawah untuk membuka aplikasi.`,
            reply_markup: {
              inline_keyboard: [
                [{ text: "💰 Buka Aplikasi", web_app: { url: MINI_APP_URL } }],
                [{ text: "🌐 Buka di Browser", url: MINI_APP_URL }],
              ],
            },
          });
          return Response.json({ ok: true });
        }

        if (command === "/help" || command === "/bantuan") {
          await sendMessage(LOVABLE_API_KEY, TELEGRAM_API_KEY, {
            chat_id: chatId,
            text: "Perintah tersedia:\n/start — buka Mini App\n/help — bantuan",
          });
          return Response.json({ ok: true });
        }

        return Response.json({ ok: true, ignored: true });
      },
    },
  },
});

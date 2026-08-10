import type { SyncEvent } from "@/lib/sync-status";

/**
 * Support-friendly plain-text dump of the local sync log. Deliberately boring
 * and copy/paste safe so users can drop it straight into a support ticket.
 */
export function formatSyncLog(input: {
  header: string;
  status: string;
  pending: number;
  lastSyncedAt: number | null;
  entries: SyncEvent[];
  labelFor: (status: SyncEvent["status"]) => string;
}): string {
  const lines = [
    input.header,
    `generated: ${new Date().toISOString()}`,
    `state: ${input.status}`,
    `pending: ${input.pending}`,
    `lastSyncedAt: ${input.lastSyncedAt ? new Date(input.lastSyncedAt).toISOString() : "never"}`,
    "",
    "history (newest first):",
  ];
  if (input.entries.length === 0) {
    lines.push("- (empty)");
  } else {
    for (const ev of input.entries) {
      lines.push(
        `- ${new Date(ev.at).toISOString()}  ${ev.status.padEnd(7)}  ${input.labelFor(ev.status)}  pending=${ev.pending}`,
      );
    }
  }
  return lines.join("\n");
}

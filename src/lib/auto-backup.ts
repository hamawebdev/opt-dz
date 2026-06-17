import { getSettings, saveSettings } from "@/db/settings";
import { commands } from "@/lib/bindings";
import { unwrap } from "@/lib/db";
import { todayISO } from "@/lib/format";

/**
 * Runs a scheduled database backup if one is due (enabled, a destination folder is set,
 * and the configured interval has elapsed since the last one). Best-effort: it must
 * never block or break app start. Called once on mount.
 */
export async function runAutoBackupIfDue(): Promise<void> {
  try {
    const s = await getSettings();
    if (s.auto_backup_enabled !== "1") return;
    const dir = s.backup_dir.trim();
    if (!dir) return;

    const intervalDays = Math.max(1, Number(s.auto_backup_interval_days) || 1);
    const last = s.last_auto_backup ? new Date(s.last_auto_backup) : null;
    const now = new Date();
    if (
      last &&
      !Number.isNaN(last.getTime()) &&
      now.getTime() - last.getTime() < intervalDays * 86_400_000
    ) {
      return;
    }

    const stamp = `${todayISO(now)}-${String(now.getHours()).padStart(2, "0")}${String(
      now.getMinutes(),
    ).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const dest = `${dir.replace(/[\\/]+$/, "")}/app-backup-${stamp}.db`;
    unwrap(await commands.backupDatabase(dest));
    await saveSettings({ last_auto_backup: now.toISOString() });
  } catch {
    /* auto-backup is best-effort; never surface to the user at startup */
  }
}

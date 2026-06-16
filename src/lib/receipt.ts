import type { Sale, SaleItem, ShopSettings, ClaimRow } from "@/types";
import type { ReceiptLine } from "@/lib/bindings";
import { formatDZD, formatDate } from "@/lib/format";
import { parseReceiptConfig } from "@/lib/receipt-config";
import i18n from "@/lib/i18n";

/**
 * Builds the pre-formatted lines of a thermal receipt. The Rust `print_receipt`
 * command turns these into ESC/POS bytes; here we lay out columns to the configured
 * character width and pick per-line alignment/emphasis.
 */
function line(
  text = "",
  align: ReceiptLine["align"] = "left",
  bold = false,
  big = false,
): ReceiptLine {
  return { text, align, bold, big };
}

/** Left label + right value padded to `width` columns. */
function twoCol(label: string, value: string, width: number): string {
  const gap = Math.max(1, width - label.length - value.length);
  return label + " ".repeat(gap) + value;
}

export function buildReceiptLines(args: {
  sale: Sale;
  items: SaleItem[];
  settings: ShopSettings;
  claim?: ClaimRow | null;
}): ReceiptLine[] {
  const { sale, items, settings, claim } = args;
  const t = i18n.t.bind(i18n);
  const cfg = parseReceiptConfig(settings.receipt_config);
  const width = Math.max(24, Number(settings.receipt_width) || 48);
  const sym = settings.currency_symbol;
  const rule = "-".repeat(width);
  const lines: ReceiptLine[] = [];

  lines.push(line(settings.shop_name || t("receipt.shopFallback"), "center", true, true));
  if (cfg.header_text) lines.push(line(cfg.header_text, "center"));
  if (cfg.show_address && settings.shop_address) lines.push(line(settings.shop_address, "center"));
  if (cfg.show_phone && settings.shop_phone) lines.push(line(t("receipt.tel", { phone: settings.shop_phone }), "center"));
  lines.push(line(rule));
  lines.push(line(t("receipt.invoice", { number: sale.invoice_number ?? `#${sale.id}` })));
  lines.push(line(t("receipt.date", { date: formatDate(sale.sale_date) })));
  lines.push(line(rule));

  for (const it of items) {
    lines.push(line(it.description));
    const left = `${cfg.show_qty ? `${it.quantity} x ` : ""}${cfg.show_unit_price ? formatDZD(it.unit_price, sym) : ""}`.trim();
    lines.push(line(twoCol(`  ${left}`, formatDZD(it.line_total, sym), width)));
  }

  lines.push(line(rule));
  lines.push(line(twoCol(t("receipt.totalTtc"), formatDZD(sale.total, sym), width)));
  if (cfg.show_tax && sale.tax_amount > 0) lines.push(line(twoCol(`  ${t("receipt.inclTva")}`, formatDZD(sale.tax_amount, sym), width)));
  if (cfg.show_timbre && sale.timbre_amount > 0)
    lines.push(line(twoCol(t("receipt.droitDeTimbre"), formatDZD(sale.timbre_amount, sym), width)));
  if (claim && claim.covered_amount > 0)
    lines.push(line(twoCol(t("receipt.covers", { payer: claim.payer_name }), `-${formatDZD(claim.covered_amount, sym)}`, width)));

  const patientTotal = sale.total + sale.timbre_amount - (claim?.covered_amount ?? 0);
  lines.push(line(twoCol(claim ? t("receipt.patientTotal") : t("receipt.total"), formatDZD(patientTotal, sym), width), "left", true));
  lines.push(line(twoCol(t("receipt.paid"), formatDZD(sale.amount_paid, sym), width)));
  lines.push(line(twoCol(t("receipt.balance"), formatDZD(sale.balance, sym), width)));
  lines.push(line(rule));
  const footer = cfg.footer_text || settings.invoice_footer;
  if (footer) lines.push(line(footer, "center"));

  return lines;
}

/**
 * Builds a real SQLite database, on the real schema, for report-level tests.
 *
 * Money semantics deliberately mirror the Rust write path (`create_sale_tx` et
 * al.) rather than being re-derived: the Rust suite owns *whether the write path
 * is correct*, and this harness owns *whether the reports read it correctly*.
 * Every amount here is therefore stated explicitly by the test, not computed —
 * so a report bug can never be masked by a fixture that makes the same mistake.
 *
 * Every timestamp is required. `paid_at` / `created_at` are stored **UTC**
 * (`YYYY-MM-DD HH:MM:SS`), while `sale_date` is a **local** date-only string,
 * exactly as the POS writes it. That asymmetry is real and is what the
 * date-boundary tests exercise.
 */
import { DatabaseSync } from "node:sqlite";
import { applyMigrations } from "./migrations";
import { __setTestDb } from "./plugin-sql-stub";

export interface ProductOpts {
  name?: string;
  category?: "frame" | "lens" | "accessory";
  purchasePrice?: number;
  sellingPrice?: number;
  quantity?: number;
  minStock?: number;
  itemType?: "product" | "service";
  archived?: boolean;
}

export interface SaleOpts {
  /** Local date-only string, as the POS writes it. */
  saleDate: string;
  patientId?: number | null;
  total: number;
  subtotal?: number;
  taxRate?: number;
  taxAmount?: number;
  timbre?: number;
  status?: "paid" | "partial" | "unpaid" | "void";
  items?: { productId?: number | null; description?: string; qty: number; unitPrice: number; unitCost: number }[];
}

export class Scenario {
  readonly db: DatabaseSync;
  private invoiceSeq = 1;
  private cnSeq = 1;

  constructor() {
    this.db = new DatabaseSync(":memory:");
    this.db.exec("PRAGMA foreign_keys = ON");
    applyMigrations(this.db);
    __setTestDb(this.db);
  }

  close(): void {
    __setTestDb(null);
    this.db.close();
  }

  private run(sql: string, params: Record<string, unknown> = {}): number {
    return Number(this.db.prepare(sql).run(params).lastInsertRowid);
  }

  setting(key: string, value: string): void {
    this.run(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      { $1: key, $2: value },
    );
  }

  patient(name: string): number {
    return this.run("INSERT INTO patients (full_name) VALUES ($1)", { $1: name });
  }

  product(o: ProductOpts = {}): number {
    return this.run(
      `INSERT INTO products (category, name, purchase_price, selling_price, quantity,
                             min_stock, item_type, archived)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      {
        $1: o.category ?? "frame",
        $2: o.name ?? "Frame",
        $3: o.purchasePrice ?? 300_00,
        $4: o.sellingPrice ?? 900_00,
        $5: o.quantity ?? 10,
        $6: o.minStock ?? 2,
        $7: o.itemType ?? "product",
        $8: o.archived ? 1 : 0,
      },
    );
  }

  variant(productId: number, o: { quantity?: number; minStock?: number; purchasePrice?: number | null; sellingPrice?: number | null; archived?: boolean } = {}): number {
    return this.run(
      `INSERT INTO product_variants (product_id, label, quantity, min_stock,
                                     purchase_price, selling_price, archived)
       VALUES ($1, 'v', $2, $3, $4, $5, $6)`,
      {
        $1: productId,
        $2: o.quantity ?? 5,
        $3: o.minStock ?? 1,
        $4: o.purchasePrice ?? null,
        $5: o.sellingPrice ?? null,
        $6: o.archived ? 1 : 0,
      },
    );
  }

  /** An invoice with explicit money, plus optional lines carrying their COGS. */
  sale(o: SaleOpts): number {
    const total = o.total;
    const subtotal = o.subtotal ?? total;
    const id = this.run(
      `INSERT INTO sales (patient_id, sale_date, subtotal, discount_type, discount_value,
                          total, tax_rate, tax_amount, timbre_amount, invoice_number,
                          amount_paid, balance, status)
       VALUES ($1, $2, $3, 'amount', $4, $5, $6, $7, $8, $9, 0, $10, $11)`,
      {
        $1: o.patientId ?? null,
        $2: o.saleDate,
        $3: subtotal,
        $4: subtotal - total,
        $5: total,
        $6: o.taxRate ?? 0,
        $7: o.taxAmount ?? 0,
        $8: o.timbre ?? 0,
        $9: `F${String(this.invoiceSeq++).padStart(6, "0")}`,
        $10: o.status === "void" ? 0 : total + (o.timbre ?? 0),
        $11: o.status ?? "unpaid",
      },
    );
    for (const it of o.items ?? []) {
      this.run(
        `INSERT INTO sale_items (sale_id, product_id, description, unit_price, quantity,
                                 item_discount, line_total, unit_cost)
         VALUES ($1, $2, $3, $4, $5, 0, $6, $7)`,
        {
          $1: id,
          $2: it.productId ?? null,
          $3: it.description ?? "Line",
          $4: it.unitPrice,
          $5: it.qty,
          $6: it.unitPrice * it.qty,
          $7: it.unitCost,
        },
      );
    }
    return id;
  }

  /** `paidAt` is a UTC `YYYY-MM-DD HH:MM:SS` timestamp. */
  payment(saleId: number, amount: number, paidAt: string, method = "cash"): number {
    const id = this.run(
      "INSERT INTO payments (sale_id, amount, paid_at, method) VALUES ($1, $2, $3, $4)",
      { $1: saleId, $2: amount, $3: paidAt, $4: method },
    );
    this.resync(saleId);
    return id;
  }

  /** `createdAt` is a UTC `YYYY-MM-DD HH:MM:SS` timestamp. */
  creditNote(
    o: { saleId: number | null; patientId?: number | null; total: number; method: "refund" | "balance"; createdAt: string; items?: { productId?: number | null; description?: string; qty: number; lineTotal: number }[] },
  ): number {
    const id = this.run(
      `INSERT INTO credit_notes (sale_id, patient_id, total, method, cn_number, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      {
        $1: o.saleId,
        $2: o.patientId ?? null,
        $3: o.total,
        $4: o.method,
        $5: `A${String(this.cnSeq++).padStart(6, "0")}`,
        $6: o.createdAt,
      },
    );
    for (const it of o.items ?? []) {
      this.run(
        `INSERT INTO credit_note_items (credit_note_id, product_id, description, quantity, line_total)
         VALUES ($1, $2, $3, $4, $5)`,
        { $1: id, $2: it.productId ?? null, $3: it.description ?? "Line", $4: it.qty, $5: it.lineTotal },
      );
    }
    if (o.saleId !== null) this.resync(o.saleId);
    return id;
  }

  expense(o: { expenseDate: string; category?: string; amount: number; note?: string; method?: string }): number {
    return this.run(
      `INSERT INTO expenses (expense_date, category, amount, note, method)
       VALUES ($1, $2, $3, $4, $5)`,
      {
        $1: o.expenseDate,
        $2: o.category ?? "other",
        $3: o.amount,
        $4: o.note ?? null,
        $5: o.method ?? "cash",
      },
    );
  }

  supplierPurchase(supplierId: number, amount: number, createdAt: string): number {
    return this.run(
      `INSERT INTO supplier_ledger (supplier_id, type, amount, created_at)
       VALUES ($1, 'purchase', $2, $3)`,
      { $1: supplierId, $2: amount, $3: createdAt },
    );
  }

  supplier(name: string): number {
    return this.run("INSERT INTO suppliers (name) VALUES ($1)", { $1: name });
  }

  /**
   * Recomputes amount_paid/balance/status the way `sync_sale_balance` does.
   * Void sales are frozen, matching the Rust command.
   */
  private resync(saleId: number): void {
    this.db
      .prepare(
        `UPDATE sales SET
           amount_paid = COALESCE((SELECT SUM(amount) FROM payments WHERE sale_id = sales.id), 0),
           balance = MAX(0,
             total + timbre_amount
             - COALESCE((SELECT covered_amount FROM claims WHERE sale_id = sales.id), 0)
             - COALESCE((SELECT SUM(total) FROM credit_notes
                         WHERE sale_id = sales.id AND method = 'balance'), 0)
             - COALESCE((SELECT SUM(amount) FROM payments WHERE sale_id = sales.id), 0))
         WHERE id = $1 AND status <> 'void'`,
      )
      .run({ $1: saleId });
    this.db
      .prepare(
        `UPDATE sales SET status = CASE
             WHEN balance <= 0 THEN 'paid'
             WHEN amount_paid <= 0 THEN 'unpaid'
             ELSE 'partial' END
         WHERE id = $1 AND status <> 'void'`,
      )
      .run({ $1: saleId });
  }
}

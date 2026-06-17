# Opt DZ — User Manual for Optical Shops

A complete, plain-language guide to running your optical shop with **Opt DZ**.

> This manual describes the application exactly as it is built today. Every screen,
> button, and rule mentioned here exists in the app. Nothing here is a future plan.

---

## Table of contents

1. [What Opt DZ is](#1-what-opt-dz-is)
2. [First-time setup](#2-first-time-setup)
3. [Finding your way around](#3-finding-your-way-around)
4. [The Dashboard](#4-the-dashboard)
5. [Quick Sale (the counter / POS)](#5-quick-sale-the-counter--pos)
6. [Patients (clients)](#6-patients-clients)
7. [Prescriptions](#7-prescriptions)
8. [Sales & invoices](#8-sales--invoices)
9. [Returns, refunds & voiding](#9-returns-refunds--voiding)
10. [Lab jobs](#10-lab-jobs)
11. [Appointments](#11-appointments)
12. [Inventory (products & stock)](#12-inventory-products--stock)
13. [Suppliers](#13-suppliers)
14. [Insurance (payers & claims)](#14-insurance-payers--claims)
15. [Tracking & expiry](#15-tracking--expiry)
16. [Notifications](#16-notifications)
17. [Reports](#17-reports)
18. [Settings](#18-settings)
19. [Money, tax & numbering explained](#19-money-tax--numbering-explained)
20. [Data safety: backups & restore](#20-data-safety-backups--restore)
21. [The complete customer journey (end to end)](#21-the-complete-customer-journey-end-to-end)
22. [Quick reference: statuses & roles](#22-quick-reference-statuses--roles)

---

## 1. What Opt DZ is

Opt DZ is a **desktop application for managing an optical shop**. It runs on one
computer at the shop counter and brings together, in a single place, everything you do
every day:

- **Patients (clients)** — their details, prescriptions, and history.
- **Inventory** — frames, lenses, accessories, and services.
- **Sales** — selling at the counter, invoices, payments, and balances.
- **Lab jobs** — tracking glasses from "ordered" to "collected."
- **Appointments** — booking eye exams and check-ins.
- **Insurance** — third-party payers (CNAS, CASNOS, mutuelles) and reimbursement claims.
- **Suppliers** — what you owe each supplier.
- **Reports** — daily takings, taxes, best-sellers, and money still owed to you.

### Things that are true everywhere in the app

- **It works offline.** No internet is required. Your data lives on the shop computer.
- **It is built for one shared till.** Everyone uses the same screen; you choose
  *who is at the till* so actions can be recorded against a name.
- **It speaks your language.** The interface is available in **Arabic, French, and
  English**, including right-to-left layout for Arabic.
- **Money is in Algerian Dinar (DA / DZD)** and Algerian taxes (TVA and stamp duty) are
  handled for you.
- **It is forgiving.** Most "deletions" are really **archiving** — the item is hidden
  but its history is kept and can be restored.

---

## 2. First-time setup

The very first time you open Opt DZ, a short **welcome wizard** appears. It takes less
than a minute.

1. **Choose your language** — Arabic, French, or English. *(You can change this anytime
   in Settings.)*
2. **Welcome** — a short introduction.
3. **Name your shop** — e.g. *Optique El Amel*. This name appears on the sidebar and on
   printed invoices.
4. **Money symbol** — the currency symbol shown on prices (default **DA**).
5. **Taxes are ready** — the usual Algerian taxes are already set for you (**TVA 19%**
   and **stamp duty**). You can change them later in Settings.
6. **Choose how you want to work** — *Simple mode* or *Show everything* (see below).

You can **Skip for now** and finish setup later in Settings.

### Simple mode vs. Show everything

- **Simple mode (Keep it simple)** — shows only daily work: Dashboard, Quick Sale,
  Patients, Sales, Appointments, Lab jobs, Inventory, and Settings. Back-office areas
  (Suppliers, Insurance, Reports, Tracking) are hidden so the screen stays uncluttered.
- **Show everything (Full mode)** — shows every feature.

You can switch between the two at any time in **Settings**. Settings itself is always
visible, so you can always turn simple mode back off.

### Sample data (optional)

To practice safely, open **Settings → Sample data** and choose **Add sample data**. This
loads example patients, products, and sales so you can try the app. You can remove them
later.

---

## 3. Finding your way around

### The sidebar (left side)

The menu is split into two groups:

**Daily** — the handful of things you touch every day:

| Menu | What it's for |
|------|----------------|
| **Dashboard** | Today's overview and shortcuts. |
| **Quick Sale** | The fast counter screen for selling. |
| **Patients** | Find and manage clients. |
| **Sales** | All invoices and their payment status. |
| **Appointments** | Book and check in eye exams. |
| **Lab jobs** | Track glasses being made. |
| **Inventory** | Products and stock. |

**Manage** — back-office areas (hidden in simple mode, except Settings):

| Menu | What it's for |
|------|----------------|
| **Tracking** | Products approaching their expiry date. |
| **Suppliers** | Supplier balances and ledgers. |
| **Insurance** | Payers and reimbursement claims. |
| **Reports** | Revenue, tax, and outstanding balances. |
| **Settings** | Everything about your shop and the app. |

### The top bar

- **Who is at the till** — pick the active staff member. Their name is recorded against
  sensitive actions (see [Staff & security](#staff--security)).
- **Notification bell** — low-stock, expiry, and recall alerts (see
  [Notifications](#16-notifications)).
- **Language and theme** are changed in Settings (Light, Dark, or System).

---

## 4. The Dashboard

The Dashboard is your "good morning" screen. At the top it asks **"What do you want to
do?"** with quick shortcuts:

- **New sale** · **Find or add patient** · **Today's appointments** ·
  **Glasses ready** · **New patient** · **Add product**

Below the shortcuts you'll see live figures and lists:

- **Today's sales** and **amount collected today**.
- **Invoices today** — how many sales you've made.
- **Low-stock items** — how many products are running low.
- **Outstanding balance** — total money customers still owe you.
- **Revenue — last 14 days** — a simple chart of recent takings.
- **Low-stock alerts** — which products to reorder (with current vs. minimum stock).
- **Pending payments** — customers with a balance due.
- **Due for recall** — patients whose last eye exam is older than your recall interval.
  These also trigger a notification when you open the app.
- **Active lab jobs** — glasses currently being made, with their expected-ready dates.

---

## 5. Quick Sale (the counter / POS)

**Quick Sale** is the fast screen for selling at the counter. It is designed for speed:
tap products into a cart, take payment, print a receipt.

### The product side

- **Search** by name, model, reference, **barcode**, brand, color, or supplier.
- **Scan** a barcode to add an item instantly. If no product matches, you'll see
  *"No product for barcode …"*.
- Switch between **Grid** and **List** views.
- Filter by **brand**, **color**, **In stock** only, **Favorites** (starred products),
  or **Recently sold**.
- Each product shows a stock pill: **In stock**, **Low stock**, or **Out of stock**.
- If a product has **variants** (e.g. different colors or sizes), tapping it asks you to
  **Choose a variant** first. Each variant has its own stock and barcode.

### The cart (current sale)

- The cart is titled **Current sale**. Tap a product to add it; an empty cart shows
  *"Cart is empty — tap a product to add it."*
- **Customer:** a sale can be for a **Walk-in customer** (no client record needed) or you
  can **Add customer** / **Change** to attach a patient. You can also **Remove customer**.
- **Adjust quantities** or **Remove item** per line.
- **Discount** can be applied to the sale.
- **Hold** — park the current cart to serve another customer, with an optional label
  (e.g. *"blue counter"*). Held carts appear in the **Held sales** strip and can be
  **Resumed** later. Holding a sale never touches stock.
- **Clear all** empties the cart (with a confirmation).

### Taking payment

1. Tap **Pay**.
2. Enter the **Amount received**. The app shows the **Change** to give back.
3. Tap **Complete sale**.

After completing, you can **Print receipt** or start a **New sale**. Stock is only
checked and reduced at this point — never while a cart is just being held or edited.

> If an item is out of stock, the app warns you (*"… is out of stock"*) and will not let
> the sale reduce stock below zero.

> **Note:** Quick Sale is the express counter flow. For a detailed invoice with insurance
> coverage, prescriptions, and partial payments, use the full **Sales → New Sale** form
> (see [Sales & invoices](#8-sales--invoices)).

---

## 6. Patients (clients)

The **Patients** screen lists your clients. Each patient has a unique **client code**
(e.g. `P-0001`) generated automatically.

### Finding a patient

Use the search box to search by **name, phone, National ID (NIN), or code**. An
**Advanced search** lets you filter by date added, and by any custom client fields you
have set up.

### Adding or editing a patient

Tap **New Patient** (or **Edit** on an existing one). Fields include:

- **Full name** *(required)*
- **Phone**, **Secondary phone**, **Email**
- **Date of birth**
- **National ID (NIN)** — 18 digits; optional
- **Address**, **Notes**
- **Photo**
- **Insurance:** default **Insurer** (CNAS/CASNOS/mutuelle), **Coverage %**, and
  **Policy / affiliation number**. These pre-fill on the patient's future sales.
- **Custom fields** — any extra fields your shop has defined (e.g. Tags like *VIP*,
  *Lentilles*, *Assuré*, *À rappeler*).

**Duplicate check:** if you enter details that match an existing client, the app warns
*"Possible duplicate?"* and lets you **Create anyway** or stop.

### The patient's page

Opening a patient shows everything about them:

- **Prescription history** — add or view prescriptions.
- **Sales history** — their invoices, with status and linked lab jobs.
- **Activity log** — a timeline of events (created, edited, sale, payment, appointment,
  prescription).
- **Account statement** — a printable statement of invoices, payments, insurer shares,
  and credit notes over a period, with totals invoiced and settled.
- **New Sale** — start a sale for this patient.

### Importing many clients at once

**Patients → Import** lets you bring in clients from a **CSV file**:

1. **Download the template**.
2. Fill it in (the `full_name` column is required).
3. **Choose file** to upload it. The app shows how many rows are ready.
4. Optionally **import duplicates too**.
5. **Import** — it reports how many clients were added.

### Archiving, deleting & merging

- **Archive** hides a patient from the list but keeps **all** their prescriptions, sales,
  and history. You can restore them later. (This is the safe option.)
- **Delete** removes the patient and their prescription history. *If the patient has any
  linked sales, deletion is blocked* — archive instead.
- **Merge** combines a duplicate patient into the one you want to keep; their sales,
  prescriptions, jobs, appointments, credit notes, and history move across.

---

## 7. Prescriptions

A prescription records the optical values for a patient. Open a patient and choose **Add
prescription**.

- **Exam date** and optional **Expiry date** (used for recalls).
- **Lens type:** Single vision, Bifocal, or Progressive.
- **Per eye (OD = right, OS = left):** Sphere, Cylinder, Axis, Add, PD, Prism + Base,
  and Segment height.
- **Contact-lens values per eye:** Base curve (BC) and Diameter (DIA).
- **Prescriber** (doctor's name, optional) and **Notes**.

Leave any field blank if it wasn't measured. The app checks values for you (for example,
**axis must be 0–180**, and powers go in **0.25 steps**).

Prescriptions are **never destroyed by accident** — they are kept as part of the medical
record even when a patient is archived.

---

## 8. Sales & invoices

The **Sales** screen lists every invoice with its **status** (Paid, Partial, Unpaid, or
Voided). You can filter by patient.

### Creating a detailed sale

**Sales → New Sale** opens the full invoice form:

1. **Select a patient** (or leave as walk-in where allowed).
2. Optionally attach a **Prescription**.
3. **Add items:**
   - **Scan a barcode**, or
   - **Add product from inventory** (search the catalog), or
   - add a **Custom** line (free description and price) for one-off items.
4. Adjust **quantity**, **unit price**, and per-line **discount**.
5. **Insurance / payer:** choose an insurer and the **coverage %**. The covered amount
   becomes a separate receivable; the patient owes the rest.
6. **Payment method** and **Amount paid now** (you can take a partial payment).
7. **Create sale.**

The summary shows **Subtotal**, **Discount**, **Total (TTC)** (with *incl. TVA*),
**Droit de timbre** (stamp duty, added automatically on cash sales), the **payer's
share**, the **Patient total**, and the **Balance due**.

### After a sale is created

Open any sale to:

- **Record payment** — add a further payment toward the balance.
- **Print invoice / Print receipt** — print a full invoice, or send a slip to a thermal
  receipt printer. (Receipt printing needs the printer set up first in Settings.)
- **Print / Save as PDF.**
- View **Payment history** and **Returns / credit notes**.
- **Return** goods or **Void** the invoice (see next section).

> **Automatic lab job:** when a sale includes a **lens**, Opt DZ automatically opens a
> **lab job** so the glasses can be tracked through production. See [Lab jobs](#10-lab-jobs).

---

## 9. Returns, refunds & voiding

### Returns (credit notes)

On a sale, choose **Return**. You select **how many** of each item to give back. The app:

- **Restores the stock** of returned goods.
- Creates a **credit note** (with its own avoir number) — the original invoice is kept.

Choose **how to credit** the customer:

- **Cash refund** — give the money back (up to what was actually paid).
- **Reduce balance** — apply the credit to what the customer still owes.

### Voiding an invoice

If an invoice was a mistake (wrong customer, entry error), use **Void**. Voiding:

- **Keeps the invoice and its number** for the records (it shows as *Voided*).
- **Restores stock.**
- **Cancels any insurance claim** on it.

Voiding **cannot be undone**. Because it is sensitive, it can require the **manager PIN**
if one has been set.

---

## 10. Lab jobs

**Lab jobs** track a pair of glasses from the lab to the customer's hand. A job is
created automatically whenever a sale includes a lens (or you can manage existing ones).

A job moves through these stages:

**Ordered → At lab → Edging → Ready → Collected**

For each job you can set the **Lab name** and the **Expected ready date**, and add notes.
The Dashboard's *Active lab jobs* and the *Glasses ready* shortcut help you see what's in
progress and what's waiting for collection. Each stage change is recorded in the job's
history.

---

## 11. Appointments

**Appointments** manages on-site eye exams.

- **New appointment:** choose a **patient**, **date & time**, **duration**,
  **optometrist** (typed in), and a **reason** (e.g. *Eye exam, check-up*).
- **Conflict warning:** the app alerts you if the slot overlaps another appointment with
  the same optometrist.
- **Views:** Day, Week, Agenda, and **Check-in**.
- **Status flow:** Booked → **Arrived** → **Done** (or **No-show** / **Cancelled**).
- **Record exam:** when an exam is done, you can record the prescription it produced and
  link it to the appointment.

---

## 12. Inventory (products & stock)

**Inventory** is your product catalog and stock control.

### Products

Tap **New Product** (or **Edit**). Key fields:

- **Item type:** **Product** (physical, has stock) or **Service** (non-physical, no
  stock — e.g. a fitting fee).
- **Category** *(required):* **Frame**, **Lens**, or **Accessory**. The category drives
  whether a lab job is created at sale time.
- **Name** *(required)*, **Brand**, **Reference code**, **Supplier**.
- **Purchase price** and **Selling price** (DZD).
- **Quantity in stock** and **Low-stock threshold**.
- **Barcode** — scan an existing one or **Generate** a new one.
- **Expiry date** — for items that expire.
- **Attributes** — extra optical details shown for the product's type/category (e.g.
  frame material/shape/rim/size, lens material/index/coatings, gender, "suitable for").
- **Variants** — add **color/size variants**, each with its own stock and barcode. A
  product is either *simple* (one stock figure) or *variant* (stock per variant).
- **Photos** — add product images and mark one as primary.

### Searching & filtering

Search by name, brand, or reference. Filter by **brand** and by **availability**
(All stock / In stock / Low stock / Out of stock).

### Receiving stock (deliveries)

Use **Record delivery** on a product to log new stock from a supplier: enter the
**quantity received**, an optional **purchase price**, and a note (e.g. invoice
reference). Always use this rather than editing the stock number by hand, so the history
stays correct. Stock can never go below zero.

### Labels

**Print label** creates a barcode label for a product: choose the **format**, what to
show (logo, name, price, SKU), the size in millimetres, and the number of copies. You can
**print one**, **print a sheet**, **export a PNG**, or print to a **thermal** label
printer.

### Archiving vs. deleting

- **Archive** hides a discontinued product from the catalog and Quick Sale, but keeps its
  stock history and past sales. You can restore it.
- **Delete** removes the product from the catalog; past sale lines are still kept.

---

## 13. Suppliers

*(Full mode only.)* **Suppliers** keeps a running account of what you owe each supplier.

- Add a supplier with **name, phone, email, address, notes**.
- Each supplier has a **ledger** with a running **balance owed**.
- Add ledger entries of type **Purchase**, **Payment**, **Debt**, or **Adjustment**.
- **Record payment** reduces what you owe.
- Suppliers can be **archived** (hidden from pickers) rather than deleted.

---

## 14. Insurance (payers & claims)

*(Full mode only.)* **Insurance** manages third-party payers and reimbursement claims.

### Payers

Set up insurers / third-party payers (e.g. **CNAS, CASNOS, mutuelles**) with a **default
coverage %**. That default pre-fills on a sale and can be overridden per sale. A payer
that already has claims cannot be removed.

### Claims

Every insured sale creates a **claim** for the covered amount. Claims have a status:

**Pending → Submitted → Partial / Paid** (or **Rejected**).

When an insurer pays, use **Record reimbursement** to log the amount received. The
covered amount is tracked separately from the patient's own balance.

---

## 15. Tracking & expiry

*(Full mode only.)* **Tracking** lists products that have an **expiry date**, flagged as:

- **Expired**, **Expiring soon** (within your warning window), or **OK**.

It shows how many days are left (or how many days ago an item expired). The warning window
in days is set in Settings.

---

## 16. Notifications

The **bell** in the top bar collects alerts:

- **Out of stock** and **Low stock** products.
- **Expired** and **Expiring soon** products.
- **Patient recalls due** — when patients' last exam is older than your recall interval
  (also shown on launch).

You can **mark items read**, **mark all read**, **view all**, and **restore dismissed**
notifications.

---

## 17. Reports

*(Full mode only.)* **Reports** summarises your business over a chosen **period**:

- **Revenue in period.**
- **TVA collected** (plus stamp duty).
- **Best-selling products** (units and revenue).
- **Outstanding balances** — invoices with money still owed, and the total outstanding.

---

## 18. Settings

Settings is organised into sections.

### Shop information
Shop **name**, **address**, **phone**, **logo**, **currency symbol**, and **invoice
footer** — these appear on printed invoices.

### Appearance & language
**Theme** (Light, Dark, System) and **interface language** (Arabic, French, English).
This is also where you turn **Simple mode** on or off.

### Tax & invoicing
Prices are **tax-inclusive (TTC)**; TVA is extracted from the total, and stamp duty is
added automatically on cash sales. You can set:

- **TVA rate (%)**
- **Timbre (stamp duty) rate, minimum, and maximum** (a maximum of 0 means no cap)
- **Invoice prefix** and **number of digits**

*Changes apply to new sales only.*

### Reminders
**Recall interval (months)** — patients whose last exam is older than this appear in the
Dashboard recall list and trigger a launch notification.

### Receipt printer
For an **ESC/POS thermal printer**: set the **device path / queue** and the **characters
per line** (≈48 for 80mm paper). Use **Print receipt** on a sale to test. Leave the path
empty to disable.

### Data & backups
Manual **SQLite backups** and **spreadsheet (CSV) exports** of patients, products, and
sales. See [Data safety](#20-data-safety-backups--restore).

### Catalog management
- **Categories** and **Brands** — add and rename.
- **Attribute templates** — define custom product fields per type/category, and custom
  **client fields** for patients. Each field can be Text, Number, Dropdown, or
  Multi-select, and can appear as a catalog filter.
- **Colors** — the shared color list used across products and variants, with
  **French/Arabic** labels and a color **swatch**. Managers can add, edit, **merge**
  duplicates, and map old free-text colors during the *colors to review* cleanup.
- **Receipt designer** — choose what prints on receipts/invoices (logo, address, phone,
  VAT, stamp duty, and which columns to show) with a live preview.
- **Expiring-soon window (days)** — drives the Tracking and expiry alerts.

### Staff & security
- **Who is at the till** — add staff members, each with a **role** (Owner, Optometrist,
  Optician, Cashier, Staff).
- **Manager PIN** — a PIN required for sensitive actions (such as voiding invoices and
  large discounts). Leave it empty and save to remove it. *This is accountability for a
  shared till, not strong security; it pairs with the activity log.*
- **Automatic backups** — turn on and set the interval in days; backups are written to
  the backup folder when due, on app start.
- **Recent activity (audit log)** — an append-only record of who did what and when.

---

## 19. Money, tax & numbering explained

- **Currency:** all amounts are in **Algerian Dinar (DA / DZD)**. (Internally, money is
  stored in centimes — 1 DA = 100 — for exact arithmetic. You always see whole Dinar
  amounts.)
- **TVA (VAT):** prices are **tax-inclusive**. The TVA portion (default **19%**) is
  *extracted from* the total rather than added on top.
- **Droit de timbre (stamp duty):** a small fixed fee added automatically **on cash
  invoices**, based on the rate/minimum/maximum you set.
- **Insurance coverage:** the insurer's share is a separate receivable; the customer's
  balance is only their own portion (plus any stamp duty).
- **Invoice numbers** are **continuous and gap-free** — every sale gets the next number
  using your prefix and digit settings. Voided invoices keep their number.
- **Credit notes (avoir)** have their own sequential numbering.

---

## 20. Data safety: backups & restore

Your data lives on the shop computer, so backups matter.

- **Backup now** — save a copy of the database to your chosen **backup folder**. On the
  first backup you'll be asked to pick the folder.
- **Automatic backups** — when enabled, a backup is made on app start when one is due,
  keeping a set number of recent copies.
- **Export to CSV** — export patients, products, or sales to a spreadsheet. (Money columns
  export in centimes — 1 DA = 100.)
- **Restore from file** — replaces **all** current data with a selected backup. The app
  makes a safety copy of the current database first, then **restarts**. Restore is
  protected because it overwrites everything.

**Golden rules**

- Prefer **Archive** over **Delete** — archiving keeps the history.
- Keep **automatic backups on** and the backup folder on a safe drive.
- Use **Record delivery** for stock-in and the **Return** flow for stock-back, so history
  stays accurate.

---

## 21. The complete customer journey (end to end)

Here is how a typical customer flows through Opt DZ, from walking in to collecting their
finished glasses.

**Step 1 — The customer arrives.**
Open **Patients**, search by name or phone. If they're new, choose **New Patient** and
fill in their details (the duplicate check warns you if they already exist). If they have
insurance, record their insurer, coverage %, and policy number now — it will pre-fill on
their sales.

**Step 2 — The eye exam (if needed).**
If they booked an exam, find them in **Appointments** and mark them **Arrived**. After the
optometrist measures their eyes, choose **Record exam** to save the **prescription**
(sphere, cylinder, axis, add, PD, and so on) and link it to the visit.

**Step 3 — Choosing frames and lenses.**
Go to **Quick Sale** for a fast counter sale, or **Sales → New Sale** for a detailed
invoice. Add the **frame** (scan its barcode or search), the **lenses**, and any
**accessories** or **services**. If the frame has color/size **variants**, pick the right
one. Apply a **discount** if agreed.

**Step 4 — Insurance and payment.**
On the detailed sale, select the **insurer** and **coverage %** — the app splits the bill
into the **insurer's share** and the **patient's total**. Take the customer's payment
(full or **partial**), choose the **method**, and **Create sale**. The app assigns the
next **invoice number**, computes **TVA** and (for cash) **stamp duty**, and shows the
**balance due**.

**Step 5 — The glasses go to the lab.**
Because the sale includes a **lens**, Opt DZ automatically opens a **lab job**. Set the
**lab name** and **expected ready date**, and move it through **Ordered → At lab → Edging
→ Ready** as work progresses.

**Step 6 — Print and hand over the paperwork.**
**Print the invoice** (or a thermal **receipt**) for the customer. They leave with their
paperwork; the glasses follow when ready.

**Step 7 — Collection.**
When the lab job is **Ready**, the Dashboard's *Glasses ready* shortcut shows it. The
customer returns, pays any **remaining balance** (open the sale → **Record payment**), and
you mark the job **Collected**.

**Step 8 — Afterwards.**
- If something is wrong, use **Return** (restock + credit note) or **Void** (cancel the
  invoice, keep the number).
- Claim insurance reimbursement in **Insurance → Claims**, and **Record reimbursement**
  when the payer pays.
- Months later, the customer appears in **Due for recall**, and you can book their next
  exam in **Appointments** — and the journey begins again.

---

## 22. Quick reference: statuses & roles

### Sale status
| Status | Meaning |
|--------|---------|
| **Paid** | Fully paid. |
| **Partial** | Some money paid, a balance remains. |
| **Unpaid** | No payment yet. |
| **Voided** | Cancelled invoice, kept for the records; stock restored. |

### Lab job status
**Ordered → At lab → Edging → Ready → Collected**

### Insurance claim status
**Pending → Submitted → Partial / Paid → Rejected**

### Appointment status
**Booked → Arrived → Done** (or **No-show** / **Cancelled**)

### Staff roles
**Owner · Optometrist · Optician · Cashier · Staff**

### Payment methods
**Cash · Card · Cheque · Transfer**

---

*This manual reflects Opt DZ as currently built. If a screen on your computer looks
different, your shop may be running a different version, or a feature may be hidden by
**Simple mode** — turn it off in Settings to see everything.*

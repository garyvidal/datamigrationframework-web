#!/usr/bin/env python3
"""
Expand the Northwind PostgreSQL database to ~10GB by inserting synthetic data.

Targets the standard pgsql-northwind schema. Generates:
  - Synthetic customers (char(5) IDs)
  - Orders linked to customers/employees/shippers
  - Order details linked to orders/products

Requirements:
    pip install psycopg2-binary

Usage:
    python expand_northwind.py [--target-gb 10] [--host localhost] [--port 5432]
                               [--dbname northwind] [--user postgres] [--password postgres]
"""

import psycopg2
from psycopg2.extras import execute_values
import random
import string
import argparse
import time
from datetime import datetime, timedelta

# ── config ─────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description="Expand Northwind DB to target size")
    p.add_argument("--target-gb",  type=float, default=10.0)
    p.add_argument("--host",       default="localhost")
    p.add_argument("--port",       type=int, default=55432)
    p.add_argument("--dbname",     default="northwind")
    p.add_argument("--user",       default="postgres")
    p.add_argument("--password",   default="postgres")
    p.add_argument("--batch-size", type=int, default=5_000,
                   help="Rows per insert batch (tune for memory vs speed)")
    return p.parse_args()

# ── helpers ────────────────────────────────────────────────────────────────────

ALPHA = string.ascii_uppercase

def rand_customer_id(seq: int) -> str:
    """Encode an integer as a 5-char base-26 string (AAAAA .. ZZZZZ)."""
    chars = []
    n = seq
    for _ in range(5):
        chars.append(ALPHA[n % 26])
        n //= 26
    return ''.join(reversed(chars))

def rand_company(rng: random.Random) -> str:
    words = ["Global", "Pacific", "Northern", "Allied", "Premier", "Summit",
             "Metro", "Delta", "Apex", "Stellar", "United", "Blue Ridge",
             "Cascade", "Ironside", "Pinnacle", "Silver", "Harbor", "Coastal"]
    suffixes = ["Inc.", "LLC", "Corp.", "Ltd.", "& Co.", "Group", "Partners", "Enterprises"]
    return f"{rng.choice(words)} {rng.choice(words)} {rng.choice(suffixes)}"

def rand_date(rng: random.Random, start: datetime, end: datetime) -> datetime:
    delta = end - start
    return start + timedelta(seconds=rng.randint(0, int(delta.total_seconds())))

def get_db_size_gb(cur) -> float:
    cur.execute("SELECT pg_database_size(current_database()) / (1024.0 * 1024 * 1024)")
    return cur.fetchone()[0]

def fmt_gb(gb: float) -> str:
    return f"{gb:.3f} GB"

# ── phase helpers ──────────────────────────────────────────────────────────────

COUNTRIES = ["USA", "UK", "Canada", "Germany", "France", "Brazil", "Mexico",
             "Spain", "Italy", "Australia", "Japan", "India", "Sweden", "Norway"]

def generate_customers(conn, cur, n: int, offset: int, rng: random.Random):
    """Insert n synthetic customers starting at seq offset."""
    rows = []
    for i in range(n):
        cid   = rand_customer_id(offset + i)
        comp  = rand_company(rng)[:40]
        rows.append((
            cid,
            comp,
            f"Contact {offset+i}",
            rng.choice(["Owner", "Sales Rep", "Manager", "Director"]),
            f"{rng.randint(100,999)}-{rng.randint(1000,9999)}",
            f"{rng.randint(10,999)} Main St",
            f"City{rng.randint(1,5000)}",
            None,
            f"{rng.randint(10000,99999)}",
            rng.choice(COUNTRIES),
            f"({rng.randint(100,999)}) {rng.randint(100,999)}-{rng.randint(1000,9999)}",
        ))
    execute_values(cur, """
        INSERT INTO customers
            (customer_id, company_name, contact_name, contact_title,
             address, city, region, postal_code, country, phone, fax)
        VALUES %s
        ON CONFLICT DO NOTHING
    """, rows, template="(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)")
    conn.commit()

def generate_orders_and_details(
    conn, cur,
    customer_ids: list, employee_ids: list, shipper_ids: list, product_ids: list,
    target_gb: float, batch_size: int, rng: random.Random
):
    """Alternate between inserting order batches and checking DB size."""
    start_dt  = datetime(1996, 1, 1)
    end_dt    = datetime(2030, 12, 31)

    # Fetch max existing order_id so we don't collide
    cur.execute("SELECT COALESCE(MAX(order_id), 0) FROM orders")
    order_seq = cur.fetchone()[0] + 1

    FREIGHT_SCALE = 200.0
    UNIT_PRICES   = [round(random.uniform(2.0, 250.0), 2) for _ in range(500)]
    DETAILS_PER_ORDER = (2, 8)  # min/max line items per order

    total_orders   = 0
    total_details  = 0
    phase_start    = time.time()

    print("\n── Phase 2: Generating orders + order_details ──────────────────────────────")

    while True:
        cur.execute("SELECT pg_database_size(current_database()) / (1024.0*1024*1024)")
        current_gb = cur.fetchone()[0]
        if current_gb >= target_gb:
            print(f"\n  Target reached: {fmt_gb(current_gb)}")
            break

        order_rows  = []
        detail_rows = []

        for _ in range(batch_size):
            oid       = order_seq
            order_seq += 1
            cid       = rng.choice(customer_ids)
            eid       = rng.choice(employee_ids)
            sid       = rng.choice(shipper_ids)
            odate     = rand_date(rng, start_dt, end_dt)
            rdate     = odate + timedelta(days=rng.randint(7, 30))
            sdate     = odate + timedelta(days=rng.randint(1, 6))

            order_rows.append((
                oid, cid, eid, odate.date(), rdate.date(), sdate.date(),
                sid, round(rng.uniform(0, FREIGHT_SCALE), 2),
                f"Ship Co {rng.randint(1,200)}"[:40],
                f"{rng.randint(1,999)} Dock Ave",
                f"City{rng.randint(1,5000)}",
                None, f"{rng.randint(10000,99999)}",
                rng.choice(COUNTRIES),
            ))

            n_items = rng.randint(*DETAILS_PER_ORDER)
            prods   = rng.sample(product_ids, min(n_items, len(product_ids)))
            for pid in prods:
                detail_rows.append((
                    oid, pid,
                    rng.choice(UNIT_PRICES),
                    rng.randint(1, 130),
                    round(rng.choice([0.0, 0.0, 0.05, 0.10, 0.15, 0.20, 0.25]), 2),
                ))

        execute_values(cur, """
            INSERT INTO orders
                (order_id, customer_id, employee_id, order_date, required_date, shipped_date,
                 ship_via, freight, ship_name, ship_address, ship_city, ship_region,
                 ship_postal_code, ship_country)
            VALUES %s ON CONFLICT DO NOTHING
        """, order_rows)

        execute_values(cur, """
            INSERT INTO order_details
                (order_id, product_id, unit_price, quantity, discount)
            VALUES %s ON CONFLICT DO NOTHING
        """, detail_rows)

        conn.commit()

        total_orders  += len(order_rows)
        total_details += len(detail_rows)
        elapsed        = time.time() - phase_start
        rate           = total_orders / elapsed if elapsed > 0 else 0

        print(f"  {fmt_gb(current_gb):>10} / {fmt_gb(target_gb)}  "
              f"orders={total_orders:>9,}  details={total_details:>10,}  "
              f"{rate:,.0f} orders/s",
              end="\r", flush=True)

    print()
    return total_orders, total_details

# ── main ───────────────────────────────────────────────────────────────────────

def main():
    args    = parse_args()
    rng     = random.Random(42)  # reproducible
    target  = args.target_gb

    print(f"Connecting to {args.user}@{args.host}:{args.port}/{args.dbname} …")
    conn = psycopg2.connect(
        host=args.host, port=args.port,
        dbname=args.dbname, user=args.user, password=args.password,
    )
    conn.autocommit = False
    cur = conn.cursor()

    current_gb = get_db_size_gb(cur)
    print(f"Current DB size : {fmt_gb(current_gb)}")
    print(f"Target DB size  : {fmt_gb(target)}")

    if current_gb >= target:
        print("Database is already at or above the target size. Nothing to do.")
        return

    # ── widen smallint columns that would overflow at 32,767 rows ────────────
    print("\nEnsuring order_id columns are INTEGER (not SMALLINT) …")
    cur.execute("""
        DO $$
        BEGIN
            -- orders.order_id
            IF (SELECT data_type FROM information_schema.columns
                WHERE table_name='orders' AND column_name='order_id') = 'smallint' THEN
                ALTER TABLE order_details DROP CONSTRAINT IF EXISTS order_details_order_id_fkey;
                ALTER TABLE orders ALTER COLUMN order_id TYPE integer;
                ALTER TABLE order_details ALTER COLUMN order_id TYPE integer;
                ALTER TABLE order_details ADD CONSTRAINT order_details_order_id_fkey
                    FOREIGN KEY (order_id) REFERENCES orders(order_id);
                -- widen the backing sequence if present
                ALTER SEQUENCE IF EXISTS orders_order_id_seq AS integer;
            END IF;
        END $$;
    """)
    conn.commit()
    print("  Done.")

    # ── fetch reference IDs ──────────────────────────────────────────────────
    cur.execute("SELECT customer_id FROM customers")
    existing_customers = [r[0] for r in cur.fetchall()]
    cur.execute("SELECT product_id  FROM products")
    product_ids  = [r[0] for r in cur.fetchall()]
    cur.execute("SELECT employee_id FROM employees")
    employee_ids = [r[0] for r in cur.fetchall()]
    cur.execute("SELECT shipper_id  FROM shippers")
    shipper_ids  = [r[0] for r in cur.fetchall()]

    if not product_ids:
        print("ERROR: No products found. Load the base Northwind data first.")
        return
    if not employee_ids:
        print("ERROR: No employees found. Load the base Northwind data first.")
        return

    print(f"\nFound: {len(existing_customers)} customers, {len(product_ids)} products, "
          f"{len(employee_ids)} employees, {len(shipper_ids)} shippers")

    # ── phase 1: generate enough synthetic customers ─────────────────────────
    # We need ~20M orders; to avoid hot-spotting on 91 real customers we
    # pre-generate a large synthetic customer pool.
    SYNTHETIC_CUSTOMERS = 50_000
    print(f"\n── Phase 1: Generating {SYNTHETIC_CUSTOMERS:,} synthetic customers ──────────────")

    # Find offset: how many 5-char IDs are already taken
    # Use a numeric offset safely above the real data range
    offset_start = 300_000  # well above any hand-crafted IDs
    batch = 5_000
    generated = 0
    while generated < SYNTHETIC_CUSTOMERS:
        n = min(batch, SYNTHETIC_CUSTOMERS - generated)
        generate_customers(conn, cur, n, offset_start + generated, rng)
        generated += n
        print(f"  {generated:>7,} / {SYNTHETIC_CUSTOMERS:,} customers", end="\r", flush=True)
    print()

    # Reload full customer list
    cur.execute("SELECT customer_id FROM customers")
    all_customers = [r[0] for r in cur.fetchall()]
    print(f"  Total customers now: {len(all_customers):,}")

    # ── phase 2: generate orders + order_details ─────────────────────────────
    t0 = time.time()
    orders, details = generate_orders_and_details(
        conn, cur,
        customer_ids=all_customers,
        employee_ids=employee_ids,
        shipper_ids=shipper_ids if shipper_ids else [1, 2, 3],
        product_ids=product_ids,
        target_gb=target,
        batch_size=args.batch_size,
        rng=rng,
    )
    elapsed = time.time() - t0

    final_gb = get_db_size_gb(cur)
    print(f"\nDone in {elapsed:.1f}s")
    print(f"  Orders inserted   : {orders:>12,}")
    print(f"  Details inserted  : {details:>12,}")
    print(f"  Final DB size     : {fmt_gb(final_gb)}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()

# PK-Hotels — Approved Room Inventory
| Category | Room numbers | Count |
|---|---|---:|
| Normal | 1–10 | 10 |
| Standard | 101–110 | 10 |
| Deluxe | 201–210 | 10 |
| Super VVIP | 111, 222, 333, 77, 66, 11, 22, 33, 55, 44 | 10 |
| **Total** | | **40** |

The exact room numbers have been provided by hotel management. Do not change or auto-renumber them.

## Seed
Run `apps/api/prisma/phase1.sql` first on a **new dedicated PK-Hotels PostgreSQL database**, then `apps/api/prisma/seed-pk-hotels-rooms.sql`.

The seed is idempotent, asserts 40 rooms, and upserts the **approved nightly rates**: Normal SAR 60, Standard SAR 100, Deluxe SAR 200, Super VVIP SAR 500. Occupancy capacity **2** remains provisional and must be confirmed before live operations. Do not run this seed against the existing unrelated Supabase project.

## Reservation room charge
The API stores the category's nightly rate as a **snapshot** in each reservation. Nights = departure date minus arrival date; room subtotal (SAR) = nights × stored nightly rate. The API returns `nights` and `roomSubtotalSar` for new reservations and SQL-derived `nights` and `room_subtotal_sar` for reservation listings. This is **room subtotal only**; VAT, discounts, service fees, deposits and payments are not yet implemented. Changing future category rates will not retroactively alter existing reservation snapshots.

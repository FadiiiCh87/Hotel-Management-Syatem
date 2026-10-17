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

The seed is idempotent and asserts 40 rooms. Room types have provisional **0** nightly rates and provisional capacity **2**, neither of which is an approved business value. **Do not take real reservations until rates and capacities are confirmed and configured.** Do not run this seed against the existing unrelated Supabase project.

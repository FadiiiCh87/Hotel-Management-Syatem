# PK-Hotels production release gate
This checklist must be completed before accepting real hotel operations.

- [ ] Dedicated database provisioned and migrations applied
- [ ] All 40 real room identifiers, categories and approved nightly rates entered
- [ ] Staff identity verified; admin password rotated and MFA enabled
- [ ] No hardcoded passwords, tokens, secrets or guest identity documents
- [ ] Database constraint tested with two concurrent overlapping reservation requests
- [ ] Room-block versus reservation concurrency resolved at database transaction level
- [ ] Check-in validates identity, room readiness, business date and actual arrival
- [ ] Check-out reconciles folio and housekeeping state
- [ ] Payment and invoice flows implemented, audited and reconciled
- [ ] Guest PII retention, consent, access and deletion rules approved
- [ ] Backup and point-in-time recovery tested
- [ ] Load tests, security tests and operational UAT passed
- [ ] HTTPS, monitoring, alerting and rollback confirmed
- [ ] Saudi compliance requirements reviewed by qualified professionals

**Do not accept live guest records or payments until this checklist is completed.**

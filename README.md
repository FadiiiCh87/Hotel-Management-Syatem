# Aurelia Hotel Management System

**Status: development scaffold, not production-ready.**

A single-hotel management system built around Next.js, NestJS, PostgreSQL, Prisma and Docker.

## Available development artifact
The source ZIP has been prepared in the ChatGPT conversation. It includes:
- Responsive Next.js frontend with 17 module views and demo data
- NestJS health API and Swagger foundation
- Initial Prisma schema for rooms, guests, reservations, folios, payments and housekeeping
- Docker Compose for PostgreSQL and Redis
- GitHub Actions CI starting configuration
- Local setup notes

## Important limitations
This repository currently contains the project handoff summary. The application source is provided in the downloadable ZIP and needs to be uploaded to this repo before CI or deployment can run. The frontend is a prototype, not a working hotel PMS. Booking concurrency, financial ledger, authentication, access control, e-invoicing, production security and testing remain to be developed.

Never upload production guest records or secrets. Do not expose this prototype as a real booking/payment system.

## Planned stack
Next.js 15, React 19, NestJS 10, PostgreSQL 17, Prisma, Docker, GitHub Actions.

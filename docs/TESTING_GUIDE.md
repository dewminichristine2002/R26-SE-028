# Testing Guide

Run commands from the repository root unless noted.

## Backend test categories

```powershell
cd backend
npm.cmd run test:unit
npm.cmd run test:integration
npm.cmd run test:nfr
npm.cmd run test:e2e
npm.cmd run test:all
```

Use `npm.cmd` on Windows if PowerShell blocks `npm.ps1`.

## What each category covers

- Unit: isolated service/controller/repository logic under `tests/unit`.
- Integration: Express route behaviour across every backend route family with mocked auth, database, and external service boundaries.
- NFR: non-functional checks for performance, usability, security, and reliability.
- E2E: authenticated HTTP flows for prediction chat plus a whole-backend system journey across health, auth, users, medications, routines, intake monitoring, allergies, prescriptions, emotional support, assistant, predictions, and health advice with mocked external DB/ML dependencies.

## Evidence report

```powershell
cd backend
npm.cmd run test:evidence
```

This writes `docs/TESTING_EVIDENCE.md` with command results for all four categories.

# Emotional Support Module

This module is intentionally isolated from the shared group application so it can be implemented without modifying other team members' code.

## Scope

- Elder emotional check-ins
- Emotion detection pipeline
- Empathetic intervention selection
- Cognitive activity recommendation
- Caregiver trend monitoring and alerts

## Integration Points

- Mount router in the shared server when the team is ready:
  `app.use('/api/emotional-support', emotionalSupportRoutes)`
- Connect repository methods to the team's PostgreSQL pool
- Link `elderUserId` and `caregiverUserId` columns to the shared auth tables once those schemas are finalized

## Current Contents

- `models/emotionalSupportModel.sql`
  PostgreSQL schema for this module
- `contracts/api-contract.md`
  Endpoint-level API contract
- `routes/`, `controllers/`, `services/`, `utils/`
  Backend scaffolding for the module

## Suggested Delivery Order

1. Apply the PostgreSQL schema
2. Wire repository layer to the shared DB connection
3. Mount the router
4. Connect elder navigation to the frontend screens
5. Replace rule-based analysis with the trained model API

# ConsultPrep AI frontend

This Next.js 16 / React 19 package contains the current local UI previews. The patient intake and clinician workspace are not connected to authentication, backend APIs, AI, or durable database storage.

## Run locally

```powershell
npm ci
npm run dev
```

Open `http://localhost:3000`. The main routes are `/intake`, `/intake/states`, and `/clinician`.

Available checks include `npm run lint`, `npm run typecheck`, `npm run test:run`, `npm run build`, and `npm run test:e2e`. For full project and database setup, environment variables, AI configuration, deployment guidance, and known blockers, see the repository's [setup and handoff guide](../SETUP_AND_HANDOFF.md).

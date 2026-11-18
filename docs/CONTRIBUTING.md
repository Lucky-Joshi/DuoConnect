# Contributing

Thanks for taking a look at DuoConnect. The project is intentionally structured so changes stay small and predictable.

## Getting set up

```bash
npm install
npm run dev
```

Read [SETUP.md](SETUP.md) for environment details and [ARCHITECTURE.md](ARCHITECTURE.md) for the layering rules.

## Before you open a PR

```bash
npm run lint
npm test
npm run build
```

Optional but recommended for changes touching chat, presence, or calls:

```bash
node scripts/smoke-rest.mjs
node scripts/smoke-realtime.mjs
```

## Project rules

### Backend

- Keep the flow `routes → controller → service → repository`.
- Services must not import Express or Socket.IO.
- Publish domain facts with `emitToUser`/`emitToUsers` from `realtime/events.js`.
- Validate every external input with Zod. Do not trust client IDs, URLs, or ownership claims.
- Parameterize SQL. Never interpolate user input.
- Use the provided error helpers (`badRequest`, `forbidden`, `notFound`, `conflict`) so responses keep their shape.
- Add an index if a new query filters or sorts on a column, and include it in the migration.
- Write migrations as new numbered files; never edit an applied migration in a shared database.

### Frontend

- Use React function components and hooks. No class components.
- Keep server state in Zustand stores; keep ephemeral UI state local.
- Route all HTTP through `lib/api.js` (interceptors handle auth/refresh).
- Do not import Socket.IO outside `lib/socket.js` and `hooks/useSocketBridge.js`.
- Use CSS Modules and existing tokens. Avoid inline styles unless a value is dynamic.
- Reuse UI primitives from `components/ui/` instead of duplicating buttons, fields, modals, or empty states.
- Handle loading, empty, error, and disabled states for every async surface.
- Never block the composer or call UI on non-critical requests.

### Style

- 2 spaces, single quotes, semicolons, trailing commas.
- Run `npm run format` before committing.
- Name booleans with `is/has/can/should`.
- Prefer early returns over nested conditionals.
- Keep components focused; extract when a file grows past a screenful of concerns.

## Commits

Use a conventional-style summary:

```text
feat(chat): add in-thread message search
fix(auth): return null refresh when no cookie exists
docs(api): document call signaling payloads
test(server): cover attachment ownership
```

One logical change per commit. Include a short body when the “why” is not obvious.

## Adding a feature

1. Start with the data model if new state is needed.
2. Add the service and repository methods with tests.
3. Expose REST and/or socket events with validation.
4. Wire the client store, socket bridge, and UI.
5. Cover loading/error/empty states and mobile layout.
6. Update the relevant docs (`API.md`, `SCHEMA.md`, `TESTING.md`).
7. Run the checks above.

## Adding a migration

```bash
server/src/db/migrations/002_your_change.sql
```

- Use `IF NOT EXISTS` / `IF EXISTS` where sensible.
- Keep it idempotent and forward-only.
- Test against both PGlite and Postgres if possible.

## Security reports

Please do not open a public issue for a vulnerability. Describe the impact and reproduction steps privately to the maintainer, and allow time for a fix before disclosure.

## Code of conduct

Be direct, kind, and curious. Critique code, not people. Assume good intent. No harassment or exclusionary language.

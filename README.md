# meter-management-demo
Demo app for the tracking and management of utility meters.

## Prerequisites
- Docker Desktop
- Ports 8080, 3000, and 5433 open

## Setup
The entire application (PostgreSQL database, Fastify API, and Vue 3 Frontend) is containerized with Docker Compose. Run a single command from the project root:

```bash
docker compose up -d --build
```

Once running, access the application in your browser:
- **Frontend App**: [http://localhost:8080](http://localhost:8080)
- **Backend API**: [http://localhost:3000](http://localhost:3000) (or via reverse proxy at `http://localhost:8080/api`)
- **API Health Check**: [http://localhost:3000/health](http://localhost:3000/health)
- **PostgreSQL Database**: `localhost:5433`

> **Note**: Database schema migrations and rich demo scenarios (multi-family premises, solar generation, water leaks, register wraps, and telemetry outage gaps) are automatically applied and seeded on initial container startup.

To stop the application:
```bash
docker compose down
```

## Key Decisions
- **Database View:** Using a postgres view to handle consumption to avoid 1: having to cascade updates when meter reads are corrected or backdated and 2: keep the math out of the frontend because pagination would be a nightmare and 3: I've never used a view before, seems worth learning.
- **Unit of Measure:** Not handling UOM for the demo. If this were production, I would build out UOM normalization as part of the data ingestion process so that data across the core tables maintains consistency, and tracking/handling differing UOM would be an extension of the current code without needing a refactor.
- **End to End Testing:** Skipping full E2E testing for the demo. I built an integration test harness I'm proud of already and unit tests are easy enough. This would be one of the first things I'd build if I were to expand this project.
- **DB Optimizations:** Decided to benchmark different index setups. Overkill, but fun and educational. See BENCHMARK.md
- **Frontend:** Spent less effort designing the frontend/UX myself. I felt like the backend I built provided somewhat easy passthrough implementation of the frontend, and admittedly I was more interested in the architecture than the UI. This is a shortcut I would absolutely revisit if I were expanding the project. I'd do some proper research and map things out rather than handing an agent "Build this page, it will need the ability to..."
- **Service-Points:** Added an intermediary piece when designing the data model. I didn't like the idea of replicating a hundred full addresses for a multifam apartment with 50 units or a retail space with submeters. The service-points table sits between locations and meters so that a meter can belong to a different space at the same mailing address.
- **Other:** I think the very first thing I would add would be authentication. I skipped it for the demo, but that's such a big part of a system that it would need to be done first. Then designing the ingestion pipeline. Then probably implementing some proper data analysis for the dashboards. I could go on. Lots of room for improvement. Lots of cool backend/data things I could do to procrastinate working on UI. I'd work on the UI though. Probably.

## Tech Stack
- **Docker (Compose):** Containerized for easy deployment and to ensure a smooth setup for reviewers. Added benefit of forcing clear separation between frontend/backend/db.
- **PostgreSQL DB:** Listed requirement.
- **Drizzle ORM:** This is the coolest ORM I have ever used. Bundling migration scripts with the code so you can sync up SQL scripts with code changes is so beautiful. Also the fact that you can write your schema in typescript and have it generate the SQL migrations for you is sick.
- **Fastify Backend Server:** I was deciding between Fastify and Express, skipping on Nuxt so that the backend server existed as a separate service. That seemed to align better with the project requirements. Decided against Express since Fastify seemed like it had less boilerplate and presented more of a learning opportunity. Fastify also makes adding API docs easy as a future improvement. I didn't read that far into it but it seems like it will auto generate an OpenAPI spec for you.
- **PGLite DB:** One of the cool benefits of DB migrations living with the app code is that it makes integration testing super straightforward. PGLite runs a Postgres DB in node; you can run all your migrations and seed data against it and have a perfect in-process db to run tests against. This is the other thing that I got really excited about.
- **Vue 3/Vite:** Makes a lot of the hard parts of frontend easy. The bundled state management (Pinia) makes it *almost* feel like you're NOT rebelling against nature by building stateful apps in a functional programming language. The scaffolding scripts and built in router are very convenient. Also an inside informant told me that Vue would be relevant. That may have played a part. Possibly.

## AI Disclosure

- **Tools Used:**
  - Google Gemini Web App: Conversational planning, organization, and time management.
  - Google agy CLI: Embedded coding assistance.
  - Claude Code: One quick pass as a coding assistant over UI to tidy formatting. Review passes to identify loose ends.
- **Prompts Log:** All coding assistant prompts are logged to `prompts.log`.

## Open Items

The following were found during my final review, which I would address if I were to continue work on this project.
- User input for installedOn accepts dates that don't exist as long as they are formatted as dates e.g. "2026-13-32"
- Missing a unique constraint on meter readings' meter_id and read_at, duplicate timestamps on meter reads for the same meter breaks pagination and usage calcs
- Old query params in the backend survived pruning. You can query service locations and pass a city to filter on, but it doesn't actually filter, and you can query readings with a date-range, but it ignores that you passed start/end dates.
- Raw SQL slipped into meters.ts that subverts drizzle type matching. Kinda defeats the purpose of typescript if you subvert your types. 
- Frontend hits the service locations' tree endpoint once for each service location. Bad implementation given that the backend has bulk queries aplenty.
# meter-management-demo
Demo app for the tracking and management of utility meters.

## Key Decisions
- **Database View:** Using a postgres view to handle consumption to avoid 1: having to cascade updates when meter reads are corrected or backdated and 2: keep the math out of the frontend because pagination would be a nightmare and 3: I've never used a view before, seems worth learning.
- **Unit of Measure:** Not handling UOM for the demo. If this were production, I would build out UOM normalization as part of the data ingestion process so that data across the core tables maintains consistency, and tracking/handling differing UOM would be an extension of the current code without needing a refactor.

## AI Disclosure

- **Tools Used:** Google Gemini Web App: Conversational planning, organization, and time management.
  - Google Gemini Web App: Conversational planning, organization, and time management.
  - Google agy CLI: Embedded coding assistance.
  - Claude Code: Quick passes over UI to tidy formatting
- **Prompts Log:** All coding assistant prompts are logged to [`prompts.log`](file:///C:/Users/theos/source/repos/meter-management-demo/prompts.log).


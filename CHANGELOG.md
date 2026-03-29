# Changelog

All notable changes to this project will be documented in this file.

## [v1.0.0] - Initial release

### Major features
- First-run setup wizard for device and API initialization
- Event import from The Blue Alliance (events/matches)
- Scout assignment management (manual + auto-assign)
- Scout match workflow with dynamic SurveyJS forms
- Quick action submission flags: No Show / Broken Robot
- Form Builder with per-event active schema and version increments
- Multi-path data sync: network (staged), QR, CSV, DB snapshot
- Analysis dashboard for team-level strategic review
- Settings with TBA API key management, logs, updates, shortcuts
- In-app Help route and expanded documentation set

### Known limitations
- Network sync backend replication is scaffolded but not fully integrated
- Automated unit/integration test suite is not yet included
- Video tutorials are placeholder links pending publication

### Future roadmap
- Complete CouchDB-compatible replication backend
- Add test coverage (unit, integration, e2e smoke)
- Add role-based workflows for lead scouts and data analysts
- Add richer analysis and picklist tooling
- Add signed installer pipeline and release automation

# Matchbook v2.0.0 - Complete Rewrite Release Notes

**Release Date:** April 3, 2026  
**GitHub:** [rishanreddy/matchbook](https://github.com/rishanreddy/matchbook)

---

## 🎉 Major Rewrite: Python/Flask → Electron Desktop App

Matchbook has been completely rewritten from the ground up as a modern Electron desktop application. This release represents a fundamental architectural change with significant improvements in performance, user experience, and maintainability.

---

## ✨ What's New

### Core Architecture
- **Electron 34** - Native desktop app for Windows, macOS, and Linux
- **React 19** - Modern UI framework with React Compiler
- **TypeScript** - Full type safety throughout the codebase
- **Vite 7** - Lightning-fast HMR and optimized production builds
- **RxDB + Dexie** - Offline-first reactive database with IndexedDB
- **Mantine UI v7** - Polished, accessible component library

### Brand Refresh
- **New Name:** "Matchbook" (formerly Offline Scouting Manager)
- **New Identity:** Fresh branding, updated logo, modern color scheme
- **FRC Colors:** Blue (#1a8cff) and Orange (#ff8800) accent palette

### User Experience
- **Native Desktop Feel:** Proper window chrome, native menus, system integration
- **Cross-Platform Shortcuts:** `Cmd/Ctrl` key adapts to OS
- **Smart Onboarding:** First-run wizard with device and API setup
- **Current Event Indicator:** Always-visible event context in sidebar
- **Responsive Design:** Works on all screen sizes (tablet/laptop friendly)

### Enhanced Features
#### Events Page
- Direct TBA website links for each event
- District badges (FIM, PNW, etc.)
- Event type icons (Championship, Regional, District)
- Week indicators
- Text search + event type filtering
- Improved card layout with hover effects

#### Home Page
- Unified header with integrated event selector
- Better visual hierarchy (Hub vs Scout modes)
- Contextual tinted backgrounds
- Quick action buttons for common tasks

#### Analysis Page
- **Expandable team cards** with match-level details
- **Sortable raw data table** (9 columns: Team, Match, scores, device, timestamp, notes)
- Fixed chart tooltip backgrounds (no more white flash)
- Better data visualization

#### Sync & Data Management
- Optional event association (no longer required)
- Nullable `eventId` in schema
- Improved CSV import/export
- QR code sync maintained

### Performance
- **82% smaller main bundle** (650kB → 114kB)
- Lazy-loaded routes (FormBuilder, Analysis, Sync)
- Optimized code splitting for large dependencies
- Fast cold start (<2s to interactive)

### Developer Experience
- Comprehensive `AGENTS.md` coding guidelines
- Strict TypeScript with no implicit any
- ESLint + Prettier configured
- Type-safe Electron IPC bridge
- Hot module replacement in dev mode

---

## 🔧 Technical Details

### Technology Stack
```
Frontend:    React 19 + TypeScript + Mantine UI
Build:       Vite 7 + Electron Builder
Database:    RxDB + Dexie (IndexedDB)
Charts:      Recharts
Forms:       SurveyJS
API:         TBA API v3 (official client)
State:       Zustand
Routing:     React Router v7
```

### Bundle Optimization
- Main chunk: **114 kB** (was 650 kB)
- SurveyJS: Lazy-loaded, split into 3 chunks
- Charts: Separate chunk (410 kB)
- Database: Separate chunk (404 kB)
- Icons: Separate chunk (15 kB)

### Database Schema v5
- Collections: events, matches, teams, scouts, devices, assignments, scoutingData, formSchemas
- Nullable `eventId` field (event association optional)
- Migration from v4 (`'unknown'` → `null`)

---

## ⚠️ Breaking Changes

### For Existing Users
1. **New Database:** App now uses `matchbook` database (old `offline-scouting-manager` DB remains but isn't accessed)
2. **Data Re-import Required:** Users need to re-import events from TBA
3. **LocalStorage Keys Changed:** `osm-*` → `matchbook-*` (preferences reset)
4. **New App ID:** `com.frc.matchbook` (may appear as new app on some systems)

### Data Preservation
- Old database is NOT deleted, just not accessed
- Users can re-import events quickly from TBA
- Scout data can be re-created or imported from CSV backup

---

## 📦 Installation

### Download
Grab the installer for your platform from the [Releases page](https://github.com/rishanreddy/matchbook/releases):
- **Windows:** `Matchbook-Setup-2.0.0.exe`
- **macOS:** `Matchbook-2.0.0.dmg` or `Matchbook-2.0.0-arm64.dmg` (Apple Silicon)
- **Linux:** `Matchbook-2.0.0.AppImage` or `.deb`

### First Run
1. Launch Matchbook
2. Complete onboarding wizard:
   - Set device name and role (Hub or Scout)
   - Enter TBA API key (Hubs only)
   - Optionally configure scout name
3. Import events from TBA
4. Start scouting!

---

## 🎯 Migration Guide

### From OSM v0.1.x (Python/Flask)
1. **Export Data:** If you have critical data in OSM 0.1.x, export to CSV before upgrading
2. **Install Matchbook 2.0:** Download and install the new version
3. **Complete Onboarding:** Set up device and API key
4. **Re-import Events:** Fetch events from TBA (quick, takes seconds)
5. **Import Old Data (Optional):** Use CSV import in Sync page if needed

### TBA API Key
Get your API key at: https://www.thebluealliance.com/account
- Required for Hubs (lead scout devices)
- Optional for Scout devices

---

## 🐛 Known Issues

None identified. Please report issues at: https://github.com/rishanreddy/matchbook/issues

---

## 🙏 Credits

- **TBA API:** The Blue Alliance for FRC event data
- **SurveyJS:** Dynamic form builder
- **Mantine:** UI component library
- **RxDB:** Reactive database
- **Electron:** Cross-platform desktop framework

---

## 📝 Changelog Summary

### Added
- Electron desktop app architecture
- Native OS integration (menus, shortcuts, window chrome)
- Smart onboarding with database verification
- Current event indicator in sidebar
- Event search and filtering
- TBA website links on event cards
- District badges and event type icons
- Expandable team cards in Analysis
- Raw data table with sorting
- Bundle code-splitting and lazy loading
- Comprehensive developer documentation

### Changed
- Complete rewrite from Python to TypeScript
- Database: SQLite → RxDB/IndexedDB
- Branding: Offline Scouting Manager → Matchbook
- Event association now optional (nullable)
- Home page layout (unified header)
- Chart tooltip styling (dark theme fix)
- GitHub repo: `Offline_Scouting_Manager` → `matchbook`

### Removed
- Python/Flask backend
- SQLite database
- Old documentation files
- Legacy localStorage migration logic

### Fixed
- Splash screen blocking interactions
- Chart tooltips showing white background
- Event selector feeling out of place
- Onboarding not showing with fresh database
- Large bundle sizes (82% reduction)
- Keyboard shortcuts not working reliably

---

## 🚀 What's Next

Future enhancements planned:
- Auto-update mechanism
- Cloud sync (optional)
- Advanced analytics (OPR, EPA)
- Custom field statistics
- Export to Tableau/CSV
- Mobile companion app

---

## 📞 Support

- **Issues:** https://github.com/rishanreddy/matchbook/issues
- **Discussions:** https://github.com/rishanreddy/matchbook/discussions
- **Documentation:** See README.md and AGENTS.md

---

**Enjoy scouting with Matchbook! 🔥📖**

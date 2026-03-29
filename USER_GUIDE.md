# Offline Scouting Manager - User Guide

> Audience: scouts, scouting leads, and drive team strategy members.

## Getting Started

### Installation
1. Download the latest release build from your team’s distribution channel.
2. Install and open **Offline Scouting Manager**.
3. Allow required permissions (camera for QR scanning, file access for imports/exports).

### First-time setup wizard
1. On first launch, complete the **Welcome Setup** wizard.
2. Enter a friendly **Device name** (example: `Team 1234 - Tablet 2`).
3. Mark **This is the primary sync device** for your hub laptop.
4. Enter your **TBA API key**.
5. Click **Test Connection**.
6. Click **Start using app**.

### Device registration
1. Open **Device Setup** from navigation.
2. Confirm device name/role and save.
3. Ensure every scout device has a unique name.

### TBA API key setup
1. Open **Settings → The Blue Alliance API**.
2. Paste key in **TBA API Key**.
3. Click **Test Connection**.

---

## Event Management

### Importing events from TBA
1. Go to **Events**.
2. Select **Season Year**.
3. Click **Fetch Events**.
4. Find your event and click **Import**.

Imported data includes:
- Event metadata
- Match schedule
- Team roster reference (for lookups)

### Viewing event details
- Imported events show **Imported** badge.
- Home page lists imported events and date range.

---

## Scout Assignments

### Creating assignments
1. Open **Assignments**.
2. Select event.
3. Expand a qualification match.
4. Pick a scout for each alliance position.
5. Click **Assign**.

### Auto-assign feature
1. Open **Assignments**.
2. Click **Auto-assign**.
3. App fills all unassigned slots in round-robin scout order.

### Managing scout roster
- Add/update scouts in **Device Setup** and team setup workflows.
- Ensure each scout maps to a device for consistent assignment routing.

---

## Scouting Workflow

### Viewing current assignment
1. Open **Scout**.
2. Review **Your Current Assignment** card.
3. Click **START SCOUTING**.

### Filling out forms
- Complete all required fields in the active form.
- Submit via survey completion or `Ctrl/Cmd + S`.

### Quick actions (No Show / Broken Robot)
- Use **No Show** for absent teams.
- Use **Broken Robot** for inoperable robot cases.

### Submitting observations
- Submission saves locally to device database.
- Confirmation toast appears on success.

---

## Form Builder

### Creating custom scouting forms
1. Open **Form Builder**.
2. Select event.
3. Edit fields/pages in Survey Creator.
4. Set form name.
5. Click **Save Form**.

### Form templates
- Default template is loaded for new events.
- You can clone and adapt for game-specific scoring.

### Previewing forms
- Click **Preview Form** to test before publishing.

---

## Data Sync

### Network sync (hub and spoke)
- **Hub device**: start server and share URL.
- **Client device**: enter URL and click **Connect and Sync**.
- Note: backend replication integration is staged; workflow UI is ready.

### QR code export/import
1. In **Sync → QR**, choose date range + collection.
2. Click **Export Recent Data**.
3. On receiving device, click **Scan QR Code** and scan all chunks.
4. Click **Import**.

### CSV export/import
1. Open **Sync → CSV**.
2. Export scouting data to CSV.
3. Import CSV on another device.
4. Duplicates are skipped when `syncHash` matches.

### Database snapshots
1. Open **Sync → Database**.
2. Click **Export Database File** for full JSON snapshot.
3. Use **Import Database** to merge snapshot.

---

## Analysis Dashboard

### Team overview
- View team-level summaries and performance trends.

### Team details
- Drill into form responses and scoring splits by match.

### Building picklists
- Use analysis insights to rank teams for alliance selection.

### Data quality checks
- Review missing submissions, suspicious outliers, and duplicates.

---

## Settings and Configuration

### TBA API key management
- Stored locally in app settings.
- Re-test connection after changing key.

### Device settings
- Configure primary vs secondary roles.

### Keyboard shortcuts
- `Ctrl/Cmd + K`: command palette
- `Ctrl/Cmd + ,`: settings
- `Ctrl/Cmd + S`: save scout form
- `Ctrl/Cmd + H`: home
- `Ctrl/Cmd + Shift + S`: scout
- `Ctrl/Cmd + Shift + A`: analysis
- `Ctrl/Cmd + Shift + Y`: sync
- `?`: shortcuts help

### Viewing logs
1. Open **Settings → Advanced**.
2. Click **View Logs** or **Export Logs**.

---

## Troubleshooting

### Common issues
- **No events fetched:** verify TBA key, internet, and season year.
- **No assignments visible:** confirm device is registered and assigned.
- **QR scan fails:** improve lighting, steady camera, scan all chunks in sequence.
- **CSV import errors:** ensure required columns exist.

### Error messages
- Read toasts/alerts carefully; most include actionable fix guidance.
- Export logs and attach them when escalating issues.

### Reporting bugs
1. Open **Help** page.
2. Click **Report Issue**.
3. Include: app version, OS, event key, reproduction steps, screenshots, and logs.

---

## Screenshot Placeholders

- `[Add Screenshot] First-run wizard`
- `[Add Screenshot] Assignments accordion`
- `[Add Screenshot] Scout form with quick actions`
- `[Add Screenshot] Sync QR export/import`
- `[Add Screenshot] Analysis team view`

# Matchbook competition-day checklist

Use this checklist before matches begin. Matchbook is designed to keep scouting local and usable without internet; network sync only needs the team hub and a private LAN.

## Before leaving for the event

1. Install the same Matchbook release on every hub and scout laptop.
2. On the hub, import the event schedule, create or select the scouting form, assign scouts, and run one sample entry through Analysis.
3. On every scout, complete first-run setup and confirm the device name is recognizable.
4. Rehearse one network transfer and one QR transfer. Confirm the hub imports the record exactly once.
5. Export a database snapshot from the hub and save it somewhere separate from that laptop.

## At the venue

1. Designate one laptop as the hub. Keep it plugged in when possible.
2. Connect only the team laptops to a private hotspot or router. Do not use a public event Wi-Fi network for data transfer.
3. On the hub, open **Sync Data → Network**, start the server, and share the shown hub address and eight-character token with scouts.
4. On each scout, enter the hub address and token once. Send a small test payload, then have the hub apply it.
5. During matches, scouts can continue recording even when the network is unavailable. Do not reset local cache to solve a sync problem.
6. Every few matches, apply incoming payloads on the hub and export a hub snapshot to removable storage or another team-controlled device.

## If sync fails

- **Wrong token / address:** Re-check both fields. The hub accepts only private-LAN HTTP addresses and a matching eight-character token.
- **No network:** Use QR export/import. CSV and database snapshots are available as fallback transfer methods.
- **Payload appears in quarantine:** Read the reason, correct the source issue if necessary, then requeue it. Do not clear quarantine until its source data is confirmed elsewhere.
- **Database startup error:** Retry first. Reset cache only after confirming the device’s records are already on the hub or backed up; Matchbook requires typing `RESET` before this destructive action.

## Release and rollback

1. Tag only a tested release: `git tag -a v2.0.2 -m "Matchbook 2.0.2" && git push origin v2.0.2`.
2. GitHub Actions publishes installers and update manifests from that tag. Keep the GitHub release public and published, not draft, so installed apps can discover it.
3. If a new release causes a problem, reinstall the previous known-good installer and restore the latest hub snapshot. Never delete the existing hub database before confirming the restored app can read it.

## Release-signing requirement

Windows and macOS users should receive signed installers. macOS automatic updates specifically require a signed application. Configure the GitHub repository secrets used by `.github/workflows/release.yml` (`MAC_CERTIFICATE`, `MAC_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`) before promising macOS in-app updates.

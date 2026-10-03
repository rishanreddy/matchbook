# Matchbook competition-day checklist

Use this checklist before matches begin. Matchbook keeps scouting local and usable without internet. Wi-Fi sync only needs the hub and the scouts on the same private network, such as a phone hotspot.

New scouts can open **Help** in the app for step-by-step pictures and two short videos. It is worth having each scout watch "Your first match" before the event.

## Before leaving for the event

1. Install the same Matchbook release on every hub and scout laptop.
2. On the hub, import the event schedule, create or select the scouting form, and run one sample entry through Analysis. Scout names and matches can wait until the scouts connect.
3. On every scout, complete first-run setup and confirm the device name is recognizable.
4. Rehearse one Wi-Fi transfer and one QR transfer. Confirm the hub gets each record exactly once.
5. On the hub, open **Sync Data, File**, save **Everything on this laptop**, and keep the file somewhere separate from that laptop.
6. Have each scout do one full sample match, so nobody meets the form for the first time in the stands.

## At the venue

1. Designate one laptop as the hub. Keep it plugged in when possible.
2. Connect only the team laptops to a private hotspot or router. Do not use the venue's public Wi-Fi for data transfer: it often stops laptops from seeing each other.
3. On the hub, open **Sync Data, Wi-Fi** and press **Start receiving**. Read the code on the screen to the scouts, or let them scan the small square code. Windows may ask about the firewall the first time: allow it on private networks.
4. On each scout, open **Sync Data, Wi-Fi**, click the hub in the list, and type the code. Press **Get form, schedule and matches** once.
5. On the hub, open **Scout Assignments**. Scouts who typed their name in **Device Setup** are on the list already; type the names of the others. Press **Fill open stations** and then **Assign**. Each scout opens **Scout Match** and presses **Get latest** to see their matches. A scout you added by name picks their name there the first time.
6. During matches, scouts keep recording even when the network is unavailable. Do not reset the local cache to solve a sync problem.
7. Every few matches each scout presses **Send my entries**. The hub adds them on its own, and its Home screen counts them. A scout's Home screen shows how many entries the hub does not have yet. If a notice says entries are for a different event, open **Review Entries** and press **Show all events**.
8. Every few matches, save a backup file from the hub (**Sync Data, File**) to a USB stick or another team-controlled device.

The hub starts receiving again by itself if the app or the laptop restarts, with the same code, so scouts do not need to pair again.

## If sync fails

- **The hub is not in the scout's list:** The laptops must be on the same Wi-Fi, and the hub must say **Receiving**. If they are, the network is probably isolating clients. Use a hotspot, or have the scout press **Scan the lead scout's code instead** or **Type the address by hand**.
- **The code does not match:** Codes are 8 letters and numbers, never I, O, 0 or 1. If the hub made a new code, use the new one.
- **No network at all:** Use **QR codes** (one laptop shows codes, the other reads them with its camera) or **File** (USB stick, AirDrop, email). They move exactly the same data.
- **QR codes will not read:** Turn the brightness of the sending screen all the way up, move the laptops a little closer, avoid glare, and choose **Bigger squares** on the sending screen.
- **The camera will not start:** On a Mac, allow Matchbook under System Settings, Privacy & Security, Camera. On Windows, turn on camera access for desktop apps under Settings, Privacy & security, Camera. Close any other app using the camera.
- **An upload was set aside:** The hub's Wi-Fi screen says why. Nothing is lost. Press **Try again**, and only choose **Remove them** if the scout still has those entries or you have a backup.
- **Database startup error:** Retry first. Reset the cache only after confirming the device's records are already on the hub or backed up; Matchbook requires typing `RESET` before this destructive action.

## Release and rollback

1. Tag only a tested release: `git tag -a v2.0.2 -m "Matchbook 2.0.2" && git push origin v2.0.2`.
2. GitHub Actions publishes installers and update manifests from that tag. Keep the GitHub release public and published, not draft, so installed apps can discover it.
3. If a new release causes a problem, reinstall the previous known-good installer and restore the latest hub snapshot. Never delete the existing hub database before confirming the restored app can read it.

## Release-signing requirement

Windows and macOS users should receive signed installers. macOS automatic updates specifically require a signed application. Configure the GitHub repository secrets used by `.github/workflows/release.yml` (`MAC_CERTIFICATE`, `MAC_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`) before promising macOS in-app updates.

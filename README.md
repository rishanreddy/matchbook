# 📖 Matchbook

<div align="center">

![Version](https://img.shields.io/github/package-json/v/rishanreddy/matchbook?style=for-the-badge&logo=electron&color=1a8cff)
![Downloads](https://img.shields.io/github/downloads/rishanreddy/matchbook/total?style=for-the-badge&logo=github&color=ff8800)
![License](https://img.shields.io/github/license/rishanreddy/matchbook?style=for-the-badge&color=1a8cff)
![Build](https://img.shields.io/github/actions/workflow/status/rishanreddy/matchbook/release.yml?style=for-the-badge&logo=githubactions&logoColor=white)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-1a8cff?style=for-the-badge&logo=electron)

**Production-focused desktop scouting app for FIRST Robotics Competition**

*Run fully offline at events, collect match observations, assign scouts, and sync data seamlessly*

[Download](https://github.com/rishanreddy/matchbook/releases/latest) • [Quick Start](#-quick-start-guide) • [Issues](https://github.com/rishanreddy/matchbook/issues)

</div>

---

## 🚀 Built With

<div align="center">

[![Electron](https://img.shields.io/badge/Electron-34-1f2937?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7-646cff?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Mantine](https://img.shields.io/badge/Mantine-7-339af0?style=for-the-badge&logo=mantine&logoColor=white)](https://mantine.dev/)
[![RxDB](https://img.shields.io/badge/RxDB-Offline--First-8d3dae?style=for-the-badge&logo=database&logoColor=white)](https://rxdb.info/)

</div>

---

## ✨ Features

- 🔌 **Offline-First** - Works without internet, syncs when connected
- 🎯 **Scout Assignments** - Manage multiple scouts across matches with manual and auto-assign workflows
- 📝 **Custom Forms** - Build dynamic scouting forms with SurveyJS, single active schema enforcement
- 🔐 **TBA Integration** - Import events directly from The Blue Alliance with stale match cleanup
- 📊 **Advanced Analytics** - Team performance tracking, analysis dashboard for picklist prep
- 📱 **QR Code Sync** - Fast data transfer between devices via QR export/import
- 🌐 **Network Sync** - Hub/spoke architecture over LAN with optional auth token
- 💾 **Multiple Sync Methods** - QR codes, CSV, full database snapshots, or network transfer
- 🎨 **Modern UI** - Beautiful Mantine components with FRC-themed dark mode
- ⚡ **Fast Performance** - Optimized Vite builds, lazy loading, modular architecture
- ⌨️ **Keyboard Shortcuts** - Command palette for power users
- 🧭 **Guided Onboarding** - Role selection, device registration, and TBA API validation wizard
- 🔧 **Diagnostics** - Built-in logs, update checks, and settings management

---

## 📸 Screenshots

<div align="center">

### Home Dashboard
![Home](https://via.placeholder.com/800x500/161b22/1a8cff?text=Home+Dashboard)

### Scouting Interface
![Scout](https://via.placeholder.com/800x500/161b22/ff8800?text=Scouting+Form)

### Team Analysis
![Analysis](https://via.placeholder.com/800x500/161b22/1a8cff?text=Team+Analytics)

</div>

---

## 💾 Installation

### Quick Download

<div align="center">

| Platform | Download | Size |
|----------|----------|------|
| ![Windows](https://img.shields.io/badge/Windows-0078D6?style=flat&logo=windows&logoColor=white) | [.exe installer](https://github.com/rishanreddy/matchbook/releases/latest) | ~150 MB |
| ![macOS](https://img.shields.io/badge/macOS-000000?style=flat&logo=apple&logoColor=white) | [.dmg installer](https://github.com/rishanreddy/matchbook/releases/latest) | ~160 MB |
| ![Linux](https://img.shields.io/badge/Linux-FCC624?style=flat&logo=linux&logoColor=black) | [.AppImage / .deb](https://github.com/rishanreddy/matchbook/releases/latest) | ~140 MB |

</div>

---

## 🎯 Quick Start Guide

### For Event Use

1. **Configure Settings**
   - Open `Settings` and add your TBA API key

2. **Register Device**
   - Open `Device Setup` and register as `Hub` or `Scout`

3. **Hub Setup** (if Hub device)
   - Import event data from The Blue Alliance
   - Publish an active scouting form from `Form Builder`
   - Assign scouts to matches using `Scout Assignment Manager`

4. **Scout Setup** (if Scout device)
   - Open `Scout` tab
   - Start assigned entries or manual entries
   - Submit data via your chosen sync method

5. **Sync Data**
   - Use QR codes for quick device-to-device transfer
   - Or connect to hub via network sync
   - Or export/import CSV or database snapshots

6. **Analyze Results**
   - View team analytics in `Analysis` dashboard
   - Prepare picklists for alliance selection

---

## 📈 Project Stats

<div align="center">

![Code Size](https://img.shields.io/github/languages/code-size/rishanreddy/matchbook?style=flat-square&color=1a8cff)
![Repo Size](https://img.shields.io/github/repo-size/rishanreddy/matchbook?style=flat-square&color=ff8800)
![Last Commit](https://img.shields.io/github/last-commit/rishanreddy/matchbook?style=flat-square&color=1a8cff)
![Issues](https://img.shields.io/github/issues/rishanreddy/matchbook?style=flat-square&color=ff8800)
![PRs](https://img.shields.io/github/issues-pr/rishanreddy/matchbook?style=flat-square&color=1a8cff)

</div>

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 💬 Support

- 📫 [Report Issues](https://github.com/rishanreddy/matchbook/issues/new)
- 💡 [Request Features](https://github.com/rishanreddy/matchbook/issues/new?labels=enhancement)
- ⭐ Star this repo if you find it helpful!

---

## 📄 License

Distributed under the **MIT License**. See [LICENSE](./LICENSE) for more information.

---

## 🙏 Credits

- Built with [Electron](https://www.electronjs.org/), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Mantine](https://mantine.dev/), [RxDB](https://rxdb.info/), and [SurveyJS](https://surveyjs.io/)
- FRC event and match data from [The Blue Alliance](https://www.thebluealliance.com/)
- Inspired by the FRC scouting community

---

<div align="center">

**Made with ❤️ for FIRST Robotics Competition**

![FRC](https://img.shields.io/badge/FIRST-Robotics-1a8cff?style=for-the-badge&logo=first&logoColor=white)

</div>

# 📇 InstaScan AI — High-Fidelity Business Card Scanner & Telemetry hub

InstaScan AI is a highly polished, single-page application built on React 18, Vite, Express, and Tailwind CSS. It empowers users to capture dual-sided business cards (Front and Back), run high-fidelity OCR extraction using **Google Gemini 3.5 Flash**, and seamlessly organize or export contacts. It is styled following **Material Design 3 (M3) Dark Theme** principles for balanced typography, generous spacing, and a responsive experience.

---

## 🌟 Major Highlights & Features

1. **Dual-Sided Camera Scans**
   - Live media device viewfinder supporting desktop or mobile camera toggling (front/back lens switching).
   - High-contrast card alignment frames with bouncy sweep lasers for pristine photography targeting.
   
2. **Gemini 3.5 Flash OCR Extraction**
   - Transmits both card images to Gemini's vision model to extract structured metadata: Name, Title, Company, Mobile Phone, Email Address, Website, and Location.
   - Robust offline-first grace handling: If the API exceeds free-tier limits, the application gracefully supplies a high-fidelity dynamic card mock so users can keep testing core features.

3. **Workspace Google Sheets & Auth Sync**
   - Fully supports Google Drive and Sheets integration. Users who set up Workspace OAuth credentials can sign in securely and stream scanned contact logs directly into live Google Sheets.
   - Automatic elegant, non-blocking warn-and-grace system for sandboxed environments.

4. **Multi-Segment CSV Export Wizard**
   - Custom segment configurations: export all items, filtered lists, just checked cards, or those within specific time scopes (last 24 hours, last 7 days).
   - Support for creating a fresh compiled sheet or uploading an existing contacts file to merge and append.

5. **Elegant M3 Dark Typography**
   - Built on carefully curated color palettes (`#1c1b22`, `#a8c7fa`, `#e3e2e6`).
   - Clean micro-animations, custom toasts, and confirmation triggers using `motion/react`.

---

## 🚀 Quick Start / Local Development

Follow these steps to run InstaScan AI locally on your machine.

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file at the root of your project following the structure of `.env.example`:
```env
# Gemini API Key (Required for live OCR extraction)
GEMINI_API_KEY=your_gemini_api_key

# Optional: Firebase Server Credentials for production Firestore auth
FIREBASE_PROJECT_ID=
```

### 3. Start Development Server
```bash
npm run dev
```
The server will start on port `3000` at `http://localhost:3000`.

---

## 🛠️ Workspace OAuth Setup (For Live Sheets Sync)

To stream contacts directly into Google Sheets in real-time, configure OAuth permissions in your Google Cloud or AI Studio workspace.

1. **Register Scopes**:
   Configure the following official Workspace scopes:
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/userinfo.profile`
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/spreadsheets`
2. **Accept Permissions**:
   Once scopes are registered, clicking the Google Sign-In button on the Sheets hub allows the application to dynamically create a spreadsheet titled **"InstaScan CO_Scans"** in your Google Drive and write new entries instantly.
3. **Local Fail-safe**:
   If credentials are left unconfigured, the app alerts you with a 6-second auto-dismissive guide, remaining fully active for premium local downloads and scanning simulation!

---

## 🗂️ Project Structure

```
├── server.ts                    # Full-stack Express backend handling Vite middleware & Gemini proxy
├── src/
│   ├── App.tsx                  # Core application layout, media devices controller, and state pipeline
│   ├── firebase.ts              # Firebase initialization handler
│   ├── types.ts                 # Shared structural TypeScript interfaces
│   ├── index.css                # Global styles with Tailwind imports & Material Design 3 theme
│   └── main.tsx                 # Client app bootstrapping mount
├── package.json                 # Project dependencies & bundle commands
└── metadata.json                # Application permissions and workspace capabilities descriptors
```

---

*Enjoy high-fidelity scans with InstaScan AI! High Contrast. Low Friction.*

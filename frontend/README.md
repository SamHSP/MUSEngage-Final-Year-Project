# MUSEngage Frontend

This React + TypeScript application powers the MUSEngage student engagement platform. It delivers dashboards, event listings, reward catalogues and QR-enabled PASS session tooling backed by a Murdoch University themed visual design.

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
   The app will be available at http://localhost:3000/.
3. Build for production:
   ```bash
   npm run build
   ```
4. Preview a production build locally:
   ```bash
   npm run preview
   ```

## Configuration

The frontend expects the following environment variables:

- `VITE_BACKEND_API`: Base URL of the backend API (e.g. `https://example.com`). If omitted, requests fall back to relative `/api/*` paths.

## Project layout

Key folders under `src/`:

- `pages/` – Route components organised by feature areas (dashboard, events, auth, etc.).
- `components/` – Shared UI building blocks such as the hero banner.
- `hooks/` – Reusable React hooks (e.g. online/offline status tracking).
- `context/` – Providers for global application state.
- `utils/` – Small utility helpers (CSV parsing, endpoint helpers).

Static assets and vendor packages live under `public/` and `vendor/` respectively.

## Coding guidelines

- Keep feature-specific logic co-located within its page folder.
- Use the provided `useOnlineStatus` hook for connectivity-dependent behaviour.
- Annotate functions with brief comments to document intent and aid future maintenance.


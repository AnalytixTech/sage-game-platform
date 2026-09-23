# 🚀 Stress-Free Deployment Guide: SageGame Platform

This is the **most optimal, low-overhead, zero-stress deployment setup** for SageGame Platform using managed serverless cloud services (**Supabase / Neon** for Database and **Render / Railway** for Backend API).

---

## ⏱️ Quick Summary (5 Minutes Total)

```text
 ┌──────────────────────┐      1-Click Deploy      ┌──────────────────────┐
 │   Supabase / Neon    ├─────────────────────────►│   Render / Railway   │
 │ (Managed PostgreSQL) │                          │ (Node.js API Engine) │
 └──────────┬───────────┘                          └──────────┬───────────┘
            │                                                 │
            │ Copy DATABASE_URL                               │ Auto-deploys on
            └─────────────────────────────────────────────────┘ git push
```

---

## Step 1: Database Setup (Supabase / Neon — 2 Minutes)

1. Go to [supabase.com](https://supabase.com) (or [neon.tech](https://neon.tech)) and sign up / log in.
2. Click **New Project** and name it `sagegame-db`.
3. Open **SQL Editor** from the left sidebar -> Click **New Query**.
4. Copy the entire contents of [`services/api/src/db/schema.sql`](file:///c:/Users/ahmed/OneDrive/Documents/Sage/Sage%20Analytix/sage-game-platform/services/api/src/db/schema.sql) and paste it into the editor.
5. Click **Run**. All 13 tables, foreign keys, and indexes are created instantly.
6. Go to **Project Settings** -> **Database** -> Copy the **URI Connection String**:
   ```env
   postgres://postgres:[YOUR-PASSWORD]@db.xxxx.supabase.co:5432/postgres
   ```

---

## Step 2: Backend API Service (Render / Railway — 3 Minutes)

### Using Render ([render.com](https://render.com)):

1. Push your `sage-game-platform` repository to GitHub.
2. Log into Render -> Click **New +** -> **Web Service**.
3. Connect your GitHub repository `sage-game-platform`.
4. Configure the deployment fields:
   - **Name**: `sagegame-api`
   - **Environment**: `Node`
   - **Region**: Choose closest to your target audience (e.g. Frankfurt, Oregon, Singapore)
   - **Build Command**:
     ```bash
     npm install --legacy-peer-deps && npm run build
     ```
   - **Start Command**:
     ```bash
     node services/api/dist/server.js
     ```
5. Scroll down to **Environment Variables** and add:
   - `DATABASE_URL` = `postgres://postgres:[YOUR-PASSWORD]@db.xxxx.supabase.co:5432/postgres`
   - `NODE_ENV` = `production`
6. Click **Create Web Service**.

🎉 Render will automatically build your monorepo, start your server, and provide a secure HTTPS endpoint:
```text
https://sagegame-api.onrender.com
```

*Every future `git push` to your repository will automatically trigger an instant, zero-downtime deployment.*

---

## Step 3: Connecting Host Applications & Publishing SDK

### 1. In Host Application Backend (`server.ts`):
Set the platform URL in environment variable:
```env
SAGEGAME_API_URL=https://sagegame-api.onrender.com
```

### 2. Publishing SDK Packages:
To distribute SDK packages to host app developers via NPM:
```bash
npm run build
npm publish --workspaces --access public
```

---

## 🛠️ Summary Checklist

| Component | Service | Setup Effort | Maintenance | Cost |
| :--- | :--- | :--- | :--- | :--- |
| **Database** | Supabase / Neon | 2 Mins (Paste SQL) | 0% Managed | Free Tier Available |
| **API Server** | Render / Railway | 3 Mins (Connect Git) | 0% Managed (Auto-Git Deploy) | Free / Low Cost |
| **SDK Packages**| NPM Registry | 1 Min (`npm publish`) | Instant Update | Free |

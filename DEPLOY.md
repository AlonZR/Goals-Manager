# Putting Goals-Manager online

You'll set up four free accounts. Each step takes a few minutes. When you're done, the app runs at an address like `https://goalsmanager.onrender.com`, only your Google account can sign in, and your phone and laptop see the same goals.

| Piece | What it does | Cost |
|---|---|---|
| **GitHub** | Stores the code privately. Render reads it from here. | Free |
| **Neon** | The database that holds your goals. | Free plan, no card |
| **Render** | Runs the app on the internet. | Free plan: sleeps after 15 min unused, ~1 min to wake |
| **Google Cloud** | Provides "Sign in with Google". | Free |

---

## 1. Put the code on GitHub (private)

1. Go to <https://github.com/new>.
   - **Repository name:** `mygoals`
   - Choose **Private**.
   - **Don't** add a README, .gitignore or license, because the project already has them.
   - Click **Create repository**.
2. If you don't have Git on Windows yet, install it from <https://git-scm.com/download/win> (the default options are fine).
3. Open **Command Prompt** in your MyGoals folder (in File Explorer, type `cmd` in the address bar and press Enter). Then run the commands below, replacing `YOUR-USERNAME` with your GitHub username:
   ```
   git remote add origin https://github.com/YOUR-USERNAME/mygoals.git
   git push -u origin main --tags
   ```
   A browser window asks you to sign in to GitHub the first time.

> Your goals (`data/`) and secrets (`config.json`) are **not** uploaded. `.gitignore` excludes them.

## 2. Create the database (Neon)

1. Sign up at <https://neon.com> (signing in with Google or GitHub is fine).
2. Create a project:
   - **Name:** `mygoals`
   - **Region:** **AWS Europe Central 1 (Frankfurt)**, which is near the app server.
3. On the project dashboard, click **Connect** and copy the **connection string**. It looks like
   `postgresql://neondb_owner:...@ep-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`
   Keep it handy for step 3. It's a password, so don't share it.

## 3. Create the app on Render

1. Sign up at <https://render.com> with **your GitHub account**.
2. Click **New → Blueprint**, pick the `mygoals` repository, and click **Connect**.
3. Render reads `render.yaml` and asks for a few values:
   - `ALLOWED_EMAILS` → `alonzr98@gmail.com`
   - `DATABASE_URL` → the Neon connection string from step 2
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` → type `pending` for now. You'll fill them in after step 4.
4. Click **Apply**. When the service appears, note its address, e.g. `https://goalsmanager.onrender.com`. Yours may have extra letters if the name is taken.

The first start will fail with "Google sign-in is enabled but ..." or a Google error. That's expected until step 4 is done.

## 4. Set up "Sign in with Google"

1. Go to <https://console.cloud.google.com/> and create a new project called `MyGoals`.
2. Open **APIs & Services → OAuth consent screen**. In newer consoles this is called **Google Auth Platform**.
   - **App name:** `Goals-Manager`. **User support email:** your Gmail.
   - **Audience / User type:** **External**.
   - Leave it in **Testing** mode and add **alonzr98@gmail.com** as a **test user**. Testing mode is fine for personal use, and only listed test users can sign in.
3. Go to **Credentials** (or **Clients**) and choose **Create credentials → OAuth client ID**.
   - **Application type:** **Web application**
   - **Authorized redirect URIs:** your Render address + `/auth/google/callback`, e.g.
     `https://goalsmanager.onrender.com/auth/google/callback`
   - Click **Create** and copy the **Client ID** and **Client secret**.
4. Back in Render, open **mygoals → Environment** and replace the two `pending` values with the real Client ID and Client secret. Then click **Save, rebuild and deploy**.

Open your Render address. You should see the sign-in page, and signing in with Google opens your goals.

## 5. Move your current goals online

1. On the laptop, start the local app (`start.bat`) and go to **⋯ → Download backup**.
2. In the online app, go to **⋯ → Restore from backup…** and pick that file.

## 6. Add it to your phone

Open the Render address on your phone and sign in. Then:
- **iPhone (Safari):** tap Share → **Add to Home Screen**.
- **Android (Chrome):** tap ⋮ → **Add to Home screen** (or **Install app**).

It opens full-screen with its own icon. You stay signed in for 6 months.

---

### Updating the app later
Each `git push` to GitHub redeploys the app automatically. Your goals stay in Neon and aren't affected.

### Going always-on
In Render, change the instance type from **Free** to a paid instance (or set `plan: starter` in `render.yaml`). Nothing else changes. This is also recommended before turning on timed WhatsApp/email reminders, because a sleeping free app can't send them.

### If something goes wrong
- **"redirect_uri_mismatch"** from Google: the redirect URI in step 4.3 must match your Render address exactly, `https://` included.
- **"That Google account isn't allowed"**: check `ALLOWED_EMAILS` in Render, and the test users in Google.
- **The app doesn't start**: in Render, open **Logs**. The first lines say what's missing.

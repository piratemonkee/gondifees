# Vercel Deployment Troubleshooting Guide

## Problem: Different Versions Between Localhost and Production

If you're seeing different versions in localhost vs production, follow these steps:

## Step 1: Verify Vercel Project Configuration

1. **Go to Vercel Dashboard** → Your Project → Settings → Git
2. **Check the following:**
   - **Repository**: Should be `piratemonkee/gondifees`
   - **Production Branch**: Should be `main`
   - **Root Directory**: Should be `/` (root)
   - **Framework Preset**: Should be `Next.js`

## Step 2: Check What Commit Vercel is Deploying

1. Go to Vercel Dashboard → Your Project → Deployments
2. Click on the latest deployment
3. Check the **Commit** field - it should match your latest commit hash
4. Compare with local: `git log -1 --format="%H"`

## Step 3: Verify Deployment Source

**Check the health endpoint in production:**
```bash
curl https://your-app.vercel.app/api/health
```

Look for:
- `version`: Should be `2025-01-11-v2`
- `commitHash`: Should match your latest commit
- `gitBranch`: Should be `main`

## Step 4: Force a Clean Redeploy

### Option A: Via Vercel Dashboard (Recommended)
1. Go to Vercel Dashboard → Your Project → Deployments
2. Click the three dots (⋯) on the latest deployment
3. Select **"Redeploy"**
4. Check **"Use existing Build Cache"** = OFF (unchecked)
5. Click **"Redeploy"**

### Option B: Via Git (Alternative)
```bash
# Create an empty commit to trigger redeploy
git commit --allow-empty -m "Force Vercel redeploy - $(date)"
git push origin main
```

## Step 5: Clear Vercel Build Cache

1. Go to Vercel Dashboard → Your Project → Settings → General
2. Scroll to **"Build Cache"**
3. Click **"Clear Build Cache"**
4. Redeploy the project

## Step 6: Verify Branch Configuration

**Check if Vercel is deploying from the correct branch:**

1. Go to Vercel Dashboard → Your Project → Settings → Git
2. Under **"Production Branch"**, ensure it's set to `main`
3. If it's set to a different branch, change it to `main` and redeploy

## Step 7: Check for Multiple Vercel Projects

**Make sure you're looking at the right project:**

1. Go to Vercel Dashboard
2. Check if you have multiple projects with similar names
3. Verify the project URL matches what you're testing

## Step 8: Reconnect Repository (Last Resort)

If nothing else works:

1. Go to Vercel Dashboard → Your Project → Settings → Git
2. Click **"Disconnect"** (this won't delete your project)
3. Click **"Connect Git Repository"**
4. Select `piratemonkee/gondifees`
5. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `/`
   - **Production Branch**: `main`
6. Click **"Deploy"**

## Quick Verification Commands

**Localhost:**
```bash
curl http://localhost:3000/api/health | jq '.version, .commitHash'
```

**Production:**
```bash
curl https://your-app.vercel.app/api/health | jq '.version, .commitHash'
```

Both should show the same version and commit hash.

## Current Expected Values

- **Version**: `2025-01-11-v2`
- **Branch**: `main`
- **Latest Commit**: Check with `git log -1 --oneline`
- **Repository**: `https://github.com/piratemonkee/gondifees.git`

## Still Having Issues?

If versions still don't match after following these steps:

1. **Check Vercel Build Logs**: Look for any errors or warnings
2. **Verify Environment Variables**: Ensure `ETHERSCAN_API_KEY` is set
3. **Check Deployment Status**: Make sure the latest deployment completed successfully
4. **Compare Commit Hashes**: Use the health endpoint to see what commit is actually deployed

## Contact Support

If the issue persists, you may need to:
- Create a new Vercel project and connect it to the same repository
- Or contact Vercel support with your project details

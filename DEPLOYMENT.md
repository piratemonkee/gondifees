# Deployment Verification Guide

## Check Which Version is Deployed

### 1. Check Health Endpoint
Visit: `https://your-app.vercel.app/api/health`

This will show:
- Version number
- Environment configuration
- API key status
- Timestamp

### 2. Check Fees API Version
Visit: `https://your-app.vercel.app/api/fees`

Look for the `version` field in the JSON response. It should be `2025-01-11-v2`.

### 3. Compare with Localhost

**Localhost:**
```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/fees
```

**Production:**
```bash
curl https://your-app.vercel.app/api/health
curl https://your-app.vercel.app/api/fees
```

Compare the `version` fields - they should match.

## Force Vercel to Redeploy

If versions don't match:

1. **Trigger a new deployment:**
   - Go to Vercel Dashboard
   - Click "Redeploy" on the latest deployment
   - Or push an empty commit: `git commit --allow-empty -m "Force redeploy" && git push`

2. **Clear Vercel cache:**
   - In Vercel Dashboard → Settings → General
   - Clear build cache
   - Redeploy

3. **Verify deployment:**
   - Check the deployment logs in Vercel
   - Verify the commit hash matches your latest commit
   - Check the health endpoint after deployment completes

## Common Issues

### Version Mismatch
- **Symptom**: Different data/behavior between localhost and production
- **Solution**: Force redeploy in Vercel, verify commit hash

### Stale Cache
- **Symptom**: Old version still showing after deployment
- **Solution**: Clear browser cache, clear Vercel build cache, redeploy

### Environment Variables
- **Symptom**: API not working in production
- **Solution**: Verify `ETHERSCAN_API_KEY` is set in Vercel → Settings → Environment Variables

## Current Version
**Version:** `2025-01-11-v2`
**Latest Commit:** Check with `git log -1 --oneline`

#!/bin/bash
# Force Vercel to redeploy by creating an empty commit

echo "🔄 Forcing Vercel redeploy..."
git commit --allow-empty -m "Force Vercel redeploy - $(date +%Y-%m-%d-%H%M%S)"
git push origin main
echo "✅ Empty commit pushed. Vercel should automatically trigger a new deployment."
echo ""
echo "📋 Next steps:"
echo "1. Go to Vercel Dashboard → Your Project → Deployments"
echo "2. Wait for the new deployment to complete"
echo "3. Check the version at: https://your-app.vercel.app/api/health"
echo "4. Version should be: 2025-01-11-v2"

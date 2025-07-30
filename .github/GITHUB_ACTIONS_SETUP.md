# GitHub Actions Setup Guide

## Required Repository Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions → Repository secrets

Add the following secrets (use the same values from your .env file):

1. **SUPABASE_URL** - `https://hmtohytskgvromvpuoom.supabase.co`
2. **SUPABASE_ANON_KEY** - `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdG9oeXRza2d2cm9tdnB1b29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4MTU3MDcsImV4cCI6MjA2ODM5MTcwN30.5Iy9Zc6lIMmARm2QnZ88rOhxi-382Wnk8E5vWKiH5SY`
3. **SUPABASE_SERVICE_KEY** - `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdG9oeXRza2d2cm9tdnB1b29tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjgxNTcwNywiZXhwIjoyMDY4MzkxNzA3fQ.P1iAJiNKEOWXFv7X1VC3E4RqSCobsR9eAM87g5OqhZY`

## Optional Repository Variables

Go to your GitHub repository → Settings → Secrets and variables → Actions → Variables

You can optionally set these variables to override defaults (current .env values):

1. **SUPABASE_BUCKET_NAME** - Supabase storage bucket name (default: sticker-packs)
2. **MAX_PACKS_PER_RUN** - Maximum packs to process per run (default: 50)
3. **DELAY_BETWEEN_REQUESTS** - Delay between API requests in ms (default: 2000)
4. **MAX_RETRIES** - Maximum retry attempts (default: 3)
5. **LOG_LEVEL** - Logging level: error, warn, info, debug (default: info)

## Schedule

The workflow runs automatically 6 times per day at:
- 00:00 UTC (8:00 PM ET / 9:00 PM BRT)
- 04:00 UTC (12:00 AM ET / 1:00 AM BRT)
- 08:00 UTC (4:00 AM ET / 5:00 AM BRT)
- 12:00 UTC (8:00 AM ET / 9:00 AM BRT)
- 16:00 UTC (12:00 PM ET / 1:00 PM BRT) 
- 20:00 UTC (4:00 PM ET / 5:00 PM BRT)

## Manual Trigger

You can also manually trigger the workflow:
1. Go to Actions tab in your GitHub repository
2. Select "Scheduled Sticker Scraping" workflow
3. Click "Run workflow" button

## Monitoring

- Logs are automatically uploaded as artifacts for each run
- Failed runs will be clearly marked in the Actions tab
- Artifacts are retained for 7 days
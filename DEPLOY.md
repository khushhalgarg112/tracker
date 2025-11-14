# Deploy to Render (Free Tier)

## Step-by-Step Guide

### 1. Choose Service Type

**Select: "Web Service"** (not Background Worker)

### 2. Connect Your Repository

1. Go to [render.com](https://render.com) and sign up/login
2. Click "New +" → "Web Service"
3. Connect your GitHub account
4. Select your repository: `khushhalgarg112/tracker`

### 3. Configure Settings

**Name:** `ecommerce-tracker` (or any name you like)

**Environment:** `Node`

**Build Command:** `npm install`

**Start Command:** `npm start`

**Plan:** Select **Free** tier

### 4. Add Environment Variables

Click "Environment" tab and add:

```
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-chat-id
APPLE_PROXIES=your-proxy-url (optional)
```

### 5. Deploy

Click "Create Web Service" and wait for deployment (~2-3 minutes)

### 6. Verify It's Running

- Check logs in Render dashboard
- Visit your service URL: `https://your-service-name.onrender.com/health`
- You should see: `{"status":"ok","service":"ecommerce-tracker","timestamp":"..."}`

## Important Notes

✅ **Free Tier Limits:**

- Service spins down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds (cold start)
- Unlimited requests when active
- 750 hours/month free (enough for 24/7 if you keep it active)

✅ **To Keep Service Active:**

- The HTTP server keeps it alive
- Render pings your service automatically
- Or use a free uptime monitor like UptimeRobot to ping every 5 minutes

✅ **Alternative: Use UptimeRobot (Free)**

1. Sign up at [uptimerobot.com](https://uptimerobot.com)
2. Add monitor: HTTP(s) Monitor
3. URL: `https://your-service-name.onrender.com/health`
4. Interval: 5 minutes
5. This keeps your service from spinning down!

## Troubleshooting

**Service keeps spinning down?**

- Use UptimeRobot to ping every 5 minutes
- Or upgrade to paid tier ($7/month) for always-on

**Build fails?**

- Check logs in Render dashboard
- Make sure `package.json` has all dependencies

**Cron not running?**

- Check logs - should see "Starting stock sweep at..."
- Verify environment variables are set correctly

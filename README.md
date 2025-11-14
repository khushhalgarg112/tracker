# eCommerce Tracking Bot (Node.js)

This project polls multiple e-commerce platform APIs every 5 minutes for stock availability across a shared list of pincodes and sends Telegram alerts on availability.

## Setup

1. Copy files into a folder

2. `npm install`

3. Create `.env` from `.env.example` and add your Telegram bot token and chat id

4. Edit `config.js` to add your platforms and product codes

5. (Optional) Add proxy configuration to `.env` for Apple API to avoid rate limiting

6. Run `npm start`

## Proxy Configuration (Optional)

If you're experiencing rate limiting (541 errors) with Apple API, you can use proxies:

1. Add `APPLE_PROXIES` to your `.env` file
2. Format: `http://username:password@host:port`
3. Multiple proxies: comma-separated (auto-rotates)
4. Example: `APPLE_PROXIES=http://user:pass@proxy1.com:8080,http://user:pass@proxy2.com:8080`

## Cost Estimates for Running Every Minute

### Without Proxies (Free but may hit rate limits)

- **Cost**: $0/month
- **Limitation**: May get 541 errors if checking too frequently

### With Proxies (Recommended for frequent checks)

**Budget Options:**

- **Bright Data (Luminati)**: ~$500/month for residential proxies
- **Smartproxy**: ~$75-400/month depending on traffic
- **Oxylabs**: ~$300-1000/month
- **Proxy-Cheap**: ~$50-200/month

**Usage Calculation:**

- 7 products × 60 checks/hour × 24 hours = **10,080 requests/day**
- **~300,000 requests/month**

**Recommended Plan:**

- **Smartproxy Residential**: ~$75-150/month (good balance)
- **Or increase delays**: Check every 2-3 minutes instead of every minute to reduce costs

**Free Alternatives:**

- Use free proxy lists (less reliable, may need frequent updates)
- Increase delays between checks (2-3 minutes instead of 1 minute)

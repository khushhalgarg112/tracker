# eCommerce Tracking Bot (Node.js)

This project polls multiple e-commerce platform APIs every 5 minutes for stock availability across a shared list of pincodes and sends Telegram alerts on availability.

## Setup

1. Copy files into a folder

2. `npm install`

3. Create `.env` (see `.env.example`) and add your Telegram bot token and chat id

4. Edit `config.js` to add your platforms and product codes

5. (Optional) Add proxy configuration to `.env` for Apple API to avoid rate limiting

6. Run `npm start`

## BigBasket search tracking

The bot can call the same BigBasket listing API as the provided cURL to watch multiple pages (e.g., pages 1‑4 for `iphone 17`, `iphone 16`, `iphone 15`) and alert when Apple products come back in stock with an offer badge/bank offer.

1. Add `BIGBASKET_COOKIE` to `.env` with a fresh cookie string captured from your browser (DevTools → Network → listing request → Request Headers → Cookie).
2. (Optional) Override headers via `BIGBASKET_TRACKER_ID`, `BIGBASKET_USER_AGENT`, or `BIGBASKET_ACCEPT_LANGUAGE`.
3. Set `QUICK_COMMERCE_BOT` and `QUICK_COMMERCE_ID` in `.env` if you want these alerts delivered through a dedicated Telegram bot/channel (BigBasket alerts default to this sender).
4. Edit `BIGBASKET_TRACKERS` in `config.js` to control the shared `iphone` search slug, pages (1‑4 by default), brand whitelist, `categoryWhitelist` (defaults to smartphones), and the `products` array. Each `products` entry defines a canonical name and optional `matchers` array (treated as whole-word regexes, e.g., “iPhone 17”)—only rows whose description matches one of those terms and show as in-stock + offer trigger an alert.

During each sweep, the watcher fetches every configured page, filters by the brand whitelist (default Apple), skips sold-out rows, and sends a Telegram message summarising the effective price, discount text, and bank offer for each in-stock product it finds.

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

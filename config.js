// Central configuration. Keep PINCODES as a single shared array & products per platform.

export const PINCODES = ["122001"];
// PLATFORMS array - fill apiUrl/method/apiKey as you need. We'll modify apiClient later per your cURLs.

export const PLATFORMS = [
  {
    name: "Croma",
    apiUrl: "https://api.croma.com/inventory/oms/v2/tms/details-pwa/",
    method: "POST",
    apiKey: null,
    products: [
      { id: "317398", name: "Apple iPhone 17 256GB White" },
      { id: "317400", name: "Apple iPhone 17 256GB Mist Blue" },
      { id: "317396", name: "Apple iPhone 17 256GB Black" },
      { id: "317403", name: "Apple iPhone 17 256GB Sage" },
      { id: "317401", name: "Apple iPhone 17 256GB Lavender" },
      { id: "316303", name: "Oppo K13X 5G 4GB RAM 128GB Sunset Peach" },
      { id: "312574", name: "Vivo Y29 5G 4GB RAM 128GB Glacier Blue" },
      { id: "312575", name: "Vivo Y29 5G 4GB RAM 128GB Diamond Black" },
      { id: "312577", name: "Vivo Y29 5G 4GB RAM 128GB Titanium Gold" },
      { id: "314881", name: "Pixel 9a" },
      { id: "314882", name: "PIxel 9a" },
      { id: "314883", name: "PIxel 9a" },
    ],
    // Croma-specific headers
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9",
      accesstoken: "2fe360a8-442f-4881-9b30-451c1643c339",
      client_id: "CROMA-WEB-APP",
      "content-type": "application/json",
      csc_code: "null",
      customerhash: "3256e9210dc30c675fefe93551b083e3",
      "oms-apim-subscription-key": "1131858141634e2abe2efb2b3a2a2a5d",
      origin: "https://www.croma.com",
      priority: "u=1, i",
      referer: "https://www.croma.com/",
      "sec-ch-ua": '"Chromium";v="142", "Brave";v="142", "Not_A Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      "sec-gpc": "1",
      source: "null",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    },
  },
  {
    name: "Samsung",
    apiUrl: "https://www.samsung.com/in/api/v4/configurator/serviceability",
    method: "GET",
    apiKey: null,
    products: [],
  },
  {
    name: "Apple",
    apiUrl: "https://www.apple.com/in/shop/fulfillment-messages",
    method: "GET",
    apiKey: null,
    products: [
      { id: "MG6N4HN/A", name: "iPhone 17 256GB White" },
      { id: "MG6L4HN/A", name: "iPhone 17 256GB Mist Blue" },
      { id: "MG6K4HN/A", name: "iPhone 17 256GB Black" },
      { id: "MG6J4HN/A", name: "iPhone 17 256GB Sage" },
      { id: "MG6M4HN/A", name: "iPhone 17 256GB Lavender" },
      { id: "MG6H4HN/A", name: "iPhone 17 256GB Natural Titanium" },
      { id: "MG8J4HN/A", name: "iPhone 17 Pro 256GB Deep Blue" }, // Test product with pickup available
    ],
  },
];

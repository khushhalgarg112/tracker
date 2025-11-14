import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import dotenv from "dotenv";
import { PLATFORMS } from "../config.js";

dotenv.config();

// Proxy configuration - supports multiple proxies for rotation
const getProxyList = () => {
  const proxyEnv = process.env.APPLE_PROXIES;
  if (!proxyEnv) return [];

  // Support comma-separated list: http://user:pass@host:port,http://user:pass@host:port
  return proxyEnv
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p);
};

// Rotate through proxies
let proxyIndex = 0;
const getNextProxy = () => {
  const proxies = getProxyList();
  if (proxies.length === 0) return null;
  const proxy = proxies[proxyIndex % proxies.length];
  proxyIndex++;
  return proxy;
};

/*
callStockAPI(platform, pincode, code)

This file contains a generic caller. After you paste your cURLs I will replace or extend the per-platform request logic
so each platform's call exactly matches the curl headers, query/body and auth.

For now the function supports common GET/POST patterns and allows a platform.customRequest function to be attached
(at runtime we'll inject the right function per-platform when you provide cURLs).
*/

export const callStockAPI = async (platform, pincode, code) => {
  // If a platform has a customRequest function, use it (we'll add these when you provide cURLs)
  if (typeof platform.customRequest === "function") {
    try {
      return await platform.customRequest({ pincode, code, axios });
    } catch (err) {
      console.error(
        `Error in customRequest for ${platform.name}:`,
        err.message
      );
      return null;
    }
  }

  // Generic fallback behaviour
  try {
    const headers = {};
    if (platform.apiKey) headers["x-api-key"] = platform.apiKey;

    if ((platform.method || "GET").toUpperCase() === "GET") {
      const res = await axios.get(platform.apiUrl, {
        params: { pincode, code },
        headers,
        timeout: 10_000,
      });
      return res.data;
    } else {
      const res = await axios.post(
        platform.apiUrl,
        { pincode, code },
        { headers, timeout: 10_000 }
      );
      return res.data;
    }
  } catch (err) {
    console.error(`HTTP error (${platform.name}) -`, err.message);
    return null;
  }
};

// Custom request function for Croma
const cromaCustomRequest = async ({ pincode, code, axios }) => {
  const requestBody = {
    promise: {
      allocationRuleID: "SYSTEM",
      checkInventory: "Y",
      organizationCode: "CROMA",
      sourcingClassification: "EC",
      promiseLines: {
        promiseLine: [
          {
            fulfillmentType: "HDEL",
            mch: "",
            itemID: code,
            lineId: "1",
            categoryType: "mobile",
            reEndDate: "2500-01-01",
            reqStartDate: "",
            requiredQty: "1",
            shipToAddress: {
              company: "",
              country: "",
              city: "",
              mobilePhone: "",
              state: "",
              zipCode: pincode,
              extn: {
                irlAddressLine1: "",
                irlAddressLine2: "",
              },
            },
            extn: {
              widerStoreFlag: "N",
            },
          },
          {
            fulfillmentType: "STOR",
            mch: "",
            itemID: code,
            lineId: "2",
            categoryType: "mobile",
            reqEndDate: "",
            reqStartDate: "",
            requiredQty: "1",
            shipToAddress: {
              company: "",
              country: "",
              city: "",
              mobilePhone: "",
              state: "",
              zipCode: pincode,
              extn: {
                irlAddressLine1: "",
                irlAddressLine2: "",
              },
            },
            extn: {
              widerStoreFlag: "N",
            },
          },
          {
            fulfillmentType: "SDEL",
            mch: "",
            itemID: code,
            lineId: "3",
            categoryType: "mobile",
            reqEndDate: "",
            reqStartDate: "",
            requiredQty: "1",
            shipToAddress: {
              company: "",
              country: "",
              city: "",
              mobilePhone: "",
              state: "",
              zipCode: pincode,
              extn: {
                irlAddressLine1: "",
                irlAddressLine2: "",
              },
            },
            extn: {
              widerStoreFlag: "N",
            },
          },
        ],
      },
    },
  };

  try {
    const res = await axios.post(
      "https://api.croma.com/inventory/oms/v2/tms/details-pwa/",
      requestBody,
      {
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
          "sec-ch-ua":
            '"Chromium";v="142", "Brave";v="142", "Not_A Brand";v="99"',
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
        timeout: 10_000,
      }
    );
    return res.data;
  } catch (err) {
    console.error("Croma API error:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response data:", err.response.data);
    }
    return null;
  }
};

// Utility to attach custom requests after we parse cURLs
export const attachCustomRequest = (platformName, fn) => {
  const p = PLATFORMS.find((x) => x.name === platformName);
  if (p) p.customRequest = fn;
};

// Custom request function for Samsung
const samsungCustomRequest = async ({ pincode, code, axios }) => {
  try {
    const url = "https://www.samsung.com/in/api/v4/configurator/serviceability";
    const res = await axios.get(url, {
      params: {
        skus: code,
        postal_code: pincode,
      },
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "accept-language": "en-US,en;q=0.9",
        "content-type": "application/json",
        priority: "u=1, i",
        referer: "https://www.samsung.com/in/",
        "sec-ch-ua":
          '"Chromium";v="142", "Brave";v="142", "Not_A Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "sec-gpc": "1",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      },
      timeout: 10_000,
    });
    return res.data;
  } catch (err) {
    console.error("Samsung API error:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response data:", err.response.data);
    }
    return null;
  }
};

// Custom request function for Apple - hits cURL directly without pincode
const applePickupCheck = async (productId, axios, retryCount = 0) => {
  const maxRetries = 2;

  try {
    const url = "https://www.apple.com/in/shop/fulfillment-messages";

    // Get proxy if available
    const proxyUrl = getNextProxy();
    const httpsAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

    if (proxyUrl) {
      console.log(
        `Using proxy for ${productId}: ${proxyUrl.split("@")[1] || proxyUrl}`
      );
    }

    const axiosConfig = {
      params: {
        fae: "true",
        pl: "true",
        "mts.0": "regular",
        "parts.0": productId, // axios will handle encoding
        location: "110017", // Default location, can be changed if needed
      },
      headers: {
        accept: "*/*",
        "accept-language": "en-US,en;q=0.7",
        priority: "u=1, i",
        referer:
          "https://www.apple.com/in/shop/buy-iphone/iphone-17/6.3%22-display-256gb-mist-blue",
        "sec-ch-ua":
          '"Chromium";v="142", "Brave";v="142", "Not_A Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "sec-gpc": "1",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        "x-aos-ui-fetch-call-1": "qgws504zi9-mhz89kun",
        Cookie:
          "dssid2=cdf1eb76-223f-432c-8122-0ef00e43c726; dssf=1; as_sfa=Mnxpbnxpbnx8ZW5fSU58Y29uc3VtZXJ8aW50ZXJuZXR8MHwwfDE; as_loc=fb62fad385bc7c493da96f54f16d3803ddfa248cbe3300d3951a2ce86b05ec66e3b1f896125de60c9acfc8b26d639e39d60fde0963e492aa445da222ddb6f46c28b5f22d9e8af0af368054358f2dea90618edaed8de054cb119884478f324c21; as_uct=2; rtsid=%7BIN%3D%7Bt%3Da%3Bi%3DR756%3B%7D%3B%7D; as_pcts=563erqnvznT2BtyWRPS0wtwqBO6tzMyT7iKxgPEai5szvxG0GlkyVLD9OncCxPDnpc:rlO_PrcIYQ_0jRzv4o:cSlwBjkXKwpZhbW5+YaIN_fl; as_dc=ucp5; as_rumid=d2d3e0bc-800d-4b74-a1a7-e33ab01afe09; s_cc=true; geo=IN; sh_spksy=.; shld_bt_ck=mBy2TIb1IbBAzBseT6zK1g|1763148844|YAgcJV_wb-RLX6h5OpMF7Xgrc13qOd39CfK0JBRkhe6CRjpTTRw7AWaY973b9B5RBYJx6I4AGK3HqcDdbW7I4cxuFqioXOph1A2SkEJEWlVJJ4JTRJpKZMyIycnNvo2RuL_2_5W4YG3n0NoPa84XqGnf50n_vdc9Fx5pqqgsuLxI1sHWv-Ffvkqj9TmNqtkIgI14R21fedwlOofOrZQJLS-SN_X54xjsngLFO-LW9zM5ONhTm-rw61XOF4UQUBlr-7k35AukIFCOtwtvvjjs0IUD0QAqztqwF_VBM6mCvcOOhnwdGA1pV1X2-6-e_IMyjL8whvLr-shqR46pzpKhWg|u4cv45ei4KdOFfjtG1eovGlZnRQ; s_fid=4CFF4D7219DFF26F-2FC55AFB33078C7F; s_vi=[CS]v1|348BBE37CF2574B4-400019027C0B238E[CE]; as_atb=1.0|MjAyNS0xMS0xNCAxMTowMToxNg|1c35d9ecffd53206c8a3186ca92a3252276a2de2; shld_bt_m=tcytnF8mJ9mGL2MU4Np9Uw|1763154302|MznV4dQhrdA_3onHNR8zVw|Lj9n_2kMxcdPGDWc0PF3QziodTw; s_sq=applestoreww%3D%2526c.%2526a.%2526activitymap.%2526page%253DAOS%25253A%252520home%25252Fshop_iphone%25252Ffamily%25252Fiphone_17%25252Fselect%2526link%253Diphone%252520availabilitypin%252520code%252520resetsave%252520%252528inner%252520text%252529%252520%25257C%252520no%252520href%252520%25257C%252520body%2526region%253Dbody%2526pageIDType%253D1%2526.activitymap%2526.a%2526.c; as_dc=ucp5; dssf=1; dssid2=cdf1eb76-223f-432c-8122-0ef00e43c726",
      },
      timeout: 10_000,
    };

    // Add proxy agent if available
    if (httpsAgent) {
      axiosConfig.httpsAgent = httpsAgent;
      axiosConfig.httpAgent = httpsAgent;
    }

    const res = await axios.get(url, axiosConfig);
    return res.data;
  } catch (err) {
    // Handle 541 rate limiting errors with retry
    if (
      err.response &&
      err.response.status === 541 &&
      retryCount < maxRetries
    ) {
      const delay = (retryCount + 1) * 5000; // 5s, 10s delays
      console.log(
        `Rate limited (541) for ${productId}, retrying after ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return applePickupCheck(productId, axios, retryCount + 1);
    }

    console.error(`Apple API error for ${productId}:`, err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
    }
    return null;
  }
};

// Export for use in index.js
export { applePickupCheck };

// Initialize Croma custom request
attachCustomRequest("Croma", cromaCustomRequest);

// Initialize Samsung custom request
attachCustomRequest("Samsung", samsungCustomRequest);

// Note: Apple uses separate applePickupCheck function, not attached here

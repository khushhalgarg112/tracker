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

// Custom request function for Croma - FIXED with all required headers
const cromaCustomRequest = async ({ pincode, code, axios, retryCount = 0 }) => {
  // Ensure pincode is a string (Python passes it as string)
  const pincodeStr = String(pincode);
  const maxRetries = 2;

  // Get Croma platform config to use ALL headers (required to bypass Akamai WAF)
  const cromaPlatform = PLATFORMS.find((p) => p.name === "Croma");
  const headers = cromaPlatform?.headers || {
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
  };

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
            itemID: String(code),
            lineId: "1",
            requiredQty: "1",
            shipToAddress: {
              zipCode: pincodeStr,
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
        headers: headers,
        timeout: 10_000,
      }
    );
    return res.data;
  } catch (err) {
    console.error(
      `[Croma] API error for product ${code}, pincode ${pincode}:`,
      err.message
    );

    if (
      err.response &&
      err.response.status === 403 &&
      retryCount < maxRetries
    ) {
      const delay = (retryCount + 1) * 2000;
      // FIX: Use backticks for template literal
      console.log(
        `[Croma] Rate limited (403) for product ${code}, retrying after ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return cromaCustomRequest({
        pincode,
        code,
        axios,
        retryCount: retryCount + 1,
      });
    }

    if (err.response) {
      console.error(`[Croma] Response status: ${err.response.status}`);
      if (err.response.data) {
        // Check if it's an Akamai block
        const responseText =
          typeof err.response.data === "string"
            ? err.response.data
            : JSON.stringify(err.response.data);
        if (
          responseText.includes("Access Denied") ||
          responseText.includes("edgesuite.net")
        ) {
          console.error(
            `[Croma] ⚠️ BLOCKED BY AKAMAI WAF - Missing browser headers or IP flagged`
          );
        }
        console.error("Response data:", responseText.substring(0, 500));
      }
    } else if (err.request) {
      console.error(
        `[Croma] Network error - no response received. Code: ${err.code}`
      );
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

// Custom request function for Flipkart (via proxy)
const flipkartCustomRequest = async ({ pincode, code, axios }) => {
  try {
    const proxyUrl =
      process.env.FLIPKART_PROXY_URL ||
      "https://rknldeals.alwaysdata.net/flipkart_check";
    const res = await axios.post(
      proxyUrl,
      {
        productId: code,
        pincode: pincode,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 25_000,
      }
    );
    return res.data;
  } catch (err) {
    console.error("Flipkart API error:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response data:", err.response.data);
    }
    return null;
  }
};

// Custom request function for Reliance Digital
const relianceDigitalCustomRequest = async ({ pincode, code, axios }) => {
  try {
    const url =
      "https://www.reliancedigital.in/ext/raven-api/inventory/multi/articles-v2";
    const payload = {
      articles: [
        {
          article_id: String(code),
          custom_json: {},
          quantity: 1,
        },
      ],
      phone_number: "0",
      pincode: String(pincode),
      request_page: "pdp",
    };

    const res = await axios.post(url, payload, {
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        origin: "https://www.reliancedigital.in",
        referer: "https://www.reliancedigital.in/",
      },
      timeout: 20_000,
    });
    return res.data;
  } catch (err) {
    console.error("Reliance Digital API error:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response data:", err.response.data);
    }
    return null;
  }
};

// Custom request function for iQOO (no pincode)
const iqooCustomRequest = async ({ code, axios }) => {
  try {
    const url = `https://mshop.iqoo.com/in/api/product/activityInfo/all/${code}`;
    const res = await axios.get(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: `https://mshop.iqoo.com/in/product/${code}`,
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/5.36",
      },
      timeout: 10_000,
    });
    return res.data;
  } catch (err) {
    console.error("iQOO API error:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response data:", err.response.data);
    }
    return null;
  }
};

// Custom request function for Vivo (no pincode)
const vivoCustomRequest = async ({ code, axios }) => {
  try {
    const url = `https://mshop.vivo.com/in/api/product/activityInfo/all/${code}`;
    const res = await axios.get(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: `https://mshop.vivo.com/in/product/${code}`,
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/5.36",
      },
      timeout: 10_000,
    });
    return res.data;
  } catch (err) {
    console.error("Vivo API error:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response data:", err.response.data);
    }
    return null;
  }
};

// Custom request function for Unicorn (no pincode)
const unicornCustomRequest = async ({ code, axios }) => {
  try {
    const unicornPlatform = PLATFORMS.find((p) => p.name === "Unicorn") || {};
    const storageOptionId = unicornPlatform.storageOptionId || "250";
    const categoryId = unicornPlatform.categoryId || "456";
    const familyId = unicornPlatform.familyId || "94";
    const groupIds = unicornPlatform.groupIds || "57,58";

    const payload = {
      category_id: categoryId,
      family_id: familyId,
      group_ids: groupIds,
      option_ids: `${code},${storageOptionId}`,
    };

    const res = await axios.post(
      unicornPlatform.apiUrl ||
        "https://fe01.beamcommerce.in/get_product_by_option_id",
      payload,
      {
        headers: {
          accept: "application/json, text/plain, */*",
          "content-type": "application/json",
          "customer-id": "unicorn",
          origin: "https://shop.unicornstore.in",
          referer: "https://shop.unicornstore.in/",
        },
        timeout: 10_000,
      }
    );
    return res.data;
  } catch (err) {
    console.error("Unicorn API error:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response data:", err.response.data);
    }
    return null;
  }
};

// Custom request for Vijay Sales (requires pincode)
const vijaySalesCustomRequest = async ({ pincode, code, axios }) => {
  try {
    const params = new URLSearchParams({
      pincode: String(pincode),
      vanNo: String(code),
      storeList: "true",
    });

    const url = `https://mdm.vijaysales.com/web/api/oms/check-servicibility/v1?${params.toString()}`;
    const res = await axios.get(url, {
      headers: {
        accept: "*/*",
        origin: "https://www.vijaysales.com",
        referer: "https://www.vijaysales.com/",
        "user-agent":
          "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142 Mobile Safari/537.36",
      },
      timeout: 10_000,
    });
    return res.data;
  } catch (err) {
    console.error("Vijay Sales API error:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response data:", err.response.data);
    }
    return null;
  }
};

// Custom request for Sangeetha (requires pincode)
const sangeethaCustomRequest = async ({ pincode, code, axios }) => {
  try {
    const payload = {
      type: "desktop",
      product_id: String(code),
      pinCode: String(pincode),
      user_id: "",
    };

    const res = await axios.post(
      "https://www.sangeethamobiles.com/b/customer/api/v3/product-eta-details",
      payload,
      {
        headers: {
          accept: "application/json, text/plain, */*",
          "accept-language": "en-US,en;q=0.8",
          "content-type": "application/json",
          cookie:
            "__guest_fingerprint=28f9d9cf-de81-4f9e-eeb7-dd53f9528763; superauserwooblyads=d148f391-22be-4a77-ba7d-655991564335; cookieAllowed=accepted; ph_phc_5gTb5cKyB4bpGngoJtohVMdhYYJ9lyNEm8vJFXCkaH7_posthog=%7B%22distinct_id%22%3A%22019aa783-9d53-787d-b8e7-cec52f39f0d4%22%2C%22%24sesid%22%3A%5B1763805489694%2C%22019aaaff-da4d-737e-b15e-565537877f68%22%2C1763805485643%5D%2C%22%24initial_person_info%22%3A%7B%22r%22%3A%22https%3A%2F%2Fsearch.brave.com%2F%22%2C%22u%22%3A%22https%3A%2F%2Fwww.sangeethamobiles.com%2F%22%7D%7D; sanUserCode=2820840e-9685-67c6-916d-d27d36d4cd6f-1763901686830; AWSALB=jLnTuztiDAAt5XhfqxfQ2dIuqA+ZvciW/FtSLeq2igOqt1CrUe1H/7PfApVQAlZQPsjFUp9916mwvzk6yyCXNHgpjjFFSFIdhLHRoVEdO74YHh9yrsgRUKtnI3q5; AWSALBCORS=jLnTuztiDAAt5XhfqxfQ2dIuqA+ZvciW/FtSLeq2igOqt1CrUe1H/7PfApVQAlZQPsjFUp9916mwvzk6yyCXNHgpjjFFSFIdhLHRoVEdO74YHh9yrsgRUKtnI3q5",
          number1:
            "18j3bX3AFk4trD#2icbB6ak3H@&OK1L0geZ0Nry5Y$o1EVa^F1k1$GZ6&QwK",
          number2:
            "9bcFbw29SimO6v0ArwLw$9)N5U9G3NQOHadxL6fFvA8bDYbYw7tmX#Ia6VFD5Wk3lz&6yNNt",
          origin: "https://www.sangeethamobiles.com",
          priority: "u=1, i",
          referer: `https://www.sangeethamobiles.com/product-details/apple-iphone-17-512gb-white-apple-iphone-17-512gb-white/${code}`,
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
        timeout: 15_000,
      }
    );
    return res.data;
  } catch (err) {
    // Handle 500 errors gracefully
    if (err.response && err.response.status === 500) {
      console.error(
        `[Sangeetha] Server error (500) for product ${code}, pincode ${pincode}`
      );
      // Return a structured error response similar to check_sangeetha_store pattern
      return {
        error: true,
        status: 500,
        message: "Server error - API returned 500",
        total: 0,
        found: 0,
      };
    }

    console.error(
      `[Sangeetha] API error for product ${code}, pincode ${pincode}:`,
      err.message
    );
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response data:", err.response.data);
    }
    return null;
  }
};

// Custom request function for OPPO (no pincode)
const oppoCustomRequest = async ({ code, axios }) => {
  try {
    const url =
      "https://opsg-gateway-in.oppo.com/v2/api/rest/mall/product/detail/fetch";
    const payload = {
      productCode: String(code),
      userGroupName: "",
      storeViewCode: "in",
      configModule: 3,
      settleChannel: 3,
    };

    const res = await axios.post(url, payload, {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.7",
        "content-type": "application/json",
        origin: "https://www.oppo.com",
        priority: "u=1, i",
        referer: "https://www.oppo.com/",
        "sec-ch-ua":
          '"Chromium";v="142", "Brave";v="142", "Not_A Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "sec-gpc": "1",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        Cookie: "frontend=3c8c9e4681264ff0a56b9b02850e200a",
      },
      timeout: 10_000,
    });
    return res.data;
  } catch (err) {
    console.error("OPPO API error:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response data:", err.response.data);
    }
    return null;
  }
};

// Custom request function for Amazon PAAPI v5 (no pincode) - DISABLED
const amazonCustomRequest = async ({ code, axios }) => {
  const crypto = await import("crypto");
  const hmac = crypto.createHmac;

  const AMAZON_ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
  const AMAZON_SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;
  const AMAZON_PARTNER_TAG = process.env.AMAZON_PARTNER_TAG;
  const AMAZON_HOST = "webservices.amazon.in";
  const AMAZON_REGION = "eu-west-1";
  const AMAZON_SERVICE = "ProductAdvertisingAPI";

  if (!AMAZON_ACCESS_KEY || !AMAZON_SECRET_KEY || !AMAZON_PARTNER_TAG) {
    console.error("Amazon API credentials not configured");
    return null;
  }

  try {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, "");
    const dateStamp = amzDate.substr(0, 8);

    const payload = {
      ItemIds: [code],
      PartnerTag: AMAZON_PARTNER_TAG,
      PartnerType: "Associates",
      Marketplace: "www.amazon.in",
      Resources: ["OffersV2.Listings.Availability", "ItemInfo.Title"],
    };

    const payloadStr = JSON.stringify(payload);
    const method = "POST";
    const target = "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems";
    const contentType = "application/json; charset=UTF-8";

    // Create canonical request
    const canonicalHeaders = `content-type:${contentType}\nhost:${AMAZON_HOST}\nx-amz-date:${amzDate}\nx-amz-target:${target}\n`;
    const signedHeaders = "content-type;host;x-amz-date;x-amz-target";
    const payloadHash = crypto
      .createHash("sha256")
      .update(payloadStr)
      .digest("hex");

    const canonicalRequest = `${method}\n/paapi5/getitems\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    // Create string to sign
    const algorithm = "AWS4-HMAC-SHA256";
    const credentialScope = `${dateStamp}/${AMAZON_REGION}/${AMAZON_SERVICE}/aws4_request`;
    const canonicalRequestHash = crypto
      .createHash("sha256")
      .update(canonicalRequest)
      .digest("hex");
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

    // Calculate signature
    const kDate = hmac(
      "sha256",
      `AWS4${AMAZON_SECRET_KEY}`,
      dateStamp
    ).digest();
    const kRegion = hmac("sha256", kDate, AMAZON_REGION).digest();
    const kService = hmac("sha256", kRegion, AMAZON_SERVICE).digest();
    const kSigning = hmac("sha256", kService, "aws4_request").digest();
    const signature = hmac("sha256", kSigning, stringToSign).digest("hex");

    const authorizationHeader = `${algorithm} Credential=${AMAZON_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await axios.post(
      `https://${AMAZON_HOST}/paapi5/getitems`,
      payloadStr,
      {
        headers: {
          "Content-Type": contentType,
          "X-Amz-Date": amzDate,
          "X-Amz-Target": target,
          Authorization: authorizationHeader,
          "Content-Encoding": "amz-1.0",
          Host: AMAZON_HOST,
        },
        timeout: 10_000,
      }
    );
    return res.data;
  } catch (err) {
    console.error("Amazon API error:", err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response data:", err.response.data);
    }
    return null;
  }
};

// Custom request function for Amazon Twister API (no pincode)
// Uses the twisterDimensionSlotsDefault endpoint to check availability
const amazonTwisterCustomRequest = async ({ code, axios }) => {
  try {
    // Get Amazon platform config for additional params if needed
    const amazonPlatform = PLATFORMS.find((p) => p.name === "Amazon") || {};
    const parentAsin = amazonPlatform.parentAsin || "B0DS5YTRZ3"; // Default parent ASIN from curl
    const qid = Math.floor(Date.now() / 1000); // Generate current timestamp as qid

    const url =
      "https://www.amazon.in/gp/product/ajax/twisterDimensionSlotsDefault";
    const params = {
      isDimensionSlotsAjax: "1",
      asinList: code,
      vs: "1",
      asin: code,
      productTypeDefinition: "CELLULAR_PHONE",
      productGroupId: "premium_ce_brands_display_on_website",
      parentAsin: parentAsin,
      isPrime: "0",
      qid: qid.toString(),
      sr: "8-6",
      keywords: "iphone+17",
      deviceOs: "unrecognized",
      landingAsin: code,
      deviceType: "web",
      showFancyPrice: "false",
      twisterFlavor: "twisterPlusDesktopConfigurator",
    };

    const headers = {
      accept: "text/html,*/*",
      "accept-language": "en-US,en;q=0.7",
      priority: "u=1, i",
      referer: `https://www.amazon.in/dp/${code}`,
      "sec-ch-ua": '"Brave";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-ch-ua-platform-version": '"19.0.0"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "sec-gpc": "1",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
      "x-requested-with": "XMLHttpRequest",
      Cookie:
        'session-id=260-1126426-7541216; i18n-prefs=INR; lc-acbin=en_IN; ubid-acbin=261-4435401-2469803; csm-sid=657-5481649-7174659; sso-state-acbin=Xdsso|ZQGXvf3m_CjavT-DUC_LyDWx89HgoJSGPf31NViQmQXTdTfDK2kemfNlto5stNortNt9LhA5q4TCMlYnWUOwKBvP7rg0BF3sCwfalc_h_26Im53p; at-acbin=Atza|gQCO02jZAwEBArKcU3CC0fy156IZcSEYZ5i7HkrMuJpJ1jVhzJtZboLLTYZwb-7Ik5RvVhzPKl-BR1vlmlLxr24T3ry8X-Pn7YcxpCS3uTIoV8HXaJ303UpusQ0B5rkCr18NUBDHa08Twngcvb-fgmqMo3uDExbMy4ADpfD3mpFb-lZYJJ_63IeR4HgyjKAXKRxqG9N7aRwxlP2cySccRCD0KetYJq7UYbhjCPSbLEqoxUBKIVC2cKHxsViKUTc6_jNSRpKCpT_YXsz_9cjB4Zb3y-OQzWCiRNjQsDyppzJ8WMRW-Fd8YWdOTt1lJj2QBlH3bD2bO39xom4bn_sva3JAdp5JOXYl-VRpPAWSqAYZWD4jBCmANk9BE47OgrFceSxG6ZoyDGni29akFSyvCOGtDjXf0WseYrFvIGKQOmKVbg; sess-at-acbin=X/gkVPgZp074VrtgNFY4Omhh/x5BUjFMZikV54Wt6h8=; sst-acbin=Sst1|PQHHwQYnaSMkqc3oQiCykpDwCTIcQVx3X7CH-C7N-zzOi4gb8qrr5HjyFNQnjdexxSehFybmjI286LVYG6w2UMqwSwj2Ef8LUec8b7Vejs-DsSS4WSJt1DtueqYM3eJ6Q_53lFIGVmF6-hFg0idHf4CvJWvPmbmADZ4aQtFr-2MeV4kidkd_J8ABI4mJRSDPlhY9dIcWQI3bUH6QlUp-L0QCSvUl_Mk65eN9bkAmGqbGEoe2UqKpbN14AlzWzh64k2XMGV5kdVatNOjAMVq_vSAiGPMmN3aT0lrs0LJx_mY0KAY; session-id-time=2082787201l; session-token=8T6XrSpLpllZIgr//Iy+o8uydDx2jfSsYJYwBatb8YqWTKir2Z7eEJmZXfLFZezthywpIt7fqHWD49vo3LwLYlAtylfCv0jtG6kbvzkkoVIbnACUmObE2Oxh+nsAP+8mBnYIFqehWz/nyhFR++ttMvRzEv7XORPZLyayWg1uodQkr1VELUFA9nscrWu4jV1ddAjCJtNiGZ+tVtyiBko4CNgSmoULvut8KJK4jxcOY4i9oEllRkwb9LcQEbTcZR1ImXFhgJHsNsoQj3A+8G7YJnNxnm0uGTJFQLSKl1UAZCXhcB/eeUTNMSwjZX9hs2fZ1V0fJGySl+aep8kP11XtpfFwJaNDSDdTjDXOOmU82twfkR4fvQiKZ7lhFy2LpJjK; x-acbin="4G6xVliVFAeX98UTadehjb7MmE5z8oYN0sEzDXgzaEG4Iljxe3LiVzblH59YMr@8"; rxc=AE4r77bCU4ZKg8g6JNE; csm-hit=tb:s-J8384YXCKKW4NB0SVD0G|1765386165249&t:1765386165249&adb:adblk_yes; session-token=K17Cp5rxLWR7115b4WKzIAZUE6C86AYXZvtfw2G4oTk9n5tGk/i7YaaeR6rFuuIWAK+yBTyoUk5xX0kop4DnUe1J9kSJjkZzDDpSc9QKULi452l9llO5ExbroCNbXCpGRHyU//iYjHiXlcxeR+oqmXszkZWd9VhvNqJ00OME7bDRc+qg2Bnb3Zuq2bFGB1sNomKhxkJ0afvTnHq7/g7357S9Jq8AFvyltEsb8dX3DAm+0VGwY7ijyBxyeV1vjP21+z2esJb0XLx7V2L7lk0uQkf35ZSHteqlOaOTp7g46GRuIA6mDZPCuH4yM81fbo+R/jjaNTgpiqPoe3aOufcLDR6vaQfYJbpooR4xQiIL2tThZsIg+N03SWjrhAApo/ZK; x-acbin="TnRI9s22z0cl4K61KIn@PP8CFjtW@nljsc9?1OXL9Tgybl0B?2Ya1LuTaGn2W1R4"',
    };

    const res = await axios.get(url, {
      params,
      headers,
      timeout: 15_000,
    });
    return res.data;
  } catch (err) {
    console.error(`[Amazon Twister] API error for ASIN ${code}:`, err.message);
    if (err.response) {
      console.error("Response status:", err.response.status);
      console.error("Response data:", err.response.data);
    }
    return null;
  }
};

// Initialize custom requests
attachCustomRequest("Croma", cromaCustomRequest);
attachCustomRequest("Samsung", samsungCustomRequest);
attachCustomRequest("Flipkart", flipkartCustomRequest);
attachCustomRequest("Reliance Digital", relianceDigitalCustomRequest);
attachCustomRequest("iQOO", iqooCustomRequest);
attachCustomRequest("Vivo", vivoCustomRequest);
attachCustomRequest("Unicorn", unicornCustomRequest);
attachCustomRequest("Vijay Sales", vijaySalesCustomRequest);
attachCustomRequest("Sangeetha", sangeethaCustomRequest);
attachCustomRequest("OPPO", oppoCustomRequest);
attachCustomRequest("Amazon", amazonTwisterCustomRequest);
// attachCustomRequest("Amazon", amazonCustomRequest); // PAAPI v5 - disabled

// Export for use in index.js
export { applePickupCheck };

// Note: Apple uses separate applePickupCheck function, not attached here

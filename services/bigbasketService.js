import axios from "axios";
import dotenv from "dotenv";
import { sendQuickCommerceTelegram } from "./telegramService.js";

dotenv.config();

const BIGBASKET_API_URL = "https://www.bigbasket.com/listing-svc/v2/products";
const BIGBASKET_WEB_URL = "https://www.bigbasket.com";
const DEFAULT_BUCKET_ID = "92";
const DEFAULT_TYPE = "ps";

const baseHeaders = {
  accept: "*/*",
  "common-client-static-version": "101",
  "content-type": "application/json",
  "osmos-enabled": "true",
  origin: "https://www.bigbasket.com",
  priority: "u=1, i",
  referer: "https://www.bigbasket.com/",
  "sec-ch-ua": '"Chromium";v="142", "Brave";v="142", "Not_A Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "sec-gpc": "1",
  "x-channel": "BB-WEB",
  "x-entry-context": "bbnow",
  "x-entry-context-id": "10",
  "x-integrated-fc-door-visible": "false",
};

const buildHeaders = () => {
  const cookie = process.env.BIGBASKET_COOKIE;
  if (!cookie) {
    console.warn(
      "[BigBasket] BIGBASKET_COOKIE env var missing - skipping BigBasket checks"
    );
    return null;
  }

  const headers = {
    ...baseHeaders,
    "accept-language":
      process.env.BIGBASKET_ACCEPT_LANGUAGE || "en-US,en;q=0.5",
    "user-agent":
      process.env.BIGBASKET_USER_AGENT ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
    "x-tracker":
      process.env.BIGBASKET_TRACKER_ID ||
      "4a7f9cba-6fac-404b-a174-ad84d36c9279",
    Cookie: cookie,
  };

  return headers;
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const collectProducts = (response) => {
  if (!response || !Array.isArray(response.tabs)) return [];
  const products = [];
  for (const tab of response.tabs) {
    const tabProducts = tab?.product_info?.products;
    if (Array.isArray(tabProducts)) {
      products.push(...tabProducts);
    }
  }
  return products;
};

const fetchBigbasketPage = async ({ slug, page, bucketId, type, headers }) => {
  const res = await axios.get(BIGBASKET_API_URL, {
    params: {
      type: type || DEFAULT_TYPE,
      slug,
      page,
      bucket_id: bucketId || DEFAULT_BUCKET_ID,
    },
    headers,
    timeout: 10_000,
  });
  return res.data;
};

const brandMatches = (product, whitelist = []) => {
  if (!whitelist || whitelist.length === 0) return true;
  const brandName = (product?.brand?.name || "").toLowerCase();
  return whitelist.some((brand) => brandName === brand.toLowerCase());
};

const buildSearchHaystack = (product = {}) => {
  const infoText = Array.isArray(product.additional_attr?.info)
    ? product.additional_attr.info.map((item) => item?.value || "").join(" ")
    : "";
  return `${product.desc || ""} ${product.usp || ""} ${infoText}`.toLowerCase();
};

const escapeRegExp = (text = "") => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildMatcherRegex = (matcher) => {
  if (!matcher || typeof matcher !== "string") return null;
  const escaped = escapeRegExp(matcher.trim());
  if (!escaped) return null;
  return new RegExp(`\\b${escaped}\\b`, "i");
};

const findConfiguredProductMatch = (product, configuredProducts = []) => {
  if (!configuredProducts || configuredProducts.length === 0) {
    return { matched: true, config: null };
  }

  const haystack = buildSearchHaystack(product);

  for (const configProduct of configuredProducts) {
    const matcherList =
      Array.isArray(configProduct.matchers) && configProduct.matchers.length > 0
        ? configProduct.matchers
        : [configProduct.name];

    const matches = matcherList.some((matcher) => {
      const regex = buildMatcherRegex(matcher);
      if (!regex) return false;
      return regex.test(haystack);
    });

    if (matches) {
      return { matched: true, config: configProduct };
    }
  }

  return { matched: false, config: null };
};

const passesCategoryFilter = (product, categoryWhitelist = []) => {
  if (!categoryWhitelist || categoryWhitelist.length === 0) return true;
  const slug = product.category?.llc_slug || "";
  return categoryWhitelist.includes(slug);
};

const productHasOffer = (pricing = {}) => {
  if (!pricing) return false;
  if (pricing.offer_badge_text) return true;
  if (pricing.available_offer_type) return true;

  const discountAvailable = pricing.discount?.d_avail === "true";
  if (discountAvailable) return true;

  if (pricing.bank_offers && Object.keys(pricing.bank_offers).length > 0) {
    return true;
  }

  if (pricing.offer?.offer_available === "true") return true;

  return false;
};

const productAvailable = (product = {}) => {
  const availability = product.availability || {};
  const badgeType = (product.sku_badge?.type || "").toLowerCase();
  if (badgeType === "oos" || badgeType.includes("sold")) return false;

  const status = (availability.avail_status || "").trim();
  if (status && status !== "000") return true;

  const button = (availability.button || "").toLowerCase();
  if (button.includes("add") || button.includes("buy")) return true;

  const label = (availability.label || "").toLowerCase();
  if (label.includes("available") || label.includes("in stock")) return true;

  return false;
};

const formatPrice = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "N/A";
  return `₹${num.toLocaleString("en-IN")}`;
};

const buildOfferLines = (product) => {
  const lines = [];
  const pricing = product.pricing || {};
  const discount = pricing.discount || {};

  if (discount.d_text) {
    lines.push(`Discount: ${discount.d_text}`);
  }

  if (pricing.offer_badge_text) {
    lines.push(`Offer badge: ${pricing.offer_badge_text}`);
  }

  if (pricing.bank_offers) {
    const { savings_text, effective_price, effective_price_text } =
      pricing.bank_offers;
    const bankLineParts = [];

    if (savings_text) {
      bankLineParts.push(savings_text);
    }
    if (effective_price_text && effective_price) {
      bankLineParts.push(
        `${effective_price_text} ${formatPrice(effective_price)}`
      );
    }
    if (bankLineParts.length) {
      lines.push(`Bank: ${bankLineParts.join(" | ")}`);
    }
  }

  if (pricing.offer?.offer_entry_text) {
    lines.push(`Promo: ${pricing.offer.offer_entry_text}`);
  }

  return lines;
};

const buildTelegramMessage = (product, tracker, page, configProduct) => {
  const pricing = product.pricing || {};
  const discount = pricing.discount || {};
  const primaryPrice =
    discount.prim_price?.sp ||
    pricing.offer?.offer_sp ||
    pricing.bank_offers?.effective_price ||
    discount.subscription_price;
  const availabilityLabel =
    product.availability?.label || product.availability?.button || "Available";
  const offerLines = buildOfferLines(product);
  const messageLines = [
    "🔥 *BigBasket Stock Alert*",
    `Product: ${product.desc}`,
    configProduct?.name ? `Matched Config: ${configProduct.name}` : null,
    `Brand: ${product.brand?.name || "N/A"}`,
    `Selling price: ${formatPrice(primaryPrice)}`,
  ];

  const filteredLines = messageLines.filter(Boolean);

  if (offerLines.length) {
    filteredLines.push(...offerLines);
  }

  filteredLines.push(
    `Availability: ${availabilityLabel}`,
    `Query: "${tracker.slug}" • Page ${page}`,
    `Link: ${BIGBASKET_WEB_URL}${product.absolute_url}`
  );

  return filteredLines.join("\n");
};

export const checkBigbasketOffers = async (trackers = []) => {
  if (!Array.isArray(trackers) || trackers.length === 0) return;
  const headers = buildHeaders();
  if (!headers) return;

  const notifiedIds = new Set();

  for (const tracker of trackers) {
    if (!tracker?.slug) continue;
    const pages =
      Array.isArray(tracker.pages) && tracker.pages.length > 0
        ? tracker.pages
        : [1];

    for (const page of pages) {
      try {
        const response = await fetchBigbasketPage({
          slug: tracker.slug,
          page,
          bucketId: tracker.bucketId,
          type: tracker.type,
          headers,
        });
        const products = collectProducts(response);

        if (!products.length) {
          console.log(
            `[BigBasket] No products found for slug "${tracker.slug}" on page ${page}`
          );
          continue;
        }

        for (const product of products) {
          if (!brandMatches(product, tracker.brandWhitelist)) continue;
          if (!passesCategoryFilter(product, tracker.categoryWhitelist))
            continue;
          const match = findConfiguredProductMatch(product, tracker.products);
          if (!match.matched) continue;
          if (!productAvailable(product)) continue;
          if (!productHasOffer(product.pricing)) continue;

          const dedupeKey = String(product.id);
          if (notifiedIds.has(dedupeKey)) continue;

          notifiedIds.add(dedupeKey);
          const message = buildTelegramMessage(
            product,
            tracker,
            page,
            match.config
          );
          await sendQuickCommerceTelegram(message);

          await delay(500);
        }
      } catch (err) {
        console.error(
          `[BigBasket] Fetch failed for slug "${tracker.slug}" page ${page}:`,
          err.message
        );
        if (err.response) {
          console.error("Status:", err.response.status);
          console.error("Body:", err.response.data);
        }
      }

      await delay(500);
    }
  }
};

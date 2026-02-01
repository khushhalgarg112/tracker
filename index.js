import cron from "node-cron";
import dotenv from "dotenv";
import http from "http";
import axios from "axios";

dotenv.config();

import { PINCODES, PLATFORMS } from "./config.js";

import {
  callStockAPI,
  attachCustomRequest,
  applePickupCheck,
  flipkartSearchCustomRequest,
} from "./services/apiClient.js";
import {
  sendTelegram,
  sendOppoTelegram,
  sendAmazonTelegram,
} from "./services/telegramService.js";

/*
How this runner works:
- Iterates platforms
- Iterates product codes for each platform
- Iterates the shared PINCODES array
- Calls callStockAPI(platform, pincode, code)
- If response indicates stock -> sends Telegram message

Stock detection is intentionally flexible: we try multiple common patterns.
When you paste cURLs I'll wire exact detection per platform.
*/

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Helper function to generate product links
const getProductLink = (platformName, productId, productUrl) => {
  // Use productUrl if available (from config)
  if (productUrl) return productUrl;

  if (platformName === "Croma") {
    return `https://www.croma.com/product-details?pid=${productId}`;
  }
  if (platformName === "Samsung") {
    return `https://www.samsung.com/in/tablets/galaxy-tab-s10/buy/?modelCode=${productId}INS`;
  }
  if (platformName === "Apple") {
    return `https://www.apple.com/in/shop/buy-iphone/iphone-17`;
  }
  if (platformName === "Flipkart") {
    return `https://www.flipkart.com/product/p?pid=${productId}`;
  }
  if (platformName === "Reliance Digital") {
    return `https://www.reliancedigital.in/product-details?articleId=${productId}`;
  }
  if (platformName === "iQOO") {
    return `https://mshop.iqoo.com/in/product/${productId}`;
  }
  if (platformName === "Vivo") {
    return `https://mshop.vivo.com/in/product/${productId}`;
  }
  if (platformName === "OPPO") {
    return `https://www.oppo.com/in/product/find-x9`;
  }
  if (platformName === "Amazon") {
    return `https://www.amazon.in/dp/${productId}`;
  }
  // Default fallback
  return `Product ID: ${productId}`;
};

// Helper function to get Croma availability details for all fulfillment types
const getCromaAvailabilityDetails = (code, resData) => {
  const availabilityDetails = {
    HDEL: null, // Home Delivery
    STOR: null, // Store Pickup
    SDEL: null, // Store Delivery
  };

  try {
    const promise = resData.promise;
    if (
      !promise ||
      !promise.suggestedOption ||
      !promise.suggestedOption.option
    ) {
      return availabilityDetails;
    }

    const option = promise.suggestedOption.option;
    const promiseLines = option.promiseLines;

    if (promiseLines && Array.isArray(promiseLines.promiseLine)) {
      // Check all three fulfillment types
      const fulfillmentTypes = ["HDEL", "STOR", "SDEL"];

      for (const fulfillmentType of fulfillmentTypes) {
        const line = promiseLines.promiseLine.find(
          (l) => l.fulfillmentType === fulfillmentType && l.itemID === code
        );

        if (
          line &&
          line.assignments &&
          Array.isArray(line.assignments.assignment)
        ) {
          // Check if there are assignments with quantity > 0
          const validAssignments = line.assignments.assignment.filter(
            (assignment) => parseInt(assignment.quantity) > 0
          );

          if (validAssignments.length > 0) {
            availabilityDetails[fulfillmentType] = {
              available: true,
              assignments: validAssignments,
            };
          }
        }
      }
    }
  } catch (err) {
    console.error("Error parsing Croma availability details:", err.message);
  }

  return availabilityDetails;
};

// Helper function to get Apple pickup availability details
const getApplePickupAvailability = (code, resData) => {
  const availableStores = [];

  try {
    if (
      !resData ||
      !resData.body ||
      !resData.body.content ||
      !resData.body.content.pickupMessage ||
      !resData.body.content.pickupMessage.stores
    ) {
      return availableStores;
    }

    const stores = resData.body.content.pickupMessage.stores;

    for (const store of stores) {
      if (
        store.partsAvailability &&
        store.partsAvailability[code] &&
        store.partsAvailability[code].pickupSearchQuote === "Available Today"
      ) {
        availableStores.push({
          storeName: store.storeName || "N/A",
          city: store.city || "N/A",
          postalCode: store.address?.postalCode || "N/A",
          address: store.address?.address || "N/A",
          address2: store.address?.address2 || "",
          address3: store.address?.address3 || "",
          productTitle:
            store.partsAvailability[code].messageTypes?.regular
              ?.storePickupProductTitle || "N/A",
        });
      }
    }
  } catch (err) {
    console.error("Error parsing Apple pickup availability:", err.message);
  }

  return availableStores;
};

// Helper function to get Samsung availability details
const getSamsungAvailabilityDetails = (code, resData) => {
  const availabilityDetails = {
    localDealers: [],
    stores: [],
    deliveryModes: [],
  };

  try {
    if (!Array.isArray(resData) || resData.length === 0) {
      return availabilityDetails;
    }

    const item = resData[0];
    if (!item || !item.external_attributes) {
      return availabilityDetails;
    }

    const extAttrs = item.external_attributes;

    // Check local dealers
    if (Array.isArray(extAttrs.local_dealers)) {
      availabilityDetails.localDealers = extAttrs.local_dealers.filter(
        (dealer) => dealer.serviceable === true
      );
    }

    // Check stores
    if (Array.isArray(extAttrs.stores)) {
      availabilityDetails.stores = extAttrs.stores.filter(
        (store) => store.serviceable === true
      );
    }

    // Check delivery modes
    if (Array.isArray(item.delivery_modes) && item.delivery_modes.length > 0) {
      availabilityDetails.deliveryModes = item.delivery_modes.filter(
        (mode) => mode.estimated_delivery_date
      );
    }
  } catch (err) {
    console.error("Error parsing Samsung availability details:", err.message);
  }

  return availabilityDetails;
};

// Helper function to get Flipkart availability details (for individual product API)
const getFlipkartAvailabilityDetails = (code, resData) => {
  try {
    const response = resData.RESPONSE?.[code];
    if (!response) {
      console.log(`[Flipkart] No RESPONSE found for product ${code}`);
      return null;
    }

    const listing = response.listingSummary || {};

    // Check both 'available' and 'serviceable' fields
    // Product is available if either is true
    const isAvailable =
      listing.available === true || listing.serviceable === true;

    // Get price
    const price = listing.pricing?.finalPrice?.decimalValue || null;

    console.log(
      `[Flipkart] Product ${code} - available: ${listing.available}, serviceable: ${listing.serviceable}, isAvailable: ${isAvailable}`
    );

    return {
      available: isAvailable,
      price: price,
    };
  } catch (err) {
    console.error("Error parsing Flipkart availability:", err.message);
    console.error("Response data:", JSON.stringify(resData, null, 2));
    return null;
  }
};

// Helper function to parse Flipkart search response and extract iPhone 17 256GB products
const parseFlipkartSearchResponse = (resData) => {
  const products = [];

  try {
    if (!resData || !resData.RESPONSE || !resData.RESPONSE.pageData) {
      console.log("[Flipkart Search] Invalid response structure");
      return products;
    }

    // iPhone 17 256GB product mapping (id, name, url)
    const iphone17Products = [
      {
        id: "MOBHFN6YKGBPYJZD",
        name: "Apple iPhone 17 (Lavender, 256 GB)",
        url: "https://www.flipkart.com/apple-iphone-17-lavender-256-gb/p/itmf37c8dffa4165?pid=MOBHFN6YKGBPYJZD&lid=LSTMOBHFN6YKGBPYJZDEZPBYP&marketplace=FLIPKART&q=iphone+17&store=tyy%2F4io&srno=s_1_19&otracker=search&otracker1=search&fm=search-autosuggest&iid=83397663-01ea-4654-b405-c51c2dab4d99.MOBHFN6YKGBPYJZD.SEARCH&ppt=sp&ppn=sp&ssid=71742qm8680000001765375401829&qH=c9eeb2d6cc488f0b",
      },
      {
        id: "MOBHFN6YN2HXB5HE",
        name: "Apple iPhone 17 (Black, 256 GB)",
        url: "https://www.flipkart.com/apple-iphone-17-black-256-gb/p/itm6eb39da622cdd?pid=MOBHFN6YN2HXB5HE&lid=LSTMOBHFN6YN2HXB5HER9QXGU&marketplace=FLIPKART&q=iphone+17&store=tyy%2F4io&srno=s_1_14&otracker=AS_QueryStore_OrganicAutoSuggest_1_3_na_na_ps&otracker1=AS_QueryStore_OrganicAutoSuggest_1_3_na_na_ps&fm=search-autosuggest&iid=f6786d63-7195-4510-83f6-639e471bc3b9.MOBHFN6YN2HXB5HE.SEARCH&ppt=pp&ppn=pp&ssid=1hpd0b44kg0000001765731295530&qH=c9eeb2d6cc488f0b",
      },
      {
        id: "MOBHFN6YTSH3QRCZ",
        name: "Apple iPhone 17 (White, 256 GB)",
        url: "https://www.flipkart.com/apple-iphone-17-white-256-gb/p/itmf98e89534d806?pid=MOBHFN6YTSH3QRCZ&lid=LSTMOBHFN6YTSH3QRCZYMRV03&marketplace=FLIPKART&q=iphone+17&store=tyy%2F4io&srno=s_1_16&otracker=AS_QueryStore_OrganicAutoSuggest_1_3_na_na_ps&otracker1=AS_QueryStore_OrganicAutoSuggest_1_3_na_na_ps&fm=search-autosuggest&iid=f6786d63-7195-4510-83f6-639e471bc3b9.MOBHFN6YTSH3QRCZ.SEARCH&ppt=pp&ppn=pp&ssid=1hpd0b44kg0000001765731295530&qH=c9eeb2d6cc488f0b",
      },
      {
        id: "MOBHFN6YNAG4ZTHS",
        name: "Apple iPhone 17 (Sage, 256 GB)",
        url: "https://www.flipkart.com/apple-iphone-17-sage-256-gb/p/itmcfa57eff7729c?pid=MOBHFN6YNAG4ZTHS&lid=LSTMOBHFN6YNAG4ZTHSWUQQUI&marketplace=FLIPKART&q=iphone+17&store=tyy%2F4io&srno=s_1_17&otracker=AS_QueryStore_OrganicAutoSuggest_1_3_na_na_ps&otracker1=AS_QueryStore_OrganicAutoSuggest_1_3_na_na_ps&fm=search-autosuggest&iid=f6786d63-7195-4510-83f6-639e471bc3b9.MOBHFN6YNAG4ZTHS.SEARCH&ppt=pp&ppn=pp&ssid=1hpd0b44kg0000001765731295530&qH=c9eeb2d6cc488f0b",
      },
      {
        id: "MOBHFN6YWTXZD8SG",
        name: "Apple iPhone 17 (Mist Blue, 256 GB)",
        url: "https://www.flipkart.com/apple-iphone-17-mist-blue-256-gb/p/itm1834df7ee2812?pid=MOBHFN6YWTXZD8SG&lid=LSTMOBHFN6YWTXZD8SGROTZTS&marketplace=FLIPKART&q=iphone+17&store=tyy%2F4io&srno=s_1_18&otracker=AS_QueryStore_OrganicAutoSuggest_1_3_na_na_ps&otracker1=AS_QueryStore_OrganicAutoSuggest_1_3_na_na_ps&fm=search-autosuggest&iid=f6786d63-7195-4510-83f6-639e471bc3b9.MOBHFN6YWTXZD8SG.SEARCH&ppt=pp&ppn=pp&ssid=1hpd0b44kg0000001765731295530&qH=c9eeb2d6cc488f0b",
      },
    ];

    // Create a map for quick lookup
    const iphone17ProductMap = new Map(iphone17Products.map((p) => [p.id, p]));
    const iphone17ProductIds = iphone17Products.map((p) => p.id);

    console.log(
      `[Flipkart Search] Tracking ${
        iphone17ProductIds.length
      } iPhone 17 256GB products: ${iphone17ProductIds.join(", ")}`
    );
    // Check both widgets and slots arrays (Flipkart may use either structure)
    // Slots contain widgets, so we need to check both
    let slots = resData.RESPONSE.slots || [];
    console.log(
      slots.length,
      "-------------------------------------------------slots"
    );
    slots = slots.filter((slot) => slot?.widget);
    console.log(
      slots.length,
      "-------------------------------------------------slots"
    );

    // Find ALL PRODUCT_SUMMARY widgets which contain product listings
    let totalProductsChecked = 0;
    const allProductsFound = []; // Track all products for logging

    for (const slot of slots) {
      if (slot.widget && slot.widget.type === "PRODUCT_SUMMARY") {
        const widgetData = slot.widget.data;
        if (
          widgetData &&
          widgetData.products &&
          Array.isArray(widgetData.products)
        ) {
          console.log(
            `[Flipkart Search] Processing widget with ${widgetData.products.length} products`
          );
          totalProductsChecked += widgetData.products.length;

          for (const product of widgetData.products) {
            if (product.productInfo && product.productInfo.value) {
              const productValue = product.productInfo.value;

              // Get productId from action.params.productId (primary) or value.id (fallback)
              const productId =
                product.addToWishlist.action?.params?.productId ||
                productValue.id;

              // Get title from titles object (preferred) or fallback to title field
              const titles = productValue.titles || {};
              const title =
                titles.title || titles.newTitle || productValue.title || "";

              const buyability = productValue.buyability || {};
              const pricing = productValue.pricing || {};
              const baseUrl = productValue.baseUrl || "";

              // Log ALL products found
              const isAvailable = buyability.intent === "positive";
              const availabilityStatus = isAvailable
                ? "✅ AVAILABLE"
                : "❌ UNAVAILABLE";
              const buyabilityMessage = buyability.message || "N/A";

              console.log(
                `[Flipkart Search] Product Found - ID: ${productId}, Title: ${title}, Status: ${availabilityStatus}, Message: ${buyabilityMessage}`
              );

              allProductsFound.push({
                productId: productId,
                title: title,
                available: isAvailable,
              });

              // Check if this productId is in our tracking list (iPhone 17 256GB)
              // Use productId matching instead of name matching for robustness
              if (iphone17ProductIds.includes(productId)) {
                const productInfo = iphone17ProductMap.get(productId);
                console.log(
                  `[Flipkart Search] ✅ MATCHED iPhone 17 256GB - ID: ${productId}, Title: ${title}, Available: ${isAvailable}`
                );

                const price =
                  pricing.finalPrice?.decimalValue ||
                  pricing.finalPrice?.value ||
                  null;

                // Use URL from mapping, fallback to constructed URL
                const fullUrl =
                  productInfo?.url ||
                  (baseUrl.startsWith("http")
                    ? baseUrl
                    : `https://www.flipkart.com${baseUrl}`);

                products.push({
                  productId: productId,
                  title: productInfo?.name || title, // Use name from mapping
                  available: isAvailable,
                  price: price,
                  url: fullUrl,
                  color: extractColorFromTitle(productInfo?.name || title),
                  buyability: buyability, // Store buyability for reference
                });
              }
            }
          }
        }
      }
    }

    console.log(
      `[Flipkart Search] Summary: Checked ${totalProductsChecked} total products, found ${allProductsFound.length} products, matched ${products.length} iPhone 17 256GB products`
    );

    // Log which tracked products were found and their status
    console.log(`[Flipkart Search] Tracked Products Status:`);
    for (const trackedId of iphone17ProductIds) {
      const foundProduct = allProductsFound.find(
        (p) => p.productId === trackedId
      );
      if (foundProduct) {
        console.log(
          `  ✅ ${trackedId} - ${foundProduct.title} - ${
            foundProduct.available ? "AVAILABLE" : "UNAVAILABLE"
          }`
        );
      } else {
        console.log(`  ❌ ${trackedId} - NOT FOUND in search results`);
      }
    }
  } catch (err) {
    console.error("Error parsing Flipkart search response:", err.message);
    console.error(err.stack);
  }

  return products;
};

// Helper function to extract color from product title
const extractColorFromTitle = (title) => {
  const colors = [
    "Lavender",
    "Black",
    "White",
    "Sage",
    "Mist Blue",
    "Deep Blue",
    "Natural Titanium",
  ];
  const titleLower = title.toLowerCase();

  for (const color of colors) {
    if (titleLower.includes(color.toLowerCase())) {
      return color;
    }
  }
  return "Unknown";
};

// Helper function to get Reliance Digital availability details
const getRelianceDigitalAvailabilityDetails = (code, resData) => {
  try {
    const articles = resData.data?.articles || [];
    if (articles.length === 0) return null;

    const article = articles[0];
    const error = article.error || {};
    const errorType = error.type;

    return {
      available: !(
        errorType &&
        ["OutOfStockError", "FaultyArticleError"].includes(errorType)
      ),
      errorMessage: error.message || null,
    };
  } catch (err) {
    console.error("Error parsing Reliance Digital availability:", err.message);
    return null;
  }
};

// Helper function to get iQOO/Vivo availability details
const getIqooVivoAvailabilityDetails = (resData) => {
  try {
    if (resData.success !== "1" || !resData.data) return null;

    const skuList = resData.data.activitySkuList || [];
    let isInStock = false;

    for (const sku of skuList) {
      const reservableId = sku.activityInfo?.reservableId;
      if (reservableId === -1) {
        isInStock = true;
        break;
      }
    }

    return { available: isInStock };
  } catch (err) {
    console.error("Error parsing iQOO/Vivo availability:", err.message);
    return null;
  }
};

// Helper function to get Amazon availability details
const getAmazonAvailabilityDetails = (resData) => {
  try {
    // Skip if this is an API error response
    if (resData && resData._error === true) {
      return null;
    }

    // Check for Twister API response format
    if (resData && resData.Value && resData.Value.content) {
      const twisterSlotJson = resData.Value.content.twisterSlotJson;
      if (twisterSlotJson !== undefined) {
        return {
          available: twisterSlotJson.isAvailable === true,
          message: twisterSlotJson.isAvailable
            ? "Available"
            : "Currently unavailable",
          asin: resData.ASIN || null,
        };
      }
    }

    // Fallback to PAAPI v5 format (if used)
    const items = resData.ItemsResult?.Items || [];
    if (items.length === 0) return null;

    const item = items[0];
    const listing = item.OffersV2?.Listings?.[0];
    const availability = listing?.Availability || {};

    return {
      available:
        availability.Type === "IN_STOCK" ||
        availability.Message?.toLowerCase().includes("in stock"),
      message: availability.Message || "Status Unknown",
    };
  } catch (err) {
    console.error("Error parsing Amazon availability:", err.message);
    return null;
  }
};

// Helper function to get Unicorn availability details
const getUnicornAvailabilityDetails = (resData) => {
  try {
    const product = resData?.data?.product;
    if (!product) return null;

    const quantity = Number(product.quantity) || 0;
    const price = Number(product.price);

    return {
      available: quantity > 0,
      quantity,
      price: Number.isFinite(price) ? price : null,
      sku: product.sku,
      dispatchNote: product.custom_column_4 || null,
    };
  } catch (err) {
    console.error("Error parsing Unicorn availability:", err.message);
    return null;
  }
};

// Helper function to get Vijay Sales availability details
const getVijaySalesAvailabilityDetails = (code, resData) => {
  try {
    const productData = resData?.data?.[String(code)];
    if (!productData) return null;

    const pickupList = Array.isArray(productData.storePickupList)
      ? productData.storePickupList
      : [];

    const delivery = productData.isServiceable === true;
    const pickup = pickupList.length > 0;

    return {
      available: delivery || pickup,
      delivery,
      pickup,
      pickupList,
    };
  } catch (err) {
    console.error("Error parsing Vijay Sales availability:", err.message);
    return null;
  }
};

// Helper function to get Sangeetha availability details
const getSangeethaAvailabilityDetails = (resData) => {
  try {
    // Handle error responses (e.g., 500 errors)
    if (resData?.error === true) {
      console.error(
        `[Sangeetha] Error response: ${resData.message || "Unknown error"}`
      );
      return null;
    }

    const eta = resData?.data?.product_eta;
    if (!eta) return null;

    const inStock = (eta.stock_status || "").toLowerCase() === "instock";
    return {
      available: inStock,
      etaTitle: eta.eta_title || null,
      etaMessage: eta.eta_message || null,
    };
  } catch (err) {
    console.error("Error parsing Sangeetha availability:", err.message);
    return null;
  }
};

// Helper function to get OPPO availability details
const getOppoAvailabilityDetails = (resData) => {
  try {
    if (!resData || !resData.success || !resData.data) return null;

    const products = resData.data.products || [];
    const inStockProducts = [];

    for (const product of products) {
      // Check stockStatus: 1 = in stock, 0 = out of stock
      if (product.stockStatus === 1) {
        inStockProducts.push({
          skuCode: product.skuCode,
          name: product.name,
          cnName: product.cnName,
          imageUrl: product.imageUrl,
          stockStatus: product.stockStatus,
        });
      }
    }

    return {
      available: inStockProducts.length > 0,
      inStockProducts,
      totalProducts: products.length,
    };
  } catch (err) {
    console.error("Error parsing OPPO availability:", err.message);
    return null;
  }
};

const detectAvailability = (platformName, code, pincode, resData) => {
  // Check for API errors - don't treat errors as "no stock"
  if (!resData || resData._error === true) {
    // Return null to indicate "unknown" status (not false for "no stock")
    return null;
  }

  // Apple-specific detection
  if (platformName === "Apple") {
    const availableStores = getApplePickupAvailability(code, resData);
    return availableStores.length > 0;
  }

  // Samsung-specific detection
  if (platformName === "Samsung") {
    const availabilityDetails = getSamsungAvailabilityDetails(code, resData);
    return (
      availabilityDetails.localDealers.length > 0 ||
      availabilityDetails.stores.length > 0 ||
      availabilityDetails.deliveryModes.length > 0
    );
  }

  // Croma-specific detection
  if (platformName === "Croma") {
    const availabilityDetails = getCromaAvailabilityDetails(code, resData);
    return (
      availabilityDetails.HDEL?.available ||
      availabilityDetails.STOR?.available ||
      availabilityDetails.SDEL?.available
    );
  }

  // Flipkart-specific detection
  if (platformName === "Flipkart") {
    const availabilityDetails = getFlipkartAvailabilityDetails(code, resData);
    return availabilityDetails?.available === true;
  }

  // Reliance Digital-specific detection
  if (platformName === "Reliance Digital") {
    const availabilityDetails = getRelianceDigitalAvailabilityDetails(
      code,
      resData
    );
    return availabilityDetails?.available === true;
  }

  // iQOO-specific detection
  if (platformName === "iQOO") {
    const availabilityDetails = getIqooVivoAvailabilityDetails(resData);
    return availabilityDetails?.available === true;
  }

  // Vivo-specific detection
  if (platformName === "Vivo") {
    const availabilityDetails = getIqooVivoAvailabilityDetails(resData);
    return availabilityDetails?.available === true;
  }

  // Amazon-specific detection
  if (platformName === "Amazon") {
    const availabilityDetails = getAmazonAvailabilityDetails(resData);
    return availabilityDetails?.available === true;
  }

  if (platformName === "Unicorn") {
    const availabilityDetails = getUnicornAvailabilityDetails(resData);
    return availabilityDetails?.available === true;
  }

  if (platformName === "Vijay Sales") {
    const availabilityDetails = getVijaySalesAvailabilityDetails(code, resData);
    return availabilityDetails?.available === true;
  }

  if (platformName === "Sangeetha") {
    const availabilityDetails = getSangeethaAvailabilityDetails(resData);
    return availabilityDetails?.available === true;
  }

  // OPPO-specific detection
  if (platformName === "OPPO") {
    const availabilityDetails = getOppoAvailabilityDetails(resData);
    return availabilityDetails?.available === true;
  }

  // Common patterns for other platforms
  if (typeof resData === "object") {
    if (resData.available === true) return true;
    if (resData.inStock === true) return true;
    if (typeof resData.qty === "number" && resData.qty > 0) return true;
    if (typeof resData.quantity === "number" && resData.quantity > 0)
      return true;
    if (
      resData.data &&
      (resData.data.available === true ||
        (typeof resData.data.qty === "number" && resData.data.qty > 0))
    )
      return true;
  }

  // fallback
  try {
    const text = JSON.stringify(resData).toLowerCase();
    if (
      text.includes("available") &&
      !text.includes("not available") &&
      !text.includes("out of stock")
    )
      return true;
  } catch (e) {}

  return false;
};

// Separate function to check Apple products (no pincode iteration)
const checkAppleStock = async () => {
  const applePlatform = PLATFORMS.find((p) => p.name === "Apple");
  if (!applePlatform) return;

  for (const product of applePlatform.products) {
    const productId = typeof product === "object" ? product.id : product;
    const productName = typeof product === "object" ? product.name : product;

    try {
      const data = await applePickupCheck(productId, axios);

      // If we got a 541 error or null response, skip this product
      if (!data) {
        console.log(`Skipping ${productId} due to API error`);
        // Add delay before next request to avoid rate limiting
        await sleep(2000);
        continue;
      }

      const availableStores = getApplePickupAvailability(productId, data);

      if (availableStores.length > 0) {
        const store = availableStores[0];
        const now = new Date();
        const dateStr = now.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
        const timeStr = now.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        });

        // Parse product name to extract details
        const storageMatch = productName.match(/(\d+GB)/);
        const storageIndex = productName.indexOf(
          storageMatch ? storageMatch[0] : ""
        );

        let model = productName;
        let storage = "N/A";
        let color = "N/A";

        if (storageMatch && storageIndex > 0) {
          storage = storageMatch[0];
          model = productName.substring(0, storageIndex).trim();
          color = productName.substring(storageIndex + storage.length).trim();
        }

        const text =
          `🎉 *${model} STOCK AVAILABLE!* 🎉\n\n` +
          `📱 ${productName}\n` +
          `🎨 Color: ${color}\n` +
          `💾 Storage: ${storage}\n\n` +
          `📍 ${store.storeName} (${store.city})\n` +
          `   Pincode: ${store.postalCode}\n` +
          `   Status: available\n\n` +
          `⏰ ${dateStr}, ${timeStr}\n\n` +
          `🏃‍♂️ Hurry! Stock may be limited!`;

        console.log("ALERT -> Apple", productId);
        await sendTelegram(text);
        await sleep(500);
      } else {
        console.log("No stock: Apple", productId);
      }

      // Add delay between product checks to avoid rate limiting
      await sleep(2000); // 2 second delay between each product
    } catch (err) {
      console.error("Error checking Apple", productId, err.message);
      // Add delay even on error to avoid hammering the API
      await sleep(2000);
    }
  }
};

// Separate function to check Flipkart search for iPhone 17 256GB
const checkFlipkartSearch = async () => {
  try {
    console.log("[Flipkart Search] Checking iPhone 17 256GB stock...");

    const searchData = await flipkartSearchCustomRequest({ axios });

    if (!searchData) {
      console.log("[Flipkart Search] No data received from API");
      return;
    }

    const products = parseFlipkartSearchResponse(searchData);
    console.log(
      `[Flipkart Search] Found ${products.length} iPhone 17 256GB products`
    );

    for (const product of products) {
      if (product.available) {
        const now = new Date();
        const dateStr = now.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
        const timeStr = now.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        });

        let text = `🎉 *iPhone 17 256GB STOCK AVAILABLE!* 🎉\n\n`;
        text += `📱 ${product.title}\n`;
        text += `🎨 Color: ${product.color}\n`;
        text += `💾 Storage: 256 GB\n`;

        if (product.price) {
          const priceNum = parseFloat(product.price);
          text += `💰 Price: ₹${priceNum.toLocaleString("en-IN")}\n`;
        }

        // Add buyability message if available (for additional context)
        if (product.buyability && product.buyability.message) {
          text += `\n📝 Status: ${product.buyability.message}\n`;
        }

        text += `\n🔗 [Buy Now](${product.url})\n\n`;
        text += `⏰ ${dateStr}, ${timeStr}\n\n`;
        text += `🏃‍♂️ Hurry! Stock may be limited!`;

        console.log(
          `ALERT -> Flipkart Search: ${product.productId} - ${product.title}`
        );
        await sendTelegram(text);
        await sleep(500); // Small delay between alerts
      } else {
        console.log(
          `[Flipkart Search] No stock: ${product.productId} - ${product.title}`
        );
      }
    }
  } catch (err) {
    console.error("Error checking Flipkart search:", err.message);
  }
};

// Separate function to check platforms without pincode (iQOO, Vivo, Unicorn, OPPO, Amazon)
const checkPlatformsWithoutPincode = async () => {
  const platformsWithoutPincode = ["iQOO", "Vivo", "Unicorn", "OPPO", "Amazon"];

  for (const platform of PLATFORMS) {
    if (!platformsWithoutPincode.includes(platform.name)) continue;
    if (!platform.products || platform.products.length === 0) continue;

    for (const product of platform.products) {
      const productId = typeof product === "object" ? product.id : product;
      const productName = typeof product === "object" ? product.name : product;
      const productUrl = typeof product === "object" ? product.url : null;

      try {
        let data;

        // Remove Amazon check - only iQOO and Vivo
        // iQOO and Vivo
        if (typeof platform.customRequest === "function") {
          data = await platform.customRequest({ code: productId, axios });
        } else {
          data = await callStockAPI(platform, null, productId);
        }

        const available = detectAvailability(
          platform.name,
          productId,
          null,
          data
        );

        // Skip if API error (available === null means error/unknown)
        if (available === null) {
          console.log(
            `⚠️ API error - skipping stock check: ${platform.name} ${productId}`
          );
          await sleep(1000);
          continue;
        }

        if (available) {
          const productLink = getProductLink(
            platform.name,
            productId,
            productUrl
          );
          let text = `✅ *Stock Alert*\nPlatform: ${platform.name}\nProduct: [${productName}](${productLink})\n`;

          if (platform.name === "Unicorn") {
            const details = getUnicornAvailabilityDetails(data);
            if (details) {
              if (details.price) {
                text += `💰 Price: ₹${details.price.toLocaleString("en-IN")}\n`;
              }
              text += `📦 Quantity: ${details.quantity ?? "N/A"}\n`;
              if (details.sku) {
                text += `SKU: ${details.sku}\n`;
              }
            }
          } else if (platform.name === "OPPO") {
            const details = getOppoAvailabilityDetails(data);
            if (details && details.inStockProducts.length > 0) {
              text += `\n📦 *Available Variants:*\n`;
              for (const variant of details.inStockProducts) {
                text += `\n• ${variant.name || variant.cnName}\n`;
              }
              text += `\nTotal: ${details.inStockProducts.length} variant(s) in stock`;
            }
          } else if (platform.name === "Amazon") {
            const details = getAmazonAvailabilityDetails(data);
            if (details) {
              text += `\n📦 Status: ${details.message || "Available"}\n`;
              if (details.asin) {
                text += `ASIN: ${details.asin}\n`;
              }
            }
          }

          console.log("ALERT ->", platform.name, productId);

          // Use platform-specific Telegram channel if available
          if (platform.name === "OPPO") {
            await sendOppoTelegram(text);
          } else if (platform.name === "Amazon") {
            await sendAmazonTelegram(text);
          } else {
            await sendTelegram(text);
          }
          await sleep(500);
        } else {
          console.log("No stock:", platform.name, productId);
        }

        // Longer delay for Amazon to avoid rate limiting (3-5 seconds random)
        if (platform.name === "Amazon") {
          const amazonDelay = 3000 + Math.random() * 2000; // 3-5 seconds
          await sleep(amazonDelay);
        } else {
          await sleep(1000); // Standard delay for other platforms
        }
      } catch (err) {
        console.error("Error checking", platform.name, productId, err.message);
        await sleep(1000);
      }
    }
  }
};

const checkStock = async () => {
  console.log("Starting stock sweep at", new Date().toISOString());

  // Check if Croma has no products configured, then call external API
  const cromaPlatform = PLATFORMS.find((p) => p.name === "Croma");
  if (cromaPlatform && cromaPlatform.products.length === 0) {
    console.log("\n🔍 Croma products length is 0 - calling external API...");
    try {
      const response = await axios.post(
        "https://inventory-rho-ten.vercel.app/api/cron"
      );
      console.log("✅ External Croma API called successfully (POST)");
      console.log("   Response:", response.data);
    } catch (err) {
      console.error("❌ Error calling external Croma API:", err.message);
      if (err.response) {
        console.error("   Status:", err.response.status);
        console.error("   Data:", err.response.data);
      }
    }
  }

  // BigBasket search tracking - DISABLED (CORS/Access Denied issues)
  // console.log("\n🔍 Calling external BigBasket API...");
  // try {
  //   const response = await axios.post(
  //     "https://inventory-rho-ten.vercel.app/api/bigbasket"
  //   );
  //   console.log("✅ External BigBasket API called successfully (POST)");
  //   console.log("   Response:", response.data);
  // } catch (err) {
  //   console.error("❌ Error calling external BigBasket API:", err.message);
  //   if (err.response) {
  //     console.error("   Status:", err.response.status);
  //     console.error("   Data:", err.response.data);
  //   }
  // }

  // Check Apple separately (no pincode iteration) - DISABLED
  // await checkAppleStock();

  // Check Flipkart search for iPhone 17 256GB
  // await checkFlipkartSearch();

  // Check platforms without pincode (iQOO, Vivo, Unicorn) - Amazon disabled
  await checkPlatformsWithoutPincode();

  // Check other platforms with pincode iteration
  for (const platform of PLATFORMS) {
    // Skip Apple as it's disabled, and iQOO, Vivo, Unicorn, OPPO, Amazon as they're handled separately
    if (
      ["Apple", "iQOO", "Vivo", "Unicorn", "OPPO", "Amazon"].includes(
        platform.name
      )
    )
      continue;

    // Also skip if platform has no products
    if (!platform.products || platform.products.length === 0) continue;

    // Get platform-specific pincodes, fallback to global PINCODES if not specified
    const platformPincodes =
      platform.pincodes && platform.pincodes.length > 0
        ? platform.pincodes
        : PINCODES; // Fallback to global PINCODES

    // Skip if no pincodes configured
    if (!platformPincodes || platformPincodes.length === 0) {
      console.log(`Skipping ${platform.name} - no pincodes configured`);
      continue;
    }

    for (const product of platform.products) {
      const productId = typeof product === "object" ? product.id : product;
      const productName = typeof product === "object" ? product.name : product;
      const productUrl = typeof product === "object" ? product.url : null;

      for (const pincode of platformPincodes) {
        try {
          const data = await callStockAPI(platform, pincode, productId);
          const available = detectAvailability(
            platform.name,
            productId,
            pincode,
            data
          );

          if (available) {
            const productLink = getProductLink(
              platform.name,
              productId,
              productUrl
            );
            let text = `✅ *Stock Alert*\nPlatform: ${platform.name}\nProduct: [${productName}](${productLink})\n📍 Pincode: ${pincode}`;

            // For Samsung, extract availability details
            if (platform.name === "Samsung") {
              text = `✅ *Stock Alert*\nPlatform: ${platform.name}\nProduct: [${productName}](${productLink})\n📍 Pincode: ${pincode}`;
              const availabilityDetails = getSamsungAvailabilityDetails(
                productId,
                data
              );
              const availableOptions = [];

              // Local Dealers
              if (availabilityDetails.localDealers.length > 0) {
                const dealer = availabilityDetails.localDealers[0];
                availableOptions.push(
                  `\n\n🏪 *Local Dealer Available*\n` +
                    `Store: ${dealer.store_name || "N/A"}\n` +
                    `Location: ${dealer.location || dealer.city || "N/A"}\n` +
                    `Quantity: ${dealer.quantity || "N/A"}\n` +
                    `Estimated Delivery: ${
                      dealer.estimated_delivery_date || "N/A"
                    }`
                );
              }

              // Stores
              if (availabilityDetails.stores.length > 0) {
                const store = availabilityDetails.stores[0];
                availableOptions.push(
                  `\n\n🏬 *Store Available*\n` +
                    `Store: ${store.store_name || "N/A"}\n` +
                    `Location: ${store.location || store.city || "N/A"}\n` +
                    `Quantity: ${store.quantity || "N/A"}\n` +
                    `Estimated Delivery: ${
                      store.estimated_delivery_date || "N/A"
                    }`
                );
              }

              // Delivery Modes
              if (availabilityDetails.deliveryModes.length > 0) {
                const mode = availabilityDetails.deliveryModes[0];
                availableOptions.push(
                  `\n\n🚚 *Delivery Available*\n` +
                    `Type: ${
                      mode.model_name ||
                      mode.product_display_name ||
                      "Standard Delivery"
                    }\n` +
                    `Estimated Delivery: ${
                      mode.estimated_delivery_date || "N/A"
                    }\n` +
                    `Delivery Time: ${mode.estimated_delivery_time || "N/A"}`
                );
              }

              if (availableOptions.length > 0) {
                text += availableOptions.join("\n");
              } else {
                text += `\n\n⚠️ Stock detected but no details available`;
              }
            }
            // For Croma, extract all fulfillment type details
            else if (platform.name === "Croma") {
              text = `✅ *Stock Alert*\nPlatform: ${platform.name}\nProduct: [${productName}](${productLink})\n📍 Pincode: ${pincode}`;
              const availabilityDetails = getCromaAvailabilityDetails(
                productId,
                data
              );
              const availableTypes = [];

              // HDEL - Home Delivery
              if (availabilityDetails.HDEL?.available) {
                const assignment = availabilityDetails.HDEL.assignments[0];
                availableTypes.push(
                  `\n\n📦 *Home Delivery (HDEL) - Available*\n` +
                    `Delivery Date: ${assignment.deliveryDate || "N/A"}\n` +
                    `Time: ${assignment.fromTime || "N/A"} - ${
                      assignment.toTime || "N/A"
                    }\n` +
                    `Quantity: ${assignment.quantity}\n` +
                    `Ship Node: ${assignment.shipNode || "N/A"}`
                );
              }

              // STOR - Store Pickup
              if (availabilityDetails.STOR?.available) {
                const assignment = availabilityDetails.STOR.assignments[0];
                availableTypes.push(
                  `\n\n🏪 *Store Pickup (STOR) - Available*\n` +
                    `Quantity: ${assignment.quantity || "N/A"}\n` +
                    `Ship Node: ${assignment.shipNode || "N/A"}`
                );
              }

              // SDEL - Store Delivery
              if (availabilityDetails.SDEL?.available) {
                const assignment = availabilityDetails.SDEL.assignments[0];
                availableTypes.push(
                  `\n\n🚚 *Store Delivery (SDEL) - Available*\n` +
                    `Delivery Date: ${assignment.deliveryDate || "N/A"}\n` +
                    `Time: ${assignment.fromTime || "N/A"} - ${
                      assignment.toTime || "N/A"
                    }\n` +
                    `Quantity: ${assignment.quantity}\n` +
                    `Ship Node: ${assignment.shipNode || "N/A"}`
                );
              }

              if (availableTypes.length > 0) {
                text += availableTypes.join("\n");
              } else {
                text += `\n\n⚠️ Stock detected but no fulfillment details available`;
              }
            }
            // For Flipkart
            else if (platform.name === "Flipkart") {
              const details = getFlipkartAvailabilityDetails(productId, data);
              if (details?.price) {
                text += `\n💰 Price: ₹${details.price}`;
              }
            }
            // For Reliance Digital
            else if (platform.name === "Reliance Digital") {
              const details = getRelianceDigitalAvailabilityDetails(
                productId,
                data
              );
              if (details?.errorMessage) {
                text += `\n⚠️ Note: ${details.errorMessage}`;
              }
            }
            // For Vijay Sales
            else if (platform.name === "Vijay Sales") {
              const details = getVijaySalesAvailabilityDetails(productId, data);
              if (details) {
                text += `\n📦 Delivery: ${details.delivery ? "YES" : "NO"}`;
                text += `\n🏬 Pickup: ${details.pickup ? "YES" : "NO"}`;
                if (details.pickupList?.length) {
                  const store = details.pickupList[0];
                  text += `\nStore: ${
                    store.storeName || store.store_name || "N/A"
                  }`;
                }
              }
            }
            // For Sangeetha
            else if (platform.name === "Sangeetha") {
              const details = getSangeethaAvailabilityDetails(data);
              if (details) {
                if (details.etaTitle) {
                  text += `\nETA: ${details.etaTitle}`;
                }
                if (details.etaMessage) {
                  text += `\n${details.etaMessage}`;
                }
              }
            } else {
              text += `\nResponse: ${JSON.stringify(data)}`;
            }

            console.log("ALERT ->", platform.name, productId, pincode);
            await sendTelegram(text);
            // optional: small delay to avoid Telegram rate limits
            await sleep(500);
          } else {
            console.log("No stock:", platform.name, productId, pincode);
          }
        } catch (err) {
          console.error(
            "Error checking",
            platform.name,
            productId,
            pincode,
            err.message
          );
        }
      }
    }
  }
};

// Cron: Apple every 1 minute - DISABLED (not working)
// cron.schedule("* * * * *", () => {
//   checkAppleStock().catch((e) =>
//     console.error("checkAppleStock failed:", e.message)
//   );
// });

// Cron: Other platforms every 2 minutes (Apple and Amazon disabled)
cron.schedule("*/10  * * * * *", () => {
  checkStock().catch((e) => console.error("checkStock failed:", e.message));
});

// Run now - both Apple and other platforms
// checkAppleStock().catch((e) =>
//   console.error("Startup checkAppleStock failed:", e.message)
// );
checkStock().catch((e) =>
  console.error("Startup checkStock failed:", e.message)
);

// Export attachCustomRequest for runtime wiring (useful during tests)
export { attachCustomRequest };

// Simple HTTP server for Render health checks (keeps service alive)
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        service: "ecommerce-tracker",
        timestamp: new Date().toISOString(),
      })
    );
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("Tracking bot is active!");
});

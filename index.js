import cron from "node-cron";
import dotenv from "dotenv";
import http from "http";
import axios from "axios";

dotenv.config();

import { PINCODES, PLATFORMS } from "./config.js";
import { callStockAPI, attachCustomRequest } from "./services/apiClient.js";
import { applePickupCheck } from "./services/apiClient.js";
import { sendTelegram } from "./services/telegramService.js";

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
const getProductLink = (platformName, productId) => {
  if (platformName === "Croma") {
    // Croma product link format
    return `https://www.croma.com/product-details?pid=${productId}`;
  }
  if (platformName === "Samsung") {
    // Samsung product link format - using modelCode pattern
    return `https://www.samsung.com/in/tablets/galaxy-tab-s10/buy/?modelCode=${productId}INS`;
  }
  if (platformName === "Apple") {
    // Apple product link - using part number
    return `https://www.apple.com/in/shop/buy-iphone/iphone-17`;
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

const detectAvailability = (platformName, code, pincode, resData) => {
  if (!resData) return false;

  // Apple-specific detection - check for pickup availability
  if (platformName === "Apple") {
    const availableStores = getApplePickupAvailability(code, resData);
    return availableStores.length > 0;
  }

  // Samsung-specific detection
  if (platformName === "Samsung") {
    const availabilityDetails = getSamsungAvailabilityDetails(code, resData);
    // Stock is available if there are serviceable dealers, stores, or delivery modes
    return (
      availabilityDetails.localDealers.length > 0 ||
      availabilityDetails.stores.length > 0 ||
      availabilityDetails.deliveryModes.length > 0
    );
  }

  // Croma-specific detection - check all 3 fulfillment types
  if (platformName === "Croma") {
    const availabilityDetails = getCromaAvailabilityDetails(code, resData);
    // Return true if any fulfillment type has stock
    return (
      availabilityDetails.HDEL?.available ||
      availabilityDetails.STOR?.available ||
      availabilityDetails.SDEL?.available
    );
  }

  // Common patterns for other platforms
  if (typeof resData === "object") {
    // common flag
    if (resData.available === true) return true;
    if (resData.inStock === true) return true;

    // numeric qty
    if (typeof resData.qty === "number" && resData.qty > 0) return true;
    if (typeof resData.quantity === "number" && resData.quantity > 0)
      return true;

    // sometimes nested
    if (
      resData.data &&
      (resData.data.available === true ||
        (typeof resData.data.qty === "number" && resData.data.qty > 0))
    )
      return true;

    // if response contains variants array
    if (Array.isArray(resData.variants)) {
      const any = resData.variants.some(
        (v) => v.sku === code || v.model === code
      );
      if (any) return true; // conservative — we'll refine when we have examples
    }
  }

  // fallback: look for any truthy string 'available' in the JSON
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

const checkStock = async () => {
  console.log("Starting stock sweep at", new Date().toISOString());

  // Check Apple separately (no pincode iteration)
  await checkAppleStock();

  // Check other platforms with pincode iteration
  for (const platform of PLATFORMS) {
    // Skip Apple as it's handled separately
    if (platform.name === "Apple") continue;

    for (const product of platform.products) {
      // Handle both object format {id, name} and string format (backward compatibility)
      const productId = typeof product === "object" ? product.id : product;
      const productName = typeof product === "object" ? product.name : product;

      for (const pincode of PINCODES) {
        try {
          const data = await callStockAPI(platform, pincode, productId);
          const available = detectAvailability(
            platform.name,
            productId,
            pincode,
            data
          );

          if (available) {
            // Format message based on platform
            const productLink = getProductLink(platform.name, productId);
            let text = "";

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

// Cron: Apple every 1 minute
// cron.schedule("* * * * *", () => {
//   checkAppleStock().catch((e) =>
//     console.error("checkAppleStock failed:", e.message)
//   );
// });

// Cron: Other platforms every 5 minutes
cron.schedule("*/5 * * * *", () => {
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

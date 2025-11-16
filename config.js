export const PINCODES = ["122001"];


export const PLATFORMS = [
  {
    name: "Croma",
    apiUrl: "https://api.croma.com/inventory/oms/v2/tms/details-pwa/",
    method: "POST",
    apiKey: null,
    pincodes: ["122001"], // Only check this one pincode for Croma
    products: [
      { 
        id: "317398", 
        name: "Apple iPhone 17 256GB White",
        url: "https://www.croma.com/apple-iphone-17-256gb-white-/p/317398"
      },
      { 
        id: "317400", 
        name: "Apple iPhone 17 256GB Mist Blue",
        url: "https://www.croma.com/apple-iphone-17-256gb-mist-blue-/p/317400"
      },
      { 
        id: "317396", 
        name: "Apple iPhone 17 256GB Black",
        url: "https://www.croma.com/apple-iphone-17-256gb-black-/p/317396"
      },
      { 
        id: "317403", 
        name: "Apple iPhone 17 256GB Sage",
        url: "https://www.croma.com/apple-iphone-17-256gb-sage-/p/317403"
      },
      { 
        id: "317401", 
        name: "Apple iPhone 17 256GB Lavender",
        url: "https://www.croma.com/apple-iphone-17-256gb-lavender-/p/317401"
      },
      { 
        id: "316303", 
        name: "Oppo K13X 5G 4GB RAM 128GB Sunset Peach",
        url: "https://www.croma.com/oppo-k13x-5g-4gb-ram-128gb-sunset-peach-/p/316303"
      },
      { 
        id: "312574", 
        name: "Vivo Y29 5G 4GB RAM 128GB Glacier Blue",
        url: "https://www.croma.com/vivo-y29-5g-4gb-ram-128gb-glacier-blue-/p/312574"
      },
      { 
        id: "312575", 
        name: "Vivo Y29 5G 4GB RAM 128GB Diamond Black",
        url: "https://www.croma.com/vivo-y29-5g-4gb-ram-128gb-diamond-black-/p/312575"
      },
      { 
        id: "312577", 
        name: "Vivo Y29 5G 4GB RAM 128GB Titanium Gold",
        url: "https://www.croma.com/vivo-y29-5g-4gb-ram-128gb-titanium-gold-/p/312577"
      },
      { 
        id: "314881", 
        name: "Google Pixel 9a 5G (8GB RAM, 256GB, Obsidian)",
        url: "https://www.croma.com/pixel-9a-/p/314881"
      },
      // { 
      //   id: "314882", 
      //   name: "Google Pixel 9a 5G (8GB RAM, 256GB, Porcelain)",
      //   url: "https://www.croma.com/google-pixel-9a-5g-8gb-ram-256gb-porcelain-/p/314882"
      // },
      // { 
      //   id: "314883", 
      //   name: "Google Pixel 9a 5G (8GB RAM, 256GB, Iris)",
      //   url: "https://www.croma.com/google-pixel-9a-5g-8gb-ram-256gb-iris-/p/314883"
      // },
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
    pincodes: ["122001", "110016"], // Multiple pincodes for Samsung
    products: [],
  },
  {
    name: "Apple",
    apiUrl: "https://www.apple.com/in/shop/fulfillment-messages",
    method: "GET",
    apiKey: null,
    pincodes: [], // No pincode needed for Apple
    products: [], // Disabled - Apple tracking not working
    // products: [
    //   { id: "MG6N4HN/A", name: "iPhone 17 256GB White" },
    //   { id: "MG6L4HN/A", name: "iPhone 17 256GB Mist Blue" },
    //   { id: "MG6K4HN/A", name: "iPhone 17 256GB Black" },
    //   { id: "MG6J4HN/A", name: "iPhone 17 256GB Sage" },
    //   { id: "MG6M4HN/A", name: "iPhone 17 256GB Lavender" },
    //   { id: "MG6H4HN/A", name: "iPhone 17 256GB Natural Titanium" },
    //   { id: "MG8J4HN/A", name: "iPhone 17 Pro 256GB Deep Blue" },
    // ],
  },
  {
    name: "Flipkart",
    apiUrl: "https://rknldeals.alwaysdata.net/flipkart_check",
    method: "POST",
    apiKey: null,
    pincodes: ["122001"], // Multiple pincodes for Flipkart
    products: [
      // { id: "MOBHFN6YV7GYZHSM", name: "Apple iPhone 17 Pro (Deep Blue, 256 GB)", url: "https://www.flipkart.com/apple-iphone-17-pro-deep-blue-256-gb/p/itm239d0b996d7f0?pid=MOBHFN6YV7GYZHSM&lid=LSTMOBHFN6YV7GYZHSMOB0WBP&marketplace=FLIPKART&q=iphone+17&store=tyy%2F4io&srno=s_1_3&otracker=AS_QueryStore_OrganicAutoSuggest_1_7_na_na_na&otracker1=AS_QueryStore_OrganicAutoSuggest_1_7_na_na_na&fm=organic&iid=1397bd25-7c28-46d7-95e3-01c979a24439.MOBHFN6YV7GYZHSM.SEARCH&ppt=hp&ppn=homepage&ssid=4jm085jsgw0000001763277665608&qH=c9eeb2d6cc488f0b" }
    ],
  },
  {
    name: "Reliance Digital",
    apiUrl: "https://www.reliancedigital.in/ext/raven-api/inventory/multi/articles-v2",
    method: "POST",
    apiKey: null,
    pincodes: ["122001"], // Multiple pincodes for Reliance Digital
    products: [
      { id: "494741625", name: "Apple iPhone 17 256 GB, White", url: "https://www.reliancedigital.in/product/apple-iphone-17-256-gb-white-mff8s2-9391633?internal_source=search_collection" },
      { id: "494741626", name: "Apple iPhone 17 256 GB, Mist Blue", url: "https://www.reliancedigital.in/product/apple-iphone-17-256-gb-mist-blue-mff8s5-9391645?internal_source=search_collection" },
      { id: "494741624", name: "Apple iPhone 17 256 GB, Black", url: "https://www.reliancedigital.in/product/apple-iphone-17-256-gb-black-mff8ru-9391619?internal_source=search_collection" },
      { id: "494741627", name: "Apple iPhone 17 256 GB, Lavender", url: "https://www.reliancedigital.in/product/apple-iphone-17-256-gb-lavender-mff8ry-9391624?internal_source=search_collection" },
      { id: "494741628", name: "Apple iPhone 17 256 GB, Sage", url: "https://www.reliancedigital.in/product/apple-iphone-17-256-gb-sage-mff8s3-9391641?internal_source=search_collection" },
    ],
  },
  {
    name: "iQOO",
    apiUrl: "https://mshop.iqoo.com/in/api/product/activityInfo/all/",
    method: "GET",
    apiKey: null,
    pincodes: [], // No pincode needed for iQOO
    products: [
      // { 
      //   id: "2057", 
      //   name: "Neo 10R 8GB+128GB MoonKnight Titanium", 
      //   url: "https://shop.iqoo.com/in/product/2057?cid=noPreload&_gl=1%2ah7x205%2a_ga%2aMTUwMjg5MDA5MC4xNzYzMjgzNDUw%2a_ga_JX6ZMMBG2R%2aczE3NjMyODM0NDkkbzEkZzEkdDE3NjMyODM1MTgkajUyJGwwJGgw" 
      // },
      // { 
      //   id: "2062", 
      //   name: "Z10x 5G 8GB+128GB Titanium", 
      //   url: "https://shop.iqoo.com/in/product/2062?skuId=8370" 
      // },
    ],
  },
  {
    name: "Vivo",
    apiUrl: "https://mshop.vivo.com/in/api/product/activityInfo/all/",
    method: "GET",
    apiKey: null,
    pincodes: [], // No pincode needed for Vivo
    products: [
        //  { id: "10297", name: "X200 12GB+256GB Natural Green", url: "https://shop.vivo.com/in/product/10297?utm_source=website&utm_medium=mainbanner&utm_campaign=x200launch&cid=noPreload&_ga=2.163479356.1656843844.1763283692-1348449134.1763283692&_gl=1%2aloo18t%2a_ga%2aMTM0ODQ0OTEzNC4xNzYzMjgzNjky%2a_ga_68BLCXM546%2aczE3NjMyODM2OTIkbzEkZzEkdDE3NjMyODM2OTYkajU2JGwwJGgw" },
        //  { id: "10320", name: "V60 8GB+128GB Mist Gray", url: "https://shop.vivo.com/in/product/10320?utm_source=website%20&utm_medium=mainbanner&utm_campaign=vivo_v60"}
    ],
  },
  {
    name: "Amazon",
    apiUrl: "https://webservices.amazon.in/paapi5/getitems",
    method: "POST",
    apiKey: null,
    pincodes: [], // No pincode needed for Amazon
    products: [], // Disabled - Amazon API credentials not available
    // products: [
    //   // Add your Amazon products here when you have API credentials
    //   // Format: { id: "ASIN", name: "Product Name", url: "https://amazon.in/..." }
    // ],
  },
];
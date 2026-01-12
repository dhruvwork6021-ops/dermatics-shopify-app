// @ts-nocheck
import { join } from "path";
import express from "express";
import serveStatic from "serve-static";
import shopify from "./shopify.js";
import productCreator from "./product-creator.js";
import PrivacyWebhookHandlers from "./privacy.js";

const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT || "3000", 10);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/web/frontend/dist`
    : `${process.cwd()}/web/frontend`;

const app = express();

/* ============================================================
   SHOPIFY APP PROXY (PUBLIC PAGE)
   URL: /apps/derma-ai
============================================================ */
/* ============================================================
   APP PROXY ROUTE (PUBLIC – NO AUTH)
   URL: /apps/derma-ai  and /apps/derma-ai/
============================================================ */

/* ============================================================
   SHOPIFY APP PROXY ROOT HANDLER
   Shopify forwards /apps/derma-ai  -->  /
============================================================ */

// Serve proxy assets
app.use(
  "/proxy-assets",
  express.static(join(process.cwd(), "proxy-assets"))
);

/* ============================================================
   SHOPIFY APP PROXY ROOT HANDLER (CRITICAL)
   Shopify calls "/" NOT "/apps/derma-ai"
============================================================ */

app.get("/", (req, res) => {
  res.status(200).send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dermatics AI – Skin & Hair Analysis</title>
</head>
<body>

  <div id="derma-ai-root"></div>

  <script>
    // Auto-start AI flow on proxy page
    window.DERMA_AI_AUTO_START = true;
  </script>

  <script src="/proxy-assets/derma-ai.js"></script>

</body>
</html>
  `);
});



/* ============================================================
   SHOPIFY OAUTH & WEBHOOKS
============================================================ */

app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);

app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({
    webhookHandlers: PrivacyWebhookHandlers,
  })
);

/* ============================================================
   API (AUTHENTICATED)
============================================================ */

app.use("/api/*", shopify.validateAuthenticatedSession());
app.use(express.json());

app.get("/api/products/count", async (_req, res) => {
  const client = new shopify.api.clients.Graphql({
    session: res.locals.shopify.session,
  });

  const countData = await client.request(`
    query {
      productsCount {
        count
      }
    }
  `);

  res.status(200).send({ count: countData.data.productsCount.count });
});

/* ============================================================
   CSP + FRONTEND
============================================================ */

app.use(shopify.cspHeaders());
app.use(serveStatic(STATIC_PATH, { index: false }));

/* ============================================================
   EMBEDDED APP ROUTES (ADMIN ONLY)
============================================================ */

app.get("/apps/new-derma/*", shopify.ensureInstalledOnShop(), (_req, res) => {
  res.sendFile(join(STATIC_PATH, "index.html"));
});

/* ============================================================
   FINAL FALLBACK (ADMIN ONLY)
============================================================ */

app.get("/*", shopify.ensureInstalledOnShop(), (_req, res) => {
  res.sendFile(join(STATIC_PATH, "index.html"));
});

app.listen(PORT, () => {
  console.log("🚀 Backend running on port", PORT);
});

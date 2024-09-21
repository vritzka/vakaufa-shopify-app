import { authenticate } from "../shopify.server";

//app doesn't handle customer or order data, so this webhook is left empty

export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);

  // Implement handling of mandatory compliance topics
  // See: https://shopify.dev/docs/apps/build/privacy-law-compliance
  console.log(`Received customers redact for ${shop}`);
  console.log(JSON.stringify(payload, null, 2));

  return new Response();
};

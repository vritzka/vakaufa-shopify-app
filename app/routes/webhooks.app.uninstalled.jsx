import { authenticate } from "../shopify.server";
import { json } from "@remix-run/node";

export const action = async ({ request }) => {

  const { shop, session } = await authenticate.webhook(request);
  

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
      return json({ success: true }, { status: 200, body: "done" });
      //delete backend data
      try {
        const response = await fetch("https://assistor.online/api/1.1/wf/shopify-deinit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.BUBBLE_API_KEY}`
          },
          body: JSON.stringify({ shopify_domain: session.shop })
        });

        const responseData = await response.json();

        console.log("Response Data:", responseData);

        if (!response.ok) {
          throw new Error("Failed to send delete");
        }

        //return json({ success: true, responseData });
      } catch (error) {
        console.error("Error deleting assistor:", error);
        return json({ success: false, error: error.message }, { status: 500 });
      }

    return json({ success: true }, { status: 200, body: "done" });

  }
  console.log("triggered uninstalled");
  return json({ success: false }, { status: 400});

};

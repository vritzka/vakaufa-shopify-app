import { json } from "@remix-run/node";
// Import AWS SDK if not already imported at the top of the file
import AWS from 'aws-sdk';
import OpenAI from 'openai';

const environment = process.env.ENVIRONMENT;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

import { Pinecone } from '@pinecone-database/pinecone';
const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});

const pinecondeIndex = pc.index('vakaufer');

// Configure AWS SDK
AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

// Create Lambda client
const lambda = new AWS.Lambda();

export async function initApp(session, admin) {

  console.log("Initializing app");

  let assistorId = null;
  let openaiAssistantId = null;
  let appInstallationId = null;

  const result = await getShopInfo(admin);
  const shopInfo = result.data;

  const appData = await getAppData(admin);

  appInstallationId = appData.currentAppInstallation.id;

  if (appData.currentAppInstallation.metafields.edges.length == 0) {

    const bubbleBackendUrl = environment === 'dev' ? 'https://assistor.online/version-test/api/1.1/wf/shopify-init' : 'https://assistor.online/api/1.1/wf/shopify-init';
    try {

      if (!session.accessToken) {
        throw new Error("No token");
      }

      const response = await fetch(bubbleBackendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.BUBBLE_API_KEY}`
        },
        body: JSON.stringify({ shopify_domain: session.shop, shopify_token: session.accessToken })
      });

      const responseData = await response.json();

      assistorId = responseData.response.assistor_id;
      openaiAssistantId = responseData.response.openai_assistant_id;

      if (!response.ok) {
        throw new Error("Request failed with status " + response.status);
      }

    } catch (error) {
      console.error("Error sending data to backend:", error);
      return json({ success: false, error: error.message }, { status: 500 });
    }

    // Create 2 app-only metafields

    try {
      const metafieldResponse = await admin.graphql(
        `mutation CreateAppDataMetafield($metafieldsSetInput: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafieldsSetInput) {
            metafields {
              id
              namespace
              key
              value
            }
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            metafieldsSetInput: [
              {
                namespace: "assistor",
                key: "assistor_id",
                type: "single_line_text_field",
                value: assistorId,
                ownerId: appInstallationId
              },
              {
                namespace: "assistor",
                key: "openai_assistant_id",
                type: "single_line_text_field",
                value: openaiAssistantId,
                ownerId: appInstallationId
              }
            ]
          }
        }
      );

      if (!metafieldResponse.ok) {
        throw new Error("Failed to update assistant instructions");
      }

    } catch (error) {
      console.error("Error creating metafields:", error);
    }

//populate an initial set of instructions into chatGPT
let instructions_en = `You are a helpful assistant on an eCommerce website
The website is about ${shopInfo.shop.description || 'Not available'}
The URL is ${shopInfo.shop.url || 'Not available'}.
You can help with product recommendations, answer questions about shipping and returns, and provide general information about the store.
Remember to be patient and understanding, as some customers may need extra guidance. Always maintain a positive and professional tone in your interactions
You introduce yourself as AI Salesclerk.
An important role is to help people find the right products. To find out what they want, you ask some questions first: What skill level are you?`;

let instructions_de = `Sie sind ein hilfreicher Assistent auf einer E-Commerce-Website.
Die Website ist über ${shopInfo.shop.description || 'nicht verfügbar'}
Die URL ist ${shopInfo.shop.url || 'nicht verfügbar'}.
Sie können Produktempfehlungen, Fragen zu Versand und Rücksendungen beantworten und allgemeine Informationen über den Shop geben.
Bitte seien Sie geduldig und verstehen Sie, dass manche Kunden zusätzliche Hilfe benötigen. Halten Sie immer einen positiven und professionellen Ton in Ihren Interaktionen ein.
Sie stellen sich als KI-Verkäufer vor. Als Anrede verwenden sie das "Sie", z.B. "Guten Tag, wie kann ich Ihnen heute behilflich sein?".
Ein wichtiger Aspekt ist es, dass Sie Menschen dabei unterstützen, die richtigen Produkte zu finden. Um herauszufinden, was sie wollen, fragen Sie zunächst einige Fragen: Wie gut können Sie Snowboarden?`;

let instructions = instructions_de;

//if (shopInfo.shop.languageCode === 'de') {
  //instructions = instructions_de;
//}


    try {
      const assistant = await openai.beta.assistants.update(
        openaiAssistantId,
        {
          instructions: instructions,
          tools: [
            {
              type: "function",
              function: {
                "name": "get_recommended_products",
                "description": "Empfehlen Sie die richtigen Produkte für den Kunden",
                "strict": true,
                "parameters": {
                  "type": "object",
                  "properties": {
                    "customer_product_description": {
                      "type": "string",
                      "description": "Beschreibung dessen, was der Kunde sucht."
                    }
                  },
                  "additionalProperties": false,
                  "required": [
                    "customer_product_description"
                  ]
                }
              },
            },
          ],
        }
      );

      console.log('Assistant updated:', assistant);
      // Handle the response as needed
    } catch (error) {
      console.error('Error updating assistant:', error);
      // Handle any errors
    }

    return json({
      success: true, data: {
        assistorId: assistorId,
        openaiAssistantId: openaiAssistantId,
        instructions
      }
    }, { status: 200 });


  }
}
//this checks if this app was installed before and fetches the data from the metafields
export async function getAppData(admin) {

  try {
    const response = await admin.graphql(
      `query getAppInstallation{
        currentAppInstallation {
          id
          metafields(first: 5) {  
            edges {
              node {
                key
                value
              }
            }
          }
        }
      }`
    );
    const responseJson = await response.json();


    return { currentAppInstallation: responseJson.data.currentAppInstallation };

  } catch (error) {
    //console.error("Error fetching App data:", error);
  }
}
async function getShopInfo(admin, shop) {

  try {
    const response = await admin.graphql(
      `query {
        shop {
          name
          url
          description
          shipsToCountries
        }
      }`
    );

    if (!response.ok) {
      throw new Error("Failed to get Shop data");
    }



    const responseJson = await response.json();

    return { status: 200, data: responseJson.data };

  } catch (error) {
    console.error("Error fetching Shop Info:", error);
  }
}
//this updates our openai assistant viw thei API
export async function updateAssistantInstructions(openaiAssistantId, instructions) {

  try {
    const response = await fetch(`https://api.openai.com/v1/assistants/${openaiAssistantId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "assistants=v1"
      },
      body: JSON.stringify({ instructions })
    });

    if (!response.ok) {
      throw new Error("Failed to update assistant instructions");
    }

    const updatedAssistant = await response.json();
    return json({ success: true, updatedAssistant });
  } catch (error) {
    console.error("Error updating assistant instructions:", error);
    return json({ success: false, error: error.message }, { status: 500 });
  }

}

export async function runProductTraining(shop, admin) {

  console.log("running product training");

  try {
    // Set up parameters for Lambda function invocation
    const params = {
      FunctionName: 'createEmbeddings',
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify({
        shopify_token: shop.accessToken,
        shop: shop.shop
      })
    };

    console.log("params:", params);

    // Invoke Lambda function
    const result = await new Promise((resolve, reject) => {
      lambda.invoke(params, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });

    // Process the result
    const payload = await JSON.parse(result.Payload);

    //console.log("payload:", payload);

    return json({ success: true, data: payload.body });


  } catch (error) {
    console.error("Error running product training:", error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function getProductEmbeddingsCount(session) {

  //console.log("session:", session.shop);

  //we also check how many product embeddings are saved in Pinecode
  const countResponse = await pinecondeIndex.describeIndexStats();
  //console.log("countResponse:", countResponse);
  const vectorCount = countResponse.namespaces[session.shop]?.recordCount; 
  //console.log("vectorCount:", vectorCount);

  return vectorCount ?? 0;

}
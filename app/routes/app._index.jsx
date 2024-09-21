import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData, useFetcher, redirect } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  PageActions,
  List,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);

  let assistorId = null;
  let openaiAssistantId = null;
  let appInstallationId = null;
  // get app installation

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

    appInstallationId = responseJson.data.currentAppInstallation.id;
    assistorId = responseJson.data.currentAppInstallation.metafields.edges.find(edge => edge.node?.key === "assistor_id")?.node?.value || null;
    openaiAssistantId = responseJson.data.currentAppInstallation.metafields.edges.find(edge => edge.node?.key === "openai_assistant_id")?.node?.value || null;
  } catch (error) {
    console.error("Error fetching App initial installation id:", error);
  }
  console.log("Initial App Installation ID:", appInstallationId);
  console.log("Initial Assistor ID:", assistorId);
  console.log("Initial OpenAI Assistant ID:", openaiAssistantId);
 
  // If assistorId exists, return it and skip the rest of the loader logic
  if (assistorId == null || assistorId === 'undefined') {
    //we initialize
    //first, get the assistorId and openaiAssistantId from the backend
    try {
      const response = await fetch("https://assistor.online/api/1.1/wf/shopify-init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.BUBBLE_API_KEY}`
        },
        body: JSON.stringify({ shopify_domain: session.shop })
      });

      const responseData = await response.json();

      assistorId = responseData.response.assistor_id;
      openaiAssistantId = responseData.response.openai_assistant_id;

      if (!response.ok) {
        throw new Error("Failed to send data to backend");
      }

      //return json({ success: true, responseData });
    } catch (error) {
      console.error("Error sending data to backend:", error);
      return json({ success: false, error: error.message }, { status: 500 });
    }
    console.log("Assistor ID:", assistorId);
    console.log("OpenAI Assistant ID:", openaiAssistantId);

    // Create 2 app-only metafields
    try {
      const response = await admin.graphql(
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

      const responseJson = await response.json();
      console.log("Metafields created:", responseJson.data);
    } catch (error) {
      console.error("Error creating metafields:", error);
    }

  }

  let instructions = '';

  try {
    const response = await fetch(`https://api.openai.com/v1/assistants/${openaiAssistantId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "assistants=v1"
      }
    });

    if (!response.ok) {
      throw new Error("Failed to fetch assistant data");
    }

    const data = await response.json();
    instructions = data.instructions || '';
  } catch (error) {
    console.error("Error fetching assistant instructions:", error);
  }

  return json({
    appInstallationId,
    assistorId,
    openaiAssistantId,
    instructions
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "updateInstructions") {
    const openaiAssistantId = formData.get("openaiAssistantId");
    const instructions = formData.get("instructions");

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

  return json({ error: "Invalid intent" }, { status: 400 });
};

export default function Index() {
  const { shop, appInstallationId, assistorId: initialAssistorId, openaiAssistantId: initialOpenaiAssistantId, instructions: initialInstructions } = useLoaderData();
  const actionData = useActionData();
  const [instructions, setInstructions] = useState(initialInstructions);
  const submit = useSubmit();
  const fetcher = useFetcher();

  const [assistorId, setAssistorId] = useState(initialAssistorId || '');
  const [openaiAssistantId, setOpenaiAssistantId] = useState(initialOpenaiAssistantId || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (fetcher.state === 'submitting') {
      setIsSaving(true);
    } else if (fetcher.state === 'idle') {
      setIsSaving(false);
    }
  }, [fetcher.state]);

  const handleSaveInstructions = () => {
    fetcher.submit(
      { intent: "updateInstructions", openaiAssistantId, instructions },
      { method: "post" }
    );
  };

  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Card sectioned>
            <Text variant="heading2xl" as="h1">
              Training your Assistant
            </Text>
            <div style={{ marginTop: "20px" }}>
              <TextField
                label="Assistant Instructions"
                value={instructions}
                onChange={(value) => setInstructions(value)}
                multiline={10}
                autoComplete="off"
              />
            </div>
            <PageActions
              primaryAction={{
                content: isSaving ? 'Saving...' : 'Save',
                onAction: handleSaveInstructions,
                disabled: isSaving,
                loading: isSaving,
              }}
            />
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card sectioned>
            <Text variant="headingMd" as="h2">
              Tips for Training Your Assistant
            </Text>
            <List type="bullet">
              <List.Item>Be clear and specific in your instructions</List.Item>
              <List.Item>Include examples of desired responses</List.Item>
              <List.Item>Specify the tone and style you want the assistant to use</List.Item>
              <List.Item>Define any limitations or boundaries for the assistant</List.Item>
              <List.Item>Update instructions as you refine your requirements</List.Item>
            </List>
            <Text variant="bodyMd" as="p" style={{ marginTop: "10px" }}>
              Remember, the quality of your instructions directly impacts the performance of your AI assistant.
              Regularly review and refine these instructions based on your interactions and needs.
            </Text>
          </Card>
        </Layout.Section>
        {actionData && (
          <Layout.Section>
            <Card sectioned>
              <Text variant="headingMd" as="h2">
                Webhook Response (Debug)
              </Text>
              <TextField
                label="Response Data"
                value={JSON.stringify(actionData, null, 2)}
                multiline={4}
                readOnly
              />
              <Text variant="bodyMd">Assistor ID: {assistorId}</Text>
              <Text variant="bodyMd">OpenAI Assistant ID: {openaiAssistantId}</Text>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}

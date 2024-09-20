import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData, useFetcher } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  PageActions,
  Spinner,
  List,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const assistantId = url.searchParams.get("assistantId");

  let instructions = '';
  if (assistantId) {
    try {
      const response = await fetch(`https://api.openai.com/v1/assistants/${assistantId}`, {
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
  }

  return json({
    shop: session.shop,
    instructions
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "init") {
    const shopifyDomain = formData.get("shopifyDomain");

    try {
      const response = await fetch("https://assistor.online/version-test/api/1.1/wf/shopify-init", {
        method: "POST", 
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.BUBBLE_API_KEY}`
        },
        body: JSON.stringify({ shopify_domain: shopifyDomain })
      });

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error("Failed to send data to backend");
      }

      return json({ success: true, responseData });
    } catch (error) {
      console.error("Error sending data to backend:", error);
      return json({ success: false, error: error.message }, { status: 500 });
    }
  } else if (intent === "updateInstructions") {
    const assistantId = formData.get("assistantId");
    const instructions = formData.get("instructions");

    try {
      const response = await fetch(`https://api.openai.com/v1/assistants/${assistantId}`, {
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
  const { shop, instructions: initialInstructions } = useLoaderData();
  const actionData = useActionData();
  const [instructions, setInstructions] = useState(initialInstructions);
  const submit = useSubmit();
  const fetcher = useFetcher();

  const [assistorId, setAssistorId] = useState('');
  const [openaiAssistantId, setOpenaiAssistantId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    submit({ intent: "init", shopifyDomain: shop }, { method: "post" });
  }, [shop, submit]);

  useEffect(() => {
    if (actionData && actionData.success && actionData.responseData && actionData.responseData.response) {
      const { assistor_id, openai_assistant_id } = actionData.responseData.response;
      setAssistorId(assistor_id || '');
      setOpenaiAssistantId(openai_assistant_id || '');
      
      if (openai_assistant_id) {
        submit({ assistantId: openai_assistant_id }, { method: "get" });
      }
    }
  }, [actionData, submit]);

  useEffect(() => {
    setInstructions(initialInstructions);
  }, [initialInstructions]);

  useEffect(() => {
    if (fetcher.state === 'submitting') {
      setIsSaving(true);
    } else if (fetcher.state === 'idle') {
      setIsSaving(false);
    }
  }, [fetcher.state]);

  const handleSaveInstructions = () => {
    fetcher.submit(
      { intent: "updateInstructions", assistantId: openaiAssistantId, instructions },
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
        {fetcher.data && (
          <Layout.Section>
            <Card sectioned>
              <Text variant="headingMd" as="h2">
                Save Instructions Response (Debug)
              </Text>
              <TextField
                label="Response Data"
                value={JSON.stringify(fetcher.data, null, 2)}
                multiline={4}
                readOnly
              />
            </Card>
          </Layout.Section>
        )}
      </Layout>
      <PageActions
        primaryAction={{
          content: isSaving ? 'Saving...' : 'Save',
          onAction: handleSaveInstructions,
          disabled: isSaving,
          loading: isSaving,
        }}
      />
    </Page>
  );
}

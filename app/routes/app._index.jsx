import { json } from "@remix-run/node";
import { EmptyState } from '@shopify/polaris';
import { useLoaderData, useSubmit, useActionData, useFetcher, redirect } from "@remix-run/react";
import { useState } from "react";
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
import { getAppData, initApp, updateAssistantInstructions } from "../utils/functions.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);

  let assistorId = null;
  let openaiAssistantId = null;
  let appInstallationId = null;
  let showInitButton = false;
  let instructions = ''; 

  const appData = await getAppData(admin);

  if (!appData || appData.currentAppInstallation.metafields.edges.length == 0) {
    showInitButton = true;
    return json({
      appInstallationId,
      assistorId,
      openaiAssistantId,
      instructions,
      showInitButton
    });

  } else {
    appInstallationId = appData.currentAppInstallation.id;
    assistorId = appData.currentAppInstallation.metafields.edges.find(edge => edge.node?.key === "assistor_id")?.node?.value || null;
    openaiAssistantId = appData.currentAppInstallation.metafields.edges.find(edge => edge.node?.key === "openai_assistant_id")?.node?.value || null;
  }

  //if app is not new, we fetch the instructions from the openai assistant
  try {
    const response = await fetch(`https://api.openai.com/v1/assistants/${openaiAssistantId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "OpenAI-Beta": "assistants=v1"
      }
    });

    if (!response.ok) {
      throw new Error("Failed to fetch data: " + response.statusText);
    }

    const data = await response.json();
    instructions = data.instructions || '';
  } catch (error) {
    console.error("Error fetching openAI assistant instructions:", error);
  }

  return json({
    appInstallationId,
    assistorId,
    openaiAssistantId,
    instructions,
    showInitButton
  });
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "initialize") {
    const response = await initApp(session, admin);
    const initData = await response.json();

   // console.log("Initdata", initData);
    return json({ 
      instructions: initData.data.instructions,
      appInstallationId: initData.data.appInstallationId,
      assistorId: initData.data.assistorId,
      openaiAssistantId: initData.data.openaiAssistantId,
      showInitButton: false
    });
  }

  if (intent === "updateInstructions") {
    const openaiAssistantId = formData.get("openaiAssistantId");
    const instructions = formData.get("instructions");

    const res = await updateAssistantInstructions(openaiAssistantId, instructions);
    const updatedAssistant = await res.json();
    return json({ success: true, updatedAssistant });
  }
}

export default function Index() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();
  const fetcher = useFetcher();

  console.log("Component rendered. Loader Data:", loaderData);
  console.log("Component rendered. Action Data:", actionData);

  const [instructions, setInstructions] = useState(
    actionData?.instructions || loaderData.instructions
  );

  const handleInstructionsChange = (value) => {
    setInstructions(value);
  };

  const isSaving = fetcher.state === 'submitting';

  const handleSaveInstructions = () => {
    fetcher.submit(
      { intent: "updateInstructions", openaiAssistantId: loaderData.openaiAssistantId, instructions },
      { method: "post" }
    );
  };

  return (
    <Page>
      <Layout>
        {loaderData.showInitButton && (
          <Layout.Section>
            <Card sectioned>
              <EmptyState
                heading="Initialize your Chatbot"
                action={{
                  content: 'Initialize',
                  onAction: () => {
                    fetcher.submit(
                    { intent: 'initialize' },
                    { method: 'post' }
                  )}
                }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p></p>
              </EmptyState>
            </Card>
          </Layout.Section>
        )}
        {!loaderData.showInitButton && (
          <>
        <Layout.Section>
          <Card sectioned>
            <Text variant="heading2xl" as="h1">
              Your Chatbot's Character
            </Text>
            <div style={{ marginTop: "20px" }}>
              <TextField
                value={instructions}
                multiline={10}
                onChange={handleInstructionsChange}
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
        </>
         )}
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

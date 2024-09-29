import { json } from "@remix-run/node";
import { EmptyState, BlockStack, InlineGrid, Button } from '@shopify/polaris';
import { PlusIcon } from '@shopify/polaris-icons';
import { useLoaderData, useActionData, useFetcher } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  TextField,
  PageActions,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getAppData, initApp, updateAssistantInstructions, runProductTraining, getProductEmbeddingsCount } from "../utils/functions.server.js";

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
      showInitButton,
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

  const productEmbeddingsCount = await getProductEmbeddingsCount(session);

  return json({
    appInstallationId,
    assistorId,
    openaiAssistantId,
    instructions,
    showInitButton,
    productEmbeddingsCount
  });
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "initialize") {

    const response = await initApp(session, admin);
    const initData = await response.json();

    return json({
      ok: true,
      assistorId: initData.data.assistorId,
      openaiAssistantId: initData.data.openaiAssistantId,
      instructions: initData.data.instructions,
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

  if (intent === "productTraining") {
    console.log("productTraining");
    const res = await runProductTraining(session, admin);
    const productTraining = await res.json();
    return json({ success: true, productTraining });
  }
}

export default function Index() {
  const fetcher = useFetcher();
  const loaderData = useLoaderData();
  const actionData = useActionData();

  const isSaving = fetcher.state === 'submitting';

  const [instructions, setInstructions] = useState(
    fetcher.data?.instructions || loaderData.instructions
  );

  useEffect(() => {
    if (fetcher.data?.instructions) {
      setInstructions(fetcher.data.instructions);
    }
  }, [fetcher.data]);

  useEffect(() => {
    setInstructions(loaderData.instructions);
  }, [loaderData.instructions]);

  const handleInitialize = () => {
    fetcher.submit(
      { intent: 'initialize' },
      { method: 'post' }
    );
  };

  const handleInstructionsChange = (value) => {
    setInstructions(value);
  };

  const handleSaveInstructions = () => {
    fetcher.submit(
      { intent: "updateInstructions", openaiAssistantId: loaderData.openaiAssistantId, instructions },
      { method: "post" }
    );
  };

  const handleClickPreview = () => {
    const url = loaderData.environment === "production" ? "https://streamlit-app-i5dp.onrender.com" : "http://localhost:8501";
    window.open(`${url}/?id=${loaderData.assistorId}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <Page>
      <Layout>
        <ui-title-bar title="Vakaufa">
          {!loaderData.showInitButton && (
            <button variant="primary" onClick={handleClickPreview}>
              Vorschau
            </button>
          )}
        </ui-title-bar>
        {loaderData.showInitButton && (
          <Layout.Section>
            <Card sectioned>
              <EmptyState
                heading="Start your Vakaufa"
                action={{
                  content: 'Start',
                  disabled: isSaving,
                  loading: isSaving,
                  onAction: () => {
                    fetcher.submit(
                      { intent: 'initialize' },
                      { method: 'post' }
                    )
                  }
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
                <Text as="h2" variant="headingLg">
                  Character
                </Text>
                <Text variant="bodyMd" as="p" style={{ marginTop: "10px" }}>
                  Here you can give your Vakaufa (AI Bot) instructions on how to behave. Write intuitively as you would talk to another human. And the more specific you are, the better.
                </Text>
                <div style={{ marginTop: "20px" }}>
                  <TextField
                    disabled={isSaving}
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
              <CardWithHeaderActions />
            </Layout.Section>
          </>
        )}
      </Layout>
    </Page>
  );
}

function CardWithHeaderActions() {

  const fetcher = useFetcher();
  const { productEmbeddingsCount } = useLoaderData();
  const actionData = useActionData();

  const isSaving = fetcher.state === 'submitting';

  const handleProductTraining = () => {
    fetcher.submit(
      { intent: "productTraining" },
      { method: "post" }
    );
  };

  return (
    <Card roundedAbove="sm">
      <BlockStack gap="200">
        <InlineGrid columns="1fr auto">
          <Text as="h2" variant="headingLg">
            Produktlernen
          </Text>
          <Button
            onClick={handleProductTraining}
            accessibilityLabel="Jetzt lernen"
            disabled={isSaving}
            loading={isSaving}
            icon={PlusIcon}
          >
            Starten
          </Button>
        </InlineGrid>
        <Text as="p" variant="bodyMd">
          Einmal Produkte lernen, um sie später den richtigen Kunden zu empfehlen. Vorgang dauert eine Weile.
        </Text>
        <Text as="p" variant="bodyMd">
          {productEmbeddingsCount} Produkte gelernt.
        </Text>
      </BlockStack>
    </Card>
  );
}
import { json } from "@remix-run/node";
import { URL } from "url";
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
import langData from "../lang/lang.json";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);

  const url = request.url;
  const parsedUrl = new URL(url);
  const searchParams = parsedUrl.searchParams;
  const lang = searchParams.get('locale').slice(0, 2);
  const appData = await getAppData(admin);

  let assistorId = null;
  let openaiAssistantId = null;
  let appInstallationId = null;
  let showInitButton = false;
  let instructions = '';
  const environment = process.env.NODE_ENV;

  if (!appData || appData.currentAppInstallation.metafields.edges.length == 0) {
    showInitButton = true;
    return json({
      shop: session.shop,
      appInstallationId,
      assistorId,
      openaiAssistantId,
      instructions,
      showInitButton,
      locale,
      environment
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
    shop: session.shop,
    appInstallationId,
    assistorId,
    openaiAssistantId,
    instructions,
    showInitButton,
    productEmbeddingsCount,
    lang,
    environment
  });
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const url = request.url;
  const parsedUrl = new URL(url);
  //const searchParams = parsedUrl.searchParams;
  //const locale = searchParams.get('locale').slice(0, 2);

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
      showInitButton: false,
      //locale
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
  console.log("loaderData", useLoaderData());
  const { lang, environment, instructions, showInitButton } = useLoaderData();

  const isSaving = fetcher.state === 'submitting';

  const [newInstructions, setNewInstructions] = useState(
    fetcher.data?.instructions || instructions
  );

  useEffect(() => {
    if (fetcher.data?.instructions) {
      setNewInstructions(fetcher.data.instructions);
    }
  }, [fetcher.data]);

  useEffect(() => {
    setNewInstructions(instructions);
  }, [instructions]);

  const handleInitialize = () => {
    fetcher.submit(
      { intent: 'initialize' },
      { method: 'post' }
    );
  };

  const handleInstructionsChange = (value) => {
    setNewInstructions(value);
  };

  const handleSaveInstructions = () => {
    fetcher.submit(
      { intent: "updateInstructions", openaiAssistantId: openaiAssistantId, instructions },
      { method: "post" }
    );
  };

  const handleClickPreview = () => {
    const url = environment === "production" ? "https://streamlit-app-i5dp.onrender.com" : "http://localhost:8501";
    window.open(`${url}/?id=${assistorId}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <Page>
      <Layout>
        <ui-title-bar title={langData[lang].dashboard}>
          {!showInitButton && (
            <button variant="primary" onClick={handleClickPreview}>
              {langData[lang].preview}
            </button>
          )}
        </ui-title-bar>
        {showInitButton && (
          <Layout.Section>
            <Card sectioned>
              <EmptyState
                heading="{langData[lang].start}"
                action={{
                  content: langData[lang].start,
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
        {!showInitButton && (
          <>
            <Layout.Section>
              <Card sectioned>
                <Text as="h2" variant="headingLg">
                  {langData[lang].character}
                </Text>
                <Text variant="bodyMd" as="p" style={{ marginTop: "10px" }}>
                  {langData[lang].characterDescription}
                </Text>
                <div style={{ marginTop: "20px" }}>
                  <TextField
                    disabled={isSaving}
                    value={newInstructions}
                    multiline={10}
                    onChange={handleInstructionsChange}
                    autoComplete="off"
                  />
                </div>
                <PageActions
                  primaryAction={{
                    content: isSaving ? langData[lang].saving : langData[lang].save,
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
        <Layout.Section>
          <CardWithInstructions />
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function CardWithHeaderActions() {

  const fetcher = useFetcher();
  const { productEmbeddingsCount, lang } = useLoaderData();

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
            {langData[lang].learnProducts}
          </Text>
          <Button
            onClick={handleProductTraining}
            accessibilityLabel={langData[lang].learnProducts}
            disabled={isSaving}
            loading={isSaving}
            icon={PlusIcon}
          >
            Start
          </Button>
        </InlineGrid>
        <Text as="p" variant="bodyMd">
          {langData[lang].learnProductsDescription}
        </Text>
        <Text as="p" variant="bodyMd">
          {productEmbeddingsCount} {langData[lang].productsLearned}.
        </Text>
      </BlockStack>
    </Card>
  );
}

function CardWithInstructions() {

  const { shop, lang } = useLoaderData(); 

  return (
    <Card roundedAbove="sm">
      <BlockStack gap="200">
        <InlineGrid columns="1fr auto">
          <Text as="h2" variant="headingLg">
            {langData[lang].installAppEmbedd}
          </Text>
        </InlineGrid>
        <Text as="p" variant="bodyMd">
          Set up
        </Text>
        <Button
            url={`https://${shop}/admin/themes/current/editor?context=apps&activateAppId=c295800e-a686-42f6-9fec-2becbf8bd379/assistor`}
            accessibilityLabel={langData[lang].gotToAppEmbedd}
            fullWidth={false}
          >
            {langData[lang].gotToAppEmbedd}
          </Button>
      </BlockStack>
    </Card>
  );
}

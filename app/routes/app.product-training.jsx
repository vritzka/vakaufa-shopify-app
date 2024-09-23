import { useState, useEffect } from "react";
import {
  Box,
  Card,
  Layout,
  Page,
  Text,
  BlockStack,
  Button,
  List,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { useFetcher, useActionData  } from "@remix-run/react";
import { json } from "@remix-run/node";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return true;
};

export async function action({ request }) {

  const { session } = await authenticate.admin(request);


  return json({
    jobId: "123",
  });

}

export default function ProductTraining() {
  const [jobStatus, setJobStatus] = useState(null);
  const actionData = useActionData();
  const fetcher = useFetcher();

  useEffect(() => {
    if (actionData?.jobId) {
      const intervalId = setInterval(async () => {
        // Implement a function to check job status
        const status = await checkJobStatus(actionData.jobId);
        setJobStatus(status);
        if (status === 'completed') {
          clearInterval(intervalId);
        }
      }, 5000);

      return () => clearInterval(intervalId);
    }
  }, [actionData]);

  return (
    <Page>
      <TitleBar title="Product Training" />
      <Layout>
        <Layout.Section>
          <Card>
            <fetcher.Form method="post" action="/app/worker/start">
              <Button submit primary>
                Start Product Processing Job
              </Button>
            </fetcher.Form>
            {fetcher.state === "submitting" && (
              <Text variant="bodyMd" as="p">
                Starting job...
              </Text>
            )}
            {jobStatus && (
              <Text variant="bodyMd" as="p">
                Job Status: {jobStatus}
              </Text>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// Implement this function to check job status
async function checkJobStatus(jobId) {
  // You'll need to implement this based on how you're tracking job status
  // This might involve making an API call to your server
  // For now, we'll return a placeholder
  return 'pending';
}

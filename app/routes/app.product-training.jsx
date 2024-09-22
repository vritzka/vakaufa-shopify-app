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
import { useLoaderData, useFetcher } from "@remix-run/react";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  
  const response = await admin.graphql(
    `query {
      products(first: 10) {
        edges {
          node {
            id
            title
            description
          }
        }
      }
    }`
  );

  const { data } = await response.json();
  return { products: data.products.edges.map(edge => edge.node) };
}

export default function ProductTraining() {
  const [products, setProducts] = useState([]);
  const fetcher = useFetcher();

  useEffect(() => {
    if (fetcher.data && fetcher.data.products) {
      setProducts(fetcher.data.products);
    }
  }, [fetcher.data]);

  const fetchProducts = () => {
    fetcher.submit(null, { method: "post" });
  };

  return (
    <Page>
      <TitleBar title="Product Training" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Fetch Products
              </Text>
              <Button onClick={fetchProducts}>Fetch First 10 Products</Button>
              {products.length > 0 && (
                <Card>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingMd">
                      Product Titles
                    </Text>
                    <List type="bullet">
                      {products.map((product) => (
                        <List.Item key={product.id}>{product.title}</List.Item>
                      ))}
                    </List>
                  </BlockStack>
                </Card>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

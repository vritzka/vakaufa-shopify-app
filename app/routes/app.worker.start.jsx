import { authenticate } from "../shopify.server";
import { productQueue } from '../utils/queue.server.js';

export async function action({ request }) {
    const { admin, session } = await authenticate.admin(request);
    await productQueue.add('jobname', { session });

  return new Response('Job started', { status: 202 });
}

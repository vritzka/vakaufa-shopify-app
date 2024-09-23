import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables when running as a standalone script
if (process.env.NODE_ENV !== 'production') {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
} 

// Create the Redis connection only once
let redisConnection = new Redis({
  username: process.env.REDIS_SERVICE_NAME, // Render Redis name, red-xxxxxxxxxxxxxxxxxxxx
  host: process.env.REDIS_HOST,             // Render Redis hostname, REGION-redis.render.com
  password: process.env.REDIS_PASSWORD,     // Provided password
  port: process.env.REDIS_PORT || 6379,     // Connection port
  tls: true,
  maxRetriesPerRequest: null,
});

export const productQueue = new Queue('productQueue', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false
  }
});

// Worker to process the jobs
export const productWorker = new Worker('productQueue', async (job) => {
  console.log(`Processing job ${job.id}`);
  //console.log(Date.now());
  console.log('ddddd');
  await processAllProducts();
}, { connection: redisConnection });

productWorker.on('completed', (job) => {
  // Notify user via email or update a status in the database
  console.log(`Job ${job.id} completed successfully!`);
});

productWorker.on('failed', (job, err) => {
  console.error(`Job ${job.id} has failed with ${err.message}`);
});

async function processAllProducts() {
  //await new Promise(resolve => setTimeout(resolve, 3000));
  const startTime = Date.now();
  const endTime = startTime + 10000; // 1 minute in milliseconds

  while (Date.now() < endTime) {
    if ((Date.now() - startTime) % 5000 === 0) {
      console.log(`Still processing... ${Math.floor((Date.now() - startTime) / 1000)} seconds elapsed`);
    }
    // Small delay to prevent excessive CPU usage
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

console.log('Worker is running');

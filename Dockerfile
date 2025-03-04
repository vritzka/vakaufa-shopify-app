FROM node:18-alpine

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

# Install system dependencies first
RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force && npm install openai bullmq ioredis openssl

# Remove CLI packages since we don't need them in production by default.
# Remove this line if you want to run CLI commands in your container.
RUN npm remove @shopify/cli

COPY . .

RUN npm run build

CMD ["npm", "run", "docker-start"]

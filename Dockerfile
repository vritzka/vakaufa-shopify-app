FROM node:18-alpine

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force && npm install openai bullmq ioredis openssl

# Remove CLI packages since we don't need them in production by default.
# Remove this line if you want to run CLI commands in your container.
RUN npm remove @shopify/cli

RUN apt-get update -y
RUN apt-get install -y openssl

COPY . .

RUN npm run build

CMD ["npm", "run", "docker-start"]

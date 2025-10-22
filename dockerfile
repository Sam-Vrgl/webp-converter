# Stage 1: Use a slim Node.js base image
FROM node:22-slim

RUN apt-get update && \
    apt-get install -y webp && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --production

COPY . .

RUN mkdir -p uploads

EXPOSE 3000

CMD [ "node", "server.js" ]


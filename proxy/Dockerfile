FROM node:18-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY server.js .
COPY serve.js .
CMD ["node", "serve.js"]

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY src ./src
COPY public ./public
ENV NODE_ENV=production PORT=3000 DATABASE_URL=file:/data/tenpoint.db
VOLUME /data
EXPOSE 3000
CMD ["node", "server.js"]

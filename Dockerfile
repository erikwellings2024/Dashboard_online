FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY . .
RUN mkdir -p /app/data /app/uploads
EXPOSE 3000
# V52: run node directly (not via "npm start") so no extra npm process (~15-25 MB) stays in RAM.
CMD ["node","--expose-gc","--max-old-space-size=384","--max-semi-space-size=4","server.js"]

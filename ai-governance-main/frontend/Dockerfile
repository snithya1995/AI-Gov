FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

ARG VITE_BACKEND_URL=/api
ARG VITE_AGENT_URL=/agent

ENV VITE_BACKEND_URL=${VITE_BACKEND_URL}
ENV VITE_AGENT_URL=${VITE_AGENT_URL}

RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist

COPY copy-dist.sh /copy-dist.sh

RUN chmod +x /copy-dist.sh

CMD ["/copy-dist.sh"]
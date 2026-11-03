# 구스링 서버 이미지
#   runtime : 서버 실행용 (운영 패키지만, root 아닌 node 계정)
#   migrate : DB 마이그레이션 1회 실행용 (prisma CLI 포함)
# 빌드: docker build --target runtime -t gusring-server:<tag> .
#       docker build --target migrate -t gusring-migrate:<tag> .

FROM node:24.14.0-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# postinstall(prisma generate)까지 실행된다
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
# 서버가 실제로 불러오는 파일만 추적해 /out에 모은다 (@vercel/nft).
# npm ci --omit=dev로는 @prisma/client가 짝 패키지로 끌고 오는 prisma CLI·TypeScript가 안 빠져서 이렇게 한다.
# package.json은 "type": "module"(ESM) 때문에 꼭 같이 넣는다.
RUN npm run build \
 && npx nft print dist/server.js > /tmp/files.txt \
 && echo package.json >> /tmp/files.txt \
 && mkdir /out && tar -cf - -T /tmp/files.txt | tar -xf - -C /out

FROM deps AS migrate
ENV NODE_ENV=production
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:24.14.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/ ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health > /dev/null || exit 1
CMD ["node", "dist/server.js"]

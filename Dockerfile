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
RUN npm run build

FROM deps AS migrate
ENV NODE_ENV=production
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:24.14.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
# 운영 패키지만. postinstall(prisma generate)은 build 단계에서 이미 끝났으므로 건너뛴다
# TODO: @prisma/client가 짝 패키지(peer)로 prisma CLI·TypeScript(약 300MB)까지 끌고 온다.
#       --omit=peer로는 안 빠짐(루트 devDependency와 겹쳐서). 동작엔 문제없어 나중에 줄인다
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/health > /dev/null || exit 1
CMD ["node", "dist/server.js"]

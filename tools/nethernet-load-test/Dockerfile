FROM node:24-bookworm-slim

ARG BEDBOO_COMMIT=254bfcc4d05ddad767ac95e6208f6e1942dea8f3
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && git clone https://github.com/LiteLDev/bedboo.git /opt/bedboo \
    && git -C /opt/bedboo checkout "$BEDBOO_COMMIT"

COPY . /opt/bedboo/.supercores-tools/nethernet-load-test
WORKDIR /opt/bedboo
RUN corepack enable && pnpm install --frozen-lockfile

WORKDIR /opt/bedboo/.supercores-tools/nethernet-load-test
ENTRYPOINT ["node", "src/cli.js"]

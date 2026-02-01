FROM node:22-bullseye AS builder

WORKDIR /build

# System deps
RUN apt-get update && apt-get install -y \
    git \
    wget \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install .NET SDK
RUN wget https://dot.net/v1/dotnet-install.sh -O dotnet-install.sh \
    && chmod +x dotnet-install.sh \
    && ./dotnet-install.sh --channel 8.0 \
    && rm dotnet-install.sh

ENV PATH="/root/.dotnet:${PATH}"
ENV DOTNET_ROOT="/root/.dotnet"

# libssl for building
RUN cd /tmp \
    && wget http://security.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2.24_amd64.deb \
    && wget http://security.ubuntu.com/ubuntu/pool/main/o/openssl/libssl-dev_1.1.1f-1ubuntu2.24_amd64.deb \
    && dpkg -i libssl1.1_1.1.1f-1ubuntu2.24_amd64.deb libssl-dev_1.1.1f-1ubuntu2.24_amd64.deb || true \
    && apt-get install -f -y \
    && rm *.deb

# Node deps
COPY package*.json ./
RUN npm install && npm install -g node-gyp

# osu-tools
RUN git clone --recurse-submodules https://github.com/ppy/osu-tools /build/osu-tools \
    && cd /build/osu-tools \
    && dotnet build

# oppai-ng
RUN wget https://github.com/Francesco149/oppai-ng/archive/HEAD.tar.gz \
    && tar xf HEAD.tar.gz \
    && cd oppai-ng-* \
    && ./build \
    && install -Dm 755 oppai /usr/bin/oppai

# old oppai
RUN git clone https://github.com/Francesco149/oppai.git \
    && cd oppai \
    && ./build.sh \
    && install -Dm 755 oppai /usr/bin/oppaiold

FROM node:22-slim

WORKDIR /app

# Runtime-only system deps
RUN apt-get update && apt-get install -y \
    libcairo2 \
    libpango-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    ffmpeg \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

# libssl1.1 runtime
RUN cd /tmp \
    && wget http://security.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2.24_amd64.deb \
    && dpkg -i libssl1.1_1.1.1f-1ubuntu2.24_amd64.deb || apt-get -f install -y \
    && rm libssl1.1_1.1.1f-1ubuntu2.24_amd64.deb

# .NET runtime ONLY
RUN wget https://dot.net/v1/dotnet-install.sh -O dotnet-install.sh \
    && chmod +x dotnet-install.sh \
    && ./dotnet-install.sh --runtime dotnet --channel 8.0 \
    && rm dotnet-install.sh

ENV PATH="/root/.dotnet:${PATH}"
ENV DOTNET_ROOT="/root/.dotnet"

# Copy built artifacts
COPY --from=builder /usr/bin/oppai /usr/bin/oppai
COPY --from=builder /usr/bin/oppaiold /usr/bin/oppaiold
COPY --from=builder /build/osu-tools /opt/osu-tools
COPY --from=builder /build/node_modules ./node_modules

# App code
COPY . .
COPY start.sh .
RUN chmod +x start.sh

CMD ["./start.sh"]
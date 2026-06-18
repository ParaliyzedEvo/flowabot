FROM node:26.3.0-bullseye AS builder

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

FROM node:26.3.0-slim

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

# Add legacy OpenSSL 1.1 for oppaiold
RUN echo "deb http://archive.debian.org/debian bullseye-security main" >> /etc/apt/sources.list \
    && apt-get update \
    && apt-get install -y libssl1.1 \
    && rm -rf /var/lib/apt/lists/*

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
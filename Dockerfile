FROM node:22-bullseye

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    wget \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install .NET 8.0
RUN wget https://dot.net/v1/dotnet-install.sh -O dotnet-install.sh \
    && chmod +x dotnet-install.sh \
    && ./dotnet-install.sh --channel 8.0 \
    && rm dotnet-install.sh

# Add .NET to PATH
ENV PATH="/root/.dotnet:${PATH}"
ENV DOTNET_ROOT="/root/.dotnet"

# Install libssl1.1 and libssl-dev (required for some dependencies)
RUN cd /tmp \
    && wget http://security.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.1f-1ubuntu2.24_amd64.deb \
    && wget http://security.ubuntu.com/ubuntu/pool/main/o/openssl/libssl-dev_1.1.1f-1ubuntu2.24_amd64.deb \
    && dpkg -i libssl1.1_1.1.1f-1ubuntu2.24_amd64.deb libssl-dev_1.1.1f-1ubuntu2.24_amd64.deb || true \
    && apt-get install -f -y \
    && rm libssl1.1_1.1.1f-1ubuntu2.24_amd64.deb libssl-dev_1.1.1f-1ubuntu2.24_amd64.deb

# Install osu-tools (PP calculator)
RUN cd /root \
    && git clone --recurse-submodules https://github.com/ppy/osu-tools \
    && cd osu-tools \
    && dotnet build

# Install new oppai
RUN cd /tmp \
    && wget https://github.com/Francesco149/oppai-ng/archive/HEAD.tar.gz \
    && tar xf HEAD.tar.gz \
    && rm HEAD.tar.gz \
    && cd oppai-ng-* \
    && ./build \
    && install -Dm 755 oppai /usr/bin/oppai \
    && cd /tmp \
    && rm -rf oppai-ng-*

# Install old oppai
RUN cd /tmp \
    && git clone https://github.com/Francesco149/oppai.git \
    && cd oppai \
    && ./build.sh \
    && mv oppai oppaiold \
    && install -Dm 755 oppaiold /usr/bin/oppaiold \
    && cd /tmp \
    && rm -rf oppai

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Install node-gyp globally
RUN npm install -g node-gyp

# Copy application code
COPY . .

# Copy and make start script executable
COPY start.sh .
RUN chmod +x start.sh

# Run the start script
CMD ["./start.sh"]
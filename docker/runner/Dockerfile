# Self-hosted GitHub Actions runner for nanobot-client
# Base: official myoung34/github-runner (handles registration/cleanup)
# Adds: JDK 17, Node 22, Android SDK 36, NDK, ccache — baked into image layer
# so the container has everything ready on first start.

FROM myoung34/github-runner:latest

USER root

ENV DEBIAN_FRONTEND=noninteractive

# JDK 17 + ccache + basics
RUN apt-get update && apt-get install -y --no-install-recommends \
        openjdk-17-jdk-headless \
        ca-certificates \
        curl \
        unzip \
        git \
        ccache \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22 (matches the CI version)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Android command-line tools + SDK 36 + build-tools + NDK
ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV PATH=$PATH:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools

RUN mkdir -p ${ANDROID_HOME}/cmdline-tools && cd ${ANDROID_HOME}/cmdline-tools \
    && curl -sSL -o cmdline-tools.zip \
       https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip \
    && unzip -q cmdline-tools.zip && mv cmdline-tools latest && rm cmdline-tools.zip \
    && yes | sdkmanager --licenses > /dev/null \
    && sdkmanager "platforms;android-36" "build-tools;36.0.0" "platform-tools" \
    && sdkmanager "ndk;26.1.10909125"

# ccache config (capped at 2GB; the persistent volume keeps it across runs)
RUN mkdir -p /home/runner/.ccache \
    && ccache --set-config=max_size=2G \
    && chown -R runner:runner /home/runner/.ccache

# Make sure the runner user can read/write the SDK
RUN chown -R runner:runner ${ANDROID_HOME}

USER runner

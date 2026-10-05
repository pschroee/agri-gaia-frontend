# SPDX-FileCopyrightText: 2024 Osnabrück University of Applied Sciences
# SPDX-FileContributor: Andreas Schliebitz
# SPDX-FileContributor: Henri Graf
# SPDX-FileContributor: Jonas Tüpker
# SPDX-FileContributor: Lukas Hesse
# SPDX-FileContributor: Maik Fruhner
# SPDX-FileContributor: Prof. Dr.-Ing. Heiko Tapken
# SPDX-FileContributor: Tobias Wamhof
# SPDX-FileContributor: Philipp Schröer
#
# SPDX-License-Identifier: MIT

FROM node:20-alpine

ARG PROJECT_BASE_URL
ARG KEYCLOAK_REALM_NAME
ARG VITE_PORTAINER_VERSION
ARG VITE_AGENT_ENABLED=false

RUN test -n "$VITE_PORTAINER_VERSION"

WORKDIR /usr/src/app

COPY package*.json .
RUN npm install -g serve && npm ci

COPY . ./
RUN npm run build

# replace all occurrences of the default hostname with the .env value
# inside the app's JavaScript and configure the keycloak.json
RUN find dist/assets -name "*.js" -exec sed -i "s/agri-gaia.localhost/${PROJECT_BASE_URL}/g" {} + && \
    sed -i "s/agri-gaia.localhost/${PROJECT_BASE_URL}/g; \
    s/test-realm/${KEYCLOAK_REALM_NAME}/g \
    " dist/keycloak.json
EXPOSE 80
ENTRYPOINT ["serve", "-s", "dist", "-l", "80"]
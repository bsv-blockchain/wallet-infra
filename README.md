# Wallet Infra (UTXO Management Infrastructure)

This repository **wallet-infra** contains the configurations and code necessary to **build and run a wallet storage server** (also referred to as an **“utxo-management-server”**). The server manages Bitcoin SV (BSV) UTXOs and can be connected to by BSV wallet clients. 

Below you’ll find two primary deployment setups:

1. **Local Development** – using Docker Compose for quick local iteration.
2. **Google Cloud Run** – for deploying a production-grade container that runs on Google Cloud’s serverless platform.

This README explains how to get each environment running, including environment variables, Docker configuration, and the basic flow of your CI/CD if you choose to use GitHub Actions for automatic deployment.

---

## 1. Introduction to wallet-infra

- **Objective**: Provide the **infrastructure** needed to spin up a remote UTXO management system. 
- **Core**: The Node.js server (written in TypeScript) uses `wallet-storage` libraries to store and manage UTXOs in a MySQL database. 
- **Features**:
  - **Auto-run Migrations**: On startup, it runs DB migrations to ensure tables are in sync.
  - **Server**: Exposes an HTTP endpoint on port `8080` by default (configurable via environment).
  - **Commission / Fee**: (Optional) can configure a commission address or default fee model in environment variables.
  - **Nginx**: Optionally included in the Docker image. For local dev or `NODE_ENV=development`, it is skipped.

---

## 2. Local Development Setup

Below are steps for **running everything locally** using **Docker Compose**: 
this will spin up:
1. A MySQL container
2. The “utxo-management-server” container with Node.js

### 2.1 Requirements

- **Docker** installed (v20+ recommended)
- **Node.js** installed if you plan to run `npm install` locally (v16+ recommended)
- **Git** for code management (optional but typical)

### 2.2 Steps

1. **Clone this repository**:
   ```bash
   git clone https://github.com/bitcoin-sv/wallet-infra.git
   cd wallet-infra
   ```

2. **Install local dependencies** (optional but helpful if you intend to run build steps outside Docker):
   ```bash
   npm install
   ```

3. **Configure environment variables**: 
   - Typically done inside the `docker-compose.yml`. 
   - By default, we have:

     ```yaml
     environment:
       NODE_ENV: development
       HTTP_PORT: "8080"
       SERVER_PRIVATE_KEY: "bffe0d7a3f7effce2b3511323c6cca1df1649e41a336a8b603194d53287ad285"
       KNEX_DB_CONNECTION: '{"host":"mysql","user":"root","password":"rootPass","database":"wallet_storage","port":3306}'
     ```
   - You can edit these in `docker-compose.yml` to suit your environment. 

4. **Run Docker Compose**:

Make sure Docker is running on your machine, then run the following command:
   ```bash
   docker-compose up --build
   ```
   - This will:
     - **Build** the Node image from the included `Dockerfile`.
     - **Launch** the MySQL container (exposing `3306` to your machine).
     - **Launch** the Node container, automatically running migrations at startup.
     - Node server will listen on port `8080` (mapped to `localhost:8080`).

5. **Check logs**:
   - You should see something like:
     ```
     utxo-management-server  | wallet-storage server v0.4.5
     utxo-management-server  | wallet-storage server started
     ```
   - This indicates the system is ready and listening on `http://localhost:8080`.

6. **Connect a wallet client**:
   - Configure your client so that the “remote storage” is at `http://localhost:8080` (or the relevant host/port).
   - The server manages your UTXOs in MySQL.

7. **Stopping**:
   ```bash
   docker-compose down
   ```

That’s it for local development. Each time you change code, you can re-run `docker-compose up --build` or rely on volume mounting for hot reload (though be mindful of overwriting `node_modules`).

---

## 3. Deploying to Google Cloud Run

For **production** or cloud usage, we recommend deploying the Docker container to **Google Cloud Run**. Below is a high-level overview.

### 3.1 Prerequisites

1. **Google Cloud CLI** (`gcloud`) – installed and authenticated to your GCP project.
2. **Cloud Run** enabled in your GCP project. 
3. **A Cloud SQL** instance for MySQL (or another DB solution). If using Cloud SQL, see the [Cloud SQL for MySQL and Cloud Run docs](https://cloud.google.com/sql/docs/mysql/connect-run).
4. **Docker** – for building the container image locally (or you can use GitHub Actions to build it).

### 3.2 Prepare the Dockerfile

We already have a `Dockerfile` that looks like this:

```dockerfile
FROM node:20-alpine

# Install nginx (optional)
RUN apk add --no-cache --update nginx && \
    chown -R nginx:www-data /var/lib/nginx

COPY ./nginx.conf /etc/nginx/nginx.conf
EXPOSE 8080

WORKDIR /app
COPY . .
RUN npm i knex -g && \
    npm run build

# By default, node out/src/index.js. It will conditionally run Nginx if NODE_ENV != development
CMD [ "node", "out/src/index.js"]
```

**If you prefer** to skip Nginx in production, you can remove the `RUN apk add` and references to `nginx`. The code in `index.ts` spawns Nginx only if `NODE_ENV !== 'development'`.

### 3.3 Deploy Manually with GCloud

1. **Build** your image:
   ```bash
   docker build -t gcr.io/PROJECT_ID/utxo-management-server:latest .
   ```
2. **Push** to your GCR or Artifact Registry:
   ```bash
   docker push gcr.io/PROJECT_ID/utxo-management-server:latest
   ```
3. **Deploy** to Cloud Run:
   ```bash
   gcloud run deploy utxo-management-server \
     --image gcr.io/PROJECT_ID/utxo-management-server:latest \
     --region=us-west1 \
     --platform=managed \
     --allow-unauthenticated \
     --set-env-vars="NODE_ENV=production,HTTP_PORT=8080,SERVER_PRIVATE_KEY=...,KNEX_DB_CONNECTION=..."
   ```
   - Replace `...` with your real values, e.g. the DB connection. 
   - If using Cloud SQL, you might set up a special JSON or the `socketPath` approach.

### 3.4 CI/CD with GitHub Actions

**Optional** but recommended. You can automate Docker builds and GCR deployments:

1. **Add** your GitHub secrets, e.g. `GCP_PROJECT_ID`, `GCP_SA_KEY` (service account JSON), `KNEX_DB_CONNECTION`, etc.
2. **Create** `.github/workflows/deploy.yaml` with a job that:
   - Checks out the repo.
   - Authenticates to GCP (using `google-github-actions/auth`).
   - Builds & pushes the Docker image to GCR.
   - Calls `gcloud run deploy` with the environment variables needed.

For instance:

```yaml
name: Deploy to Cloud Run

on:
  push:
    branches: [ "master" ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v1
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Configure docker
        run: gcloud auth configure-docker

      - name: Build
        run: |
          docker build -t gcr.io/${{ secrets.GCP_PROJECT_ID }}/utxo-management-server:${{ github.sha }} .
      
      - name: Push Docker image
        run: |
          docker push gcr.io/${{ secrets.GCP_PROJECT_ID }}/utxo-management-server:${{ github.sha }}
      
      - name: Deploy
        run: |
          gcloud run deploy utxo-management-server \
            --image gcr.io/${{ secrets.GCP_PROJECT_ID }}/utxo-management-server:${{ github.sha }} \
            --region=us-west1 \
            --platform=managed \
            --allow-unauthenticated \
            --set-env-vars="KNEX_DB_CONNECTION=${{ secrets.KNEX_DB_CONNECTION }},SERVER_PRIVATE_KEY=${{ secrets.SERVER_PRIVATE_KEY }},HTTP_PORT=8080,NODE_ENV=production"
```

After merging to `master`, this workflow triggers, builds, and deploys automatically.

---

## 4. Summary

- **Local**: `docker-compose up --build` → 2 containers (MySQL + Node) → auto migrations → UTXO manager on `localhost:8080`.
- **Cloud**: Build Docker → push to GCR → `gcloud run deploy` → serverless environment. 
- **CI**: Optionally set up GitHub Actions (or other pipelines) so changes to your code trigger a new container build and deployment.

With this, you have a straightforward path to run the server in dev or production, with minimal overhead and easy integration into your existing BSV wallet ecosystem.
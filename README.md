# Wallet Infra - UTXO Management Server

This repository serves as a reference implementation for building and deploying BSV Wallet Infrastructure. It contains the configuration and code necessary to build and run a wallet storage server (also referred to as a “UTXO Management Server”). The server securely stores and manages UTXOs, providing a reliable backend for BSV wallet clients, all while never accessing user-held keys.

Built on the [wallet-toolbox](https://github.com/bitcoin-sv/wallet-toolbox), this implementation empowers developers with extensive customization options for authentication, monetization, and database management to name a few.

## Deployment Options

1. **Local Development** – using Docker Compose for quick local iteration.
2. **Google Cloud Run** – for deploying a production-grade container that runs on Google Cloud’s serverless platform.

## Key Features

1. **Out-of-the-Box UTXO Management**  
   - The server automatically handles all core wallet storage actions—storing transaction outputs (UTXOs), managing spent/unspent states, tracking labels, baskets, certificates, and more.
   - **Auto-migrations** on startup (via Knex).

2. **Customizable Monetization**  
   - By default, sets a `calculateRequestPrice` returning `0`, but you can easily **charge** clients in satoshis for each API call—either flat fees or **per-route** fees.
   - Using [`@bsv/payment-express-middleware`](https://github.com/bitcoin-sv/payment-express-middleware) in combination with the `monetize` flag, you can create a system that verifies micropayments on each request.

3. **Mutual Authentication**  
   - The server uses [`@bsv/auth-express-middleware`](https://github.com/bitcoin-sv/auth-express-middleware) to ensure that **both** the client and the server authenticate before a request is allowed through. 
   - This ensures that only authorized wallets can read or modify UTXO data.

4. **Flexible Database Choice**  
   - MySQL is used in this example (`mysql2` driver, `knex` config), however, you can integrate **any** DB driver that [Knex](https://knexjs.org/) supports—PostgreSQL, SQLite, etc. 

5. **Extensible Codebase**  
   - The `WalletStorageManager` class can handle multiple active or backup storage providers, letting you replicate or sync data across different backends.
   - The `StorageServer` class is an Express-based HTTP server that exposes a JSON-RPC endpoint. You can add your own routes, middlewares, or entire route controllers to further extend its functionality as needed for your [BRC-100](https://github.com/bitcoin-sv/BRCs/blob/master/wallet/0100.md) compliant wallet.

6. **Just Defaults—Feel Free to Customize**  
   - The code in `index.ts` is a basic example. Everything from `SERVER_PRIVATE_KEY`, `HTTP_PORT`, `KNEX_DB_CONNECTION`, to fee/commission handling can be **tweaked** in environment variables or replaced with your own logic.

---

## Local Development Setup

Below are steps for **running locally** using **Docker Compose**: 
this will spin up:
1. A MySQL container
2. The “utxo-management-server” container with Node.js

### Requirements

- **Docker** installed (v20+ recommended)
- **Node.js** installed if you plan to run `npm install` locally (v18+ recommended)
- **Git** for code management (optional but typical)

### Steps

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

## Deploying to Google Cloud Run

For **production** or cloud usage, we recommend deploying the Docker container to **Google Cloud Run**. Below is a high-level overview.

### Prerequisites

1. **Google Cloud CLI** (`gcloud`) – installed and authenticated to your GCP project.
2. **Cloud Run** enabled in your GCP project. 
3. **A Cloud SQL** instance for MySQL (or another DB solution). If using Cloud SQL, see the [Cloud SQL for MySQL and Cloud Run docs](https://cloud.google.com/sql/docs/mysql/connect-run).
4. **Docker** – for building the container image locally (or you can use GitHub Actions to build it).

### Prepare the Dockerfile

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

### Deploy Manually with GCloud

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

### CI/CD with GitHub Actions

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

## Conclusion

By following this setup, you can quickly spin up a UTXO management system—either locally with Docker Compose or in the cloud via Google Cloud Run. Customize your environment variables, monetization logic, database engine, or route controllers as needed. The wallet-infra repository aims to give you a solid foundation for building secure and flexible BSV wallet infrastructure, while remaining [BRC-100](https://github.com/bitcoin-sv/BRCs/blob/master/wallet/0100.md) compliant to ensure interoperability.

Feel free to fork and adapt this to your production needs.  Let's build the future of BSV Blockchain wallets together!

## License

The license for the code in this repository is the Open BSV License. Refer to [LICENSE.txt](./LICENSE.txt) for the license text.
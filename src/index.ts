import * as bsv from '@bsv/sdk'
import {
  Services,
  StorageKnex,
  table,
  WalletStorageManager,
  WalletStorageServerOptions,
  StorageServer,
  sdk,
  Wallet,
  WalletSigner
} from 'wallet-storage'
import { Knex, knex as makeKnex } from 'knex'
import { spawn } from 'child_process'
import * as dotenv from 'dotenv'

dotenv.config()

// Load environment variables
const {
  NODE_ENV = 'development',
  HTTP_PORT = 3998,
  SERVER_PRIVATE_KEY = '1'.repeat(64),
  KNEX_DB_CONNECTION = '{}'
} = process.env

async function setupWalletStorageAndMonitor(): Promise<{
  databaseName: string
  knex: Knex
  activeStorage: StorageKnex
  storage: WalletStorageManager
  services: Services
  settings: table.Settings
  keyDeriver: bsv.KeyDeriver
  signer: sdk.WalletSigner
  wallet: Wallet
  server: StorageServer
}> {
  try {
    // Parse database connection details
    const connection = JSON.parse(KNEX_DB_CONNECTION)
    const databaseName = connection['database']

    // You can also use an imported knex configuration file.
    const knexConfig: Knex.Config = {
      client: 'mysql2',
      connection,
      useNullAsDefault: true,
      pool: {
        min: 2,
        max: 10,
        createTimeoutMillis: 10000,
        acquireTimeoutMillis: 30000,
        idleTimeoutMillis: 600000,
        reapIntervalMillis: 60000,
        createRetryIntervalMillis: 200,
        propagateCreateError: false
      }
    }
    const knex = makeKnex(knexConfig)
    const chain = NODE_ENV === 'production' ? 'main' : 'test'

    // Initialize storage components
    const rootKey = bsv.PrivateKey.fromHex(SERVER_PRIVATE_KEY)
    const storageIdentityKey = rootKey.toPublicKey().toString()

    const activeStorage = new StorageKnex({
      chain,
      knex,
      commissionSatoshis: 0,
      commissionPubKeyHex: undefined,
      feeModel: { model: 'sat/kb', value: 1 }
    })

    await activeStorage.migrate(databaseName, storageIdentityKey)
    const settings = await activeStorage.makeAvailable()

    const storage = new WalletStorageManager(settings.storageIdentityKey, activeStorage)
    await storage.makeAvailable()

    // Initialize wallet components
    const services = new Services(chain)
    const keyDeriver = new bsv.KeyDeriver(rootKey)
    const signer = new WalletSigner(chain, keyDeriver, storage)
    const wallet = new Wallet(signer, keyDeriver, services)

    // Set up server options
    const serverOptions: WalletStorageServerOptions = {
      port: Number(HTTP_PORT),
      wallet,
      monetize: false
    }
    const server = new StorageServer(activeStorage, serverOptions)

    return {
      databaseName,
      knex,
      activeStorage,
      storage,
      services,
      settings,
      keyDeriver,
      signer,
      wallet,
      server
    }
  } catch (error) {
    console.error('Error setting up Wallet Storage and Monitor:', error)
    throw error
  }
}

// Main function to start the server
(async () => {
  try {
    const context = await setupWalletStorageAndMonitor()
    console.log('wallet-storage server v0.4.5')
    console.log(JSON.stringify(context.settings, null, 2))

    context.server.start()
    console.log('wallet-storage server started')

    // Conditionally start nginx
    if (NODE_ENV !== 'development') {
      console.log('Spawning nginx...')
      spawn('nginx', [], { stdio: ['inherit', 'inherit', 'inherit'] })
      console.log('nginx is up!')

    }
  } catch (error) {
    console.error('Error starting server:', error)
  }
})()
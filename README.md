# block67

> Developer-first CLI tool for smart contract deployment — fast, simple, with clear error diagnostics.

No GUI. No config hell. Just run `block67 deploy MyToken` and you're live.

---

## Why block67?

| Problem with existing tools | What block67 does |
|---|---|
| Too much setup before you can deploy | One config file, one command |
| Cryptic EVM error messages | Matches known errors and shows plain-English fixes |
| Context-switching between docs and terminal | Error catalogue built in (`block67 errors`) |
| Repetitive config across projects | Single `block67.config.js` per project |

---

## Installation

```bash
npm install -g block67
```

Verify it works:

```bash
block67 --help
```

---

## Quick Start

### 1. Initialize your project

```bash
cd your-project
block67 init
```

This creates:
- `block67.config.js` — your project config
- `.env.example` — environment variable template
- `.gitignore` — pre-configured to exclude `.env`
- `artifacts/` — directory for your compiled contract JSON files

### 2. Configure your environment

```bash
cp .env.example .env
```

Edit `.env`:

```
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
PRIVATE_KEY=your_deployer_wallet_private_key
```

Get a free RPC URL from [Alchemy](https://www.alchemy.com) or [Infura](https://infura.io).
Get Sepolia test ETH from [sepoliafaucet.com](https://sepoliafaucet.com).

### 3. Add your compiled contract artifact

Place the compiled ABI + bytecode JSON at:

```
artifacts/MyToken.json
```

Format:

```json
{
  "contractName": "MyToken",
  "abi": [ ... ],
  "bytecode": "0x608060..."
}
```

> If you use Hardhat, copy from `artifacts/contracts/MyToken.sol/MyToken.json`.
> If you use Foundry, copy from `out/MyToken.sol/MyToken.json`.

### 4. Configure `block67.config.js`

```js
require('dotenv').config();

module.exports = {
  network: "sepolia",
  rpcUrl: process.env.RPC_URL,
  privateKey: process.env.PRIVATE_KEY,
  contracts: {
    MyToken: {
      args: ["Test Token", "TT", 1000000]  // constructor arguments
    }
  }
};
```

### 5. Deploy

```bash
block67 deploy MyToken
```

---

## CLI Commands

### `block67 init`

Initialize a new block67 project in the current directory.

```bash
block67 init
```

---

### `block67 deploy <ContractName>`

Deploy a compiled contract to the configured network.

```bash
block67 deploy MyToken
```

**Options:**

| Flag | Description |
|---|---|
| `--dry-run` | Validate config and artifact without sending a transaction |
| `--gas-limit <n>` | Override gas limit for this deployment |

```bash
block67 deploy MyToken --dry-run
block67 deploy MyToken --gas-limit 3000000
```

**Example output:**

```
  ██████╗ ██╗      ██████╗  ██████╗██╗  ██╗ ██████╗ ███████╗
  ...

[block67] ✔ Artifact loaded: MyToken

  ── DEPLOYING: MyToken ──────────────────────────────────────
  Network      : sepolia
  RPC          : https://eth-sepolia.g.alchemy.com/v2/****
  Constructor  : ["Test Token","TT",1000000]

[block67] ✔ Connected to sepolia
  Deployer     : 0xYourWalletAddress
  Balance      : 0.25 ETH

[block67] ✔ MyToken deployed!

  ── DEPLOYMENT SUCCESSFUL ───────────────────────────────────
  Contract     : 0xContractAddress
  Tx Hash      : 0xTransactionHash
  Explorer     : https://sepolia.etherscan.io/address/0xContractAddress
  Tx Link      : https://sepolia.etherscan.io/tx/0xTransactionHash
```

---

### `block67 doctor`

Run a quick environment check.

```bash
block67 doctor
```

```
  ✔ block67.config.js
  ✔ .env file
  ✔ RPC_URL set
  ✔ PRIVATE_KEY set
  ✔ artifacts/ directory

[block67] ✔ All checks passed. You are ready to deploy!
```

---

### `block67 errors`

Browse the full catalogue of known EVM errors with plain-English explanations.

```bash
block67 errors
```

---

## Error Diagnostics

When a deployment fails, block67 automatically matches the error against a catalogue of the top 20+ most common EVM and deployment errors.

Example:

```
  ── DEPLOYMENT FAILED ───────────────────────────────────────
  Context : Deploying MyToken
  Raw Msg : insufficient funds for gas * price + value

  DIAGNOSIS
  Reason  : Your wallet does not have enough ETH to cover gas fees.
  Fix     : Add funds to your deployer wallet. Use a faucet if on testnet.
  Docs    : https://sepoliafaucet.com
```

**Covered errors include:**

- `gas estimation failed`
- `execution reverted`
- `nonce too low / too high`
- `insufficient funds`
- `invalid private key`
- `could not detect network`
- `contract creation code storage out of gas`
- `replacement transaction underpriced`
- `abi not found / bytecode not found / artifact not found`
- `config not found`
- `private key not set / rpc url not set`
- ...and more

**Enable full stack traces:**

```bash
BLOCK67_DEBUG=1 block67 deploy MyToken
```

---

## Supported Networks

| Network | Key in config |
|---|---|
| Ethereum Mainnet | `mainnet` |
| Sepolia Testnet | `sepolia` |
| Goerli Testnet | `goerli` |
| Polygon | `polygon` |
| Mumbai Testnet | `mumbai` |
| Arbitrum One | `arbitrum` |
| Optimism | `optimism` |
| Base | `base` |
| BNB Smart Chain | `bsc` |
| Local (Hardhat/Anvil) | `localhost` |

For `localhost`, set `RPC_URL=http://127.0.0.1:8545` in your `.env`.

---

## Testing Locally

### Option A — Hardhat node

```bash
npx hardhat node
# In another terminal:
RPC_URL=http://127.0.0.1:8545 block67 deploy MyToken
```

### Option B — Foundry Anvil

```bash
anvil
# Copy any of the printed private keys into .env as PRIVATE_KEY
# Set RPC_URL=http://127.0.0.1:8545
block67 deploy MyToken
```

---

## Project Structure

```
your-project/
├── artifacts/
│   └── MyToken.json        ← compiled ABI + bytecode
├── .env                    ← secret keys (never commit)
├── .env.example            ← safe template to commit
├── .gitignore
└── block67.config.js       ← your project config
```

---

## Publishing Your Own CLI to npm

If you are building on top of block67 or releasing your own fork:

```bash
# 1. Update name, version, and description in package.json
# 2. Make bin/block67.js executable
chmod +x bin/block67.js

# 3. Test locally
npm link
block67 --help

# 4. Publish
npm login
npm publish --access public
```

---

## Contributing

Issues and PRs are welcome at [github.com/sanjudefi/block67-cli](https://github.com/sanjudefi/block67-cli).

---

## License

MIT

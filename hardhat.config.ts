import "dotenv/config"
import "@nomiclabs/hardhat-waffle"
import "hardhat-abi-exporter"
import "solidity-coverage"

import { HardhatUserConfig } from "hardhat/types"

const accounts = {
  mnemonic: process.env.MNEMONIC || "test test test test test test test test test test test fina",
}

const config: HardhatUserConfig = {
  abiExporter: {
    path: "./abi",
    clear: false,
    flat: true
  },
  mocha: {
    timeout: 20000
  },
  paths: {
    artifacts: "artifacts",
    cache: "cache",
    sources: "contracts",
    tests: "test"
  },
  solidity: {
    compilers: [
      {
        version: "0.8.4",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200
          },
        }
      }
    ]
  }
}



export default config
import { Address } from "@graphprotocol/graph-ts"
import { Token } from "../generated/schema"
import {
  PairCreated as PairCreatedEvent,
  Buy as BuyEvent,
  Sell as SellEvent
} from "../generated/DexFactory/Factory"
import { recordTradeAndPositions } from "./helpers"

export function handlePairCreated(event: PairCreatedEvent): void {
  const token0 = event.params.token0
  const token1 = event.params.token1
  const pair = event.params.pair

  // If one side is WETH/ETH wrapper, attach pair to token
  // TODO: set YOUR_WRAPPED_ETH_ADDRESS
  const WETH = Address.fromString("0x6100E367285b01F48D07953803A2d8dCA5D19873")
  let baseToken: Address | null = null
  if (token0.equals(WETH)) baseToken = token1
  if (token1.equals(WETH)) baseToken = token0
  if (baseToken != null) {
    let t = Token.load(baseToken!.toHexString())
    if (t != null) {
      t.pair = pair
      t.updatedAt = event.block.timestamp
      t.save()
    }
  }
}

export function handleDexBuy(event: BuyEvent): void {
  recordTradeAndPositions(
    "DEX",
    "BUY",
    event.block.timestamp,
    event.transaction.hash,
    event.logIndex,
    event.params.user,
    event.params.token,
    event.params.quantityETH,
    event.params.quantityTokens
  )
}

export function handleDexSell(event: SellEvent): void {
  recordTradeAndPositions(
    "DEX",
    "SELL",
    event.block.timestamp,
    event.transaction.hash,
    event.logIndex,
    event.params.user,
    event.params.token,
    event.params.quantityETH,
    event.params.quantityTokens
  )
}

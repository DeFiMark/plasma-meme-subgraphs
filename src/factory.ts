// src/factory.ts
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

  // Replace with your wrapped native token address for this network
  const WETH = Address.fromString("0x6100E367285b01F48D07953803A2d8dCA5D19873")

  // Avoid nullable Address/union types; just use a string id
  let baseId = "" // empty = none
  if (token0.equals(WETH)) {
    baseId = token1.toHexString()
  } else if (token1.equals(WETH)) {
    baseId = token0.toHexString()
  }

  if (baseId.length > 0) {
    let t = Token.load(baseId)
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

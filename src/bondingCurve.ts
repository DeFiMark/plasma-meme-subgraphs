import { Buy as BuyEvent, Sell as SellEvent } from "../generated/templates/BondingCurve/BondingCurve"
import { recordTradeAndPositions } from "./helpers"

export function handleCurveBuy(event: BuyEvent): void {
  recordTradeAndPositions(
    "CURVE",
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

export function handleCurveSell(event: SellEvent): void {
  recordTradeAndPositions(
    "CURVE",
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

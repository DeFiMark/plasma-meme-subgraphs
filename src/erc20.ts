import { Transfer as TransferEvent } from "../generated/templates/ERC20/ERC20"
import { updateBalanceFromTransfer } from "./helpers"

export function handleTransfer(event: TransferEvent): void {
  updateBalanceFromTransfer(
    event.params.from,
    event.params.to,
    event.address,                 // token address
    event.params.value,
    event.block.timestamp
  )
}

import { handlePaymentVerify, paymentFunctionConfig } from '../payment-handler.mjs'

export const config = paymentFunctionConfig

/** Alias: POST /api/payment/check (same as /api/check-md5) */
export default async function handler(req, res) {
  return handlePaymentVerify(req, res, { allowGet: false })
}

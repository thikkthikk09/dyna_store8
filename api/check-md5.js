import { handlePaymentVerify, paymentFunctionConfig } from './payment-handler.mjs'

export const config = paymentFunctionConfig

/** Browser + app poll: POST /api/check-md5 { md5, token? } */
export default async function handler(req, res) {
  return handlePaymentVerify(req, res, { allowGet: false })
}

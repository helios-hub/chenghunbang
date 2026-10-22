export function resolvePayMode(env = process.env) {
  if (env.PAY_MODE) return env.PAY_MODE;
  return env.NODE_ENV === 'production' ? 'off' : 'mock';
}

export function startPayment(payMode, order) {
  if (payMode === 'mock') return { mode: 'mock', orderId: order.id };
  throw Object.assign(new Error('支付渠道尚未开通'), { status: 501 });
}

/**
 * Helpers para hash de códigos OTP.
 * SHA-256 (com user_id como sal) é suficiente: códigos vivem 10 min,
 * têm máximo 5 tentativas e o segredo é descartado após uso.
 */
const crypto = require('crypto');

function generateCode() {
  // 6 dígitos crypto-secure
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

function hashCode(code, userId) {
  return crypto.createHash('sha256')
    .update(String(code) + ':' + String(userId))
    .digest('hex');
}

function safeEqual(a, b) {
  try {
    var ba = Buffer.from(String(a));
    var bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch (e) { return false; }
}

module.exports = { generateCode, hashCode, safeEqual };

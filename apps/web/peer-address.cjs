// Web sunucusu başlamadan önce yüklenir (node --require). Her isteğe, bağlantının gerçek karşı adresini
// x-kvkk-peer başlığıyla ekler; istemcinin aynı adla gönderdiği değerin üzerine yazılır. Next.js
// X-Forwarded-For başlığını istemci gönderdiyse olduğu gibi bıraktığından, istemci IP'si bu başlıktan
// ve güvenilir vekil sayısından hesaplanır (src/lib/server/backend.ts).
const http = require('node:http');

const emit = http.Server.prototype.emit;
http.Server.prototype.emit = function (event, req, ...rest) {
  if (event === 'request' && req && req.headers) {
    req.headers['x-kvkk-peer'] = req.socket?.remoteAddress ?? '';
  }
  return emit.call(this, event, req, ...rest);
};

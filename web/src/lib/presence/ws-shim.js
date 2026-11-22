/**
 * Browser shim for Photon's Node `ws` dependency.
 * photon-realtime calls require("ws"); in the browser we use native WebSocket.
 */
const WS = globalThis.WebSocket;

module.exports = WS;
module.exports.WebSocket = WS;
module.exports.default = WS;

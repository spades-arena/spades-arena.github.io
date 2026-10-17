/**
 * Spades by Hadzz - Node loader for the shared match engine (js/match.js).
 * Loads the rules engine and bot AI, then exposes OnlineMatch to server.js.
 */
'use strict';

const nodeCrypto = require('crypto');
if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.getRandomValues !== 'function') {
  globalThis.crypto = nodeCrypto.webcrypto;
}
require('../js/engine.js');
require('../js/bot.js');
module.exports = require('../js/match.js');

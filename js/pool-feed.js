/**
 * @file The ckpool pool hashrate feed. On page load it reads the one minute
 * pool hashrate from the pool proxy and writes it into the CKpool hashrate
 * field. A failure leaves the empty mark. The page has no build step, so this
 * file adds one function to the shared namespace from js/version.js. Load
 * js/version.js before this file.
 */

/**
 * The shared page namespace from js/version.js.
 * @typedef {object} PageNamespace
 * @property {string} [version] - The release version from js/version.js.
 * @property {() => void} [initAddressSearch] - Wire the address search form.
 * @property {() => void} [initPriceFeed] - Open the live BTC price feed.
 * @property {() => void} [initNetworkFeed] - Read the network data once.
 * @property {() => void} [initPoolFeed] - Read the pool hashrate once.
 */

(() => {
  "use strict";

  /** @type {Window & { CKHASHER?: PageNamespace }} */
  const page = window;
  const ns = page.CKHASHER || (page.CKHASHER = {});

  /**
   * Write the pool row from a pool reply.
   * @param {Record<string, unknown>} data - The pool reply.
   * @returns {void}
   */
  const fillPool = (data) => {
    const hashrate =
      typeof ns.formatHashrate === "function"
        ? ns.formatHashrate(data.hashrate)
        : undefined;
    ns.setField("#ckpool-hashrate", hashrate);
  };

  /**
   * Read the pool hashrate once and fill the CKpool hashrate field.
   * @returns {void}
   */
  ns.initPoolFeed = () => {
    ns.loadJson("/api/pool", "the pool hashrate", fillPool);
  };
})();

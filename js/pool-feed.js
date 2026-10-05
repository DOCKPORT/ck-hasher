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

  /** The empty value. */
  const EMPTY = "\u2014";

  /**
   * Write a value into one field, or the empty mark on a missing value.
   * @param {string} selector - The field selector.
   * @param {string} [text] - The text to write.
   * @returns {void}
   */
  const setField = (selector, text) => {
    const slot = document.querySelector(selector);
    if (slot instanceof HTMLElement) {
      slot.textContent = text === undefined || text === "" ? EMPTY : text;
    }
  };

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
    setField("#ckpool-hashrate", hashrate);
  };

  /**
   * Read the pool hashrate once and fill the CKpool hashrate field.
   * @returns {void}
   */
  ns.initPoolFeed = () => {
    fetch("/api/pool")
      .then((response) => {
        if (!response.ok) {
          throw new Error(String(response.status));
        }
        return response.json();
      })
      .then(fillPool)
      .catch((error) => {
        /* A failure leaves the empty mark in place. */
        console.error("ck-hasher: the pool hashrate did not load", error);
      });
  };
})();

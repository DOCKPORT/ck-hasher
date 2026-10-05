/**
 * @file The live BTC price feed. It opens a WebSocket to Coinbase and writes
 * the price and the 24 hour change into the BTC price slot. The feed is public,
 * so no key and no backend take part. The slot updates at most once a second.
 * A dropped socket reconnects with a growing delay.
 * The page has no build step, so this file adds one function to the shared
 * namespace from js/version.js. Load js/version.js before this file.
 */

/**
 * The shared page namespace from js/version.js.
 * @typedef {object} PageNamespace
 * @property {string} [version] - The release version from js/version.js.
 * @property {() => void} [initAddressSearch] - Wire the address search form.
 * @property {() => void} [initPriceFeed] - Open the live BTC price feed.
 */

(() => {
  "use strict";

  /** @type {Window & { CKHASHER?: PageNamespace }} */
  const page = window;
  const ns = page.CKHASHER || (page.CKHASHER = {});

  /** The public Coinbase Exchange feed. It needs no key. */
  const ENDPOINT = "wss://ws-feed.exchange.coinbase.com";
  /** The product pair. */
  const PRODUCT = "BTC-USD";
  /** The largest wait between two reconnect tries. */
  const MAX_BACKOFF_MS = 30000;
  /** The shortest time between two screen updates. */
  const RENDER_INTERVAL_MS = 1000;

  /**
   * Read a finite number from a feed value.
   * @param {string} value - The raw value from the feed.
   * @returns {number | undefined} The number, or undefined on a bad value.
   */
  const toNumber = (value) => {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : undefined;
  };

  /**
   * Read the direction of a change. A flat value takes a dot.
   * @param {number} value - The signed change value.
   * @returns {{ name: string, symbol: string }} The class name and the symbol.
   */
  const readDirection = (value) => {
    if (value > 0) {
      return { name: "up", symbol: "\u2191" };
    }
    if (value < 0) {
      return { name: "down", symbol: "\u2193" };
    }
    return { name: "flat", symbol: "\u2022" };
  };

  /**
   * Draw one ticker update into the slot. The price leads. The 24 hour change
   * follows it, when the feed carries the open price.
   * @param {HTMLElement} slot - The BTC price slot.
   * @param {{ price: string, open24h?: number }} info - The ticker values.
   * @returns {void}
   */
  const paint = (slot, info) => {
    slot.textContent = "";
    slot.append(document.createTextNode(ns.formatUsd(info.price)));

    const price = toNumber(info.price);
    const open = info.open24h;
    if (price !== undefined && open !== undefined && open !== 0) {
      const change = ((price - open) / open) * 100;
      const direction = readDirection(change);

      const marker = document.createElement("span");
      marker.className = `price-change price-change--${direction.name}`;
      marker.textContent = `${direction.symbol} ${Math.abs(change).toFixed(2)}%`;

      slot.append(document.createTextNode(" "));
      slot.append(marker);
    }

    /* Hand the price to the subsidy module for the subsidy value. */
    if (price !== undefined && typeof ns.setBtcPrice === "function") {
      ns.setBtcPrice(price);
    }
  };

  /**
   * Open the feed and keep it open. Each ticker message sets the latest values.
   * The screen reads those values at most once a second. A close schedules a
   * reconnect.
   * @returns {void}
   */
  ns.initPriceFeed = () => {
    const slot = document.querySelector("#btc-price");
    if (!(slot instanceof HTMLElement)) {
      return;
    }

    /** The number of failed tries since the last success. */
    let attempt = 0;
    /** The latest ticker values. A new object marks a fresh value. */
    let latest = null;
    /** The ticker values on the screen. */
    let shown = null;
    /** The interval handle. Zero means the interval is off. */
    let timer = 0;

    const render = () => {
      if (latest === null) {
        return;
      }
      paint(slot, latest);
      shown = latest;
    };

    /* The first update goes out at once. Later updates follow one per second,
       and only while a fresh value waits. */
    const schedule = () => {
      if (timer !== 0) {
        return;
      }
      render();
      timer = page.setInterval(() => {
        if (latest === shown) {
          page.clearInterval(timer);
          timer = 0;
          return;
        }
        render();
      }, RENDER_INTERVAL_MS);
    };

    const connect = () => {
      /* The handlers act on this one connection, never on a later one. */
      const socket = new WebSocket(ENDPOINT);

      socket.addEventListener("open", () => {
        attempt = 0;
        socket.send(
          JSON.stringify({
            type: "subscribe",
            product_ids: [PRODUCT],
            channels: ["ticker"],
          }),
        );
      });

      socket.addEventListener("message", (event) => {
        let data;
        try {
          data = JSON.parse(String(event.data));
        } catch (error) {
          return;
        }
        if (!data || data.type !== "ticker" || data.product_id !== PRODUCT) {
          return;
        }
        latest = { price: data.price, open24h: toNumber(data.open_24h) };
        schedule();
      });

      socket.addEventListener("close", () => {
        attempt += 1;
        const wait = Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
        page.setTimeout(connect, wait);
      });

      socket.addEventListener("error", () => {
        socket.close();
      });
    };

    connect();
  };
})();

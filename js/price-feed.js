/**
 * @file The live BTC price feed. It opens a WebSocket to Coinbase and writes
 * the price and the year-over-year change into the BTC price slot. It reads the
 * daily close of the day one year back from the Coinbase candles REST API for
 * the base of the change. The feeds are public, so no key and no backend take
 * part. The slot updates at most once a second. A dropped socket reconnects
 * with a growing delay.
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
  /** The public Coinbase Exchange daily candles REST endpoint. No key is needed. */
  const CANDLES_URL =
    "https://api.exchange.coinbase.com/products/BTC-USD/candles";
  /** The seconds in one day. This is the daily candle step. */
  const DAY_SECONDS = 86400;
  /** The milliseconds in one day. */
  const DAY_MS = 86400000;
  /** The closed price field in a candle row. */
  const CANDLE_CLOSE = 4;
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
   * Read the daily candle start, in epoch seconds, for the same day one year
   * back. The value uses UTC midnight. In a common year, 29 February rolls to
   * 1 March.
   * @returns {number} The epoch seconds of the day one year back.
   */
  const yearAgoDay = () => {
    const now = new Date();
    const midnight = Date.UTC(
      now.getUTCFullYear() - 1,
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    return Math.floor(midnight / 1000);
  };

  /**
   * Read the daily close of the day one year back from Coinbase. A success hands
   * the close to the callback. A failure is logged, and the callback does not
   * run.
   * @param {(close: number) => void} onClose - The close handler.
   * @returns {void}
   */
  const loadYearAgoClose = (onClose) => {
    const day = yearAgoDay();
    const start = encodeURIComponent(new Date(day * 1000).toISOString());
    const end = encodeURIComponent(new Date(day * 1000 + DAY_MS).toISOString());
    const url = `${CANDLES_URL}?granularity=${DAY_SECONDS}&start=${start}&end=${end}`;

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(String(response.status));
        }
        return response.json();
      })
      .then((rows) => {
        if (!Array.isArray(rows)) {
          return;
        }
        const row = rows.find(
          (item) => Array.isArray(item) && Number(item[0]) === day,
        );
        if (!row) {
          return;
        }
        const close = toNumber(row[CANDLE_CLOSE]);
        if (close !== undefined && close > 0) {
          onClose(close);
        }
      })
      .catch((error) => {
        console.error("ck-hasher: the year-ago price did not load", error);
      });
  };

  /**
   * Draw one ticker update into the slot. The price leads. The year-over-year
   * change follows it, when the year-ago close is at hand.
   * @param {HTMLElement} slot - The BTC price slot.
   * @param {{ price: string }} info - The ticker values.
   * @param {number | null} reference - The daily close one year back.
   * @returns {void}
   */
  const paint = (slot, info, reference) => {
    slot.textContent = "";
    slot.append(document.createTextNode(ns.formatUsd(info.price)));

    const price = toNumber(info.price);
    if (price !== undefined && reference !== null) {
      const change = ((price - reference) / reference) * 100;
      const direction = readDirection(change);

      const marker = document.createElement("span");
      marker.className = `price-change price-change--${direction.name}`;
      marker.textContent = `${direction.symbol} ${Math.abs(change).toFixed(2)}% YoY`;

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
    /** The daily close one year back. Null until the REST reply lands. */
    let yearAgo = null;
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
      paint(slot, latest, yearAgo);
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
        latest = { price: data.price };
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

    /* Read the year-ago close once. A later paint picks the value up. */
    loadYearAgoClose((close) => {
      yearAgo = close;
      render();
    });

    connect();
  };
})();

# ck-hasher

A dashboard for CK-Pool Bitcoin miners.
Enter a Bitcoin address. The dashboard finds the miner that belongs to the
address. The dashboard then shows the miner status and the mining statistics.

## Data Sources

- **ck-pool.** Look up address to find workers https://solo.ckpool.org/users/
- **Coinbase WebSocket.** The feed returns the live BTC price.
- **Mempool via GitHub Actions.** A scheduled job fetches the block height,
  the network difficulty and more.

## Tech Stack

- JavaScript, HTML, and CSS for the frontend
- Python for scripting and the pool proxy
- GitHub Actions for the scheduled block data job

## Status

Early project. The repository is under development. 


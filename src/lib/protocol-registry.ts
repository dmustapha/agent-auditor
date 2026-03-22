// Static map of known protocol contract addresses → readable names
// Key: lowercase address, Value: protocol name
// Organized by chain — some addresses are the same across chains (CREATE2 deploys)

export const PROTOCOL_ADDRESSES: Record<string, string> = {
  // ─── Uniswap ───
  "0xe592427a0aece92de3edee1f18e0157c05861564": "Uniswap V3 Router",
  "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45": "Uniswap V3 Router 02",
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": "Uniswap Universal Router",
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": "Uniswap V2 Router",
  "0x2626664c2603336e57b271c5c0b26f421741e481": "Uniswap V3 Router (Base)",

  // ─── Aave ───
  "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2": "Aave V3 Pool",
  "0x794a61358d6845594f94dc1db02a252b5b4814ad": "Aave V3 Pool (L2)",
  "0xa97684ead0e402dc232d5a977953df7ecbab3cdb": "Aave V3 Pool Addresses Provider",

  // ─── Compound ───
  "0xc3d688b66703497daa19211eedff47f25384cdc3": "Compound V3 (cUSDCv3)",
  "0xa17581a9e3356d9a858b789d68b4d866e593ae94": "Compound V3 (cWETHv3)",

  // ─── 1inch ───
  "0x1111111254eeb25477b68fb85ed929f73a960582": "1inch V5 Router",
  "0x111111125421ca6dc452d289314280a0f8842a65": "1inch V6 Router",

  // ─── CoW Protocol ───
  "0x9008d19f58aabd9ed0d60971565aa8510560ab41": "CoW Protocol Settlement",

  // ─── Curve ───
  "0x99a58482bd75cbab83b27ec03ca68ff489b5788f": "Curve Router",
  "0xf0d4c12a5768d806021f80a262b4d39d26c58b8d": "Curve Router V2",

  // ─── Lido ───
  "0xae7ab96520de3a18e5e111b5eaab095312d7fe84": "Lido stETH",
  "0x889edc2edab5f40e902b864ad4d7ade8e412f9b1": "Lido wstETH (L2)",

  // ─── Chainlink ───
  "0x75c0530885f385721fdda23c539af3701d6f41f0": "Chainlink Automation Registry",

  // ─── Gnosis Safe ───
  "0xd9db270c1b5e3bd161e8c8503c55ceabee709552": "Gnosis Safe Singleton",
  "0xa6b71e26c5e0845f74c812102ca7114b6a896ab2": "Gnosis Safe Proxy Factory",

  // ─── Balancer ───
  "0xba12222222228d8ba445958a75a0704d566bf2c8": "Balancer Vault",

  // ─── Sushiswap ───
  "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f": "SushiSwap Router",

  // ─── Across ───
  "0x5c7bcd6e7de5423a257d81b442095a1a6ced35c5": "Across SpokePool",

  // ─── Stargate ───
  "0x8731d54e9d02c286767d56ac03e8037c07e01e98": "Stargate Router",

  // ─── OpenSea / Seaport ───
  "0x00000000000000adc04c56bf30ac9d3c0aaf14dc": "Seaport 1.5",
  "0x00000000000001ad428e4906ae43d8f9852d0dd6": "Seaport 1.6",

  // ─── ERC-4337 ───
  "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789": "ERC-4337 EntryPoint",
  "0x0000000071727de22e5e9d8baf0edac6f37da032": "ERC-4337 EntryPoint v0.7",

  // ─── Olas ───
  "0x48b6af7b12c71f09e2fd8c5cdc1a328b4ebc2cf6": "Olas Service Registry",
  "0x9338b5153ae39bb89f50468e608ed9d764b755fd": "Olas Mech Marketplace",

  // ─── Base-specific ───
  "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24": "Uniswap V2 Router (Base)",
  "0x2b3141f4b6ac36253b4c1155dba8ea5e3b0e3d5e": "Aerodrome Router (Base)",
  "0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43": "Aerodrome Router V2 (Base)",

  // ─── Gnosis-specific ───
  "0x1a1ec25dc08e98e5e93f1104b5e5cdd298707d31": "Omen Fixed Product Market Maker",

  // ─── Morpho ───
  "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb": "Morpho Blue",

  // ─── Pendle ───
  "0x00000000005bbb0ef59571e58418f9a4357b68a0": "Pendle Router V4",

  // ─── EigenLayer ───
  "0x858646372cc42e1a627fce94aa7a7033e7cf075a": "EigenLayer Strategy Manager",

  // ─── Hyperlane ───
  "0xc005dc82818d67af737725bd4bf75435d065d239": "Hyperlane Mailbox",

  // ─── Bridges ───
  "0x3154cf16ccdb4c6d922629664174b904d80f2c35": "Base Bridge",
  "0x49048044d57e1c92a77f79988d21fa8faf74e97e": "Base Portal",
  "0x99c9fc46f92e8a1c0dec1b1747d010903e884be1": "Optimism Gateway",
  "0x4dbd4fc535ac27206064b68ffcf827b0a60bab3f": "Arbitrum Inbox",

  // ─── Tornado (risk) ───
  "0xd90e2f925da726b50c4ed8d0fb90ad053324f31b": "Tornado Cash",
  "0x722122df12d4e14e13ac3b6895a86e84145b6967": "Tornado Cash Router",

  // ─── WETH ───
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH (Ethereum)",
  "0x4200000000000000000000000000000000000006": "WETH (Base/OP)",
  "0xe91d153e0b41518a2ce8dd3d7944fa863463a97d": "WXDAI (Gnosis)",
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": "WETH (Arbitrum)",

  // ─── Stablecoins ───
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC (Ethereum)",
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC (Base)",
  "0xddafbb505ad214d7b80b1f830fccc89b60fb7a83": "USDC (Gnosis)",
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": "USDC (Arbitrum)",
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT (Ethereum)",

  // ─── Ethereum Mainnet DEX Routers ───
  "0xdef1c0ded9bec7f1a1670819833240f027b25eff": "0x Exchange Proxy",
  "0x881d40237659c251811cec9c364ef91dc08d300c": "Metamask Swap Router",
  "0x3328f7f4a1d1c57c35df56bbf0c9dcafca309c49": "Banana Gun Router",
  "0x80a64c6d7f12c47b7c66c5b4e20e72bc0dbd2e96": "Maestro Router",
  "0x6131b5fae19ea4f9d964eac0408e4408b66337b5": "Kyberswap Aggregator",
  // ─── Ethereum Mainnet Lending ───
  "0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9": "Aave V2 Pool",
  "0x398ec7346dcd622edc5ae82352f02be94c62d119": "Aave V1 Core",
  "0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b": "Compound V2 Comptroller",

  // ─── Ethereum Mainnet NFT ───
  "0x00000000006c3852cbef3e08e8df289169ede581": "Seaport 1.1",
  "0x7f268357a8c2552623316e2562d90e642bb538e5": "OpenSea Wyvern",
  "0x7be8076f4ea4a4ad08075c2508e481d6c946d12b": "OpenSea Wyvern V1",
  "0x59728544b08ab483533076417fbbb2fd0b17ce3a": "LooksRare Exchange",
  "0x74312363e45dcaba76c59ec49a7aa8a65a67eed3": "X2Y2 Exchange",
  "0xb2ecfe4e4d61f8790bbb9de2d1259b9e2410cea5": "Blur Marketplace",

  // ─── MEV Infrastructure ───
  "0xc0a47dfe034b400b47bdad5fecda2621de6c4d95": "Uniswap V1",

  // ─── ENS ───
  "0x283af0b28c62c092c9727f1ee09c02ca627eb7f5": "ENS Registrar Controller",
  "0x57f1887a8bf19b14fc0df6fd9b2acc9af147ea85": "ENS Base Registrar",

  // ─── Maker/DAI ───
  "0x9759a6ac90977b93b58547b4a71c78317f391a28": "MakerDAO DSR",
  "0x6b175474e89094c44da98b954eedeac495271d0f": "DAI Token",

  // ─── Gnosis Chain Protocols ───
  "0x6093aecece4e7aee005fa14375e285a40eb54113": "Agave Lending (Gnosis)",
  "0x2a6c106ae13b558bb9e2ec64bd2f1f7beff3a5e0": "SushiSwap Router (Gnosis)",
};

/**
 * Resolve a contract address to a known protocol name.
 * Returns null if not found in the static registry.
 */
export function resolveProtocolName(address: string): string | null {
  return PROTOCOL_ADDRESSES[address.toLowerCase()] ?? null;
}

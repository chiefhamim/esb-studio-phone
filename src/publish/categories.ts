// The site's story categories and author records.
// Origin: esb-banner-studio src/editorial/siteApi.ts (commit 3884532), ESB_CATEGORIES and ESB_AUTHORS copied unchanged.
// Authors are keyed by the SHA-256 of the account's lower-case email, so no address is stored in this app.

/** Official Category mapping for esbpowerline.com matching public.Category */
export const ESB_CATEGORIES: Record<string, { id: string; slug: string; name: string }> = {
  'Consumers & Tariffs': { id: 'cmqv473nh000avk55ur3yty0p', slug: 'consumers-tariffs', name: 'Consumers & Tariffs' },
  'Distribution & Utilities': { id: 'cmqv473nh0009vk55nefpoof1', slug: 'distribution-utilities', name: 'Distribution & Utilities' },
  'Energy Policy & Regulators': { id: 'cmqv473nh0004vk55oaccbbvz', slug: 'energy-policy-regulators', name: 'Energy Policy & Regulators' },
  'Environment & Efficiency': { id: 'cmqv473nh000dvk55qsg8qbkd', slug: 'environment-efficiency', name: 'Environment & Efficiency' },
  'Fossil Fuels & Commodities': { id: 'cmqv473nh0006vk555w03ngbq', slug: 'fossil-fuels-commodities', name: 'Fossil Fuels & Commodities' },
  'Grid & Transmission': { id: 'cmqv473nh0008vk55hv4ga5ls', slug: 'grid-transmission', name: 'Grid & Transmission' },
  'International & Cross-Border': { id: 'cmqv473nh000cvk559jgrh40y', slug: 'international-cross-border', name: 'International & Cross-Border' },
  'Market, Finance & Subsidies': { id: 'cmqv473nh000bvk55mu43hu0w', slug: 'market-finance-subsidies', name: 'Market, Finance & Subsidies' },
  'Power Generation': { id: 'cmqv473nh0005vk55cyytt3r4', slug: 'power-generation', name: 'Power Generation' },
  'Renewables & Nuclear': { id: 'cmqv473nh0007vk55fyfwonza', slug: 'renewables-nuclear', name: 'Renewables & Nuclear' },
}

export interface SiteAuthor { id: string; name: string; role: string; newsDesk?: boolean }
export const ESB_AUTHORS: Record<string, SiteAuthor> = {
  e0949ef415de7fe4a72e0d9f1c44c59a82c60ef78b35ba8d23b0aa4c4bc4e3f1: { id: 'cmqv471bq0001vk55aw07256e', name: 'Mehedi Hasan Hamim', role: 'EDITOR' },
  '953e07d714089108dd65eefdadeed299cd02803d3c3f639791534107e863c5e1': { id: 'cmqv471700000vk55trr7n8df', name: 'ESB NEWS DESK', role: 'SUPER_ADMIN', newsDesk: true },
  ea3930a44d4f0c5c9c3bc2eff2026969499763aea67c5a4694a45709b83fb9cf: { id: 'cmqv471gb0002vk55sozpxt7p', name: 'Sheikh Rasel', role: 'EDITOR' },
  e2912d649e362102e78c8dd634362e571daddc35ab51ea5f85d1e1ad3c5a8542: { id: 'cmtveuqkv000004jm5sjwsqox', name: 'Faisal Al Mahmud', role: 'EDITOR' },
  '53ab50c34db9e4c1c328cc1feea9313853d6701bd3343ad55b3c01d6ddbdf1d3': { id: 'cmttn1o9s000204igmykknlg9', name: 'Yeasin Fiyaz', role: 'EDITOR' },
}

export async function emailKey(email: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** The site author for a signed-in email, or undefined when the app does not know it. */
export async function authorFor(email: string): Promise<SiteAuthor | undefined> {
  return ESB_AUTHORS[await emailKey(email)]
}

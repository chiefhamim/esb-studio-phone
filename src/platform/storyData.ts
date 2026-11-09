// Pin the article body for sites that ship their story as data (Quintype: Prothom Alo and others).
// Moved into the shared extractor on 2026-11-09 (PC src/editorial/storyData.ts, vendored here as src/pc/editorial/storyData.ts):
// parseArticleDocument now runs it on every page on both apps. fetchGuarded still calls it before handing a page over, which
// is harmless (a pinned page passes through unchanged).
export { pinStoryBody, storyParagraphs } from '../pc/editorial/storyData'

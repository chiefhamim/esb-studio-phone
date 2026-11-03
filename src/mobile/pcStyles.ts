// The PC design system on the phone. Global: fonts + tokens (the same "Quiet Studio" tokens the phone uses).
// Scoped: the PC component stylesheets, wrapped in @scope (.pc-host) by tools/pc-css-scope.ts, so PC components
// mounted inside phone sheets look exactly as on the PC while the phone layout stays the phone's own.
import '../pc/fonts.css'
import '../pc/styles/tokens.css'
import '../pc/styles/base.css'
import '../pc/styles/primitives.css'
import '../pc/App.css'
import '../pc/styles/studio.css'
import '../pc/editorial/editorial.css'
import './pcHost.css'

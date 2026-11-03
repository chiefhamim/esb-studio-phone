import { useState } from 'react'
import {
  TopAppBar,
  BottomNav,
  NavDrawer,
  BottomSheet,
  Button,
  ExtendedFAB,
  StatusChip,
  SelectSheet
} from './index'
import { IconPlus, IconTrash } from '../../shell/icons'
import type { Tab } from '../../shell/Nav'
import type { ThemePref } from '../../shell/theme'

export function Gallery() {
  const [tab, setTab] = useState<Tab>('stories')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectOpen, setSelectOpen] = useState(false)
  const [selectedCat, setSelectedCat] = useState<string | null>('power')
  const [themePref, setThemePref] = useState<ThemePref>('auto')

  const cycleTheme = () => {
    const next: ThemePref = themePref === 'auto' ? 'light' : themePref === 'light' ? 'dark' : 'auto'
    setThemePref(next)
    document.documentElement.setAttribute('data-theme', next === 'dark' ? 'dark' : 'light')
  }

  const sampleCategories = [
    { id: 'power', label: 'Power Generation', description: 'Thermal, nuclear, grid infrastructure', color: '#00875a' },
    { id: 'renewable', label: 'Renewable Energy', description: 'Solar, wind, hydro, bio-energy', color: '#ffab00' },
    { id: 'oil-gas', label: 'Oil & Gas', description: 'Exploration, LNG, refining, distribution', color: '#ff5630' },
    { id: 'policy', label: 'Energy Policy', description: 'Regulations, BERC, tariffs, ministry', color: '#6554c0' }
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--surface-app)' }}>
      <TopAppBar
        title="UI Component Gallery"
        subtitle="ESB Studio Phone Design Kit"
        onOpenDrawer={() => setDrawerOpen(true)}
        onOpenSettings={() => setSheetOpen(true)}
        onCycleTheme={cycleTheme}
        themePref={themePref}
        ai={true}
        aiLabel="Gemini"
      />

      <main style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
        <section>
          <h2 style={{ font: 'var(--t-title)', margin: '0 0 var(--sp-3)' }}>Buttons (48 dp touch target)</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
            <Button variant="primary">Primary</Button>
            <Button variant="tonal">Tonal</Button>
            <Button variant="outlined">Outlined</Button>
            <Button variant="danger" leading={<IconTrash />}>Danger</Button>
            <Button variant="primary" disabled>Disabled</Button>
          </div>
        </section>

        <section>
          <h2 style={{ font: 'var(--t-title)', margin: '0 0 var(--sp-3)' }}>Status Chips</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
            <StatusChip status="draft" label="Draft" />
            <StatusChip status="translated" label="Translated" />
            <StatusChip status="ready" label="Ready to Publish" />
            <StatusChip status="warn" label="Review Blockers" />
          </div>
        </section>

        <section>
          <h2 style={{ font: 'var(--t-title)', margin: '0 0 var(--sp-3)' }}>Text Inputs & Textareas</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            <div className="kit-field">
              <label className="kit-field-label">Headline (English)</label>
              <input type="text" className="kit-input" placeholder="Enter headline..." defaultValue="BPDB Signs 50MW Solar Deal in Cox’s Bazar" />
            </div>

            <div className="kit-field">
              <label className="kit-field-label">Article Text (Bangla - Hind Siliguri 1.6 lh)</label>
              <textarea
                className="kit-textarea"
                lang="bn"
                rows={4}
                defaultValue="কক্সবাজারে ৫০ মেগাওয়াট সৌর বিদ্যুৎ কেন্দ্র নির্মাণে বাংলাদেশ বিদ্যুৎ উন্নয়ন বোর্ড (বিপিডিবি) এবং একটি বেসরকারি কনসোর্টিয়ামের মধ্যে চুক্তি স্বাক্ষরিত হয়েছে।"
              />
            </div>
          </div>
        </section>

        <section>
          <h2 style={{ font: 'var(--t-title)', margin: '0 0 var(--sp-3)' }}>Sheets & Pickers</h2>
          <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
            <Button variant="tonal" onClick={() => setSheetOpen(true)}>Open Modal Bottom Sheet</Button>
            <Button variant="outlined" onClick={() => setSelectOpen(true)}>Category Sheet Picker</Button>
          </div>
        </section>
      </main>

      <ExtendedFAB
        icon={<IconPlus />}
        label="New Story"
        onClick={() => setSheetOpen(true)}
      />

      <BottomNav
        tab={tab}
        onTab={setTab}
        badges={{ edit: 2 }}
      />

      <NavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeTab={tab}
        onSelectTab={setTab}
        onOpenSettings={() => setSheetOpen(true)}
      />

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Modal Bottom Sheet"
      >
        <p style={{ margin: '0 0 var(--sp-4)', color: 'var(--text-secondary)' }}>
          This is an Android-native bottom sheet with smooth spring transition, drag handle, backdrop blur scrim, and full safe-area insetting.
        </p>
        <Button variant="primary" style={{ width: '100%' }} onClick={() => setSheetOpen(false)}>
          Done
        </Button>
      </BottomSheet>

      <SelectSheet
        open={selectOpen}
        onClose={() => setSelectOpen(false)}
        title="Select Category"
        options={sampleCategories}
        selectedId={selectedCat}
        onSelect={(id) => setSelectedCat(id)}
      />
    </div>
  )
}

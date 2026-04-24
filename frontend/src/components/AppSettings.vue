<script lang="ts" setup>
import { ref } from 'vue'
import {
  Settings,
  Type,
  GitBranch,
  Info,
  ChevronDown,
  ArrowLeft,
} from 'lucide-vue-next'
import { useNavigation } from '../composables/useNavigation'
import { useSettings } from '../composables/useSettings'

const { navigateTo } = useNavigation()

type SettingsSection = 'general' | 'editor' | 'git' | 'about'

const activeSection = ref<SettingsSection>('general')

interface NavItem {
  key: SettingsSection
  label: string
  icon: typeof Settings
}

const navItems: NavItem[] = [
  { key: 'general', label: 'General', icon: Settings },
  { key: 'editor', label: 'Editor', icon: Type },
  { key: 'git', label: 'Git', icon: GitBranch },
  { key: 'about', label: 'About', icon: Info },
]

const theme = ref<'light' | 'dark'>('light')
const language = ref('en')
const { autoSave, autoSaveDelay } = useSettings()
const fontFamily = ref('Inter')
const fontSize = ref(16)
const tabSize = ref(2)
const lineNumbers = ref(true)
const wordWrap = ref(true)
const defaultBranch = ref('main')
const autoCommit = ref(false)
const autoPull = ref(false)
</script>

<template>
  <div class="settings">
    <aside class="settings-nav">
      <div class="nav-header">
        <span class="nav-title">Settings</span>
      </div>
      <div class="nav-divider" />
      <div class="nav-list">
        <button
          v-for="item in navItems"
          :key="item.key"
          class="nav-item"
          :class="{ active: activeSection === item.key }"
          @click="activeSection = item.key"
        >
          <component :is="item.icon" :size="16" class="nav-item-icon" />
          <span class="nav-item-text">{{ item.label }}</span>
        </button>
      </div>
      <div class="nav-spacer" />
      <div class="nav-back-divider" />
      <div class="nav-back-wrap">
        <button class="nav-back" @click="navigateTo('editor')">
          <ArrowLeft :size="20" />
        </button>
      </div>
    </aside>

    <div class="settings-content">
      <div class="content-scroll">
        <!-- General -->
        <template v-if="activeSection === 'general'">
          <h1 class="section-title">General</h1>

          <div class="settings-group">
            <span class="group-label">Appearance</span>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Theme</span>
                <span class="setting-desc">Choose between light and dark mode</span>
              </div>
              <div class="theme-selector">
                <button
                  class="theme-btn"
                  :class="{ active: theme === 'light' }"
                  @click="theme = 'light'"
                >
                  Light
                </button>
                <button
                  class="theme-btn"
                  :class="{ active: theme === 'dark' }"
                  @click="theme = 'dark'"
                >
                  Dark
                </button>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Language</span>
                <span class="setting-desc">Choose the display language</span>
              </div>
              <div class="select-value">
                <span>{{ language === 'en' ? 'English' : '中文' }}</span>
                <ChevronDown :size="12" />
              </div>
            </div>
          </div>

          <div class="settings-group">
            <span class="group-label">SAVING</span>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Auto Save</span>
                <span class="setting-desc">Automatically save changes to files</span>
              </div>
              <button
                class="toggle"
                :class="{ on: autoSave }"
                @click="autoSave = !autoSave"
              >
                <span class="toggle-thumb" />
              </button>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Auto Save Delay</span>
                <span class="setting-desc">Time in seconds before auto save triggers</span>
              </div>
              <div class="input-value wide">
                {{ autoSaveDelay }}s
              </div>
            </div>
          </div>
        </template>

        <!-- Editor -->
        <template v-if="activeSection === 'editor'">
          <h1 class="section-title">Editor</h1>

          <div class="settings-group">
            <span class="group-label">FONT</span>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Font Family</span>
                <span class="setting-desc">Set the editor font family</span>
              </div>
              <div class="select-value">
                <span>{{ fontFamily }}</span>
                <ChevronDown :size="12" />
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Font Size</span>
                <span class="setting-desc">Set the editor font size in pixels</span>
              </div>
              <div class="input-value">{{ fontSize }}</div>
            </div>
          </div>

          <div class="settings-group">
            <span class="group-label">DISPLAY</span>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Tab Size</span>
                <span class="setting-desc">Number of spaces per tab</span>
              </div>
              <div class="input-value">{{ tabSize }}</div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Line Numbers</span>
                <span class="setting-desc">Show line numbers in the editor gutter</span>
              </div>
              <button
                class="toggle"
                :class="{ on: lineNumbers }"
                @click="lineNumbers = !lineNumbers"
              >
                <span class="toggle-thumb" />
              </button>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Word Wrap</span>
                <span class="setting-desc">Wrap long lines to fit the editor width</span>
              </div>
              <button
                class="toggle"
                :class="{ on: wordWrap }"
                @click="wordWrap = !wordWrap"
              >
                <span class="toggle-thumb" />
              </button>
            </div>
          </div>
        </template>

        <!-- Git -->
        <template v-if="activeSection === 'git'">
          <h1 class="section-title">Git</h1>

          <div class="settings-group">
            <span class="group-label">VERSION CONTROL</span>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Default Branch</span>
                <span class="setting-desc">Default branch name for new repositories</span>
              </div>
              <div class="select-value mono">
                <span>{{ defaultBranch }}</span>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Auto Commit</span>
                <span class="setting-desc">Automatically commit changes on save</span>
              </div>
              <button
                class="toggle"
                :class="{ on: autoCommit }"
                @click="autoCommit = !autoCommit"
              >
                <span class="toggle-thumb" />
              </button>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Auto Pull</span>
                <span class="setting-desc">Automatically pull changes on startup</span>
              </div>
              <button
                class="toggle"
                :class="{ on: autoPull }"
                @click="autoPull = !autoPull"
              >
                <span class="toggle-thumb" />
              </button>
            </div>
          </div>
        </template>

        <!-- About -->
        <template v-if="activeSection === 'about'">
          <h1 class="section-title">About</h1>

          <div class="settings-group">
            <span class="group-label">INFORMATION</span>
            <div class="about-card">
              <div class="about-header">
                <span class="about-name">MindStack</span>
                <span class="about-version">v0.1.0</span>
              </div>
              <div class="about-sep" />
              <p class="about-desc">
                A developer-focused markdown editor with git sync.
              </p>
              <p class="about-build">
                Built with Wails, Vue 3 and Go.
              </p>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* Settings Nav */
.settings-nav {
  width: 220px;
  background-color: var(--surface-secondary);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  user-select: none;
  flex-shrink: 0;
}

.nav-header {
  height: 48px;
  padding: 0 20px;
  display: flex;
  align-items: center;
}

.nav-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--foreground-primary);
}

.nav-divider {
  height: 1px;
  background-color: var(--border-subtle);
}

.nav-list {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  height: 32px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--foreground-secondary);
  font-family: var(--font-sans);
  font-size: 13px;
}

.nav-item:hover {
  background-color: var(--surface-hover);
}

.nav-item.active {
  background-color: var(--accent-primary);
  color: var(--foreground-inverse);
}

.nav-item.active .nav-item-icon {
  color: var(--foreground-inverse);
}

.nav-item-icon {
  flex-shrink: 0;
  color: var(--foreground-tertiary);
}

.nav-item-text {
  line-height: 1;
}

.nav-spacer {
  flex: 1;
}

.nav-back-divider {
  height: 1px;
  background-color: var(--border-subtle);
}

.nav-back-wrap {
  padding: 8px;
}

.nav-back {
  width: 100%;
  height: 32px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--foreground-secondary);
}

.nav-back:hover {
  background-color: var(--surface-hover);
}

/* Settings Content */
.settings-content {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.content-scroll {
  height: 100%;
  overflow-y: auto;
  padding: 32px 48px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.section-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--foreground-primary);
}

.settings-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.group-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--foreground-tertiary);
  letter-spacing: 0.5px;
}

/* Setting Row */
.setting-row {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 16px;
  background-color: var(--surface-secondary);
  border-radius: 6px;
  border: 1px solid var(--border-subtle);
}

.setting-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.setting-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--foreground-primary);
}

.setting-desc {
  font-size: 12px;
  color: var(--foreground-tertiary);
}

/* Toggle */
.toggle {
  width: 36px;
  height: 20px;
  border-radius: 10px;
  border: none;
  background-color: var(--surface-active);
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
  padding: 2px;
  transition: background-color 0.15s;
}

.toggle.on {
  background-color: var(--accent-primary);
}

.toggle-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: var(--foreground-inverse);
  display: block;
  transition: transform 0.15s;
}

.toggle.on .toggle-thumb {
  transform: translateX(16px);
}

/* Theme Selector */
.theme-selector {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  margin-left: 8px;
}

.theme-btn {
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: 4px;
  background: none;
  font-family: var(--font-sans);
  font-size: 12px;
  cursor: pointer;
  color: var(--foreground-secondary);
}

.theme-btn.active {
  background-color: var(--accent-primary);
  color: var(--foreground-inverse);
  font-weight: 500;
}

/* Input / Select values */
.input-value {
  width: 48px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 1px solid var(--border-strong);
  font-size: 12px;
  color: var(--foreground-secondary);
  flex-shrink: 0;
}

.input-value.mono {
  width: auto;
  padding: 0 10px;
  font-family: var(--font-mono);
}

.input-value.wide {
  width: 72px;
  font-family: var(--font-sans);
}

.select-value {
  height: 28px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  border-radius: 4px;
  border: 1px solid var(--border-strong);
  font-size: 12px;
  color: var(--foreground-secondary);
  flex-shrink: 0;
}

.select-value.mono {
  font-family: var(--font-mono);
}

/* About Card */
.about-card {
  padding: 20px;
  background-color: var(--surface-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.about-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.about-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground-primary);
}

.about-version {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--foreground-tertiary);
}

.about-sep {
  height: 1px;
  background-color: var(--border-subtle);
}

.about-desc {
  font-size: 13px;
  color: var(--foreground-secondary);
  line-height: 1.5;
}

.about-build {
  font-size: 12px;
  color: var(--foreground-tertiary);
  line-height: 1.5;
}
</style>

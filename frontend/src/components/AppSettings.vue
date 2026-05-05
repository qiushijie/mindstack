<script lang="ts" setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Settings,
  Type,
  Sparkles,
  GitBranch,
  ChevronDown,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Search,
  X,
} from 'lucide-vue-next'
import { useSettings, applyTheme, SUPPORTED_MODELS } from '../composables/useSettings'
import type { SupportedModel, UIPlatform } from '../composables/useSettings'
import type { Locale } from '../i18n'

const { t } = useI18n()

const searchQuery = ref('')

function matchSearch(text: string): boolean {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return true
  return text.toLowerCase().includes(q)
}

const generalKeywords = computed(() => [
  t('settings.section.general'),
  t('settings.group.appearance'),
  t('settings.label.theme'),
  t('settings.desc.theme'),
  t('settings.theme.light'),
  t('settings.theme.dark'),
  t('settings.label.language'),
  t('settings.desc.language'),
  t('settings.group.saving'),
  t('settings.label.autoSave'),
  t('settings.desc.autoSave'),
  t('settings.label.autoSaveDelay'),
  t('settings.desc.autoSaveDelay'),
].join(' '))

const editorKeywords = computed(() => [
  t('settings.section.editor'),
  t('settings.group.font'),
  t('settings.label.fontFamily'),
  t('settings.desc.fontFamily'),
  t('settings.label.fontSize'),
  t('settings.desc.fontSize'),
  t('settings.group.display'),
  t('settings.label.tabSize'),
  t('settings.desc.tabSize'),
  t('settings.label.lineNumbers'),
  t('settings.desc.lineNumbers'),
  t('settings.label.wordWrap'),
  t('settings.desc.wordWrap'),
].join(' '))

const modelKeywords = computed(() => [
  t('settings.section.model'),
  t('settings.group.aiModels'),
  t('settings.model.apiUrl'),
  t('settings.model.apiUrlPlaceholder'),
  t('settings.model.apiKey'),
  t('settings.model.apiKeyPlaceholder'),
  t('settings.model.active'),
  t('settings.model.inactive'),
  t('settings.model.add'),
].join(' '))

const gitKeywords = computed(() => [
  t('settings.section.git'),
  t('settings.group.versionControl'),
  t('settings.label.defaultBranch'),
  t('settings.desc.defaultBranch'),
  t('settings.label.autoCommit'),
  t('settings.desc.autoCommit'),
  t('settings.label.autoPull'),
  t('settings.desc.autoPull'),
].join(' '))

const debugKeywords = computed(() => [
  t('settings.section.debug'),
  t('settings.group.debug'),
  t('settings.label.platform'),
  t('settings.desc.platform'),
  t('settings.platform.macos'),
  t('settings.platform.windows'),
].join(' '))

const { autoSave, autoSaveDelay, locale, theme, models, activeModelId, showKeyIds, platform, uiPlatform, debugMode, defaultBranch, autoCommit, autoPull, saveSettings, addModel, removeModel, activateModel, toggleShowKey } = useSettings()
const fontFamily = ref('Inter')
const fontSize = ref(16)
const tabSize = ref(2)
const lineNumbers = ref(true)
const wordWrap = ref(true)

const searchFocused = ref(false)
const langOpen = ref(false)
const modelDropdownOpen = ref('')

function toggleModelDropdown(id: string) {
  modelDropdownOpen.value = modelDropdownOpen.value === id ? '' : id
}

function selectModelCardModel(id: string, value: string) {
  const item = models.value.find(m => m.id === id)
  if (item) item.model = value as SupportedModel
  modelDropdownOpen.value = ''
  saveSettings()
}

function getModelLabel(model: string): string {
  return SUPPORTED_MODELS.find(m => m.value === model)?.label ?? model
}

const locales: { key: Locale; labelKey: string }[] = [
  { key: 'en', labelKey: 'settings.langName.en' },
  { key: 'zh', labelKey: 'settings.langName.zh' },
  { key: 'ja', labelKey: 'settings.langName.ja' },
  { key: 'fr', labelKey: 'settings.langName.fr' },
  { key: 'de', labelKey: 'settings.langName.de' },
  { key: 'es', labelKey: 'settings.langName.es' },
  { key: 'ru', labelKey: 'settings.langName.ru' },
  { key: 'ko', labelKey: 'settings.langName.ko' },
]

async function selectLocale(key: Locale) {
  locale.value = key
  langOpen.value = false
  await saveSettings()
}
</script>

<template>
  <div class="settings">
    <div class="settings-content">
      <div class="content-scroll">
        <div class="settings-search-box" :class="{ focused: searchFocused }">
          <Search :size="14" class="settings-search-icon" />
          <input
            v-model="searchQuery"
            type="text"
            class="settings-search-input"
            :placeholder="t('settings.searchPlaceholder')"
            @focus="searchFocused = true"
            @blur="searchFocused = false"
          />
          <button v-if="searchQuery" class="settings-search-clear" @click="searchQuery = ''">
            <X :size="14" />
          </button>
        </div>

        <!-- General -->
        <div v-show="matchSearch(generalKeywords)" class="settings-section">
          <h1 class="section-title">{{ t('settings.section.general') }}</h1>

          <div class="settings-group">
            <span class="group-label">{{ t('settings.group.appearance') }}</span>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">{{ t('settings.label.theme') }}</span>
                <span class="setting-desc">{{ t('settings.desc.theme') }}</span>
              </div>
              <div class="theme-selector">
                <button
                  class="theme-btn"
                  :class="{ active: theme === 'light' }"
                  @click="theme = 'light'; applyTheme('light')"
                >
                  {{ t('settings.theme.light') }}
                </button>
                <button
                  class="theme-btn"
                  :class="{ active: theme === 'dark' }"
                  @click="theme = 'dark'; applyTheme('dark')"
                >
                  {{ t('settings.theme.dark') }}
                </button>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">{{ t('settings.label.language') }}</span>
                <span class="setting-desc">{{ t('settings.desc.language') }}</span>
              </div>
              <div class="select-dropdown" :class="{ open: langOpen }">
                <button class="select-value" @click="langOpen = !langOpen">
                  <span>{{ t(`settings.langName.${locale}`) }}</span>
                  <ChevronDown :size="12" />
                </button>
                <div v-if="langOpen" class="dropdown-menu">
                  <button
                    v-for="item in locales"
                    :key="item.key"
                    class="dropdown-item"
                    :class="{ active: locale === item.key }"
                    @click="selectLocale(item.key)"
                  >
                    {{ t(item.labelKey) }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="settings-group">
            <span class="group-label">{{ t('settings.group.saving') }}</span>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">{{ t('settings.label.autoSave') }}</span>
                <span class="setting-desc">{{ t('settings.desc.autoSave') }}</span>
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
                <span class="setting-label">{{ t('settings.label.autoSaveDelay') }}</span>
                <span class="setting-desc">{{ t('settings.desc.autoSaveDelay') }}</span>
              </div>
              <div class="input-value wide">
                {{ autoSaveDelay }}s
              </div>
            </div>
          </div>
        </div>

        <!-- Editor -->
        <div v-show="matchSearch(editorKeywords)" class="settings-section">
          <h1 class="section-title">{{ t('settings.section.editor') }}</h1>

          <div class="settings-group">
            <span class="group-label">{{ t('settings.group.font') }}</span>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">{{ t('settings.label.fontFamily') }}</span>
                <span class="setting-desc">{{ t('settings.desc.fontFamily') }}</span>
              </div>
              <div class="select-value">
                <span>{{ fontFamily }}</span>
                <ChevronDown :size="12" />
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">{{ t('settings.label.fontSize') }}</span>
                <span class="setting-desc">{{ t('settings.desc.fontSize') }}</span>
              </div>
              <div class="input-value">{{ fontSize }}</div>
            </div>
          </div>

          <div class="settings-group">
            <span class="group-label">{{ t('settings.group.display') }}</span>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">{{ t('settings.label.tabSize') }}</span>
                <span class="setting-desc">{{ t('settings.desc.tabSize') }}</span>
              </div>
              <div class="input-value">{{ tabSize }}</div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">{{ t('settings.label.lineNumbers') }}</span>
                <span class="setting-desc">{{ t('settings.desc.lineNumbers') }}</span>
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
                <span class="setting-label">{{ t('settings.label.wordWrap') }}</span>
                <span class="setting-desc">{{ t('settings.desc.wordWrap') }}</span>
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
        </div>

        <!-- Model -->
        <div v-show="matchSearch(modelKeywords)" class="settings-section">
          <h1 class="section-title">{{ t('settings.section.model') }}</h1>

          <div class="settings-group">
            <span class="group-label">{{ t('settings.group.aiModels') }}</span>

            <div
              v-for="model in models"
              :key="model.id"
              class="model-card"
              :class="{ active: model.id === activeModelId }"
            >
              <div class="model-header">
                <div class="select-dropdown model-select" :class="{ open: modelDropdownOpen === model.id }">
                  <button class="select-value" @click="toggleModelDropdown(model.id)">
                    <span>{{ getModelLabel(model.model) }}</span>
                    <ChevronDown :size="12" />
                  </button>
                  <div v-if="modelDropdownOpen === model.id" class="dropdown-menu">
                    <button
                      v-for="m in SUPPORTED_MODELS"
                      :key="m.value"
                      class="dropdown-item"
                      :class="{ active: model.model === m.value }"
                      @click="selectModelCardModel(model.id, m.value)"
                    >
                      {{ m.label }}
                    </button>
                  </div>
                </div>
                <div v-if="model.id === activeModelId" class="model-active-badge">
                  <span class="active-dot" />
                  <span class="active-text">{{ t('settings.model.active') }}</span>
                </div>
                <div v-else class="model-inactive-badge" @click="activateModel(model.id)">
                  <span class="inactive-dot" />
                  <span class="inactive-text">{{ t('settings.model.inactive') }}</span>
                </div>
              </div>
              <div class="model-divider" />
              <div class="model-api-row">
                <span class="api-row-label">{{ t('settings.model.apiUrl') }}</span>
                <input
                  v-model="model.apiUrl"
                  class="api-row-input"
                  :placeholder="t('settings.model.apiUrlPlaceholder')"
                  @change="saveSettings"
                  @keydown.enter="saveSettings"
                />
              </div>
              <div class="model-api-key-row">
                <span class="api-key-label">{{ t('settings.model.apiKey') }}</span>
                <input
                  v-model="model.apiKey"
                  :type="showKeyIds.has(model.id) ? 'text' : 'password'"
                  class="api-key-input"
                  :placeholder="t('settings.model.apiKeyPlaceholder')"
                  @change="saveSettings"
                  @keydown.enter="saveSettings"
                />
                <button class="icon-btn" @click="toggleShowKey(model.id)">
                  <Eye v-if="!showKeyIds.has(model.id)" :size="16" />
                  <EyeOff v-else :size="16" />
                </button>
                <button class="icon-btn delete" @click="removeModel(model.id)">
                  <Trash2 :size="16" />
                </button>
              </div>
            </div>

            <button class="add-model-btn" @click="addModel">
              <Plus :size="16" />
              <span>{{ t('settings.model.add') }}</span>
            </button>
          </div>
        </div>

        <!-- Git -->
        <div v-show="matchSearch(gitKeywords)" class="settings-section">
          <h1 class="section-title">{{ t('settings.section.git') }}</h1>

          <div class="settings-group">
            <span class="group-label">{{ t('settings.group.versionControl') }}</span>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">{{ t('settings.label.defaultBranch') }}</span>
                <span class="setting-desc">{{ t('settings.desc.defaultBranch') }}</span>
              </div>
              <div class="select-value mono">
                <span>{{ defaultBranch }}</span>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">{{ t('settings.label.autoCommit') }}</span>
                <span class="setting-desc">{{ t('settings.desc.autoCommit') }}</span>
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
                <span class="setting-label">{{ t('settings.label.autoPull') }}</span>
                <span class="setting-desc">{{ t('settings.desc.autoPull') }}</span>
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
        </div>

        <!-- Debug -->
        <div v-if="debugMode" v-show="matchSearch(debugKeywords)" class="settings-section">
          <h1 class="section-title">{{ t('settings.section.debug') }}</h1>

          <div class="settings-group">
            <span class="group-label">{{ t('settings.group.debug') }}</span>
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">{{ t('settings.label.platform') }}</span>
                <span class="setting-desc">{{ t('settings.desc.platform') }} ({{ t('settings.actualPlatform') }}: {{ platform }})</span>
              </div>
              <div class="theme-selector">
                <button
                  class="theme-btn"
                  :class="{ active: uiPlatform === 'macos' }"
                  @click="uiPlatform = 'macos'"
                >
                  {{ t('settings.platform.macos') }}
                </button>
                <button
                  class="theme-btn"
                  :class="{ active: uiPlatform === 'windows' }"
                  @click="uiPlatform = 'windows'"
                >
                  {{ t('settings.platform.windows') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
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

.settings-search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 6px;
  background-color: var(--surface-secondary);
  border: 1px solid var(--border-subtle);
  width: 200px;
  align-self: flex-end;
  flex-shrink: 0;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.settings-search-box.focused {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 1px var(--accent-primary);
}

.settings-search-icon {
  color: var(--foreground-tertiary);
  flex-shrink: 0;
}

.settings-search-input {
  flex: 1;
  border: none;
  background: none;
  outline: none;
  font-size: 13px;
  color: var(--foreground-primary);
  font-family: var(--font-sans);
  min-width: 0;
}

.settings-search-input::placeholder {
  color: var(--foreground-tertiary);
}

.settings-search-clear {
  border: none;
  background: none;
  cursor: pointer;
  color: var(--foreground-tertiary);
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.settings-search-clear:hover {
  color: var(--foreground-secondary);
}

.settings-section {
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

/* Select Dropdown */
.select-dropdown {
  position: relative;
  flex-shrink: 0;
}

.select-dropdown .select-value {
  cursor: pointer;
  background: none;
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 120px;
  background-color: var(--surface-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  padding: 4px;
  z-index: 100;
}

.dropdown-item {
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 4px;
  background: none;
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--foreground-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  text-align: left;
}

.dropdown-item:hover {
  background-color: var(--surface-hover);
}

.dropdown-item.active {
  color: var(--accent-primary);
  font-weight: 500;
}

/* Model Card */
.model-card {
  padding: 20px;
  background-color: var(--surface-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.model-card.active {
  border-color: var(--accent-primary);
}

.model-header {
  display: flex;
  align-items: center;
}

.model-select {
  flex: 1;
  min-width: 0;
}

.model-select .select-value {
  background: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  padding: 2px 4px;
}

.model-select .dropdown-menu {
  right: auto;
  left: 0;
  min-width: 180px;
}

.model-active-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.active-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #22c55e;
}

.active-text {
  font-size: 12px;
  font-weight: 500;
  color: #22c55e;
}

.model-inactive-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  cursor: pointer;
}

.inactive-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--foreground-tertiary);
}

.inactive-text {
  font-size: 12px;
  color: var(--foreground-tertiary);
}

.model-divider {
  height: 1px;
  background-color: var(--border-subtle);
}

.model-api-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.api-row-label {
  font-size: 13px;
  color: var(--foreground-secondary);
  flex-shrink: 0;
}

.api-row-input {
  flex: 1;
  border: none;
  background: none;
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--foreground-secondary);
  outline: none;
  padding: 2px 4px;
  border-radius: 4px;
  min-width: 0;
}

.api-row-input:focus {
  background-color: var(--surface-primary);
  box-shadow: 0 0 0 1px var(--border-strong);
}

.api-row-input::placeholder {
  color: var(--foreground-tertiary);
}

.model-api-key-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.api-key-label {
  font-size: 13px;
  color: var(--foreground-secondary);
  flex-shrink: 0;
}

.api-key-input {
  flex: 1;
  border: none;
  background: none;
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--foreground-secondary);
  outline: none;
  padding: 2px 4px;
  border-radius: 4px;
  min-width: 0;
}

.api-key-input:focus {
  background-color: var(--surface-primary);
  box-shadow: 0 0 0 1px var(--border-strong);
}

.api-key-input::placeholder {
  color: var(--foreground-tertiary);
}

.icon-btn {
  border: none;
  background: none;
  cursor: pointer;
  color: var(--foreground-tertiary);
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 4px;
}

.icon-btn:hover {
  color: var(--foreground-secondary);
  background-color: var(--surface-hover);
}

.icon-btn.delete:hover {
  color: #ef4444;
}

.add-model-btn {
  width: 100%;
  height: 40px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  color: var(--foreground-tertiary);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
}

.add-model-btn:hover {
  background-color: var(--surface-secondary);
  color: var(--foreground-secondary);
}
</style>

<template>
  <div class="skills-page">
    <section class="skill-hero">
      <header class="skill-hero-header">
        <div>
          <span class="hero-kicker">技能 Workspace</span>
          <h1>技能工作台</h1>
          <p>把高层 workflow / prompt 资产挂到当前会话，不再把编排逻辑散落在聊天输入里。</p>
        </div>
        <div class="hero-actions">
          <button
            type="button"
            class="hero-button icon-only"
            title="刷新目录"
            :disabled="refreshing"
            @click="refreshAll()"
          >
            <Icon :icon="refreshBold" class="hero-button-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="hero-button secondary icon-only"
            title="清空当前会话"
            :disabled="!chat.currentConversationId || activeCount === 0"
            @click="clearConversationSkills()"
          >
            <Icon :icon="trashBinMinimalisticBold" class="hero-button-icon" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div class="overview-grid">
        <article class="overview-card accent">
          <span class="overview-label">技能总数</span>
          <strong>{{ totalCount }}</strong>
          <p>来自项目本地或用户目录的 `SKILL.md` 资产。</p>
        </article>
        <article class="overview-card warning">
          <span class="overview-label">当前会话已激活</span>
          <strong>{{ activeCount }}</strong>
          <p>会话级激活后，会在模型调用前统一注入提示和工具策略。</p>
        </article>
        <article class="overview-card neutral">
          <span class="overview-label">技能包</span>
          <strong>{{ packageCount }}</strong>
          <p>其中 {{ restrictedCount }} 个还声明了工具 allow / deny 策略。</p>
        </article>
        <article class="overview-card warning">
          <span class="overview-label">本地脚本信任</span>
          <strong>{{ scriptCapableCount }}</strong>
          <p>这些技能在当前会话激活后，允许通过统一技能工具执行本地脚本。</p>
        </article>
      </div>
    </section>

    <p v-if="error" class="page-banner error">{{ error }}</p>

    <div class="skills-layout">
      <SkillsList
        v-model="selectedSkillIdModel"
        v-model:search-keyword="searchKeyword"
        :skills="filteredSkills"
        :loading="loading"
        :active-skill-ids="conversationSkillState?.activeSkillIds ?? []"
        :mutating-skill-id="mutatingSkillId"
        :current-conversation-id="chat.currentConversationId"
        @toggle-skill="toggleSkill"
      />

      <div class="skill-detail-column">
        <SkillDetailPanel
          :skill="selectedSkill"
          :conversation-id="chat.currentConversationId"
          :conversation-skill-state="conversationSkillState"
          :mutating-skill-id="mutatingSkillId"
          @toggle-skill="toggleSkill"
          @update-trust-level="handleSkillTrustLevelUpdate"
        />
        <ToolGovernancePanel
          source-id="active-packages"
          source-kind="skill"
          title="技能工具治理"
          description="管理 `Active Skill Packages` 这一条技能工具源的启用状态和治理动作。"
          :show-source-list="false"
          empty-title="当前没有技能工具源"
          empty-description="当会话技能包加载后，这里会展示资产读取与脚本执行工具。"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import trashBinMinimalisticBold from '@iconify-icons/solar/trash-bin-minimalistic-bold'
import type { SkillTrustLevel } from '@garlic-claw/shared'
import SkillDetailPanel from '@/features/skills/components/SkillDetailPanel.vue'
import SkillsList from '@/features/skills/components/SkillsList.vue'
import { useSkillManagement } from '@/features/skills/composables/use-skill-management'
import ToolGovernancePanel from '@/features/tools/components/ToolGovernancePanel.vue'
import { useChatStore } from '@/features/chat/store/chat'

const chat = useChatStore()
const {
  loading,
  refreshing,
  error,
  mutatingSkillId,
  searchKeyword,
  filteredSkills,
  selectedSkillId,
  selectedSkill,
  conversationSkillState,
  totalCount,
  activeCount,
  restrictedCount,
  packageCount,
  scriptCapableCount,
  selectSkill,
  toggleSkill,
  clearConversationSkills,
  updateSkillGovernance,
  refreshAll,
} = useSkillManagement(chat)

const selectedSkillIdModel = computed({
  get: () => selectedSkillId.value,
  set: (nextSkillId: string | null) => {
    if (!nextSkillId) {
      selectedSkillId.value = null
      return
    }

    selectSkill(nextSkillId)
  },
})

function handleSkillTrustLevelUpdate(payload: {
  skillId: string
  trustLevel: SkillTrustLevel
}) {
  void updateSkillGovernance(payload.skillId, {
    trustLevel: payload.trustLevel,
  })
}
</script>

<style src="./skills-view.css"></style>

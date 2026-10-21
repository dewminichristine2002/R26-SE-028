const supportDirectiveMap = {
  anxiety: {
    activityKey: 'sensory_breathing_guide',
    tier1Audio: 'Let us take a slow breath together and focus on one calm memory.',
    tier2Module: 'sensory_breathing_guide',
    tier3UiTheme: 'CALM_PASTEL_BLUE',
  },
  cognitive_fog: {
    activityKey: 'memory_puzzle',
    tier1Audio: 'It is okay to take your time. Let us try one gentle memory activity together.',
    tier2Module: 'memory_puzzle',
    tier3UiTheme: 'CALM_PASTEL_BLUE',
  },
  sadness: {
    activityKey: 'relaxing_music',
    tier1Audio: 'That sounds like a tender memory. Let us listen to something gentle and comforting.',
    tier2Module: 'relaxing_music',
    tier3UiTheme: 'WARM_AMBER',
  },
  loneliness: {
    activityKey: 'conversation_prompt',
    tier1Audio: 'You are being heard. Let us continue with a warm memory or someone meaningful to you.',
    tier2Module: 'conversation_prompt',
    tier3UiTheme: 'WARM_AMBER',
  },
  happiness: {
    activityKey: 'positive_journal',
    tier1Audio: 'That is a good memory to keep. Let us save one positive thought from it.',
    tier2Module: 'positive_journal',
    tier3UiTheme: 'SOFT_GREEN',
  },
  neutral: {
    activityKey: 'standard_menu',
    tier1Audio: 'Thank you for sharing. You can choose a simple activity for today.',
    tier2Module: 'standard_menu',
    tier3UiTheme: 'DEFAULT',
  },
  anger: {
    activityKey: 'sensory_breathing_guide',
    tier1Audio: 'Let us pause for a moment and take a steady breath before continuing.',
    tier2Module: 'sensory_breathing_guide',
    tier3UiTheme: 'CALM_PASTEL_BLUE',
  },
};

function getSupportDirective(detectedEmotionalState) {
  const selected = supportDirectiveMap[detectedEmotionalState] || supportDirectiveMap.neutral;

  return {
    supportActivityKey: selected.activityKey,
    supportDirective: {
      tier_1_audio: selected.tier1Audio,
      tier_2_module: selected.tier2Module,
      tier_3_ui_theme: selected.tier3UiTheme,
    },
  };
}

module.exports = {
  getSupportDirective,
};

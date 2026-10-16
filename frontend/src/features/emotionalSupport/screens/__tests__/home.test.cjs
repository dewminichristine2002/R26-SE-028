const fs = require('fs');
const path = require('path');

const featureRoot = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(featureRoot, relativePath), 'utf8');
const stripComments = (src) => src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

describe('Today for You home experience', () => {
  const source = read('screens/ElderHomeScreen.jsx');
  const navigator = read('EmotionalSupportNavigator.jsx');

  test('home presents the four simple choices: TALK / PLAY / REMEMBER / REVIEW', () => {
    expect(source).toContain('Talk With Me');
    expect(source).toContain('Play an Activity');
    expect(source).toContain('Remember Something Nice');
    expect(source).toContain('My Wellness');
    expect(source).toContain('Today for You');
  });

  test('the three main action cards use the shared accessible card layout', () => {
    expect(source).toContain('function HomeActionCard');
    expect(source).toContain('style={s.actionCards}');
    expect(source).toContain('s.actionButton, { backgroundColor: buttonColor, borderColor: buttonColor }, pressed && s.pressed');
    expect(source).toContain('buttonColor="#2D654F"');
    expect(source).toContain('buttonColor="#68478B"');
    expect(source).toContain('buttonColor="#98566C"');
    expect(source).toContain("minHeight: 54");
    expect(source).toContain("width: '100%'");
    expect(source).toContain('Explore Games');
    expect(source).toContain('Explore Memories');
    expect(source).toContain('Start Conversation');
  });

  test('Talk With Me remains the primary action with concise conversation framing', () => {
    expect(source).toContain('Start Conversation');
    expect(source).toContain('A short, voice-supported conversation about your day.');
    // No questionnaire wording on the primary action.
    expect(source).not.toContain('Start Check-In');
    expect(source).not.toContain('Daily Adaptive Check-In');
  });

  test('each card navigates to its registered destination', () => {
    expect(source).toContain("navigate('AdaptiveSupportChatScreen')");
    expect(source).toContain("navigate('CognitiveActivityLibraryScreen')");
    expect(source).toContain("navigate('ReminiscenceHubScreen')");
    expect(source).toContain("navigate('EmotionalTrendScreen')");
    ['ReminiscenceHubScreen', 'MemoryMomentScreen', 'PhotoMemoryScreen', 'RememberedTopicsScreen'].forEach((screen) => {
      expect(navigator).toContain(screen);
    });
  });

  test('personalized time-aware greeting is shown safely', () => {
    expect(source).toContain('getPersonalizedGreeting(user)');
    expect(source).toContain('Choose one small moment for yourself.');
  });

  test('gentle weekly summary uses factual counts only — no streaks or scores', () => {
    expect(source).toContain('Your Week');
    expect(source).toContain('Check-ins');
    expect(source).toContain('Activities');
    expect(source).toContain('Thanks for taking time for yourself.');
    const forbidden = [/streak/i, /rank/i, /leaderboard/i, /level \d/i, /badge/i, /missed yesterday/i, /wellbeing score/i];
        forbidden.forEach((pattern) => expect(stripComments(source)).not.toMatch(pattern));
  });

  test('empty state avoids meaningless zero values', () => {
    expect(source).toContain('Your wellness journey will appear here as you use the app.');
  });
});

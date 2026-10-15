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

  test('Talk With Me is the primary hero with conversation framing', () => {
    expect(source).toContain('Start Conversation');
    expect(source).toContain('A short conversation about your day.');
    expect(source).toContain('5 short moments');
    expect(source).toContain('Voice supported');
    expect(source).toContain('About 3 minutes');
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
    expect(source).toContain('What would you like to do today?');
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
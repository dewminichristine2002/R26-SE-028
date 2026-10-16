const fs = require('fs');
const path = require('path');
const { formatDuration } = require('../../utils/wellnessFormatters');
const { getCheckinSampleLabel, getMetricColumnCount } = require('../../utils/wellnessDashboardLayout');

const featureRoot = path.resolve(__dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(featureRoot, relativePath), 'utf8');

describe('My Wellness home entry and dashboard', () => {
  const home = read('screens/ElderHomeScreen.jsx');
  const dashboard = read('screens/EmotionalTrendScreen.js');

  test('home card retains the dashboard route and offers a clear full-width action', () => {
    expect(home).toContain('accessibilityLabel="My Wellness. View My Wellness."');
    expect(home).toContain("navigate('EmotionalTrendScreen')");
    expect(home).toContain('View My Wellness');
    expect(home).toContain('wellnessButton: {');
    expect(home).toContain("minHeight: 54");
    expect(home).toContain('wellnessHeart');
  });

  test('dashboard keeps its trend sections, retry states, empty states and summary action', () => {
    ['Emotional Check-Ins', 'Cognitive Engagement', 'Activity Accuracy', 'Recent Activity', 'View Wellness Summary']
      .forEach((section) => expect(dashboard).toContain(section));
    expect(dashboard).toContain('<InlineState loading={loading} error={error} onRetry={load}');
    expect(dashboard).toContain('No cognitive activities completed yet');
    expect(dashboard).toContain('summaryError ?');
  });

  test('four cognitive metrics use compact cards and stack for narrow or enlarged layouts', () => {
    expect(dashboard).toContain('getMetricColumnCount(gridWidth, fontScale)');
    expect(dashboard).toContain('onLayout={({ nativeEvent }) => setGridWidth');
    expect(dashboard).toContain("width: metric.wide && columnCount === 2 ? gridWidth : cardWidth");
    expect(dashboard).not.toMatch(/metric:\s*\{[^}]*minHeight:/);
    expect(dashboard).not.toMatch(/metric:\s*\{[^}]*flexBasis:/);
    expect(dashboard).toContain("label: 'Activities completed'");
    expect(dashboard).toContain("label: 'Activity accuracy'");
    expect(dashboard).toContain("label: 'Recent difficulty'");
    expect(dashboard).toContain("label: 'Average recorded time'");
    expect(dashboard).toContain('Recorded time is measured on each question. Older records may include idle time.');
    expect(dashboard).toContain('textBreakStrategy="simple"');
    expect(dashboard).toContain("cognitive.activities_completed ?? '");
    expect(dashboard).toContain('cognitive.average_activity_accuracy == null ?');
    expect(dashboard).toContain("cognitive.recent_difficulty ? label(cognitive.recent_difficulty) : '");
    expect(dashboard).toContain('formatDuration(cognitive.average_response_time_ms)');
    expect(dashboard).toContain('flexDirection: \'column\'');
    const metricCard = dashboard.slice(dashboard.indexOf('function MetricsGrid'), dashboard.indexOf('function Section'));
    expect(metricCard.indexOf('s.metricIcon')).toBeLessThan(metricCard.indexOf('s.metricValue'));
    expect(metricCard.indexOf('s.metricValue')).toBeLessThan(metricCard.indexOf('s.metricLabel'));
  });

  test.each([[320, 1], [360, 1], [393, 2]])('%i dp screens choose %i column(s) based on available card width', (screenWidth, expectedColumns) => {
    // Current screen gutters and Card padding leave this width for the measured grid.
    const availableGridWidth = screenWidth - 82;
    expect(getMetricColumnCount(availableGridWidth, 1)).toBe(expectedColumns);
  });

  test('large font scaling switches even a wide screen to one column', () => {
    expect(getMetricColumnCount(393 - 82, 1.3)).toBe(1);
    expect(getMetricColumnCount(393 - 82, 1.15)).toBe(2);
  });

  test('difficulty and long duration values are displayed as full words and can wrap between words', () => {
    expect(dashboard).toContain("label(cognitive.recent_difficulty)");
    expect(dashboard).toContain('textBreakStrategy="simple" style={s.metricValue}');
    expect(formatDuration(5554600)).toBe('1 hr 32 min');
    expect(formatDuration(7200000)).toBe('2 hr 0 min');
  });

  test('emotion percentage is explained as a check-in distribution with its sample count', () => {
    expect(dashboard).toContain('Share of recorded check-ins');
    expect(dashboard).toContain('getCheckinSampleLabel(emotional.total_checkins)');
    expect(dashboard).toContain('accessibilityRole="progressbar" accessibilityLabel={`${label(item.emotion)}: ${item.percentage}% share of recorded check-ins`}');
  });
});

describe('check-in sample-size wording', () => {
  test.each([[1, 'Based on 1 recorded check-in'], [2, 'Based on 2 recorded check-ins'], [0, 'Based on 0 recorded check-ins']])(
    'formats sample size %i accurately', (count, expected) => {
      expect(getCheckinSampleLabel(count)).toBe(expected);
    },
  );
});

describe('wellness duration formatting', () => {
  test.each([
    [0, '0 sec'],
    [12500, '13 sec'],
    [84000, '1 min 24 sec'],
    [60000, '1 min'],
    [5554600, '1 hr 32 min'],
    [86399000, '23 hr 59 min'],
    [null, '—'],
    [-1000, '—'],
    ['not-a-duration', '—'],
  ])('formats %j as %s without losing units', (value, expected) => {
    expect(formatDuration(value)).toBe(expected);
  });
});

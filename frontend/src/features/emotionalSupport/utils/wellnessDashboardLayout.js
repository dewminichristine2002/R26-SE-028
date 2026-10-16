const MIN_METRIC_CARD_WIDTH = 144;
const METRIC_COLUMN_GAP = 12;
const MAX_TWO_COLUMN_FONT_SCALE = 1.15;

function getMetricColumnCount(contentWidth, fontScale = 1) {
  const width = Number(contentWidth);
  const scale = Number(fontScale);
  if (!Number.isFinite(width) || !Number.isFinite(scale)) return 1;
  return width >= (MIN_METRIC_CARD_WIDTH * 2) + METRIC_COLUMN_GAP
    && scale <= MAX_TWO_COLUMN_FONT_SCALE ? 2 : 1;
}

function getCheckinSampleLabel(totalCheckins) {
  const count = Number(totalCheckins);
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return `Based on ${safeCount} recorded check-in${safeCount === 1 ? '' : 's'}`;
}

module.exports = { getCheckinSampleLabel, getMetricColumnCount };

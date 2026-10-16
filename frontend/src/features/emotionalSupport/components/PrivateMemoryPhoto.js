import React, { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { refreshMemoryPhotoUrl } from '../api/emotionalSupportApi';
import { colors, type } from '../theme';

export default function PrivateMemoryPhoto({ entryId, userId, photoUrl, style, label = 'Saved memory photo' }) {
  const [uri, setUri] = useState(photoUrl || null);
  const [unavailable, setUnavailable] = useState(!photoUrl);
  const [refreshing, setRefreshing] = useState(false);
  const lastFailedUri = useRef(null);

  useEffect(() => {
    setUri(photoUrl || null);
    setUnavailable(!photoUrl);
  }, [photoUrl]);

  async function refresh() {
    if (refreshing || lastFailedUri.current === uri) return;
    lastFailedUri.current = uri;
    setRefreshing(true);
    try {
      const result = await refreshMemoryPhotoUrl(entryId, userId);
      setUri(result.photoUrl);
      setUnavailable(!result.photoUrl);
    } catch {
      setUnavailable(true);
    } finally {
      setRefreshing(false);
    }
  }

  if (unavailable || !uri) return <View style={[s.placeholder, style]}><Text style={s.placeholderText}>Photo temporarily unavailable</Text></View>;
  return <Image accessibilityLabel={label} source={{ uri }} style={style} resizeMode="cover" onError={refresh} />;
}

const s = StyleSheet.create({
  placeholder: { alignItems: 'center', backgroundColor: colors.mint, justifyContent: 'center' },
  placeholderText: { ...type.meta, color: colors.secondary },
});

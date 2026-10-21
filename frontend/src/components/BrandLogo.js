import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

// The supplied artwork has a generous white margin. These viewports display
// its original pixels at useful sizes without changing or recreating the logo.
const source = require('../../assets/logo.png');
const transparentSource = require('../../assets/eldermeds-logo-transparent.png');

export default function BrandLogo({ variant = 'wordmark', accessible = true }) {
  const frameStyle = styles[variant] || styles.wordmark;
  const imageStyle = styles[`${variant}Image`] || styles.wordmarkImage;
  return (
    <View accessible={accessible} accessibilityRole={accessible ? 'image' : undefined} accessibilityLabel={accessible ? 'ElderMeds logo' : undefined} style={frameStyle}>
      <Image accessible={false} source={variant.endsWith('Transparent') ? transparentSource : source} resizeMode="stretch" style={imageStyle} />
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: { width: 170, height: 36, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  wordmarkImage: { position: 'absolute', width: 435, height: 237, left: -132, top: -149 },
  full: { width: 190, height: 142, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  fullImage: { position: 'absolute', width: 486, height: 265, left: -148, top: -61 },
  home: { width: 150, height: 112, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  homeImage: { position: 'absolute', width: 384, height: 209, left: -117, top: -48 },
  homeCompact: { width: 116, height: 87, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  homeCompactImage: { position: 'absolute', width: 297, height: 162, left: -90, top: -37 },
  headerSymbol: { width: 52, height: 55, marginRight: 8, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  headerSymbolImage: { position: 'absolute', width: 256, height: 140, left: -102, top: -33 },
  headerWordmark: { width: 140, height: 30, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  headerWordmarkImage: { position: 'absolute', width: 358, height: 195, left: -109, top: -123 },
  headerSymbolMedium: { width: 46, height: 49, marginRight: 4, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  headerSymbolMediumImage: { position: 'absolute', width: 227, height: 124, left: -90, top: -29 },
  headerWordmarkMedium: { width: 136, height: 29, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  headerWordmarkMediumImage: { position: 'absolute', width: 348, height: 190, left: -106, top: -119 },
  headerSymbolSmall: { width: 36, height: 38, marginRight: 6, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  headerSymbolSmallImage: { position: 'absolute', width: 177, height: 97, left: -71, top: -23 },
  headerWordmarkSmall: { width: 112, height: 24, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  headerWordmarkSmallImage: { position: 'absolute', width: 287, height: 156, left: -87, top: -98 },
  headerSymbolCompact: { width: 28, height: 30, marginRight: 4, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  headerSymbolCompactImage: { position: 'absolute', width: 138, height: 75, left: -55, top: -18 },
  headerWordmarkCompact: { width: 90, height: 19, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  headerWordmarkCompactImage: { position: 'absolute', width: 230, height: 125, left: -70, top: -79 },
  symbol: { width: 80, height: 84, overflow: 'hidden', backgroundColor: '#FFFFFF' },
  symbolImage: { position: 'absolute', width: 394, height: 215, left: -157, top: -51 },
  headerSymbolTransparent: { width: 52, height: 50, marginRight: 8, overflow: 'hidden' },
  headerSymbolTransparentImage: { position: 'absolute', width: 136, height: 74, left: -44, top: -6 },
  headerSymbolMediumTransparent: { width: 46, height: 45, marginRight: 4, overflow: 'hidden' },
  headerSymbolMediumTransparentImage: { position: 'absolute', width: 121, height: 66, left: -39, top: -5 },
  headerWordmarkTransparent: { width: 140, height: 30, overflow: 'hidden' },
  headerWordmarkTransparentImage: { position: 'absolute', width: 201, height: 110, left: -31, top: -84 },
  headerWordmarkMediumTransparent: { width: 136, height: 29, overflow: 'hidden' },
  headerWordmarkMediumTransparentImage: { position: 'absolute', width: 195, height: 106, left: -30, top: -81 },
  headerWordmarkCompactTransparent: { width: 90, height: 19, overflow: 'hidden' },
  headerWordmarkCompactTransparentImage: { position: 'absolute', width: 129, height: 70, left: -20, top: -54 },
});
